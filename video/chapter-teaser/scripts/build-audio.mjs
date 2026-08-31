import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import Engine from "../../../app/assets/topology.js";
import { createPcm16StereoHeader, readWav, writePcm16Stereo } from "../src/audio-wav.mjs";
import { buildTimeline, serializeAss, serializeSrt } from "../src/audio-timeline.mjs";
import { SCORE_SEED, mixPcm16Stereo, renderScoreStem } from "../src/audio-synth.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const pvRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(pvRoot, "../..");
const storyPath = path.join(pvRoot, "story.json");
const timingPath = path.join(pvRoot, "narration-timing.json");
const scriptTextPath = path.join(pvRoot, "narration-script.txt");
const musicPlanPath = path.join(pvRoot, "music-plan.json");
const committedManifestPath = path.join(pvRoot, "manifest.json");
const srtPath = path.join(pvRoot, "captions.srt");
const assPath = path.join(pvRoot, "captions.ass");
const DEFAULT_OUTPUT_ROOT = path.join(repositoryRoot, ".tmp", "chapter-teaser");
const VOICE_SHA256 = "502e1b05792ed3d16eddc13d192f73c3c8622e0f10abe05559cdf9f16f8f54e2";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function toRepositoryPath(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

function artifact(filePath) {
  return { path: toRepositoryPath(filePath), bytes: fs.statSync(filePath).size, sha256: sha256(filePath) };
}

function executableProbe(candidate, args = ["-version"]) {
  if (!candidate) return false;
  const result = spawnSync(candidate, args, {
    cwd: repositoryRoot,
    windowsHide: true,
    encoding: "utf8",
    timeout: 15000
  });
  return !result.error && result.status === 0;
}

function resolveExecutable(environmentName, candidates) {
  const resolved = [process.env[environmentName], ...candidates]
    .filter(Boolean)
    .find((candidate) => executableProbe(candidate));
  if (!resolved) throw new Error(`${candidates[0]} is required to build the PV audio`);
  return resolved;
}

function runChecked(executable, args, label, timeout = 300000) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    windowsHide: true,
    encoding: "utf8",
    timeout,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} exited with status ${result.status}${detail ? `\n${detail}` : ""}`);
  }
  return result.stdout;
}

function copyFileIfDifferent(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (path.resolve(source) !== path.resolve(destination)) fs.copyFileSync(source, destination);
}

function wrapRawPcm16Stereo(rawPath, outputPath, totalSampleFrames, sampleRate) {
  const expectedBytes = totalSampleFrames * 4;
  const sourceBytes = fs.statSync(rawPath).size;
  if (sourceBytes % 4 !== 0) throw new Error(`Raw PCM is not stereo-frame aligned: ${rawPath}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const input = fs.openSync(rawPath, "r");
  const output = fs.openSync(outputPath, "w");
  try {
    fs.writeSync(output, createPcm16StereoHeader(totalSampleFrames, sampleRate));
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let copied = 0;
    const copyBytes = Math.min(sourceBytes, expectedBytes);
    while (copied < copyBytes) {
      const count = Math.min(buffer.length, copyBytes - copied);
      const bytesRead = fs.readSync(input, buffer, 0, count, copied);
      if (bytesRead <= 0) throw new Error(`Unexpected EOF in ${rawPath}`);
      fs.writeSync(output, buffer, 0, bytesRead);
      copied += bytesRead;
    }
    if (copied < expectedBytes) {
      const silence = Buffer.alloc(Math.min(buffer.length, expectedBytes - copied));
      while (copied < expectedBytes) {
        const count = Math.min(silence.length, expectedBytes - copied);
        fs.writeSync(output, silence, 0, count);
        copied += count;
      }
    }
  } finally {
    fs.closeSync(input);
    fs.closeSync(output);
  }
  return {
    sourceSampleFrames: sourceBytes / 4,
    outputSampleFrames: totalSampleFrames,
    paddedSampleFrames: Math.max(0, totalSampleFrames - sourceBytes / 4),
    trimmedSampleFrames: Math.max(0, sourceBytes / 4 - totalSampleFrames)
  };
}

function pcm16StereoLayout(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const fileBytes = fs.fstatSync(descriptor).size;
    const riff = Buffer.alloc(12);
    if (fs.readSync(descriptor, riff, 0, riff.length, 0) !== riff.length
        || riff.toString("ascii", 0, 4) !== "RIFF"
        || riff.toString("ascii", 8, 12) !== "WAVE") {
      throw new Error(`Not a RIFF/WAVE file: ${filePath}`);
    }
    let format = null;
    let dataOffset = -1;
    let dataBytes = 0;
    let cursor = 12;
    while (cursor + 8 <= fileBytes) {
      const chunk = Buffer.alloc(8);
      if (fs.readSync(descriptor, chunk, 0, chunk.length, cursor) !== chunk.length) break;
      const id = chunk.toString("ascii", 0, 4);
      const chunkBytes = chunk.readUInt32LE(4);
      const payloadOffset = cursor + 8;
      if (payloadOffset + chunkBytes > fileBytes) throw new Error(`Truncated ${id} chunk in ${filePath}`);
      if (id === "fmt ") {
        if (chunkBytes < 16) throw new Error(`Invalid fmt chunk in ${filePath}`);
        const payload = Buffer.alloc(16);
        if (fs.readSync(descriptor, payload, 0, payload.length, payloadOffset) !== payload.length) {
          throw new Error(`Truncated fmt payload in ${filePath}`);
        }
        format = {
          audioFormat: payload.readUInt16LE(0),
          channels: payload.readUInt16LE(2),
          sampleRate: payload.readUInt32LE(4),
          blockAlign: payload.readUInt16LE(12),
          bitsPerSample: payload.readUInt16LE(14)
        };
      } else if (id === "data") {
        dataOffset = payloadOffset;
        dataBytes = chunkBytes;
      }
      cursor = payloadOffset + chunkBytes + (chunkBytes & 1);
    }
    if (!format || dataOffset < 0) throw new Error(`Missing PCM layout chunks in ${filePath}`);
    if (format.audioFormat !== 1 || format.channels !== 2 || format.bitsPerSample !== 16 || format.blockAlign !== 4) {
      throw new Error(`Expected PCM16 stereo WAV for tail silence audit: ${filePath}`);
    }
    if (dataBytes % format.blockAlign !== 0) throw new Error(`Unaligned PCM data in ${filePath}`);
    return { ...format, dataOffset, dataBytes, frameCount: dataBytes / format.blockAlign };
  } finally {
    fs.closeSync(descriptor);
  }
}

export function inspectDigitalSilenceTail(filePath, startSampleFrame) {
  const layout = pcm16StereoLayout(filePath);
  if (!Number.isInteger(startSampleFrame) || startSampleFrame < 0 || startSampleFrame > layout.frameCount) {
    throw new Error(`Invalid silence start ${startSampleFrame} for ${filePath}`);
  }
  const descriptor = fs.openSync(filePath, "r");
  let nonZeroSamples = 0;
  let maxAbsPcm16 = 0;
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let position = layout.dataOffset + startSampleFrame * layout.blockAlign;
    const end = layout.dataOffset + layout.dataBytes;
    while (position < end) {
      const count = Math.min(buffer.length, end - position);
      const bytesRead = fs.readSync(descriptor, buffer, 0, count, position);
      if (bytesRead <= 0) throw new Error(`Unexpected EOF while auditing ${filePath}`);
      for (let offset = 0; offset < bytesRead; offset += 2) {
        const value = buffer.readInt16LE(offset);
        if (value !== 0) nonZeroSamples += 1;
        maxAbsPcm16 = Math.max(maxAbsPcm16, Math.abs(value));
      }
      position += bytesRead;
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return {
    startSampleFrame,
    endSampleFrame: layout.frameCount,
    checkedSampleFrames: layout.frameCount - startSampleFrame,
    nonZeroSamples,
    maxAbsPcm16,
    digitalSilence: nonZeroSamples === 0
  };
}

export function enforceDigitalSilenceTail(filePath, startSampleFrame) {
  const layout = pcm16StereoLayout(filePath);
  if (!Number.isInteger(startSampleFrame) || startSampleFrame < 0 || startSampleFrame > layout.frameCount) {
    throw new Error(`Invalid silence start ${startSampleFrame} for ${filePath}`);
  }
  const descriptor = fs.openSync(filePath, "r+");
  try {
    const silence = Buffer.alloc(1024 * 1024);
    let position = layout.dataOffset + startSampleFrame * layout.blockAlign;
    const end = layout.dataOffset + layout.dataBytes;
    while (position < end) {
      const count = Math.min(silence.length, end - position);
      fs.writeSync(descriptor, silence, 0, count, position);
      position += count;
    }
  } finally {
    fs.closeSync(descriptor);
  }
  const audit = inspectDigitalSilenceTail(filePath, startSampleFrame);
  if (!audit.digitalSilence) {
    throw new Error(`Tail-silence assertion failed for ${filePath}: ${audit.nonZeroSamples} non-zero PCM samples`);
  }
  return audit;
}

function probeAudio(ffprobe, filePath) {
  const output = runChecked(ffprobe, [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "format=duration:stream=codec_name,sample_rate,channels,channel_layout,bit_rate",
    "-of", "json", filePath
  ], `Audio probe for ${path.basename(filePath)}`, 30000);
  const parsed = JSON.parse(output);
  const stream = parsed.streams?.[0] ?? {};
  return {
    durationSeconds: Number(parsed.format?.duration),
    codec: stream.codec_name,
    sampleRate: Number(stream.sample_rate),
    channels: stream.channels,
    channelLayout: stream.channel_layout,
    bitRate: Number(stream.bit_rate || 0)
  };
}

export function parseArguments(argv) {
  const options = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    voicePath: process.env.PV_VOICE_PATH || null,
    musicSourceRoot: null,
    renderAudio: true,
    allowDownload: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--timeline-only") options.renderAudio = false;
    else if (argument === "--no-download") options.allowDownload = false;
    else if (argument === "--output") options.outputRoot = path.resolve(argv[++index]);
    else if (argument.startsWith("--output=")) options.outputRoot = path.resolve(argument.slice("--output=".length));
    else if (argument === "--voice") options.voicePath = path.resolve(argv[++index]);
    else if (argument.startsWith("--voice=")) options.voicePath = path.resolve(argument.slice("--voice=".length));
    else if (argument === "--music-source") options.musicSourceRoot = path.resolve(argv[++index]);
    else if (argument.startsWith("--music-source=")) options.musicSourceRoot = path.resolve(argument.slice("--music-source=".length));
    else throw new Error(`Unknown argument: ${argument}`);
  }
  options.outputRoot = path.resolve(options.outputRoot);
  options.musicSourceRoot = options.musicSourceRoot || path.join(options.outputRoot, "source", "music", "curated");
  return options;
}

async function downloadSource(source, destination) {
  const response = await fetch(source.downloadUrl, {
    redirect: "follow",
    headers: { "user-agent": "Topology-Gomoku-PV/1.0 (local editorial build)" }
  });
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    throw new Error(`Download failed for ${source.id}: HTTP ${response.status}${retry ? `; retry after ${retry}s` : ""}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
}

async function ensureMusicSources(plan, sourceRoot, allowDownload) {
  const paths = new Map();
  for (const source of plan.sources) {
    const sourcePath = path.join(sourceRoot, source.filename);
    if (!fs.existsSync(sourcePath)) {
      if (!allowDownload || !source.downloadUrl) {
        const provision = source.cacheRequired
          ? `; copy the exact user-provided ${source.filename} into the curated music source directory or pass --music-source PATH`
          : "";
        throw new Error(`Missing music source ${sourcePath}${provision}`);
      }
      process.stdout.write(`Downloading ${source.work}…\n`);
      await downloadSource(source, sourcePath);
    }
    const digest = sha256(sourcePath);
    if (source.sha256 && digest !== source.sha256.toLowerCase()) {
      throw new Error(`Checksum mismatch for ${source.id}: ${digest}`);
    }
    paths.set(source.id, sourcePath);
  }
  return paths;
}

function validateMusicPlan(plan, timeline) {
  if (plan.fps !== timeline.fps || plan.sampleRate !== 48000) throw new Error("music-plan.json must be 60 fps / 48 kHz");
  const sources = new Set(plan.sources.map((source) => source.id));
  if (sources.size !== plan.sources.length) throw new Error("Music source ids must be unique");
  for (const clip of plan.clips) {
    if (!sources.has(clip.sourceId)) throw new Error(`Unknown music source ${clip.sourceId}`);
    if (!Number.isInteger(clip.targetStartFrame) || !Number.isInteger(clip.targetEndFrame)
        || clip.targetStartFrame < 0 || clip.targetEndFrame <= clip.targetStartFrame
        || clip.targetEndFrame > timeline.totalFrames) {
      throw new Error(`Invalid target frame range for music clip ${clip.id}`);
    }
  }
}

export function renderVoiceStem({ ffmpeg, sourcePath, outputPath, totalSampleFrames, sampleRate, silentFromSampleFrame = totalSampleFrames }) {
  const rawPath = `${outputPath}.raw`;
  if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
  runChecked(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", sourcePath, "-map", "0:a:0", "-vn",
    // Resample before the sample-count trim. Otherwise end_sample is interpreted
    // in the MP3 source rate and lands late when the source is not 48 kHz.
    "-af", `aresample=${sampleRate},atrim=end_sample=${silentFromSampleFrame},apad=whole_len=${totalSampleFrames}`,
    "-ar", String(sampleRate), "-ac", "2",
    "-c:a", "pcm_s16le", "-f", "s16le", rawPath
  ], "Narration normalization");
  const alignment = wrapRawPcm16Stereo(rawPath, outputPath, totalSampleFrames, sampleRate);
  fs.unlinkSync(rawPath);
  return alignment;
}

function renderMusicStem({ ffmpeg, plan, sourcePaths, outputPath, totalFrames }) {
  const fps = plan.fps;
  const totalSeconds = totalFrames / fps;
  const samplesPerVideoFrame = plan.sampleRate / fps;
  const totalSampleFrames = totalFrames * samplesPerVideoFrame;
  const mix = new Float32Array(totalSampleFrames * 2);
  const temporaryRoot = fs.mkdtempSync(path.join(path.dirname(outputPath), "music-clips-"));
  const placedClips = [];
  const normalizedSources = new Map();

  try {
    // Normalize each recording once before editorial trimming. This preserves the
    // original relative dynamics when several chapter clips come from one mastered
    // work (notably the supplied Travail reference), instead of flattening every
    // chapter independently.
    [...new Set(plan.clips.map((clip) => clip.sourceId))].forEach((sourceId, sourceIndex) => {
      const sourcePath = sourcePaths.get(sourceId);
      const sourceClips = plan.clips.filter((clip) => clip.sourceId === sourceId);
      const spanStart = Math.max(0, Math.min(...sourceClips.map((clip) => Number(clip.sourceInSeconds || 0))) - 1);
      const spanEnd = Math.max(...sourceClips.map((clip) => (
        Number(clip.sourceInSeconds || 0) + (clip.targetEndFrame - clip.targetStartFrame) / fps
      ))) + 1;
      const normalizedPath = path.join(temporaryRoot, `source-${String(sourceIndex).padStart(2, "0")}-${sourceId}.wav`);
      runChecked(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", sourcePath, "-map", "0:a:0", "-vn",
        "-af", [
          `atrim=start=${spanStart.toFixed(6)}:end=${spanEnd.toFixed(6)}`,
          "asetpts=PTS-STARTPTS",
          `loudnorm=I=${plan.editing.normalizationTargetLufs}:TP=${plan.editing.truePeakDb}:LRA=11`,
          `aresample=${plan.sampleRate}`,
          "aformat=sample_fmts=fltp:channel_layouts=stereo",
          "asetpts=N/SR/TB"
        ].join(","),
        "-ar", String(plan.sampleRate), "-ac", "2",
        "-c:a", "pcm_f32le", normalizedPath
      ], `Curated music source ${sourceId}`, 600000);
      normalizedSources.set(sourceId, { path: normalizedPath, offsetSeconds: spanStart });
    });

    plan.clips.forEach((clip, index) => {
      const durationFrames = clip.targetEndFrame - clip.targetStartFrame;
      const duration = durationFrames / fps;
      const expectedSampleFrames = durationFrames * samplesPerVideoFrame;
      const fadeIn = Math.min(duration / 2, (clip.fadeInFrames ?? 0) / fps);
      const fadeOut = Math.min(duration / 2, (clip.fadeOutFrames ?? 0) / fps);
      const fadeOutStart = Math.max(0, duration - fadeOut);
      const normalizedSource = normalizedSources.get(clip.sourceId);
      const sourcePath = normalizedSource.path;
      const clipPath = path.join(temporaryRoot, `${String(index).padStart(2, "0")}-${clip.id}.wav`);
      const chain = [
        `atrim=start=${(Number(clip.sourceInSeconds || 0) - normalizedSource.offsetSeconds).toFixed(6)}:duration=${duration.toFixed(6)}`,
        "asetpts=PTS-STARTPTS",
        `aresample=${plan.sampleRate}`,
        "aformat=sample_fmts=fltp:channel_layouts=stereo",
        `atrim=start=0:duration=${duration.toFixed(6)}`,
        "asetpts=N/SR/TB"
      ];
      if (fadeIn > 0) chain.push(`afade=t=in:st=0:d=${fadeIn.toFixed(6)}:curve=qsin`);
      if (fadeOut > 0) chain.push(`afade=t=out:st=${fadeOutStart.toFixed(6)}:d=${fadeOut.toFixed(6)}:curve=qsin`);
      chain.push(`apad=whole_len=${expectedSampleFrames}`, `atrim=end_sample=${expectedSampleFrames}`);
      runChecked(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", sourcePath, "-map", "0:a:0", "-vn",
        "-af", chain.join(","),
        "-ar", String(plan.sampleRate), "-ac", "2",
        "-c:a", "pcm_f32le", clipPath
      ], `Curated music clip ${clip.id}`, 300000);

      const wav = readWav(clipPath);
      if (wav.sampleRate !== plan.sampleRate || wav.channels !== 2) {
        throw new Error(`Normalized music clip ${clip.id} is not 48 kHz stereo`);
      }
      if (wav.frameCount !== expectedSampleFrames) {
        throw new Error(`Normalized music clip ${clip.id} has ${wav.frameCount} samples; expected ${expectedSampleFrames}`);
      }
      const destinationStart = clip.targetStartFrame * samplesPerVideoFrame;
      const framesToMix = Math.min(expectedSampleFrames, wav.frameCount, totalSampleFrames - destinationStart);
      for (let frame = 0; frame < framesToMix; frame += 1) {
        const sourceOffset = frame * 2;
        const destinationOffset = (destinationStart + frame) * 2;
        mix[destinationOffset] += wav.samples[sourceOffset];
        mix[destinationOffset + 1] += wav.samples[sourceOffset + 1];
      }
      placedClips.push({
        id: clip.id,
        startSampleFrame: destinationStart,
        endSampleFrame: destinationStart + framesToMix,
        renderedSampleFrames: wav.frameCount
      });
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  const logoStartSample = plan.editing.logoWindow.startFrame * samplesPerVideoFrame;
  const logoEndSample = plan.editing.logoWindow.endFrame * samplesPerVideoFrame;
  const revealFloor = plan.editing.chapterRevealGrammar?.musicGainDuringVacuum ?? 1;
  const chapterRevealGainAtFrame = (videoFrame) => {
    let gain = 1;
    for (const clip of plan.clips) {
      const reveal = clip.reveal;
      if (!reveal || videoFrame < reveal.vacuumStartFrame || videoFrame >= reveal.impactFrame) continue;
      const restoreFrames = Math.min(5, Math.max(1, reveal.impactFrame - reveal.vacuumStartFrame));
      const restoreStart = reveal.impactFrame - restoreFrames;
      if (videoFrame < restoreStart) {
        const span = Math.max(1, restoreStart - reveal.vacuumStartFrame);
        const linear = Math.max(0, Math.min(1, (videoFrame - reveal.vacuumStartFrame) / span));
        const eased = linear * linear * (3 - 2 * linear);
        gain = Math.min(gain, 1 + (revealFloor - 1) * eased);
      } else {
        const linear = Math.max(0, Math.min(1, (videoFrame - restoreStart) / restoreFrames));
        gain = Math.min(gain, revealFloor + (1 - revealFloor) * linear * linear);
      }
    }
    return gain;
  };
  let musicPeak = 0;
  let musicSquareSum = 0;
  for (let frame = 0; frame < totalSampleFrames; frame += 1) {
    const logoGain = frame >= logoStartSample && frame < logoEndSample ? plan.editing.logoWindow.gain : 1;
    const gain = plan.editing.postMixGain * logoGain * chapterRevealGainAtFrame(frame / samplesPerVideoFrame);
    const offset = frame * 2;
    mix[offset] = Math.max(-0.9, Math.min(0.9, mix[offset] * gain));
    mix[offset + 1] = Math.max(-0.9, Math.min(0.9, mix[offset + 1] * gain));
    musicPeak = Math.max(musicPeak, Math.abs(mix[offset]), Math.abs(mix[offset + 1]));
    musicSquareSum += mix[offset] ** 2 + mix[offset + 1] ** 2;
  }

  const coverage = plan.clips.map((clip) => {
    const centerFrame = Math.floor((clip.targetStartFrame + clip.targetEndFrame) / 2);
    const centerSample = centerFrame * samplesPerVideoFrame;
    const radius = Math.round(plan.sampleRate * 0.5);
    const start = Math.max(0, centerSample - radius);
    const end = Math.min(totalSampleFrames, centerSample + radius);
    let sumSquares = 0;
    let count = 0;
    for (let frame = start; frame < end; frame += 1) {
      const offset = frame * 2;
      sumSquares += mix[offset] * mix[offset] + mix[offset + 1] * mix[offset + 1];
      count += 2;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, count));
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    if (!Number.isFinite(rmsDb) || rmsDb < -60) {
      throw new Error(`Music coverage failed inside ${clip.id}: ${rmsDb} dBFS`);
    }
    return { id: clip.id, centerFrame, rmsDb: Number(rmsDb.toFixed(3)) };
  });

  writePcm16Stereo(outputPath, mix, plan.sampleRate);
  return {
    sourceSampleFrames: placedClips.reduce((sum, clip) => sum + clip.renderedSampleFrames, 0),
    outputSampleFrames: totalSampleFrames,
    paddedSampleFrames: 0,
    trimmedSampleFrames: 0,
    durationSeconds: totalSeconds,
    placement: "two-pass normalized PCM clips placed at exact integer sample offsets",
    sourceNormalization: "once per unique source's complete editorial span before clip trims",
    chapterRevealAutomation: `music dips to ${revealFloor} before each measured title impact and returns to unity on the impact frame`,
    energy: {
      peakDbfs: Number((20 * Math.log10(Math.max(musicPeak, Number.EPSILON))).toFixed(3)),
      rmsDbfs: Number((20 * Math.log10(Math.max(
        Math.sqrt(musicSquareSum / Math.max(1, mix.length)),
        Number.EPSILON
      ))).toFixed(3))
    },
    placedClips,
    coverage
  };
}

export function buildSfxEvents(timeline, storyDocument = readJson(storyPath)) {
  const profiles = Object.freeze({
    plane: Object.freeze({ index: 0, midi: 50, boardHz: 174.61, clickHz: 1240, tailHz: 261.63, impactHz: 43, warpStyle: "dry-grid" }),
    cylinder: Object.freeze({ index: 1, midi: 52, boardHz: 196.00, clickHz: 1390, tailHz: 293.66, impactHz: 45, warpStyle: "axial-hollow" }),
    torus: Object.freeze({ index: 2, midi: 55, boardHz: 220.00, clickHz: 1530, tailHz: 329.63, impactHz: 47, warpStyle: "dual-orbit" }),
    mobius: Object.freeze({ index: 3, midi: 53, boardHz: 185.00, clickHz: 1160, tailHz: 277.18, impactHz: 42, warpStyle: "half-twist" }),
    klein: Object.freeze({ index: 4, midi: 48, boardHz: 164.81, clickHz: 1340, tailHz: 246.94, impactHz: 39, warpStyle: "bottle-fold" }),
    projective: Object.freeze({ index: 5, midi: 56, boardHz: 207.65, clickHz: 1080, tailHz: 311.13, impactHz: 41, warpStyle: "mirror-cross" }),
    sphere: Object.freeze({ index: 6, midi: 57, boardHz: 246.94, clickHz: 1660, tailHz: 369.99, impactHz: 49, warpStyle: "harmonic-bloom" })
  });
  const endCard = timeline.segments.find((segment) => segment.kind === "end-card");
  const soundEndFrame = endCard?.startFrame ?? timeline.totalFrames;
  const events = [];
  const add = (id, startFrame, durationFrames, velocity, pan, kind, metadata = {}) => {
    const roundedStart = Math.round(startFrame);
    if (roundedStart >= soundEndFrame) return;
    const boundedStart = Math.max(0, Math.min(soundEndFrame - 1, roundedStart));
    const boundedDuration = Math.max(1, Math.min(
      Math.round(durationFrames),
      soundEndFrame - boundedStart
    ));
    events.push({
      id,
      startFrame: boundedStart,
      durationFrames: boundedDuration,
      velocity,
      pan,
      kind,
      midi: metadata.midi ?? 50,
      ...metadata
    });
  };
  const inverseSmootherstep = (target) => {
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const midpoint = (low + high) / 2;
      const value = midpoint ** 3 * (midpoint * (midpoint * 6 - 15) + 10);
      if (value < target) low = midpoint;
      else high = midpoint;
    }
    return (low + high) / 2;
  };
  const revealProgress = (targetReveal) => 0.08 + 0.30 * inverseSmootherstep(Math.max(0, Math.min(1, targetReveal)));
  const storyChapterById = new Map(storyDocument.chapters.map((chapter) => [chapter.id, chapter]));
  const chapterTrace = (chapterId) => {
    const chapter = storyChapterById.get(chapterId);
    if (!chapter) throw new Error(`Missing story chapter for sound design: ${chapterId}`);
    const rules = Engine.createRules({ type: chapter.id, width: chapter.width, height: chapter.height, target: 5 });
    const trace = Engine.tracePath(
      rules,
      Engine.toCell(rules, chapter.start[0], chapter.start[1]),
      chapter.direction,
      5
    );
    if (!trace || trace.cells.length !== 5) throw new Error(`Invalid representative path for sound design: ${chapterId}`);
    return { chapter, rules, trace };
  };

  // A very quiet paper-and-room floor binds otherwise contrasting chapter cues
  // without turning the SFX bus into a second music track.
  add("paper-world-room-tone", 0, soundEndFrame, 0.052, 0, "paper-air", {
    role: "paper-environment",
    layer: "room-tone",
    visualAnchor: "picture-start-to-end-card"
  });
  add("intro-edge-approach", 286, 520, 0.105, -0.18, "reverse-breath", {
    role: "boundary-connection",
    layer: "approach",
    toneHz: 88,
    visualAnchor: "intro-board-edge"
  });
  add("intro-hidden-seam", 821, 194, 0.22, 0.18, "seam-crossing", {
    role: "boundary-connection",
    layer: "crossing",
    seamMask: Engine.SEAM_X,
    toneHz: 126,
    visualAnchor: "caption-03:start"
  });
  add("intro-boundaries-glue", 1015, 205, 0.17, 0, "topology-warp", {
    role: "boundary-connection",
    layer: "reconnection",
    topologyId: "intro",
    warpStyle: "mirror-cross",
    toneHz: 148,
    visualAnchor: "caption-04:start"
  });
  add("institution-logo-bloom", 1225, 210, 0.16, 0, "logo-bloom", {
    role: "institution-logo",
    layer: "identity",
    toneHz: 392,
    visualAnchor: "institution-logo:start"
  });
  add("seven-worlds-rise", 1466, 360, 0.17, 0.08, "reverse-breath", {
    role: "awakening",
    layer: "rise",
    toneHz: 110,
    visualAnchor: "intro-awakening:start"
  });
  const awakeningStart = timeline.cues.find((cue) => cue.id === "caption-07")?.startFrame ?? 1866;
  Object.entries(profiles).forEach(([topologyId, profile], index) => {
    add(`awaken-${topologyId}`, awakeningStart + 14 + index * 39, 82, 0.105 + index * 0.006, (index - 3) * 0.105, "glyph-pulse", {
      role: "awakening",
      layer: "topology-glyph",
      topologyId,
      profileIndex: profile.index,
      toneHz: profile.tailHz,
      visualAnchor: "caption-07:seven-glyph-sequence"
    });
  });

  timeline.segments.filter((segment) => segment.kind === "chapter-card").forEach((segment) => {
    const profile = profiles[segment.chapterId];
    const common = {
      role: "chapter-transition",
      chapterId: segment.chapterId,
      topologyId: segment.chapterId,
      profileIndex: profile.index,
      warpStyle: profile.warpStyle,
      boardHz: profile.boardHz,
      toneHz: profile.tailHz,
      impactHz: profile.impactHz,
      midi: profile.midi
    };
    // The music renderer supplies a twenty-frame vacuum before the transform;
    // these restrained gestures frame it without turning every title into a
    // trailer hit.
    add(`${segment.chapterId}-card-rise`, segment.startFrame - 46, 34, 0.16, profile.index % 2 ? 0.13 : -0.13, "reverse-breath", {
      ...common,
      stage: "reverse-breath",
      visualAnchor: "chapter-card:pre-roll"
    });
    add(`${segment.chapterId}-card-hit`, segment.startFrame + 12, 84, 0.34 + profile.index * 0.009, 0, "chapter-impact", {
      ...common,
      stage: "low-hit",
      visualAnchor: "drawChapterCard:reveal-start"
    });
    add(`${segment.chapterId}-card-shimmer`, segment.transformFrame, 112, 0.12 + profile.index * 0.005, profile.index % 2 ? -0.15 : 0.15, "title-shimmer", {
      ...common,
      stage: "fine-shimmer",
      visualAnchor: "drawChapterCard:transformFrame"
    });
    add(`${segment.chapterId}-card-tail`, segment.transformFrame + 5, Math.min(150, segment.endFrame - segment.transformFrame - 5), 0.075, 0, "space-tail", {
      ...common,
      stage: "space-tail",
      visualAnchor: "drawChapterCard:transform-afterglow"
    });
  });

  timeline.segments.filter((segment) => segment.kind === "chapter").forEach((segment) => {
    const profile = profiles[segment.chapterId];
    const { chapter, rules, trace } = chapterTrace(segment.chapterId);
    trace.cells.forEach((cell, stoneIndex) => {
      // drawPath reaches a stone's settled size when reveal*5.25+0.1 == i+1.
      // Inverting the compositor's quintic reveal keeps every click on that frame.
      const targetReveal = Math.min(1, (stoneIndex + 0.9) / 5.25);
      const progress = revealProgress(targetReveal);
      const frame = segment.startFrame + Math.round(segment.durationFrames * progress);
      const point = Engine.toPoint(rules, cell);
      const pan = chapter.width > 1 ? (point.x / (chapter.width - 1) - 0.5) * 0.58 : 0;
      const common = {
        role: "five-in-a-row",
        chapterId: segment.chapterId,
        topologyId: segment.chapterId,
        profileIndex: profile.index,
        stoneIndex,
        cell: [point.x, point.y],
        revealTarget: Number(targetReveal.toFixed(6)),
        visualProgress: Number(progress.toFixed(6)),
        visualAnchor: "drawChapterScene:reveal-smootherstep(0.08,0.38)",
        boardHz: profile.boardHz,
        clickHz: profile.clickHz,
        toneHz: profile.tailHz,
        midi: profile.midi
      };
      const emphasis = stoneIndex === 4 ? 1.15 : 1;
      add(`${segment.chapterId}-stone-${stoneIndex + 1}-click`, frame, 18, (0.22 + stoneIndex * 0.008) * emphasis, pan, "stone-click", {
        ...common,
        layer: "transient"
      });
      add(`${segment.chapterId}-stone-${stoneIndex + 1}-board`, frame + 1, 52 + profile.index * 2, (0.135 + stoneIndex * 0.006) * emphasis, pan * 0.72, "board-resonance", {
        ...common,
        layer: "board-resonance"
      });
      add(`${segment.chapterId}-stone-${stoneIndex + 1}-tail`, frame + 4, 88 + profile.index * 4, (0.072 + stoneIndex * 0.004) * emphasis, -pan * 0.35, "room-tail", {
        ...common,
        layer: "space-tail"
      });
    });

    trace.seams.forEach((seamMask, edgeIndex) => {
      if (!seamMask) return;
      const targetReveal = Math.min(1, (edgeIndex + 0.48) / 4.35);
      const progress = revealProgress(targetReveal);
      add(
        `${segment.chapterId}-seam-${edgeIndex + 1}`,
        segment.startFrame + Math.round(segment.durationFrames * progress),
        82,
        seamMask & Engine.SEAM_TWIST ? 0.21 : 0.17,
        edgeIndex % 2 ? 0.24 : -0.24,
        "seam-crossing",
        {
          role: "topology-seam",
          layer: seamMask & Engine.SEAM_TWIST ? "twisted-boundary" : "wrapped-boundary",
          chapterId: segment.chapterId,
          topologyId: segment.chapterId,
          profileIndex: profile.index,
          edgeIndex,
          seamMask,
          warpStyle: profile.warpStyle,
          toneHz: profile.tailHz,
          revealTarget: Number(targetReveal.toFixed(6)),
          visualProgress: Number(progress.toFixed(6)),
          visualAnchor: "drawPath:edgeReveal>0.48"
        }
      );
    });

    if (segment.chapterId !== "plane") {
      const morphStart = segment.startFrame + Math.round(segment.durationFrames * 0.46);
      const morphEnd = segment.startFrame + Math.round(segment.durationFrames * 0.84);
      add(`${segment.chapterId}-morph-motion`, morphStart, morphEnd - morphStart, 0.165 + profile.index * 0.006, profile.index % 2 ? 0.16 : -0.16, "topology-warp", {
        role: "2d-to-3d",
        layer: "motion",
        chapterId: segment.chapterId,
        topologyId: segment.chapterId,
        profileIndex: profile.index,
        warpStyle: profile.warpStyle,
        toneHz: profile.boardHz,
        visualAnchor: "drawChapterScene:morph-smootherstep(0.46,0.84)",
        visualStartProgress: 0.46,
        visualEndProgress: 0.84
      });
      add(`${segment.chapterId}-morph-lock`, morphEnd, 78 + profile.index * 3, 0.115, 0, "topology-lock", {
        role: "2d-to-3d",
        layer: "arrival",
        chapterId: segment.chapterId,
        topologyId: segment.chapterId,
        profileIndex: profile.index,
        warpStyle: profile.warpStyle,
        toneHz: profile.tailHz,
        visualAnchor: "drawChapterScene:morph-complete",
        visualProgress: 0.84
      });
    }
  });

  const tableau = timeline.segments.find((segment) => segment.kind === "tableau");
  const finale = timeline.segments.find((segment) => segment.kind === "finale");
  if (tableau) add("tableau-convergence", tableau.startFrame, tableau.durationFrames, 0.21, 0, "convergence", {
    role: "seven-worlds",
    layer: "convergence",
    visualAnchor: "tableau:start"
  });
  if (finale) {
    const challengeCue = timeline.cues.find((cue) => cue.id === "caption-36");
    const stoneCue = timeline.cues.find((cue) => cue.id === "caption-37");
    const witnessCue = timeline.cues.find((cue) => cue.id === "caption-39");
    const breathStart = challengeCue?.startFrame ?? finale.startFrame + Math.round(finale.durationFrames * 0.42);
    const decisiveFrame = stoneCue
      ? stoneCue.startFrame + Math.round(stoneCue.durationFrames * 0.45)
      : finale.startFrame + Math.round(finale.durationFrames * 0.58);
    add("finale-challenge-breath", breathStart, Math.max(72, (stoneCue?.startFrame ?? breathStart + 180) - breathStart - 22), 0.17, 0, "final-breath", {
      role: "final-challenge",
      layer: "approach",
      visualAnchor: "caption-36:start-to-caption-37:pre-roll"
    });
    add("finale-decisive-stone-click", decisiveFrame, 22, 0.56, 0, "final-stone", {
      role: "decisive-move",
      layer: "transient",
      toneHz: profiles.sphere.clickHz,
      boardHz: profiles.sphere.boardHz,
      visualAnchor: "caption-37:45-percent"
    });
    add("finale-decisive-stone-board", decisiveFrame + 1, 104, 0.31, 0, "final-board", {
      role: "decisive-move",
      layer: "board-resonance",
      toneHz: profiles.sphere.tailHz,
      boardHz: profiles.sphere.boardHz,
      visualAnchor: "caption-37:45-percent"
    });
    add("finale-decisive-stone-tail", decisiveFrame + 5, 260, 0.16, 0, "final-tail", {
      role: "decisive-move",
      layer: "space-tail",
      toneHz: profiles.sphere.tailHz,
      visualAnchor: "caption-37:45-percent"
    });
    if (witnessCue) add("finale-world-reveal", witnessCue.startFrame, witnessCue.durationFrames, 0.14, 0, "logo-bloom", {
      role: "final-challenge",
      layer: "reveal",
      toneHz: profiles.sphere.tailHz,
      visualAnchor: "caption-39:start"
    });
  }
  return events.sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
}

function duckGainAtFrame(frame, cues) {
  let amount = 0;
  for (const cue of cues) {
    const attackStart = cue.startFrame - 12;
    const releaseEnd = cue.endFrame + 24;
    if (frame < attackStart || frame >= releaseEnd) continue;
    const attack = Math.max(0, Math.min(1, (frame - attackStart) / 12));
    const release = Math.max(0, Math.min(1, (releaseEnd - frame) / 24));
    amount = Math.max(amount, Math.min(attack, release));
  }
  return 1 - amount * 0.48;
}

function buildManifest({ story, timing, timeline, musicPlan, audio, sourcePaths, probes, metrics }) {
  return {
    schemaVersion: 2,
    title: story.title,
    fps: timeline.fps,
    sampleRate: story.render.sampleRate,
    samplesPerFrame: story.render.sampleRate / timeline.fps,
    totalFrames: timeline.totalFrames,
    durationSeconds: timeline.durationSeconds,
    seed: SCORE_SEED,
    source: {
      story: toRepositoryPath(storyPath),
      storySha256: sha256(storyPath),
      timing: toRepositoryPath(timingPath),
      timingSha256: sha256(timingPath),
      script: toRepositoryPath(scriptTextPath),
      suppliedScriptSha256: timing.sources.script.sha256,
      timingPolicy: timing.timingPolicy
    },
    voice: {
      speaker: "余荫铠",
      sourceFileName: timing.sources.voice.fileName,
      sourceDurationSeconds: timing.sources.voice.sourceDurationSeconds,
      sourceSha256: timing.sources.voice.sha256,
      processing: "One continuous take; decoded once to 48 kHz stereo PCM; no edits, reordering or time stretch; frame-aligned tail silence only",
      alignment: metrics.voiceAlignment
    },
    music: {
      plan: toRepositoryPath(musicPlanPath),
      planSha256: sha256(musicPlanPath),
      reference: musicPlan.reference,
      sources: musicPlan.sources.map((source) => ({
        ...source,
        artifact: sourcePaths.has(source.id) ? artifact(sourcePaths.get(source.id)) : null,
        probe: probes.musicSources?.[source.id] ?? null
      })),
      clips: musicPlan.clips
    },
    audio: {
      rendered: Boolean(audio.artifacts),
      format: { codec: "pcm_s16le", sampleRate: story.render.sampleRate, channels: 2, bitDepth: 16 },
      originalVoice: audio.originalVoice,
      voiceStem: audio.voiceStem,
      musicStem: audio.musicStem,
      sfxStem: audio.sfxStem,
      scoreMix: audio.scoreMix,
      masterMix: audio.masterMix,
      mix: {
        voiceGain: 1.06,
        musicGain: `${musicPlan.editing.postMixGain} base after once-per-source normalization; multiplied by 0.52 under speech with 12-frame attack / 24-frame release`,
        sfxGain: 0.82,
        limiter: "deterministic tanh soft limiter, 0.96 ceiling"
      },
      metrics,
      artifacts: audio.artifacts ?? {}
    },
    segments: timeline.segments,
    cues: timeline.cues,
    subtitles: timeline.subtitles
  };
}

export async function buildAudio(options = parseArguments([])) {
  const story = readJson(storyPath);
  const timing = readJson(timingPath);
  const musicPlan = readJson(musicPlanPath);
  const timeline = buildTimeline(story, timing);
  validateMusicPlan(musicPlan, timeline);
  if (story.render.fps !== 60 || story.render.sampleRate !== 48000) throw new Error("Chapter teaser audio requires 60 fps and 48 kHz");

  const outputRoot = path.resolve(options.outputRoot ?? DEFAULT_OUTPUT_ROOT);
  const sourceVoiceCache = path.join(outputRoot, "source", "voice-original.mp3");
  const suppliedVoicePath = options.voicePath || (fs.existsSync(sourceVoiceCache) ? sourceVoiceCache : null);
  if (!suppliedVoicePath || !fs.existsSync(suppliedVoicePath)) {
    throw new Error("The supplied narration is required; pass --voice PATH or set PV_VOICE_PATH");
  }
  const voiceDigest = sha256(suppliedVoicePath);
  if (voiceDigest !== VOICE_SHA256 || voiceDigest !== timing.sources.voice.sha256) throw new Error(`Narration checksum mismatch: ${voiceDigest}`);
  copyFileIfDifferent(suppliedVoicePath, sourceVoiceCache);

  fs.mkdirSync(outputRoot, { recursive: true });
  const audio = {
    originalVoice: toRepositoryPath(path.join(outputRoot, "audio", "voice-original.mp3")),
    voiceStem: toRepositoryPath(path.join(outputRoot, "audio", "voice.wav")),
    musicStem: toRepositoryPath(path.join(outputRoot, "audio", "music.wav")),
    sfxStem: toRepositoryPath(path.join(outputRoot, "audio", "sfx.wav")),
    scoreMix: toRepositoryPath(path.join(outputRoot, "audio", "music-and-sfx.wav")),
    masterMix: toRepositoryPath(path.join(outputRoot, "audio", "master.wav")),
    artifacts: null
  };
  const absoluteAudio = Object.fromEntries(Object.entries(audio)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => [key, path.resolve(repositoryRoot, value)]));
  const sourcePaths = options.renderAudio === false
    ? new Map()
    : await ensureMusicSources(musicPlan, options.musicSourceRoot, options.allowDownload);
  const probes = { musicSources: {} };
  const metrics = {};

  if (options.renderAudio !== false) {
    const ffmpeg = resolveExecutable("FFMPEG_PATH", ["ffmpeg"]);
    const ffprobe = resolveExecutable("FFPROBE_PATH", ["ffprobe"]);
    fs.mkdirSync(path.dirname(absoluteAudio.masterMix), { recursive: true });
    copyFileIfDifferent(sourceVoiceCache, absoluteAudio.originalVoice);
    for (const [id, sourcePath] of sourcePaths) probes.musicSources[id] = probeAudio(ffprobe, sourcePath);

    const totalSampleFrames = timeline.totalFrames * story.render.sampleRate / timeline.fps;
    process.stdout.write("Preparing exact supplied narration…\n");
    const endCardStartFrame = timeline.segments.find((segment) => segment.kind === "end-card")?.startFrame ?? timeline.totalFrames;
    metrics.voiceAlignment = renderVoiceStem({
      ffmpeg,
      sourcePath: sourceVoiceCache,
      outputPath: absoluteAudio.voiceStem,
      totalSampleFrames,
      sampleRate: story.render.sampleRate,
      silentFromSampleFrame: endCardStartFrame * story.render.sampleRate / timeline.fps
    });
    process.stdout.write(`Editing ${musicPlan.clips.length} curated music clips…\n`);
    metrics.musicAlignment = renderMusicStem({ ffmpeg, plan: musicPlan, sourcePaths, outputPath: absoluteAudio.musicStem, totalFrames: timeline.totalFrames });

    const sfxEvents = buildSfxEvents(timeline);
    process.stdout.write(`Rendering ${sfxEvents.length} topology sound events…\n`);
    metrics.sfx = renderScoreStem({
      stem: "fx",
      events: sfxEvents,
      totalFrames: timeline.totalFrames,
      sampleRate: story.render.sampleRate,
      outputPath: absoluteAudio.sfxStem,
      silentFromFrame: endCardStartFrame
    });
    metrics.sfx.events = sfxEvents;
    process.stdout.write("Mixing music + sound design stem…\n");
    metrics.scoreMix = mixPcm16Stereo({
      inputs: [{ path: absoluteAudio.musicStem, gain: 1 }, { path: absoluteAudio.sfxStem, gain: 0.82 }],
      outputPath: absoluteAudio.scoreMix,
      totalFrames: totalSampleFrames,
      sampleRate: story.render.sampleRate
    });

    const musicDuckByVideoFrame = Float32Array.from({ length: timeline.totalFrames }, (_, frame) => duckGainAtFrame(frame, timeline.cues));
    process.stdout.write("Mixing narration, curated music and sound design…\n");
    metrics.masterMix = mixPcm16Stereo({
      inputs: [
        {
          path: absoluteAudio.musicStem,
          gain: (sampleFrame) => musicDuckByVideoFrame[Math.min(
            musicDuckByVideoFrame.length - 1,
            Math.floor(sampleFrame * timeline.fps / story.render.sampleRate)
          )]
        },
        { path: absoluteAudio.sfxStem, gain: 0.82 },
        { path: absoluteAudio.voiceStem, gain: 1.06 }
      ],
      outputPath: absoluteAudio.masterMix,
      totalFrames: totalSampleFrames,
      sampleRate: story.render.sampleRate
    });
    const endCardStartSampleFrame = endCardStartFrame * story.render.sampleRate / timeline.fps;
    metrics.endCardDigitalSilence = Object.fromEntries(
      ["musicStem", "sfxStem", "voiceStem", "scoreMix", "masterMix"].map((key) => [
        key,
        enforceDigitalSilenceTail(absoluteAudio[key], endCardStartSampleFrame)
      ])
    );
    for (const key of ["originalVoice", "voiceStem", "musicStem", "sfxStem", "scoreMix", "masterMix"]) probes[key] = probeAudio(ffprobe, absoluteAudio[key]);
    metrics.probes = probes;
    audio.artifacts = Object.fromEntries(
      ["originalVoice", "voiceStem", "musicStem", "sfxStem", "scoreMix", "masterMix"].map((key) => [key, artifact(absoluteAudio[key])])
    );
  }

  const manifest = buildManifest({ story, timing, timeline, musicPlan, audio, sourcePaths, probes, metrics });
  writeJson(committedManifestPath, manifest);
  writeJson(path.join(outputRoot, "manifest.json"), manifest);
  fs.writeFileSync(srtPath, serializeSrt(timeline.subtitles, timeline.fps), "utf8");
  fs.writeFileSync(assPath, serializeAss(timeline.subtitles, timeline.fps), "utf8");
  process.stdout.write(`Built ${timeline.cues.length} cues / ${timeline.totalFrames} frames / ${timeline.durationSeconds.toFixed(3)} seconds.\n`);
  process.stdout.write(`Manifest: ${committedManifestPath}\n`);
  if (options.renderAudio !== false) process.stdout.write(`Master: ${absoluteAudio.masterMix}\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  buildAudio(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createPcm16StereoHeader } from "../src/audio-wav.mjs";
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
      if (!allowDownload) throw new Error(`Missing music source ${sourcePath}`);
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

function renderVoiceStem({ ffmpeg, sourcePath, outputPath, totalSampleFrames, sampleRate }) {
  const rawPath = `${outputPath}.raw`;
  if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
  runChecked(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", sourcePath, "-map", "0:a:0", "-vn",
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
  const rawPath = `${outputPath}.raw`;
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const clip of plan.clips) args.push("-i", sourcePaths.get(clip.sourceId));
  const filters = [];
  plan.clips.forEach((clip, index) => {
    const duration = (clip.targetEndFrame - clip.targetStartFrame) / fps;
    const fadeIn = Math.min(duration / 2, (clip.fadeInFrames ?? 0) / fps);
    const fadeOut = Math.min(duration / 2, (clip.fadeOutFrames ?? 0) / fps);
    const fadeOutStart = Math.max(0, duration - fadeOut);
    const delayMs = Math.round(clip.targetStartFrame * 1000 / fps);
    const chain = [
      `atrim=start=${Number(clip.sourceInSeconds || 0).toFixed(6)}:duration=${duration.toFixed(6)}`,
      "asetpts=PTS-STARTPTS",
      `aresample=${plan.sampleRate}`,
      "aformat=sample_fmts=fltp:channel_layouts=stereo",
      `loudnorm=I=${plan.editing.normalizationTargetLufs}:TP=${plan.editing.truePeakDb}:LRA=11`
    ];
    if (fadeIn > 0) chain.push(`afade=t=in:st=0:d=${fadeIn.toFixed(6)}`);
    if (fadeOut > 0) chain.push(`afade=t=out:st=${fadeOutStart.toFixed(6)}:d=${fadeOut.toFixed(6)}`);
    chain.push(`adelay=${delayMs}|${delayMs}`, `apad=whole_dur=${totalSeconds.toFixed(6)}`, `atrim=duration=${totalSeconds.toFixed(6)}`);
    filters.push(`[${index}:a]${chain.join(",")}[clip${index}]`);
  });
  const inputs = plan.clips.map((_, index) => `[clip${index}]`).join("");
  const logoStart = plan.editing.logoWindow.startFrame / fps;
  const logoEnd = plan.editing.logoWindow.endFrame / fps;
  filters.push(
    `${inputs}amix=inputs=${plan.clips.length}:duration=longest:dropout_transition=0:normalize=0,`
    + `volume=${plan.editing.postMixGain},`
    + `volume='if(between(t,${logoStart.toFixed(6)},${logoEnd.toFixed(6)}),${plan.editing.logoWindow.gain},1)':eval=frame,`
    + `alimiter=limit=0.90:level=false,atrim=duration=${totalSeconds.toFixed(6)},asetpts=N/SR/TB[music]`
  );
  args.push(
    "-filter_complex", filters.join(";"), "-map", "[music]",
    "-ar", String(plan.sampleRate), "-ac", "2",
    "-c:a", "pcm_s16le", "-f", "s16le", rawPath
  );
  runChecked(ffmpeg, args, "Curated music edit", 600000);
  const alignment = wrapRawPcm16Stereo(rawPath, outputPath, totalFrames * plan.sampleRate / fps, plan.sampleRate);
  fs.unlinkSync(rawPath);
  return alignment;
}

export function buildSfxEvents(timeline) {
  const events = [];
  const add = (id, startFrame, durationFrames, velocity, pan, kind, metadata = {}) => {
    events.push({ id, startFrame, durationFrames, velocity, pan, kind, midi: 50, ...metadata });
  };
  add("intro-hidden-seam", 770, 210, 0.34, -0.16, "seam", { role: "boundary-connection" });
  add("institution-logo-resonance", 1225, 180, 0.22, 0, "seam", { role: "institution-logo" });
  add("seven-worlds-awaken", 1466, 220, 0.32, 0.12, "seam", { role: "awakening" });
  timeline.segments.filter((segment) => segment.kind === "chapter-card").forEach((segment, chapterIndex) => {
    add(`${segment.chapterId}-card-impact`, segment.startFrame, 72, 0.48, 0, "impact", { role: "chapter-card" });
    add(`${segment.chapterId}-title-transform`, segment.transformFrame - 18, 128, 0.26, chapterIndex % 2 ? 0.16 : -0.16, "seam", { role: "title-transform" });
  });
  timeline.segments.filter((segment) => segment.kind === "chapter").forEach((segment, chapterIndex) => {
    const duration = segment.durationFrames;
    [0.10, 0.16, 0.22, 0.28, 0.34].forEach((progress, stoneIndex) => {
      add(
        `${segment.chapterId}-stone-${stoneIndex + 1}`,
        segment.startFrame + Math.round(duration * progress), 30,
        0.30 + stoneIndex * 0.028, (stoneIndex - 2) * 0.075, "stone",
        { role: "five-in-a-row", chapterId: segment.chapterId }
      );
    });
    if (segment.chapterId !== "plane") {
      add(
        `${segment.chapterId}-morph`, segment.startFrame + Math.round(duration * 0.46),
        Math.max(72, Math.round(duration * 0.38)), 0.24,
        chapterIndex % 2 ? 0.2 : -0.2, "seam",
        { role: "2d-to-3d", chapterId: segment.chapterId }
      );
    }
  });
  const tableau = timeline.segments.find((segment) => segment.kind === "tableau");
  const finale = timeline.segments.find((segment) => segment.kind === "finale");
  const endCard = timeline.segments.find((segment) => segment.kind === "end-card");
  if (tableau) add("tableau-convergence", tableau.startFrame, tableau.durationFrames, 0.32, 0, "seam", { role: "seven-worlds" });
  if (finale) {
    add("finale-breath", finale.startFrame + 510, 180, 0.27, 0, "seam", { role: "final-challenge" });
    add("finale-decisive-stone", 11802, 44, 0.64, 0, "stone", { role: "decisive-move" });
  }
  if (endCard) add("end-card-arrival", endCard.startFrame, 120, 0.29, 0, "impact", { role: "end-card" });
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
        musicGain: "1.0 in pauses; 0.52 under speech with 12-frame attack / 24-frame release",
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
    metrics.voiceAlignment = renderVoiceStem({ ffmpeg, sourcePath: sourceVoiceCache, outputPath: absoluteAudio.voiceStem, totalSampleFrames, sampleRate: story.render.sampleRate });
    process.stdout.write(`Editing ${musicPlan.clips.length} curated music clips…\n`);
    metrics.musicAlignment = renderMusicStem({ ffmpeg, plan: musicPlan, sourcePaths, outputPath: absoluteAudio.musicStem, totalFrames: timeline.totalFrames });

    const sfxEvents = buildSfxEvents(timeline);
    process.stdout.write(`Rendering ${sfxEvents.length} topology sound events…\n`);
    metrics.sfx = renderScoreStem({ stem: "fx", events: sfxEvents, totalFrames: timeline.totalFrames, sampleRate: story.render.sampleRate, outputPath: absoluteAudio.sfxStem });
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

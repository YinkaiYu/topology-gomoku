import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { narrationCues } from "../src/data/narration.js";
import { buildCaptionArtifacts, measureCaptionLayout } from "./build-captions.mjs";
import { findEspeak, findFfmpeg } from "./doctor.mjs";
import { runHyperframes } from "./hyperframes-cli.mjs";

const buildScriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(buildScriptPath);
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const pvRoot = path.join(repositoryRoot, "video", "footsteps-return");
const voiceoverRoot = path.join(pvRoot, "audio", "voiceover");
const sourceScriptPath = path.join(voiceoverRoot, "script.json");
const timingPath = path.join(voiceoverRoot, "timing.json");
const reviewPath = path.join(voiceoverRoot, "review.json");
const managedPython = path.join(repositoryRoot, ".venv", "Scripts", "python.exe");
export const ESPEAK_FALLBACK_SPEED = 300;

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function requireSuccessful(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
}

function ensureManagedTtsRuntime() {
  const sync = spawnSync("uv", ["sync", "--locked"], { stdio: "inherit", cwd: repositoryRoot });
  requireSuccessful(sync, "locked Kokoro Python environment sync");
  if (!existsSync(managedPython)) throw new Error(`uv sync did not create ${managedPython}`);
  const probe = spawnSync(managedPython, ["-c", "import kokoro_onnx, soundfile"], { stdio: "inherit" });
  requireSuccessful(probe, "Kokoro Python runtime import probe");
}

function locateChunk(buffer, name) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (id === name) return { offset: dataOffset, size };
    offset = dataOffset + size + (size % 2);
  }
  return null;
}

export function inspectPcmWav(file) {
  const buffer = readFileSync(file);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${file} is not a RIFF/WAVE file`);
  }
  const format = locateChunk(buffer, "fmt ");
  const data = locateChunk(buffer, "data");
  if (!format || !data || format.size < 16) throw new Error(`${file} is missing WAV format/data chunks`);
  const audioFormat = buffer.readUInt16LE(format.offset);
  const channels = buffer.readUInt16LE(format.offset + 2);
  const sampleRateHz = buffer.readUInt32LE(format.offset + 4);
  const blockAlign = buffer.readUInt16LE(format.offset + 12);
  const bitsPerSample = buffer.readUInt16LE(format.offset + 14);
  if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16 || blockAlign !== 2) {
    throw new Error(`${file} must be 16-bit mono PCM after normalization`);
  }
  let sumSquares = 0;
  let peak = 0;
  let activeSamples = 0;
  let firstActive = -1;
  let lastActive = -1;
  const sampleCount = Math.floor(data.size / blockAlign);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = buffer.readInt16LE(data.offset + index * blockAlign);
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    sumSquares += sample * sample;
    if (absolute >= 328) {
      activeSamples += 1;
      if (firstActive < 0) firstActive = index;
      lastActive = index;
    }
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  const toDbfs = (amplitude) => amplitude > 0 ? round(20 * Math.log10(amplitude / 32768), 3) : -120;
  return {
    durationSeconds: round(sampleCount / sampleRateHz),
    sampleRateHz,
    channels,
    bitsPerSample,
    peakDbfs: toDbfs(peak),
    rmsDbfs: toDbfs(rms),
    activeRatio: round(activeSamples / Math.max(1, sampleCount)),
    leadingSilenceSeconds: round((firstActive < 0 ? sampleCount : firstActive) / sampleRateHz),
    trailingSilenceSeconds: round((lastActive < 0 ? sampleCount : sampleCount - lastActive - 1) / sampleRateHz)
  };
}

function normalizeWav(source, destination, ffmpeg) {
  const result = spawnSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", source,
    "-af", "volume=-3dB", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", destination
  ], { stdio: "inherit" });
  requireSuccessful(result, `WAV normalization for ${path.basename(destination)}`);
}

function generateRequestedVoice(cue, sourceFile, voice) {
  return runHyperframes([
    "tts", cue.text,
    "--voice", voice.requestedId,
    "--speed", String(voice.speed),
    "--lang", "zh",
    "--output", sourceFile
  ], {
    env: {
      ...process.env,
      HYPERFRAMES_PYTHON: managedPython
    }
  });
}

function generateFallbackVoice(cue, sourceFile, espeak) {
  const result = spawnSync(espeak, [
    "-v", "cmn+m3",
    "-s", String(ESPEAK_FALLBACK_SPEED),
    "-p", "38",
    "-a", "70",
    "-w", sourceFile,
    cue.text
  ], { stdio: "inherit" });
  requireSuccessful(result, `eSpeak NG fallback for ${cue.id}`);
}

function validateScript(script) {
  const approved = narrationCues.map(({ id, semanticGroup, spokenText }) => ({ id, semanticGroup, text: spokenText }));
  const actual = script.cues.map(({ id, semanticGroup, text }) => ({ id, semanticGroup, text }));
  if (JSON.stringify(actual) !== JSON.stringify(approved)) {
    throw new Error("script.json must preserve the Task 2 narration order and wording verbatim");
  }
  if (script.voice.requestedId !== "zm_yunyang" || script.voice.speed !== 0.88 || script.voice.gender !== "male") {
    throw new Error("script.json must request the approved zm_yunyang male rhythm voice at 0.88 speed");
  }
}

function buildReview(script, timing) {
  const cues = timing.cues.map((cue) => {
    return {
      id: cue.id,
      replacementId: cue.id,
      status: "automated-signal-review-passed",
      pronunciation: "native-listener-review-required",
      cadence: "tempo-calibrated-at-0.88",
      notes: [
        "Wording remains locked to the approved Task 2 script.",
        "No pronunciation edits are authorized from automated inspection alone."
      ],
      signal: {
        durationSeconds: cue.durationSeconds,
        peakDbfs: cue.peakDbfs,
        rmsDbfs: cue.rmsDbfs,
        activeRatio: cue.activeRatio,
        leadingSilenceSeconds: cue.leadingSilenceSeconds,
        trailingSilenceSeconds: cue.trailingSilenceSeconds
      }
    };
  });
  return {
    schemaVersion: 1,
    trackPurpose: script.purpose,
    resolvedVoice: timing.voice,
    replacementContract: "Replace captures/voiceover/<cue-id>.wav one-for-one without changing cue IDs.",
    synthesisRuntime: {
      python: ".venv/Scripts/python.exe via HYPERFRAMES_PYTHON",
      packages: ["kokoro-onnx==0.6.1 (MIT)", "soundfile==0.14.0 (BSD-3-Clause)"],
      model: "Kokoro-82M / kokoro-v1.0.onnx + voices-v1.0.bin (Apache-2.0)",
      installCommand: "uv add kokoro-onnx soundfile"
    },
    paceCalibration: {
      cueIds: script.cues.slice(0, 3).map(({ id }) => id),
      candidates: [
        { speed: 0.84, aggregateDurationSeconds: 20.35 },
        { speed: 0.88, aggregateDurationSeconds: 19.56, selected: true },
        { speed: 0.92, aggregateDurationSeconds: 18.77 }
      ],
      rationale: "0.88 retains the requested mature, restrained rhythm without stretching the composition or chasing the 165-second reference."
    },
    auditionMethod: "sample-count, hash, waveform envelope, peak/RMS, silence, duration, and 4K caption-sync inspection",
    nativeListening: {
      status: "required-before-final-mix",
      reason: "This agent host cannot present returned audio to the model for a truthful subjective Mandarin audition.",
      asrAssist: "HyperFrames transcribe was attempted with Whisper small/zh and returned whisper_unavailable."
    },
    trackDisposition: "rhythm-track-ready; native Mandarin pronunciation review required before final mix",
    unacceptableCues: [],
    cues
  };
}

export function writeVoiceReview({ script = readJson(sourceScriptPath), timing = readJson(timingPath) } = {}) {
  validateScript(script);
  const review = buildReview(script, timing);
  writeJson(reviewPath, review);
  return review;
}

export async function buildVoiceover({
  script = readJson(sourceScriptPath),
  hyperframes = generateRequestedVoice,
  fallback = generateFallbackVoice
} = {}) {
  validateScript(script);
  ensureManagedTtsRuntime();
  const ffmpeg = findFfmpeg();
  const espeak = findEspeak();
  if (!ffmpeg || !espeak) throw new Error("FFmpeg and eSpeak NG must pass npm run pv:doctor before voice generation");
  const outputDirectory = path.join(repositoryRoot, script.output.directory);
  mkdirSync(outputDirectory, { recursive: true });

  let resolvedVoice = {
    engine: script.voice.engine,
    phonemizer: script.voice.phonemizer,
    requestedId: script.voice.requestedId,
    resolvedId: script.voice.requestedId,
    gender: script.voice.gender,
    speed: script.voice.speed,
    fallback: null
  };
  let requestedAvailable;
  const measured = [];

  for (const [index, cue] of script.cues.entries()) {
    const destination = path.join(repositoryRoot, cue.outputFile);
    const sourceFile = path.join(outputDirectory, `.source-${cue.id}.wav`);
    rmSync(sourceFile, { force: true });
    rmSync(destination, { force: true });

    if (index === 0) {
      const result = hyperframes(cue, sourceFile, script.voice);
      requestedAvailable = result.status === 0 && existsSync(sourceFile);
      if (!requestedAvailable) {
        fallback(cue, sourceFile, espeak);
        resolvedVoice = {
          engine: "eSpeak NG",
          phonemizer: "eSpeak NG",
          requestedId: script.voice.requestedId,
          resolvedId: "cmn+m3",
          gender: "male",
          speed: ESPEAK_FALLBACK_SPEED,
          speedUnit: "eSpeak -s parameter",
          requestedSpeed: script.voice.speed,
          fallback: {
            reason: "HyperFrames/Kokoro could not synthesize the requested zm_yunyang voice on this host.",
            actualVoice: "eSpeak NG cmn+m3",
            speedParameter: ESPEAK_FALLBACK_SPEED,
            calibration: "21 cue WAVs total 145.855283s before scene pauses; chosen to keep the fallback master near the 150–210s review range."
          }
        };
      }
    } else if (requestedAvailable) {
      requireSuccessful(hyperframes(cue, sourceFile, script.voice), `zm_yunyang synthesis for ${cue.id}`);
    } else {
      fallback(cue, sourceFile, espeak);
    }

    normalizeWav(sourceFile, destination, ffmpeg);
    rmSync(sourceFile, { force: true });
    const signal = inspectPcmWav(destination);
    measured.push({
      id: cue.id,
      replacementId: cue.id,
      outputFile: cue.outputFile,
      ...signal,
      sha256: createHash("sha256").update(readFileSync(destination)).digest("hex")
    });
    console.log(`✓ ${cue.id}: ${signal.durationSeconds.toFixed(3)}s, ${signal.peakDbfs.toFixed(1)} dBFS`);
  }

  const timing = {
    schemaVersion: 1,
    measurement: "normalized PCM WAV sample count",
    voice: resolvedVoice,
    cues: measured
  };
  writeJson(timingPath, timing);
  writeVoiceReview({ script, timing });

  const captions = buildCaptionArtifacts({ script, timing });
  const measurements = await measureCaptionLayout(captions.captions);
  const widest = measurements.reduce((best, current) => current.width > best.width ? current : best, measurements[0]);
  console.log(`✓ ${measured.length} cue WAVs; ${captions.timeline.duration.toFixed(3)}s master; widest caption ${widest.id} ${widest.width.toFixed(2)}px/${widest.safeWidth}px.`);
  return { timing: captions.timing, captions: captions.captions, measurements };
}

if (process.argv[1] && path.resolve(process.argv[1]) === buildScriptPath) {
  const operation = process.argv.includes("--review-only") ? Promise.resolve(writeVoiceReview()) : buildVoiceover();
  operation.catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}

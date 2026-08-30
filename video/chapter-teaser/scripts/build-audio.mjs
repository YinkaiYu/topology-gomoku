import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  findAudibleBounds,
  mixResampledCue,
  readWav,
  writePcm16Stereo
} from "../src/audio-wav.mjs";
import {
  buildTimeline,
  flattenStoryCues,
  serializeAss,
  serializeSrt
} from "../src/audio-timeline.mjs";
import {
  ORCHESTRAL_PART_BUSES,
  SCORE_SEED,
  SCORE_STEMS,
  VOICE_DUCK_REDUCTION,
  buildScorePlan,
  buildScoreTimeWarpAnchors,
  mixPcm16Stereo,
  orchestralSourcePartPath,
  renderOrchestralScoreStem,
  scoreManifestDescription,
  scoreMixInputs,
  validateOrchestralSources,
  validateScorePlan,
  voiceDuckGain
} from "../src/audio-synth.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const pvRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(pvRoot, "../..");
const storyPath = path.join(pvRoot, "story.json");
const committedManifestPath = path.join(pvRoot, "manifest.json");
const srtPath = path.join(pvRoot, "captions.srt");
const assPath = path.join(pvRoot, "captions.ass");
const DEFAULT_OUTPUT_ROOT = path.join(repositoryRoot, ".tmp", "chapter-teaser");
const TRIM_OPTIONS = Object.freeze({ thresholdDb: -46, preRollMs: 20, postRollMs: 60 });
const SCORE_SOURCE_DURATION_SECONDS = 183.352;

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

function resolveRepositoryPath(relativePath) {
  return path.resolve(repositoryRoot, relativePath.replaceAll("/", path.sep));
}

function artifact(filePath) {
  return {
    path: toRepositoryPath(filePath),
    bytes: fs.statSync(filePath).size,
    sha256: sha256(filePath)
  };
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

function resolveMuseScore() {
  const candidates = [
    process.env.MUSESCORE_PATH,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "MuseScore 4", "bin", "MuseScore4.exe"),
    "MuseScore4.exe",
    "MuseScore4",
    "musescore"
  ].filter(Boolean);
  const resolved = candidates.find((candidate) => executableProbe(candidate, ["--version"]));
  if (!resolved) {
    throw new Error("MuseScore 4 is required to rebuild the committed original MusicXML score; install MuseScore 4 or set MUSESCORE_PATH");
  }
  return resolved;
}

function resolveFfmpeg() {
  const candidates = [process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean);
  const resolved = candidates.find((candidate) => executableProbe(candidate));
  if (!resolved) throw new Error("FFmpeg is required to normalize the MuseScore renders to exact 48 kHz stereo PCM");
  return resolved;
}

function runChecked(executable, args, label, timeout = 180000) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    windowsHide: true,
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} exited with status ${result.status}${detail ? `\n${detail}` : ""}`);
  }
}

function sourceRenderSidecarPath(renderedPath) {
  return `${renderedPath}.source.json`;
}

function renderedSourcePartIsCurrent(renderedPath, sourcePath) {
  const sidecarPath = sourceRenderSidecarPath(renderedPath);
  if (!fs.existsSync(renderedPath) || !fs.existsSync(sidecarPath)) return false;
  const sidecar = readJson(sidecarPath);
  return sidecar.sourceSha256 === sha256(sourcePath)
    && sidecar.renderer === "MuseScore Basic"
    && sidecar.sampleRate === 48000
    && sidecar.channels === 2
    && sidecar.durationSeconds === SCORE_SOURCE_DURATION_SECONDS
    && sidecar.renderedSha256 === sha256(renderedPath);
}

function renderOrchestralSourceParts(outputRoot) {
  const museScore = resolveMuseScore();
  const ffmpeg = resolveFfmpeg();
  const sourceRenderRoot = path.join(outputRoot, "audio", "orchestra-source");
  fs.mkdirSync(sourceRenderRoot, { recursive: true });
  const parts = Object.values(ORCHESTRAL_PART_BUSES).flat();
  const rendered = {};
  let cacheHits = 0;

  for (const part of parts) {
    const sourcePath = orchestralSourcePartPath(part.id);
    const renderedPath = path.join(sourceRenderRoot, `${part.id}.wav`);
    const rawPath = path.join(sourceRenderRoot, `${part.id}.musescore.wav`);
    rendered[part.id] = renderedPath;
    if (renderedSourcePartIsCurrent(renderedPath, sourcePath)) {
      cacheHits += 1;
      continue;
    }
    if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
    if (fs.existsSync(renderedPath)) fs.unlinkSync(renderedPath);
    process.stdout.write(`Rendering original MusicXML part ${part.id} with MuseScore Basic…\n`);
    runChecked(
      museScore,
      ["--sound-profile", "MuseScore Basic", "-o", rawPath, sourcePath],
      `MuseScore render for ${part.id}`,
      300000
    );
    if (!fs.existsSync(rawPath)) throw new Error(`MuseScore returned success without creating ${rawPath}`);
    runChecked(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", rawPath,
      "-af", `volume=0.72,apad=whole_dur=${SCORE_SOURCE_DURATION_SECONDS},atrim=duration=${SCORE_SOURCE_DURATION_SECONDS},asetpts=N/SR/TB`,
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
      renderedPath
    ], `48 kHz normalization for ${part.id}`);
    fs.unlinkSync(rawPath);
    writeJson(sourceRenderSidecarPath(renderedPath), {
      schemaVersion: 1,
      partId: part.id,
      source: toRepositoryPath(sourcePath),
      sourceSha256: sha256(sourcePath),
      renderer: "MuseScore Basic",
      sampleRate: 48000,
      channels: 2,
      durationSeconds: SCORE_SOURCE_DURATION_SECONDS,
      renderedSha256: sha256(renderedPath)
    });
  }

  return {
    paths: rendered,
    metrics: {
      partCount: parts.length,
      cacheHits,
      renderer: "MuseScore Basic",
      sampleRate: 48000,
      channels: 2,
      sourceDurationSeconds: SCORE_SOURCE_DURATION_SECONDS
    }
  };
}

export function parseArguments(argv) {
  const options = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    voiceRate: 0,
    forceVoice: false,
    skipVoiceBuild: false,
    renderAudio: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force-voice") options.forceVoice = true;
    else if (argument === "--skip-voice-build") options.skipVoiceBuild = true;
    else if (argument === "--timeline-only") options.renderAudio = false;
    else if (argument === "--output") options.outputRoot = path.resolve(argv[++index]);
    else if (argument.startsWith("--output=")) options.outputRoot = path.resolve(argument.slice("--output=".length));
    else if (argument === "--voice-rate") options.voiceRate = Number(argv[++index]);
    else if (argument.startsWith("--voice-rate=")) options.voiceRate = Number(argument.slice("--voice-rate=".length));
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (![-1, 0].includes(options.voiceRate)) throw new Error("--voice-rate must be -1 or 0");
  return options;
}

function voiceManifestIsCurrent(voiceManifest, story, outputRoot, voiceRate) {
  if (!voiceManifest || voiceManifest.voice?.displayName !== "Microsoft Kangkang" || voiceManifest.voice?.rate !== voiceRate) return false;
  const expected = flattenStoryCues(story);
  const entries = new Map((voiceManifest.cues ?? []).map((cue) => [cue.id, cue]));
  return expected.every((cue) => {
    const entry = entries.get(cue.id);
    if (!entry || entry.text !== cue.text) return false;
    const expectedPath = path.join(outputRoot, "voice", "raw", `${cue.id}.wav`);
    return path.resolve(resolveRepositoryPath(entry.path)) === path.resolve(expectedPath)
      && fs.existsSync(expectedPath)
      && fs.statSync(expectedPath).size > 44;
  });
}

function runVoiceBuilder({ story, outputRoot, voiceRate, forceVoice, skipVoiceBuild }) {
  const voiceManifestPath = path.join(outputRoot, "voice", "voice-manifest.json");
  let voiceManifest = fs.existsSync(voiceManifestPath) ? readJson(voiceManifestPath) : undefined;
  if (!voiceManifestIsCurrent(voiceManifest, story, outputRoot, voiceRate)) {
    if (skipVoiceBuild) {
      throw new Error(`Voice assets are incomplete or stale at ${voiceManifestPath}`);
    }
    const windowsPowerShell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const args = [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptDirectory, "build-voice.ps1"),
      "-Rate", String(voiceRate), "-OutputRoot", outputRoot, "-Force"
    ];
    const result = spawnSync(windowsPowerShell, args, { cwd: repositoryRoot, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`build-voice.ps1 exited with status ${result.status}`);
    voiceManifest = readJson(voiceManifestPath);
  } else if (forceVoice) {
    const windowsPowerShell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const result = spawnSync(windowsPowerShell, [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptDirectory, "build-voice.ps1"),
      "-Rate", String(voiceRate), "-OutputRoot", outputRoot, "-Force"
    ], { cwd: repositoryRoot, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`build-voice.ps1 exited with status ${result.status}`);
    voiceManifest = readJson(voiceManifestPath);
  }
  if (!voiceManifestIsCurrent(voiceManifest, story, outputRoot, voiceRate)) {
    throw new Error("Voice builder completed without producing all expected Kangkang cues");
  }
  return voiceManifest;
}

export function measureVoiceCues(story, voiceManifest) {
  const entries = new Map(voiceManifest.cues.map((cue) => [cue.id, cue]));
  return flattenStoryCues(story).map((cue) => {
    const entry = entries.get(cue.id);
    if (!entry) throw new Error(`Missing voice entry ${cue.id}`);
    const voicePath = resolveRepositoryPath(entry.path);
    const wav = readWav(voicePath);
    const bounds = findAudibleBounds(wav, TRIM_OPTIONS);
    return {
      id: cue.id,
      voiceFile: entry.path,
      sourceSampleRate: wav.sampleRate,
      sourceStartSample: bounds.startFrame,
      sourceEndSample: bounds.endFrame,
      durationSeconds: (bounds.endFrame - bounds.startFrame) / wav.sampleRate
    };
  });
}

function cuePeak(wav, startFrame, endFrame) {
  let peak = 0;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    for (let channel = 0; channel < wav.channels; channel += 1) {
      peak = Math.max(peak, Math.abs(wav.samples[frame * wav.channels + channel]));
    }
  }
  return peak;
}

export function renderVoiceStem({ timeline, sampleRate, outputPath }) {
  const samplesPerFrame = sampleRate / timeline.fps;
  if (!Number.isInteger(samplesPerFrame)) throw new Error("48 kHz must align exactly to 60 fps");
  const samples = new Float32Array(timeline.totalFrames * samplesPerFrame * 2);
  for (const cue of timeline.cues) {
    const wav = readWav(resolveRepositoryPath(cue.voiceFile));
    const peak = cuePeak(wav, cue.sourceStartSample, cue.sourceEndSample);
    const gain = Math.min(4, 0.58 / Math.max(peak, 1e-6));
    mixResampledCue({
      destination: samples,
      destinationSampleRate: sampleRate,
      destinationStartFrame: cue.startFrame * samplesPerFrame,
      destinationFrameCount: cue.durationFrames * samplesPerFrame,
      wav,
      sourceStartFrame: cue.sourceStartSample,
      sourceEndFrame: cue.sourceEndSample,
      gain
    });
  }
  let peak = 0;
  let squareSum = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
    squareSum += sample * sample;
  }
  writePcm16Stereo(outputPath, samples, sampleRate);
  return { peak, rms: Math.sqrt(squareSum / samples.length), cueCount: timeline.cues.length };
}

function scoreVariationManifest(timeline) {
  const score = scoreManifestDescription();
  return {
    ...score,
    source: {
      ...score.source,
      licenses: [
        "video/chapter-teaser/assets/licenses/audio/musescore-license.txt",
        "video/chapter-teaser/assets/licenses/audio/ms-basic-license.md"
      ]
    },
    timeWarp: {
      targetDurationSeconds: timeline.durationSeconds,
      fps: timeline.fps,
      interpolation: "piecewise-linear continuous PCM mapping between semantic scene boundaries",
      anchors: buildScoreTimeWarpAnchors(timeline)
    }
  };
}

export function scoreArtifactIsCurrent(artifactMetadata, scoreDescription) {
  return Boolean(
    artifactMetadata
    && typeof artifactMetadata.sha256 === "string"
    && artifactMetadata.sha256.length === 64
    && artifactMetadata.scorePlanSha256 === scoreDescription.source.planSha256
  );
}

function buildManifest({ story, timeline, voiceManifest, outputRoot, audioPaths, audioMetrics, artifacts }) {
  const score = scoreVariationManifest(timeline);
  for (const key of ["pianoStem", "stringsStem", "bassStem", "choirStem", "fxStem", "scoreMix", "masterMix"]) {
    if (artifacts[key] && !scoreArtifactIsCurrent(artifacts[key], score)) {
      throw new Error(`Refusing stale ${key}: score source fingerprint does not match the current MusicXML plan`);
    }
  }
  return {
    schemaVersion: 1,
    title: story.title,
    fps: story.render.fps,
    sampleRate: story.render.sampleRate,
    samplesPerFrame: story.render.sampleRate / story.render.fps,
    totalFrames: timeline.totalFrames,
    durationSeconds: timeline.durationSeconds,
    seed: SCORE_SEED,
    source: {
      story: toRepositoryPath(storyPath),
      storySha256: sha256(storyPath),
      timing: "Measured per-cue Kangkang WAV durations, silence-trimmed and rounded up to integer 60 fps frames"
    },
    outputRoot: toRepositoryPath(outputRoot),
    voice: {
      engine: voiceManifest.engine,
      displayName: voiceManifest.voice.displayName,
      language: voiceManifest.voice.language,
      gender: voiceManifest.voice.gender,
      rate: voiceManifest.voice.rate,
      speakingRate: voiceManifest.voice.speakingRate,
      reviewOnly: true,
      releaseRequirement: "公开发布前需再次确认声音来源与授权"
    },
    score,
    audio: {
      format: { codec: "pcm_s16le", sampleRate: story.render.sampleRate, channels: 2, bitDepth: 16 },
      voiceStem: audioPaths.voiceStem,
      scoreStems: audioPaths.scoreStems,
      scoreMix: audioPaths.scoreMix,
      masterMix: audioPaths.masterMix,
      mix: {
        voiceDucking: { attackFrames: 12, releaseFrames: 24, maximumReduction: VOICE_DUCK_REDUCTION },
        peakCeiling: 0.96
      },
      metrics: audioMetrics,
      artifacts
    },
    segments: timeline.segments,
    cues: timeline.cues,
    subtitles: timeline.subtitles
  };
}

export async function buildAudio(options = parseArguments([])) {
  const story = readJson(storyPath);
  if (story.render.fps !== 60 || story.render.sampleRate !== 48000) {
    throw new Error("Chapter teaser audio requires 60 fps and 48 kHz");
  }
  const outputRoot = path.resolve(options.outputRoot ?? DEFAULT_OUTPUT_ROOT);
  fs.mkdirSync(outputRoot, { recursive: true });

  const voiceManifest = runVoiceBuilder({ ...options, story, outputRoot });
  const measuredCues = measureVoiceCues(story, voiceManifest);
  const timeline = buildTimeline(story, measuredCues);
  const scorePlan = buildScorePlan(story, timeline);
  validateScorePlan(scorePlan, story);
  validateOrchestralSources();
  const scoreAnchors = buildScoreTimeWarpAnchors(timeline);

  const audioRoot = path.join(outputRoot, "audio");
  const stemRoot = path.join(audioRoot, "stems");
  const stemAbsolutePaths = Object.fromEntries(SCORE_STEMS.map((stem) => [stem, path.join(stemRoot, `${stem}.wav`)]));
  const voiceStemAbsolutePath = path.join(audioRoot, "voice.wav");
  const scoreMixAbsolutePath = path.join(audioRoot, "score.wav");
  const masterMixAbsolutePath = path.join(audioRoot, "master.wav");
  const audioMetrics = { stems: {} };
  const artifactMetadata = {};
  const scorePlanSha256 = scoreManifestDescription().source.planSha256;
  const scoreArtifact = (filePath) => ({ ...artifact(filePath), scorePlanSha256 });

  if (options.renderAudio !== false) {
    fs.mkdirSync(stemRoot, { recursive: true });
    const sourceParts = renderOrchestralSourceParts(outputRoot);
    audioMetrics.orchestralSource = sourceParts.metrics;
    for (const stem of SCORE_STEMS) {
      const events = scorePlan[stem];
      process.stdout.write(`Adapting orchestral ${stem} bus (${ORCHESTRAL_PART_BUSES[stem].length} source parts + ${events.length} topology events)…\n`);
      audioMetrics.stems[stem] = renderOrchestralScoreStem({
        stem,
        sourcePartPaths: sourceParts.paths,
        proceduralEvents: events,
        anchors: scoreAnchors,
        totalFrames: timeline.totalFrames,
        sampleRate: story.render.sampleRate,
        outputPath: stemAbsolutePaths[stem]
      });
      artifactMetadata[`${stem}Stem`] = scoreArtifact(stemAbsolutePaths[stem]);
      await new Promise((resolve) => setImmediate(resolve));
      globalThis.gc?.();
    }

    process.stdout.write(`Rendering voice stem (${timeline.cues.length} cues)…\n`);
    audioMetrics.voice = renderVoiceStem({ timeline, sampleRate: story.render.sampleRate, outputPath: voiceStemAbsolutePath });
    artifactMetadata.voiceStem = artifact(voiceStemAbsolutePath);
    await new Promise((resolve) => setImmediate(resolve));
    globalThis.gc?.();

    process.stdout.write("Mixing original score…\n");
    audioMetrics.scoreMix = mixPcm16Stereo({
      inputs: scoreMixInputs(stemAbsolutePaths),
      outputPath: scoreMixAbsolutePath,
      totalFrames: timeline.totalFrames * story.render.sampleRate / story.render.fps,
      sampleRate: story.render.sampleRate
    });
    artifactMetadata.scoreMix = scoreArtifact(scoreMixAbsolutePath);

    process.stdout.write("Mixing voice and score master…\n");
    const duckByVideoFrame = Float32Array.from(
      { length: timeline.totalFrames },
      (_, frame) => voiceDuckGain(frame, timeline.cues) * 0.72
    );
    audioMetrics.masterMix = mixPcm16Stereo({
      inputs: [
        {
          path: scoreMixAbsolutePath,
          gain: (sampleFrame) => duckByVideoFrame[Math.min(
            duckByVideoFrame.length - 1,
            Math.floor(sampleFrame * story.render.fps / story.render.sampleRate)
          )]
        },
        { path: voiceStemAbsolutePath, gain: 1 }
      ],
      outputPath: masterMixAbsolutePath,
      totalFrames: timeline.totalFrames * story.render.sampleRate / story.render.fps,
      sampleRate: story.render.sampleRate
    });
    artifactMetadata.masterMix = scoreArtifact(masterMixAbsolutePath);
  }

  const audioPaths = {
    voiceStem: toRepositoryPath(voiceStemAbsolutePath),
    scoreStems: Object.fromEntries(Object.entries(stemAbsolutePaths).map(([stem, stemPath]) => [stem, toRepositoryPath(stemPath)])),
    scoreMix: toRepositoryPath(scoreMixAbsolutePath),
    masterMix: toRepositoryPath(masterMixAbsolutePath)
  };
  const manifest = buildManifest({
    story,
    timeline,
    voiceManifest,
    outputRoot,
    audioPaths,
    audioMetrics,
    artifacts: artifactMetadata
  });
  writeJson(committedManifestPath, manifest);
  writeJson(path.join(outputRoot, "manifest.json"), manifest);
  fs.writeFileSync(srtPath, serializeSrt(timeline.subtitles, timeline.fps), "utf8");
  fs.writeFileSync(assPath, serializeAss(timeline.subtitles, timeline.fps), "utf8");

  process.stdout.write(`Built ${timeline.cues.length} cues / ${timeline.totalFrames} frames / ${timeline.durationSeconds.toFixed(3)} seconds.\n`);
  process.stdout.write(`Manifest: ${committedManifestPath}\n`);
  if (options.renderAudio !== false) process.stdout.write(`Master: ${masterMixAbsolutePath}\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  buildAudio(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}

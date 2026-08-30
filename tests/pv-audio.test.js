"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "footsteps-return");
const MIX_PATH = path.join(PV_ROOT, "audio", "mix.json");
const MIX_SCRIPT = path.join(PV_ROOT, "scripts", "mix-audio.ps1");
const REQUIRE_REAL_AUDIO = process.env.REQUIRE_PV_FINAL_MIX === "1";
const EPSILON = 1 / 48_000;
const EXPECTED_FRAME_COUNT = 10_273_920;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function projectPath(projectRelativePath) {
  assert.match(projectRelativePath, /^video\/footsteps-return\//);
  return path.join(ROOT, ...projectRelativePath.split("/"));
}

function realAudioAvailability() {
  if (!fs.existsSync(MIX_PATH)) return { inputs: false, output: false };
  const mix = readJson(MIX_PATH);
  const inputFiles = [
    ...mix.inputs.narration.cues.map(({ file }) => file),
    mix.inputs.score.file,
    ...new Set(mix.inputs.sfx.cues.map(({ file }) => file))
  ];
  return {
    inputs: inputFiles.every((file) => fs.existsSync(projectPath(file))),
    output: fs.existsSync(projectPath(mix.composition.outputFile))
  };
}

function resolveFfmpeg() {
  const doctorPath = path.join(PV_ROOT, "scripts", "doctor.mjs");
  const result = spawnSync(process.execPath, [doctorPath, "--score-tools-json"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const ffmpeg = JSON.parse(result.stdout.trim()).ffmpeg;
  assert.ok(ffmpeg && fs.existsSync(ffmpeg), "FFmpeg must resolve for independent loudness verification");
  return ffmpeg;
}

function analyzeLoudness(filePath, loudness) {
  const result = spawnSync(resolveFfmpeg(), [
    "-hide_banner", "-nostats", "-nostdin", "-i", filePath,
    "-af", `loudnorm=I=${loudness.targetIntegratedLufs}:LRA=${loudness.targetLoudnessRangeLu}:TP=${loudness.truePeakCeilingDbtp}:print_format=json`,
    "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"
  ], { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const measurementBlock = result.stderr.match(/\{\s*"input_i"[\s\S]*?"target_offset"\s*:\s*"[^"]+"\s*\}/);
  assert.ok(measurementBlock, `FFmpeg loudnorm JSON missing:\n${result.stderr}`);
  return JSON.parse(measurementBlock[0]);
}

function renderFloatDiagnostic(inputFiles, filterGraph, channelCount) {
  const inputArgs = inputFiles.flatMap((filePath) => ["-i", filePath]);
  const result = spawnSync(resolveFfmpeg(), [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    ...inputArgs,
    "-filter_complex", filterGraph,
    "-map", "[diagnostic]", "-ar", "4000", "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"
  ], { cwd: ROOT, windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.stdout?.toString() ?? ""}\n${result.stderr?.toString() ?? ""}`);
  assert.equal(result.stdout.length % (channelCount * 4), 0);
  return {
    buffer: result.stdout,
    channels: channelCount,
    frameCount: result.stdout.length / (channelCount * 4),
    sampleRate: 4_000
  };
}

function diagnosticSample(diagnostic, frame, channel) {
  return diagnostic.buffer.readFloatLE((frame * diagnostic.channels + channel) * 4);
}

function measureDuckingReduction(inputFiles, filterPrelude, beforeLabel, afterLabel) {
  const inputArgs = inputFiles.flatMap((filePath) => ["-i", filePath]);
  const reductionExpression = "if(gt(abs(val(0)),0.0001),-20*log(max(abs(val(2)/val(0)),0.000000001))/log(10),0)|if(gt(abs(val(1)),0.0001),-20*log(max(abs(val(3)/val(1)),0.000000001))/log(10),0)";
  const escapedReductionExpression = reductionExpression.replaceAll(",", "\\,");
  const filterGraph = [
    filterPrelude,
    `[${beforeLabel}][${afterLabel}]join=inputs=2:channel_layout=quad:map=0.0-FL|0.1-FR|1.0-BL|1.1-BR[paired]`,
    `[paired]aeval=exprs='${escapedReductionExpression}':c=stereo,astats=metadata=0:reset=0:measure_perchannel=Peak_level:measure_overall=none[diagnostic]`
  ].join(";");
  const result = spawnSync(resolveFfmpeg(), [
    "-hide_banner", "-nostats", "-nostdin", ...inputArgs,
    "-filter_complex", filterGraph, "-map", "[diagnostic]", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"
  ], { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const peakLevelDb = [...result.stderr.matchAll(/Peak level dB:\s*([+-]?(?:\d+(?:\.\d+)?|inf))/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  assert.ok(peakLevelDb.length >= 2, `FFmpeg reduction diagnostics missing:\n${result.stderr}`);
  return Math.max(...peakLevelDb.map((level) => 10 ** (level / 20)));
}

const REAL_AUDIO = realAudioAvailability();

function readWav(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", `${filePath} must be RIFF`);
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE", `${filePath} must be WAVE`);
  let offset = 12;
  let format;
  let dataOffset;
  let dataLength;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkLength = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (chunkId === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14)
      };
      if (format.audioFormat === 65534 && chunkLength >= 40) {
        format.subFormatCode = buffer.readUInt16LE(body + 24);
      }
    } else if (chunkId === "data") {
      dataOffset = body;
      dataLength = chunkLength;
      break;
    }
    offset = body + chunkLength + (chunkLength % 2);
  }
  assert.ok(format && Number.isInteger(dataOffset) && Number.isInteger(dataLength), `${filePath} needs fmt/data chunks`);
  assert.ok(format.audioFormat === 1 || (format.audioFormat === 65534 && format.subFormatCode === 1), `${filePath} must be integer PCM`);
  const bytesPerFrame = format.channels * format.bitsPerSample / 8;
  return {
    buffer,
    dataOffset,
    dataLength,
    ...format,
    frameCount: dataLength / bytesPerFrame,
    durationSeconds: dataLength / bytesPerFrame / format.sampleRate
  };
}

function rmsDbfs24(wav, startSeconds, endSeconds) {
  assert.equal(wav.bitsPerSample, 24);
  const firstFrame = Math.max(0, Math.floor(startSeconds * wav.sampleRate));
  const finalFrame = Math.min(wav.frameCount, Math.ceil(endSeconds * wav.sampleRate));
  let sumSquares = 0;
  let sampleCount = 0;
  const bytesPerFrame = wav.channels * 3;
  for (let frame = firstFrame; frame < finalFrame; frame += 1) {
    const frameOffset = wav.dataOffset + frame * bytesPerFrame;
    for (let channel = 0; channel < wav.channels; channel += 1) {
      const sampleOffset = frameOffset + channel * 3;
      let value = wav.buffer.readUIntLE(sampleOffset, 3);
      if (value & 0x800000) value -= 0x1000000;
      const normalized = value / 0x800000;
      sumSquares += normalized * normalized;
      sampleCount += 1;
    }
  }
  if (sampleCount === 0 || sumSquares === 0) return -Infinity;
  return 20 * Math.log10(Math.sqrt(sumSquares / sampleCount));
}

test("the integrated audio manifest binds the measured F narration, retimed score, sparse SFX, and end-card tail", async () => {
  const mix = readJson(MIX_PATH);
  const timing = readJson(path.join(PV_ROOT, "audio", "voiceover", "timing.json"));
  const scorePlan = readJson(path.join(PV_ROOT, "audio", "score", "score-plan.json"));
  const scoreRender = readJson(path.join(PV_ROOT, "audio", "score", "render-metadata.json"));
  const sfxPlan = readJson(path.join(PV_ROOT, "audio", "sfx", "sfx-plan.json"));
  const sfxRender = readJson(path.join(PV_ROOT, "audio", "sfx", "render-metadata.json"));
  const { masterTimeline } = await import("../video/footsteps-return/src/data/timeline.js");
  const { canonicalMixRenderContract } = await import("../video/footsteps-return/src/runtime/mix-contract.js");

  assert.equal(mix.schemaVersion, 1);
  assert.deepEqual(mix.composition, {
    id: "footsteps-return",
    durationSeconds: 214.04,
    sampleRateHz: 48_000,
    channels: 2,
    outputFile: "video/footsteps-return/audio/mix/footsteps-return-draft.wav"
  });
  assert.equal(mix.inputs.narration.selectedAuditionId, "F");
  assert.equal(mix.inputs.narration.selectedVoiceId, "cold-witness");
  assert.equal(mix.inputs.narration.pan, "center");
  assert.equal(mix.inputs.narration.cues.length, 21);
  assert.deepEqual(mix.inputs.narration.cues.map(({ id, startSeconds, durationSeconds, file, sha256: hash }) => ({ id, startSeconds, durationSeconds, file, hash })), timing.cues.map((cue) => ({
    id: cue.id,
    startSeconds: cue.timelineStartSeconds,
    durationSeconds: cue.durationSeconds,
    file: cue.outputFile,
    hash: cue.sha256
  })));

  assert.equal(mix.inputs.score.file, `video/footsteps-return/${scoreRender.master.path}`);
  assert.equal(mix.inputs.score.sha256, scoreRender.master.sha256);
  assert.equal(mix.inputs.score.durationSeconds, 214.04);
  assert.equal(mix.inputs.score.width.sideLevel, 0.7);
  assert.equal(mix.inputs.score.ducking.sidechain, "narration");
  assert.equal(mix.inputs.score.ducking.ratio, 1.22);
  assert.equal(Object.hasOwn(mix.inputs.score.ducking, "maximumReductionDb"), false, "do not publish an unmeasured ducking cap");

  assert.equal(sfxPlan.mixPolicy.continuousRumble, false);
  assert.equal(mix.inputs.sfx.continuousBed, false);
  assert.equal(mix.inputs.sfx.ducking.ratio, 1.28);
  assert.equal(mix.inputs.sfx.ducking.targetReductionDb, Math.abs(sfxPlan.mixPolicy.narrationDuckingDb));
  assert.equal(mix.inputs.sfx.cues.length, 21);
  const renderedSfx = new Map(sfxRender.files.map((file) => [file.id, file]));
  const generatorById = new Map(sfxPlan.generators.map((generator) => [generator.id, generator]));
  mix.inputs.sfx.cues.forEach((cue, index) => {
    const planned = sfxPlan.cues[index];
    const generator = generatorById.get(planned.generatorId);
    const rendered = renderedSfx.get(planned.generatorId);
    assert.deepEqual(cue, {
      id: planned.id,
      category: planned.category,
      generatorId: planned.generatorId,
      sceneId: planned.sceneId,
      startSeconds: planned.time,
      durationSeconds: planned.duration,
      gainDb: planned.gainDb,
      file: `video/footsteps-return/${generator.outputFile}`,
      sha256: rendered.sha256
    });
  });

  const cardStarts = new Map(masterTimeline.scenes.filter(({ kind }) => kind === "chapter-card").map(({ chapterId, start }) => [chapterId, start]));
  const cardCues = sfxPlan.cues.filter(({ category }) => category === "chapter-low-punctuation");
  assert.equal(cardCues.length, 7);
  cardCues.forEach((cue) => assert.equal(cue.time, cardStarts.get(cue.sceneId.replace("chapter-card-", "")), `${cue.id} must punctuate its current card start`));
  sfxPlan.cues.forEach((cue) => {
    const scene = masterTimeline.scenes.find(({ id }) => id === cue.sceneId);
    assert.ok(scene, `${cue.id} needs a real scene binding`);
    const sceneIndex = masterTimeline.scenes.indexOf(scene);
    const nextStart = masterTimeline.scenes[sceneIndex + 1]?.start ?? masterTimeline.duration;
    const activeUntil = Math.max(scene.start + scene.duration, nextStart);
    assert.ok(cue.time >= scene.start - EPSILON && cue.time + cue.duration <= activeUntil + EPSILON, `${cue.id} must stay inside ${cue.sceneId}'s active picture span`);
  });
  const sfxIntervals = sfxPlan.cues
    .map((cue) => ({ start: cue.time, end: cue.time + cue.duration }))
    .sort((left, right) => left.start - right.start);
  let unionDuration = 0;
  let unionStart = sfxIntervals[0].start;
  let unionEnd = sfxIntervals[0].end;
  for (const interval of sfxIntervals.slice(1)) {
    if (interval.start > unionEnd) {
      unionDuration += unionEnd - unionStart;
      unionStart = interval.start;
      unionEnd = interval.end;
    } else {
      unionEnd = Math.max(unionEnd, interval.end);
    }
  }
  unionDuration += unionEnd - unionStart;
  const concurrencyEvents = sfxIntervals
    .flatMap(({ start, end }) => [{ time: start, delta: 1 }, { time: end, delta: -1 }])
    .sort((left, right) => left.time - right.time || left.delta - right.delta);
  let concurrency = 0;
  let maximumConcurrency = 0;
  for (const event of concurrencyEvents) {
    concurrency += event.delta;
    maximumConcurrency = Math.max(maximumConcurrency, concurrency);
  }
  assert.equal(Number(unionDuration.toFixed(6)), 18.32);
  assert.equal(Number((unionDuration / mix.composition.durationSeconds * 100).toFixed(3)), 8.559);
  assert.equal(maximumConcurrency, 1);
  assert.equal(Number(Math.max(...sfxIntervals.map(({ end }) => end)).toFixed(6)), 199.077196);
  assert.ok(Math.max(...sfxIntervals.map(({ end }) => end)) < 210.04);

  assert.deepEqual(masterTimeline.scenes.map(({ kind }) => kind), [
    "intro", "chapter-card", "chapter", "chapter-card", "chapter", "chapter-card", "chapter",
    "chapter-card", "chapter", "chapter-card", "chapter", "chapter-card", "chapter",
    "chapter-card", "chapter", "seven-world-gallery", "outro", "end-card"
  ]);
  assert.deepEqual(masterTimeline.audio.map(({ role }) => role), ["narration", "score", "sfx", "master"]);
  assert.equal(Math.max(...masterTimeline.audio.map(({ start, duration }) => start + duration)), masterTimeline.duration);

  assert.equal(scorePlan.form.at(-1).id, "end-card");
  assert.equal(scorePlan.form.at(-1).start, 210.04);
  assert.deepEqual(mix.tail, {
    endCardStartSeconds: 210.04,
    lastNotatedEventSeconds: 211.682,
    releaseTailSeconds: 2.358,
    policy: "Preserve the final D6/9 event and its rendered decay through the logo entrance, then retain the quiet release hold without padding the former score."
  });
  assert.equal(Number((mix.tail.lastNotatedEventSeconds + mix.tail.releaseTailSeconds).toFixed(3)), 214.04);

  const finalInputEnd = Math.max(
    ...mix.inputs.narration.cues.map((cue) => cue.startSeconds + cue.durationSeconds),
    mix.inputs.score.startSeconds + mix.inputs.score.durationSeconds,
    ...mix.inputs.sfx.cues.map((cue) => cue.startSeconds + cue.durationSeconds)
  );
  assert.ok(finalInputEnd <= mix.composition.durationSeconds + EPSILON);
  assert.equal(mix.processing.loudness.targetIntegratedLufs, -14);
  assert.equal(mix.processing.loudness.truePeakCeilingDbtp, -1);
  assert.equal(mix.processing.outputFormat.codec, "pcm_s24le");
  assert.equal(mix.processing.outputFormat.bitsPerSample, 24);
  assert.equal(mix.processing.implementation.mixerScript, "scripts/mix-audio.ps1");
  assert.equal(mix.processing.implementation.mixerScriptSha256, sha256(MIX_SCRIPT));
  const ffmpegVersion = spawnSync(resolveFfmpeg(), ["-version"], { encoding: "utf8", windowsHide: true });
  assert.equal(ffmpegVersion.status, 0, ffmpegVersion.stderr);
  assert.equal(mix.processing.implementation.ffmpegVersion, ffmpegVersion.stdout.split(/\r?\n/)[0].trim());
  const contractHash = crypto.createHash("sha256").update(canonicalMixRenderContract(mix)).digest("hex");
  assert.equal(mix.output.renderContractSha256, contractHash, "measured output must bind to the current deterministic render contract");
  assert.equal(mix.output.subjectiveListening.status, "not-completed");
});

test("the mixer validates every real 48 kHz voice, score, and SFX input", { skip: !REAL_AUDIO.inputs }, () => {
  const result = spawnSync("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", MIX_SCRIPT, "-ValidateOnly"
  ], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const summary = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.deepEqual(summary, {
    status: "ready",
    durationSeconds: 214.04,
    sampleRateHz: 48_000,
    narrationCueCount: 21,
    scoreFileCount: 1,
    sfxFileCount: 5,
    sfxCueCount: 21
  });
});

test("real diagnostic buses prove centered narration, controlled score width, bounded ducking, and sparse SFX silence", { skip: !REAL_AUDIO.inputs }, () => {
  const mix = readJson(MIX_PATH);
  const timing = readJson(path.join(PV_ROOT, "audio", "voiceover", "timing.json"));
  const voiceReviewPath = projectPath(timing.continuousReview.file);
  assert.ok(fs.existsSync(voiceReviewPath));
  const center = renderFloatDiagnostic([voiceReviewPath], [
    "[0:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono",
    "pan=stereo|FL=0.7071067812*c0|FR=0.7071067812*c0",
    "aresample=4000[diagnostic]"
  ].join(","), 2);
  let centerEnergy = 0;
  let maximumChannelDifference = 0;
  for (let frame = 0; frame < center.frameCount; frame += 1) {
    const left = diagnosticSample(center, frame, 0);
    const right = diagnosticSample(center, frame, 1);
    centerEnergy += left * left;
    maximumChannelDifference = Math.max(maximumChannelDifference, Math.abs(left - right));
  }
  assert.ok(centerEnergy > 0);
  assert.ok(maximumChannelDifference <= 1e-7, `centered narration L/R difference ${maximumChannelDifference}`);

  const score = mix.inputs.score;
  const scoreDucking = score.ducking;
  const scorePrelude = [
    `[0:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${score.gainDb}dB,asplit=2[score_source][score_width_input]`,
    `[score_width_input]stereotools=mlev=${score.width.middleLevel}:slev=${score.width.sideLevel},asplit=2[score_controlled][score_duck_input]`,
    "[1:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono,pan=stereo|FL=0.7071067812*c0|FR=0.7071067812*c0[voice_key]",
    `[score_duck_input][voice_key]sidechaincompress=threshold=${scoreDucking.threshold}:ratio=${scoreDucking.ratio}:attack=${scoreDucking.attackMs}:release=${scoreDucking.releaseMs}:makeup=1:mix=1[score_ducked]`
  ].join(";");
  const scoreDiagnostic = renderFloatDiagnostic([projectPath(score.file), voiceReviewPath], `${scorePrelude};[score_source][score_controlled][score_ducked]join=inputs=3:channel_layout=5.1:map=0.0-FL|0.1-FR|1.0-FC|1.1-LFE|2.0-BL|2.1-BR,aresample=4000[diagnostic]`, 6);
  let sourceMidSquares = 0;
  let sourceSideSquares = 0;
  let controlledMidSquares = 0;
  let controlledSideSquares = 0;
  for (let frame = 0; frame < scoreDiagnostic.frameCount; frame += 1) {
    const sourceLeft = diagnosticSample(scoreDiagnostic, frame, 0);
    const sourceRight = diagnosticSample(scoreDiagnostic, frame, 1);
    const controlledLeft = diagnosticSample(scoreDiagnostic, frame, 2);
    const controlledRight = diagnosticSample(scoreDiagnostic, frame, 3);
    sourceMidSquares += ((sourceLeft + sourceRight) / 2) ** 2;
    sourceSideSquares += ((sourceLeft - sourceRight) / 2) ** 2;
    controlledMidSquares += ((controlledLeft + controlledRight) / 2) ** 2;
    controlledSideSquares += ((controlledLeft - controlledRight) / 2) ** 2;
  }
  const sourceSideToMid = Math.sqrt(sourceSideSquares / sourceMidSquares);
  const controlledSideToMid = Math.sqrt(controlledSideSquares / controlledMidSquares);
  assert.ok(Math.abs(controlledSideToMid / sourceSideToMid - 0.7) <= 0.005, `score side scale ${controlledSideToMid / sourceSideToMid}`);
  const scoreMaximumReductionDb = measureDuckingReduction([projectPath(score.file), voiceReviewPath], `${scorePrelude};[score_source]anullsink`, "score_controlled", "score_ducked");
  assert.ok(scoreMaximumReductionDb > 2 && scoreMaximumReductionDb <= 4.15, `score ducking maximum ${scoreMaximumReductionDb.toFixed(3)} dB`);

  const sfx = mix.inputs.sfx;
  const sfxInputFiles = sfx.cues.map(({ file }) => projectPath(file));
  const voiceInputIndex = sfxInputFiles.length;
  const sfxLabels = [];
  const sfxFilters = sfx.cues.map((cue, index) => {
    const label = `sfx_${index}`;
    sfxLabels.push(`[${label}]`);
    const delaySamples = Math.round(cue.startSeconds * mix.composition.sampleRateHz);
    return `[${index}:a]atrim=duration=${cue.durationSeconds},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${cue.gainDb}dB,adelay=${delaySamples}S|${delaySamples}S[${label}]`;
  });
  sfxFilters.push(`${sfxLabels.join("")}amix=inputs=${sfxLabels.length}:duration=longest:normalize=0,apad=whole_dur=${mix.composition.durationSeconds},atrim=duration=${mix.composition.durationSeconds},asplit=2[sfx_reference][sfx_main]`);
  sfxFilters.push(`[${voiceInputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono,pan=stereo|FL=0.7071067812*c0|FR=0.7071067812*c0[voice_key]`);
  sfxFilters.push(`[sfx_main][voice_key]sidechaincompress=threshold=${sfx.ducking.threshold}:ratio=${sfx.ducking.ratio}:attack=${sfx.ducking.attackMs}:release=${sfx.ducking.releaseMs}:makeup=1:mix=1[sfx_ducked]`);
  const sfxPrelude = sfxFilters.join(";");
  const sfxDiagnostic = renderFloatDiagnostic([...sfxInputFiles, voiceReviewPath], `${sfxPrelude};[sfx_reference][sfx_ducked]join=inputs=2:channel_layout=quad:map=0.0-FL|0.1-FR|1.0-BL|1.1-BR,aresample=4000[diagnostic]`, 4);
  let outsideCuePeak = 0;
  for (let frame = 0; frame < sfxDiagnostic.frameCount; frame += 1) {
    const time = frame / sfxDiagnostic.sampleRate;
    const referenceLeft = diagnosticSample(sfxDiagnostic, frame, 0);
    const referenceRight = diagnosticSample(sfxDiagnostic, frame, 1);
    const insideCueGuard = sfx.cues.some((cue) => time >= cue.startSeconds - 0.025 && time <= cue.startSeconds + cue.durationSeconds + 0.025);
    if (!insideCueGuard) outsideCuePeak = Math.max(outsideCuePeak, Math.abs(referenceLeft), Math.abs(referenceRight));
  }
  const sfxMaximumReductionDb = measureDuckingReduction([...sfxInputFiles, voiceReviewPath], sfxPrelude, "sfx_reference", "sfx_ducked");
  assert.ok(sfxMaximumReductionDb > 2 && sfxMaximumReductionDb <= 5.05, `SFX ducking maximum ${sfxMaximumReductionDb.toFixed(3)} dB`);
  assert.ok(outsideCuePeak <= 1e-7, `SFX diagnostic bus leaked outside cue intervals: ${outsideCuePeak}`);
});

test("the rendered draft is independently measured as an exact 48 kHz stereo PCM24 master with a decaying end-card tail", { skip: !(REQUIRE_REAL_AUDIO || REAL_AUDIO.output) }, () => {
  const mix = readJson(MIX_PATH);
  const outputPath = projectPath(mix.composition.outputFile);
  const wav = readWav(outputPath);
  assert.equal(mix.output.status, "measured");
  assert.equal(wav.sampleRate, 48_000);
  assert.equal(wav.channels, 2);
  assert.equal(wav.bitsPerSample, 24);
  assert.equal(wav.frameCount, EXPECTED_FRAME_COUNT);
  assert.equal(wav.durationSeconds, 214.04);
  assert.equal(mix.output.sha256, sha256(outputPath));
  assert.equal(mix.output.bytes, fs.statSync(outputPath).size);
  const independent = analyzeLoudness(outputPath, mix.processing.loudness);
  const independentlyMeasuredLufs = Number(independent.input_i);
  const independentlyMeasuredTruePeak = Number(independent.input_tp);
  assert.ok(Math.abs(independentlyMeasuredLufs - -14) <= 0.5, `independently measured ${independentlyMeasuredLufs} LUFS`);
  assert.ok(independentlyMeasuredTruePeak <= -1 + 0.05, `independently measured ${independentlyMeasuredTruePeak} dBTP`);
  assert.ok(Math.abs(mix.output.measurements.integratedLufs - independentlyMeasuredLufs) <= 0.01, "manifest LUFS must match a fresh FFmpeg analysis");
  assert.ok(Math.abs(mix.output.measurements.truePeakDbtp - independentlyMeasuredTruePeak) <= 0.01, "manifest dBTP must match a fresh FFmpeg analysis");
  const tailWindows = [
    [mix.tail.endCardStartSeconds, mix.tail.lastNotatedEventSeconds],
    [mix.tail.lastNotatedEventSeconds, mix.tail.lastNotatedEventSeconds + 0.5],
    [mix.tail.lastNotatedEventSeconds + 0.5, mix.tail.lastNotatedEventSeconds + 1],
    [mix.tail.lastNotatedEventSeconds + 1, mix.tail.lastNotatedEventSeconds + 1.5],
    [mix.composition.durationSeconds - 0.5, mix.composition.durationSeconds]
  ];
  const tailRms = tailWindows.map(([start, end]) => rmsDbfs24(wav, start, end));
  tailRms.forEach((level, index) => assert.ok(Number.isFinite(level), `tail window ${index + 1} must retain finite rendered decay rather than a hard mute`));
  for (let index = 1; index < tailRms.length; index += 1) {
    assert.ok(tailRms[index] < tailRms[index - 1], `tail must decay progressively: ${tailRms.map((level) => level.toFixed(2)).join(" / ")} dBFS`);
  }
  assert.ok(tailRms[0] > -90, `end-card resonance is too quiet: ${tailRms[0].toFixed(2)} dBFS`);
  assert.ok(tailRms.at(-1) < -70, `final hold must remain very quiet: ${tailRms.at(-1).toFixed(2)} dBFS`);
  assert.ok(tailRms[0] - tailRms.at(-1) > 25, "the end-card should resolve by at least 25 dB without hard-muting its rendered decay");
});

test("the browser binds one final master audio track and proves all named render-readiness gates", { skip: !(REQUIRE_REAL_AUDIO || REAL_AUDIO.output) }, async () => {
  const { chromium } = require("playwright");
  const { startStaticServer } = await import("../video/footsteps-return/scripts/serve-app.mjs");
  const server = await startStaticServer({ root: PV_ROOT });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 3840, height: 2160 } });
    await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
    const ready = await page.evaluate(() => window.__renderReady);
    const contract = await page.evaluate(() => {
      const audio = document.querySelector("[data-master-audio]");
      return {
        audioCount: document.querySelectorAll("[data-master-audio]").length,
        src: audio?.getAttribute("src"),
        start: audio?.dataset.start,
        duration: audio?.dataset.duration,
        trackIndex: audio?.dataset.trackIndex,
        preload: audio?.preload,
        audioReadyState: audio?.readyState,
        audioError: audio?.error?.code ?? null,
        audioDuration: audio?.duration,
        fonts: [...document.fonts]
          .filter((face) => face.family.replaceAll('"', "") === "Topo Serif")
          .map(({ weight, status }) => ({ weight, status }))
          .sort((left, right) => Number(left.weight) - Number(right.weight)),
        introReady: document.querySelector('[data-scene-id="intro"]')?.dataset.introRenderReady,
        chapterAdapterStates: Object.values(window.__pvChapterControllers ?? {}).map((controller) => controller.adapter?.renderReady?.()),
        galleryAdapterStates: Object.values(window.__pvGalleryControllers ?? {}).map((controller) => controller.adapter?.renderReady?.()),
        webgl: [...document.querySelectorAll("[data-chapter-surface-canvas]")].map((canvas) => {
          const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
          return { present: Boolean(context), lost: context?.isContextLost() ?? true };
        }),
        gates: window.__pvRenderReadiness,
        rootReady: document.documentElement.dataset.renderReady
      };
    });
    assert.equal(contract.audioCount, 1);
    assert.equal(contract.src, "./audio/mix/footsteps-return-draft.wav");
    assert.equal(contract.start, "0");
    assert.equal(contract.duration, "214.04");
    assert.equal(contract.trackIndex, "20");
    assert.equal(contract.preload, "metadata");
    assert.ok(contract.audioReadyState >= 1);
    assert.equal(contract.audioError, null);
    assert.ok(Math.abs(contract.audioDuration - 214.04) <= EPSILON);
    assert.deepEqual(contract.fonts, [
      { weight: "400", status: "loaded" },
      { weight: "600", status: "loaded" },
      { weight: "700", status: "loaded" }
    ]);
    assert.equal(contract.introReady, "true");
    assert.equal(contract.chapterAdapterStates.length, 7);
    assert.ok(contract.chapterAdapterStates.every(({ ready }) => ready));
    assert.equal(contract.galleryAdapterStates.length, 7);
    assert.ok(contract.galleryAdapterStates.every(({ ready }) => ready));
    assert.equal(contract.webgl.length, 6);
    assert.ok(contract.webgl.every(({ present, lost }) => present && !lost));
    assert.equal(contract.rootReady, "true");
    assert.deepEqual(Object.keys(contract.gates), ["fonts", "liveGameAdapter", "narration", "score", "sfx", "webgl"]);
    Object.entries(contract.gates).forEach(([name, gate]) => assert.equal(gate.ready, true, `${name}: ${gate.detail}`));
    assert.deepEqual(ready.readiness, contract.gates);
  } finally {
    await browser.close();
    await server.close();
  }
});

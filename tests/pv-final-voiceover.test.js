"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "footsteps-return");
const VOICE_ROOT = path.join(PV_ROOT, "audio", "voiceover");
const FINAL_CONFIG_PATH = path.join(VOICE_ROOT, "final-voice.json");
const ASR_REVIEW_POLICY_PATH = path.join(VOICE_ROOT, "asr-review.json");
const CAPTION_EVIDENCE_PATH = path.join(ROOT, "artifacts", "pv-caption-scenes-task8-manifest.json");
const REQUIRE_FINAL_WAVS = process.env.REQUIRE_PV_FINAL_VOICEOVER === "1";

const APPROVED_CUES = Object.freeze([
  ["intro-boundary", "人们总把棋盘的边缘视作尽头。", 1803012708],
  ["intro-roads", "可那些消失在边界上的道路并未中断。它们在另一处接缝后延续，将遥远的落点重新变为近邻。", 1279274001],
  ["intro-invitation", "现在，落子之人啊，循着隐藏的连接前行吧。七种世界，将在你面前依次展开。", 1799362060],
  ["plane-order", "边界分明，方向笔直，胜负都在眼前。方庭以有限的秩序收容第一条五连，也由此埋下对所有边界的疑问。", 1569261575],
  ["cylinder-cycle", "左右相接，上下仍被截断。横向的路绕过世界回到身后，纵向的路却有始有终。", 1792442127],
  ["cylinder-distance", "只拥有一重循环的世界，该如何丈量远近？", 273778121],
  ["torus-cycles", "四边相接，两个方向各自成环。一条斜线可以先越过上边，再从左侧归来。", 1622475403],
  ["torus-shortest-path", "两重循环交织之处，最短的道路往往藏在视野之外。", 497495445],
  ["mobius-turn", "左右边界相接，却带着一次翻转。沿同一面环行一周，归来时上下已经交换。", 1804224669],
  ["mobius-one-side", "只有一面的世界，正反又该如何分辨？", 965176795],
  ["klein-two-returns", "一组边界如圆环般相接，另一组边界让方向翻转。两种归来共处一界：一条路保持原样，一条路带回倒影。", 1855326299],
  ["klein-memory", "路径会记住你选择的环绕。", 545355154],
  ["projective-reflection", "上下左右，全都通向各自的倒影。一次越界改变方向，两次倒映使棋路重新吻合。", 982094031],
  ["projective-twin", "在双生的世界里，每次远行，都会遇见另一个自己。", 2061565332],
  ["sphere-closure", "在最后的世界，棋路离开一条边，便会沿相邻的方向继续。四条边依次归向彼此，方形的棋盘也随之闭合成球。", 10234720],
  ["sphere-map", "人们为了看清完整的世界，将它展开成一张有边的图。", 591676504],
  ["sphere-boundary", "所谓边界，或许只是观察世界时留下的痕迹。", 1463021511],
  ["outro-invocation", "现在，落子之人。", 1165219178],
  ["outro-connection", "七种世界已经显现，但最后的连接，仍等待你亲手完成。", 315395075],
  ["outro-stone", "若你已经理解边界的意义，就落下那颗棋子。", 769022107],
  ["outro-world", "然后，去看见世界本来的样子吧。", 1699742640]
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readFinalConfig() {
  assert.ok(fs.existsSync(FINAL_CONFIG_PATH), "final-voice.json must bind the selected audition before generation");
  return readJson(FINAL_CONFIG_PATH);
}

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function findChunk(buffer, chunkId) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === chunkId) return { offset: offset + 8, size };
    offset += 8 + size + (size % 2);
  }
  return null;
}

function inspectPcm16Mono(file) {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
  const format = findChunk(buffer, "fmt ");
  const data = findChunk(buffer, "data");
  assert.ok(format && data, `${file} needs WAV fmt/data chunks`);
  assert.equal(buffer.readUInt16LE(format.offset), 1, `${file} must be PCM`);
  assert.equal(buffer.readUInt16LE(format.offset + 2), 1, `${file} must be mono`);
  assert.equal(buffer.readUInt32LE(format.offset + 4), 48000, `${file} must be 48 kHz`);
  assert.equal(buffer.readUInt16LE(format.offset + 14), 16, `${file} must be PCM-16`);
  return { durationSeconds: data.size / 2 / 48000, sha256: sha256Bytes(buffer), bytes: buffer.length };
}

test("final narration binds the approved F cold-witness audition and only the official VoiceDesign path", () => {
  const config = readFinalConfig();
  const auditionsPath = path.join(ROOT, config.selection.auditionConfigPath);
  const manifestPath = path.join(ROOT, config.selection.auditionManifestPath);
  const auditions = readJson(auditionsPath);
  const manifest = readJson(manifestPath);
  const approved = auditions.voiceDesign.voices.find(({ auditionId }) => auditionId === "F");
  const approvedOutput = manifest.outputs.find(({ auditionId }) => auditionId === "F");

  assert.deepEqual(
    { auditionId: config.selection.auditionId, voiceId: config.selection.voiceId },
    { auditionId: "F", voiceId: "cold-witness" }
  );
  assert.equal(config.selection.auditionConfigSha256, "2d94820de25d99ffe4f25a66e83833f27e90b0c0ff2c8928676fc511402c3f95");
  assert.equal(sha256File(auditionsPath), config.selection.auditionConfigSha256);
  assert.equal(manifest.configSha256, config.selection.auditionConfigSha256);
  assert.equal(config.selection.auditionWavSha256, "b2c5fc6282a462c30e7d558870e7bff855a0102c8f42cb7810c0182b37a368b5");
  assert.equal(approvedOutput.sha256, config.selection.auditionWavSha256);
  assert.equal(config.voiceDesign.timbreClause, approved.timbreClause);
  assert.equal(config.voiceDesign.sharedDeliveryClause, auditions.voiceDesign.sharedDeliveryClause);
  assert.equal(config.voiceDesign.instruction, approved.instruction);
  assert.equal(config.voiceDesign.instruction, config.voiceDesign.timbreClause + config.voiceDesign.sharedDeliveryClause);
  assert.deepEqual(config.model, auditions.voiceDesign.model);
  assert.equal(config.model.id, "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign");
  assert.equal(config.model.revision, "0e711a1c0aa5aad30654426e0d11f67716c1211e");
  assert.equal(config.model.generationMethod, "generate_voice_design");
  assert.equal(config.model.device, "cpu");
  assert.equal(config.model.referenceAudio, null);
  assert.equal(config.model.referenceText, null);
  assert.equal(Object.hasOwn(config.model, "speaker"), false);
  assert.equal(Object.hasOwn(config, "fallback"), false);
  assert.doesNotMatch(JSON.stringify(config), /CustomVoice|generate_voice_clone|create_voice_clone_prompt|voiceClonePrompt|BaseModel/i);
});

test("the final batch consumes all 21 approved script cues byte-for-byte and records literal deterministic seeds", () => {
  const script = readJson(path.join(VOICE_ROOT, "script.json"));
  const config = readFinalConfig();
  const timing = readJson(path.join(VOICE_ROOT, "timing.json"));
  assert.equal(script.cues.length, 21);
  assert.deepEqual(script.cues.map(({ id, text }) => [id, text]), APPROVED_CUES.map(([id, text]) => [id, text]));
  assert.equal(script.voice.configFile, "video/footsteps-return/audio/voiceover/final-voice.json");
  assert.equal(script.voice.selectedAuditionId, "F");
  assert.equal(script.voice.selectedVoiceId, "cold-witness");
  assert.equal(Object.hasOwn(script.voice, "fallback"), false);
  assert.equal(config.generation.baseSeed, 83001);
  assert.equal(config.generation.seedDerivation, "sha256-u32be-v1");
  assert.equal(config.generation.seedInput, "<base-seed>\\0<zero-based-cue-index>\\0<cue-id>");
  assert.deepEqual(timing.cues.map(({ id, seed }) => [id, seed]), APPROVED_CUES.map(([id, _text, seed]) => [id, seed]));
  assert.equal(new Set(timing.cues.map(({ seed }) => seed)).size, 21);
  timing.cues.forEach((cue, index) => {
    assert.equal(cue.textSha256, sha256Bytes(Buffer.from(APPROVED_CUES[index][1], "utf8")));
    assert.equal(cue.replacementId, cue.id);
    assert.equal(cue.outputFile, `video/footsteps-return/captures/voiceover/${cue.id}.wav`);
    assert.equal(cue.timeCompressionFactor, 1, `${cue.id} must remain naturally paced unless an explicitly evidenced factor is needed`);
  });
});

test("tracked final metadata is fresh, non-overlapping, caption-synchronized and honest about ASR limits", () => {
  const config = readFinalConfig();
  const timingPath = path.join(VOICE_ROOT, "timing.json");
  const timing = readJson(timingPath);
  const review = readJson(path.join(VOICE_ROOT, "review.json"));
  const captionEvidence = readJson(CAPTION_EVIDENCE_PATH);
  assert.equal(timing.schemaVersion, 2);
  assert.equal(timing.finalConfigSha256, sha256File(FINAL_CONFIG_PATH));
  assert.equal(timing.voice.selectedAuditionId, "F");
  assert.equal(timing.voice.selectedVoiceId, "cold-witness");
  assert.equal(timing.voice.modelId, config.model.id);
  assert.equal(timing.voice.modelRevision, config.model.revision);
  assert.equal(timing.voice.generationMethod, "generate_voice_design");
  assert.equal(Object.hasOwn(timing.voice, "fallback"), false);
  assert.equal(timing.cues.length, 21);
  timing.cues.forEach((cue, index) => {
    assert.ok(cue.durationSeconds > 0);
    assert.equal(cue.sampleRateHz, 48000);
    assert.equal(cue.channels, 1);
    assert.equal(cue.bitsPerSample, 16);
    assert.equal(cue.subtype, "PCM_16");
    assert.match(cue.sha256, /^[a-f0-9]{64}$/);
    assert.ok(cue.peakDbfs <= -6.9 && cue.peakDbfs >= -10, `${cue.id} must respect the conservative peak ceiling`);
    assert.ok(Math.abs(cue.rmsDbfs - (-22)) <= 0.15, `${cue.id} must use consistent dry-voice loudness`);
    assert.ok(cue.leadingSilenceSeconds >= 0 && cue.trailingSilenceSeconds >= 0);
    assert.ok(cue.timelineEndSeconds - cue.timelineStartSeconds >= cue.durationSeconds - 1e-6);
    if (index > 0) {
      assert.ok(cue.timelineStartSeconds >= timing.cues[index - 1].timelineEndSeconds - 1e-6,
        `${timing.cues[index - 1].id} must not overlap ${cue.id}`);
    }
  });
  assert.equal(review.nativeListening.status, "user-review-required");
  assert.equal(review.selectedVoice.auditionId, "F");
  assert.equal(review.selectedVoice.voiceId, "cold-witness");
  assert.equal(review.finalConfigSha256, timing.finalConfigSha256);
  assert.equal(review.continuousReview.sha256, timing.continuousReview.sha256);
  assert.equal(review.continuousReview.durationSeconds, timing.masterDurationSeconds);
  assert.equal(timing.continuousReview.file, config.output.continuousReviewFile);

  assert.ok(["completed", "blocked"].includes(review.asr.status));
  if (review.asr.status === "completed") {
    assert.equal(review.asr.enabled, true);
    assert.match(review.asr.model.id, /whisper/i);
    assert.match(review.asr.model.revision, /^[a-f0-9]{40}$/);
    assert.ok(review.asr.licenseEvidence.repositoryPath);
    assert.ok(Number.isFinite(review.asr.corpusCer));
    assert.equal(review.cues.length, 21);
    review.cues.forEach(({ asr }) => {
      assert.equal(asr.status, "completed");
      assert.equal(typeof asr.transcript, "string");
      assert.equal(typeof asr.normalizedReference, "string");
      assert.equal(typeof asr.normalizedTranscript, "string");
      assert.ok(Number.isInteger(asr.referenceCharacters) && asr.referenceCharacters > 0);
      assert.ok(Number.isInteger(asr.editDistance) && asr.editDistance >= 0);
      assert.ok(Number.isFinite(asr.cer) && asr.cer >= 0);
    });
  } else {
    assert.equal(review.asr.enabled, false);
    assert.ok(review.asr.blocker);
    assert.ok(Array.isArray(review.asr.attempts) && review.asr.attempts.length > 0);
    review.cues.forEach((cue) => assert.equal(Object.hasOwn(cue, "asr"), false, "blocked ASR cannot contain invented cue transcripts"));
  }

  assert.equal(captionEvidence.task, "task8d-final-voiceover-captions");
  assert.equal(captionEvidence.sourceTimingSha256, sha256File(timingPath));
  assert.equal(captionEvidence.masterDurationSeconds, timing.masterDurationSeconds);
  assert.deepEqual(captionEvidence.viewport, { width: 3840, height: 2160, deviceScaleFactor: 1 });
  assert.equal(captionEvidence.native4k, true);
});

test("release provenance and score evidence consume Qwen VoiceDesign and the actual final cue hashes", () => {
  const licenses = readJson(path.join(PV_ROOT, "assets", "audio-licenses.json"));
  const timing = readJson(path.join(VOICE_ROOT, "timing.json"));
  const scoreReview = readJson(path.join(PV_ROOT, "audio", "score", "review.json"));
  const external = licenses.resources.filter(({ external }) => external);
  const releaseInputs = external.filter(({ usageClass }) => usageClass === "release-audio-input").map(({ id }) => id).sort();
  assert.deepEqual(releaseInputs, ["ms-basic-sf3", "qwen3-tts-voice-design-cold-witness"]);
  const qwen = external.find(({ id }) => id === "qwen3-tts-voice-design-cold-witness");
  assert.ok(qwen);
  assert.equal(qwen.version, "0e711a1c0aa5aad30654426e0d11f67716c1211e");
  assert.equal(qwen.incorporatedIntoReleasedAudio, true);
  assert.ok(qwen.assetEvidence.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)));
  ["kokoro-82m-zm-yunyang", "kokoro-onnx-runtime", "espeak-ng-phonemizer"].forEach((id) => {
    const historical = external.find((resource) => resource.id === id);
    assert.ok(historical, `${id} should remain documented as history`);
    assert.equal(historical.usageClass, "historical-build-artifact");
    assert.equal(historical.incorporatedIntoReleasedAudio, false);
  });
  assert.deepEqual(
    scoreReview.objectiveChecks.voiceScoreComparison.cues.map(({ id, voiceSha256 }) => [id, voiceSha256]),
    timing.cues.map(({ id, sha256 }) => [id, sha256])
  );
});

test("high raw-CER cues stay explicit and receive focused independent ASR corroboration without becoming a pass", () => {
  const policy = readJson(ASR_REVIEW_POLICY_PATH);
  const review = readJson(path.join(VOICE_ROOT, "review.json"));
  const asr = review.asr;
  assert.equal(asr.reviewPolicy.sha256, sha256File(ASR_REVIEW_POLICY_PATH));
  assert.equal(asr.manualReview.status, "required");
  assert.match(asr.manualReview.conclusion, /not an intelligibility pass/i);
  assert.ok(asr.corpusCer > 0, "raw CER must remain visible");
  assert.ok(asr.diagnosticCorpusCerAfterScriptVariantFold <= asr.corpusCer);
  assert.match(asr.diagnosticScriptVariantFoldPolicy, /never overwrites raw CER/i);
  assert.deepEqual(asr.focusedCrossCheck.cueIds,
    review.cues.filter(({ asr: cueAsr }) => cueAsr.cer >= policy.focusedCrossCheck.threshold).map(({ id }) => id));
  assert.equal(asr.focusedCrossCheck.model.id, "openai/whisper-large-v3-turbo");
  assert.equal(asr.focusedCrossCheck.model.revision, "41f01f3fe87f28c78e2fbf8b568835947dd65ed9");
  assert.equal(asr.focusedCrossCheck.status, "completed");
  assert.equal(asr.focusedCrossCheck.cuesCompleted, asr.focusedCrossCheck.cueCount);
  assert.deepEqual(asr.manualReview.focusCues.map(({ cueId }) => cueId),
    policy.manualReviewFocus.map(({ cueId }) => cueId));
  assert.ok(new Set(asr.manualReview.focusCues.map(({ category }) => category)).size >= 3);
  asr.manualReview.focusCues.forEach((focus) => {
    assert.ok(focus.primaryTranscript);
    assert.ok(Number.isFinite(focus.primaryRawCer));
    if (focus.primaryRawCer >= policy.focusedCrossCheck.threshold) {
      assert.equal(focus.focusedCrossCheck.status, "completed");
      assert.ok(focus.focusedCrossCheck.transcript);
      assert.ok(Number.isFinite(focus.focusedCrossCheck.cer));
    } else {
      assert.equal(focus.focusedCrossCheck.status, "not-selected");
      assert.match(focus.focusedCrossCheck.reason, /below focused threshold/);
    }
    assert.match(focus.requiredAction, /Native Mandarin reviewer/);
  });
  assert.ok(asr.manualReview.focusCues.some(({ primaryRawCer }) => primaryRawCer < policy.focusedCrossCheck.threshold),
    "ordinary/topology term disagreements below the high-CER threshold must still remain explicit listening targets");
});

test("all ignored final cue WAVs and the continuous review master match committed measurements", { skip: !REQUIRE_FINAL_WAVS }, () => {
  const timing = readJson(path.join(VOICE_ROOT, "timing.json"));
  timing.cues.forEach((cue) => {
    const file = path.join(ROOT, cue.outputFile);
    const measured = inspectPcm16Mono(file);
    assert.equal(measured.sha256, cue.sha256, `${cue.id} hash must describe the actual replacement WAV`);
    assert.ok(Math.abs(measured.durationSeconds - cue.durationSeconds) < 1 / 48000);
  });
  const reviewFile = path.join(ROOT, timing.continuousReview.file);
  const review = inspectPcm16Mono(reviewFile);
  assert.equal(review.sha256, timing.continuousReview.sha256);
  assert.equal(review.bytes, timing.continuousReview.bytes);
  assert.ok(Math.abs(review.durationSeconds - timing.masterDurationSeconds) < 1 / 48000);
});

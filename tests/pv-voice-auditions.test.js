"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "footsteps-return");
const CONFIG_PATH = path.join(PV_ROOT, "audio", "voiceover", "auditions.json");
const MANIFEST_PATH = path.join(PV_ROOT, "audio", "voiceover", "audition-manifest.json");
const LICENSE_EVIDENCE_PATH = path.join(PV_ROOT, "assets", "licenses", "audio", "qwen3-tts-license-evidence.json");
const STYLE_IDS = ["documentary", "adventure", "contemplative"];
const MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";
const MODEL_REVISION = "85e237c12c027371202489a0ec509ded67b5e4b5";
const APPROVED_EXCERPT = "人们总把棋盘的边缘视作尽头。";
const VOICE_DESIGN_IDS = ["deep-baritone", "epic-narrator", "cold-witness", "warm-scholar", "weathered-traveler", "resolute-guide"];
const AUDITION_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
const VOICE_DESIGN_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign";
const VOICE_DESIGN_REVISION = "0e711a1c0aa5aad30654426e0d11f67716c1211e";
const APPROVED_COMBINED_OPENING = "人们总把棋盘的边缘视作尽头。可那些消失在边界上的道路并未中断。它们在另一处接缝后延续，将遥远的落点重新变为近邻。";
const SHARED_DELIVERY_CLAUSE = "使用成熟、自然的标准普通话；以庄重、克制的电影感旁白朗读；辅音清楚，字词易懂；保持平静而向前的推进；不要悲伤、煽情、广告腔、新闻播音腔、喊叫或拖长句尾。";

function requireJson(filePath) {
  assert.ok(fs.existsSync(filePath), `${path.relative(ROOT, filePath)} must exist`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parsePcmWave(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
  let offset = 12;
  let format;
  let pcm;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRateHz: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14)
      };
    } else if (id === "data") {
      pcm = buffer.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  assert.ok(format, "WAV fmt chunk must exist");
  assert.ok(pcm, "WAV data chunk must exist");
  assert.equal(format.audioFormat, 1, "auditions must use integer PCM");
  assert.equal(format.bitsPerSample, 16, "auditions must use PCM-16");
  const sampleCount = pcm.length / 2;
  let peak = 0;
  let squareSum = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const value = pcm.readInt16LE(index * 2) / 32768;
    peak = Math.max(peak, Math.abs(value));
    squareSum += value * value;
  }
  const rms = Math.sqrt(squareSum / sampleCount);
  return {
    ...format,
    sampleCount,
    durationSeconds: sampleCount / (format.sampleRateHz * format.channels),
    peakDbfs: 20 * Math.log10(peak),
    rmsDbfs: 20 * Math.log10(rms)
  };
}

test("Qwen voice auditions lock one approved opening excerpt, Uncle_Fu, and three real style instructions", () => {
  const config = requireJson(CONFIG_PATH);
  const script = requireJson(path.join(PV_ROOT, "audio", "voiceover", "script.json"));
  const packageJson = requireJson(path.join(ROOT, "package.json"));

  assert.equal(script.cues[0].id, "intro-boundary");
  assert.equal(script.cues[0].text, APPROVED_EXCERPT);
  assert.deepEqual(config.textSource, {
    scriptPath: "video/footsteps-return/audio/voiceover/script.json",
    cueIds: ["intro-boundary"],
    text: script.cues[0].text
  });
  assert.deepEqual(config.model, {
    id: MODEL_ID,
    revision: MODEL_REVISION,
    package: { name: "qwen-tts", version: "0.1.1" },
    language: "Chinese",
    speaker: "Uncle_Fu",
    device: "cpu",
    referenceAudio: null
  });
  assert.deepEqual(config.styles.map(({ id }) => id), STYLE_IDS);
  assert.equal(new Set(config.styles.map(({ instruction }) => instruction)).size, 3);
  assert.equal(new Set(config.styles.map(({ seed }) => seed)).size, 1, "instruction must be the only generation variable across styles");
  config.styles.forEach(({ instruction, seed }) => {
    assert.ok(typeof instruction === "string" && instruction.length >= 30, "each performance instruction must be substantive");
    assert.ok(Number.isSafeInteger(seed), "each style must have a deterministic seed");
  });
  assert.deepEqual(config.output, {
    directory: "video/footsteps-return/captures/voice-auditions",
    sampleRateHz: 48000,
    channels: 1,
    subtype: "PCM_16",
    targetRmsDbfs: -22,
    peakCeilingDbfs: -7
  });
  assert.match(packageJson.scripts["pv:voice:auditions"], /^uv run python /);
  assert.doesNotMatch(packageJson.scripts["pv:voice:auditions"], /kokoro|espeak|edge/i);

  for (const style of STYLE_IDS) {
    const outputPath = `${config.output.directory}/${style}.wav`;
    const ignored = spawnSync("git", ["check-ignore", "-q", outputPath], { cwd: ROOT });
    assert.equal(ignored.status, 0, `${outputPath} must remain ignored`);
  }
});

test("Qwen package and pinned model license claims are backed by immutable saved evidence", () => {
  const evidence = requireJson(LICENSE_EVIDENCE_PATH);
  const packageLicensePath = path.join(PV_ROOT, evidence.package.licenseFile);
  const modelCardPath = path.join(PV_ROOT, evidence.model.modelCardFile);
  const packageLicense = fs.readFileSync(packageLicensePath);
  const modelCard = fs.readFileSync(modelCardPath);

  assert.deepEqual(
    { name: evidence.package.name, version: evidence.package.version, spdx: evidence.package.spdx },
    { name: "qwen-tts", version: "0.1.1", spdx: "Apache-2.0" }
  );
  assert.equal(evidence.package.distributionSha256, "11a290d8dabc7ef91a90c54478c8ab19b3edb1d85c0882313721892bdc4af15d");
  assert.equal(sha256(packageLicense), "a44a6081c73ad75f0255bb2bb5cab74ef1829565a895a24e53a4f11290ab7655");
  assert.equal(evidence.package.licenseSha256, sha256(packageLicense));
  assert.match(packageLicense.toString("utf8"), /Apache License\s+Version 2\.0, January 2004/);
  assert.match(packageLicense.toString("utf8"), /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/);

  assert.deepEqual(
    { id: evidence.model.id, revision: evidence.model.revision, spdx: evidence.model.spdx },
    { id: MODEL_ID, revision: MODEL_REVISION, spdx: "Apache-2.0" }
  );
  assert.equal(evidence.model.sourceSha256, "1e3adeecc7a72d6756fdb77c2847f8e994195e105b51206a7a5c049b0dfa48a8");
  assert.equal(sha256(modelCard), "f010321beea475a26a048ab9f8ba69c7fdb1242745d90a047a3e08b336bf923b");
  assert.equal(evidence.model.modelCardSha256, sha256(modelCard));
  assert.equal(evidence.model.savedNormalization, "source text with trailing whitespace trimmed and one final LF");
  assert.match(evidence.model.sourceUrl, new RegExp(MODEL_REVISION));
  assert.match(modelCard.toString("utf8"), /^---\s+license: apache-2\.0/m);
  assert.match(modelCard.toString("utf8"), /Uncle_Fu\s*\|\s*Seasoned male voice, mellow timbre/);
  assert.match(modelCard.toString("utf8"), /generate_custom_voice/);
});

test("audition manifest keeps directly comparable deterministic review metadata", () => {
  const config = requireJson(CONFIG_PATH);
  const manifest = requireJson(MANIFEST_PATH);
  const configBytes = fs.readFileSync(CONFIG_PATH);

  assert.equal(manifest.status, "user-review-required");
  assert.equal(manifest.configSha256, sha256(configBytes));
  assert.equal(manifest.text, APPROVED_EXCERPT);
  assert.equal(manifest.model.id, MODEL_ID);
  assert.equal(manifest.model.revision, MODEL_REVISION);
  assert.equal(manifest.model.speaker, "Uncle_Fu");
  assert.equal(manifest.outputs.length, 9);
  assert.deepEqual(manifest.outputs.slice(0, 3).map(({ style }) => style), STYLE_IDS);
  manifest.outputs.slice(0, 3).forEach((output, index) => {
    assert.equal(output.instruction, config.styles[index].instruction);
    assert.equal(output.seed, config.styles[index].seed);
    assert.equal(output.file, `${config.output.directory}/${output.style}.wav`);
    assert.ok(Number.isInteger(output.sourceSampleRateHz) && output.sourceSampleRateHz > 0);
    assert.equal(output.normalizedSampleRateHz, 48000);
    assert.equal(output.channels, 1);
    assert.equal(output.subtype, "PCM_16");
    assert.ok(output.durationSeconds > 0.5);
    assert.ok(Number.isFinite(output.peakDbfs) && output.peakDbfs <= -0.9);
    assert.ok(Number.isFinite(output.rmsDbfs));
    assert.match(output.sha256, /^[a-f0-9]{64}$/);
    assert.equal(output.status, "user-review-required");
  });
  assert.ok(Math.max(...manifest.outputs.slice(0, 3).map(({ rmsDbfs }) => rmsDbfs)) - Math.min(...manifest.outputs.slice(0, 3).map(({ rmsDbfs }) => rmsDbfs)) <= 0.35);
  assert.ok(Math.max(...manifest.outputs.slice(0, 3).map(({ peakDbfs }) => peakDbfs)) - Math.min(...manifest.outputs.slice(0, 3).map(({ peakDbfs }) => peakDbfs)) <= 3);
});

test("local Qwen audition WAVs decode as fresh, non-silent, matched 48 kHz mono PCM", (t) => {
  const manifest = requireJson(MANIFEST_PATH);
  const missing = manifest.outputs.filter(({ file }) => !fs.existsSync(path.join(ROOT, file)));
  if (missing.length > 0 && process.env.REQUIRE_PV_VOICE_AUDITIONS !== "1") {
    t.skip("ignored local audition WAVs are not present in this checkout");
    return;
  }
  assert.deepEqual(missing, [], "all nine ignored audition WAVs must exist for focused verification");

  const measured = manifest.outputs.map((output) => {
    const buffer = fs.readFileSync(path.join(ROOT, output.file));
    const wave = parsePcmWave(buffer);
    assert.equal(wave.channels, 1);
    assert.equal(wave.sampleRateHz, 48000);
    assert.ok(wave.sampleCount > 24000, `${output.style} must be non-empty`);
    assert.ok(Number.isFinite(wave.peakDbfs) && wave.peakDbfs > -40, `${output.style} must be non-silent`);
    assert.ok(Number.isFinite(wave.rmsDbfs) && wave.rmsDbfs > -50, `${output.style} must be non-silent`);
    assert.equal(sha256(buffer), output.sha256, `${output.style} hash must be fresh`);
    assert.ok(Math.abs(wave.durationSeconds - output.durationSeconds) <= 0.0001);
    assert.ok(Math.abs(wave.peakDbfs - output.peakDbfs) <= 0.01);
    assert.ok(Math.abs(wave.rmsDbfs - output.rmsDbfs) <= 0.01);
    return wave;
  });

  assert.ok(Math.max(...measured.map(({ rmsDbfs }) => rmsDbfs)) - Math.min(...measured.map(({ rmsDbfs }) => rmsDbfs)) <= 0.35);
  assert.ok(Math.max(...measured.map(({ peakDbfs }) => peakDbfs)) - Math.min(...measured.map(({ peakDbfs }) => peakDbfs)) <= 3);
});

test("VoiceDesign auditions D-I lock the two-cue text and vary only original non-identifying timbre clauses", () => {
  const config = requireJson(CONFIG_PATH);
  const script = requireJson(path.join(PV_ROOT, "audio", "voiceover", "script.json"));
  const voiceDesign = config.voiceDesign;

  assert.ok(voiceDesign, "D-I VoiceDesign config must exist");
  assert.equal(script.cues[0].id, "intro-boundary");
  assert.equal(script.cues[1].id, "intro-roads");
  assert.equal(script.cues[0].text + script.cues[1].text, APPROVED_COMBINED_OPENING);
  assert.deepEqual(voiceDesign.textSource, {
    scriptPath: "video/footsteps-return/audio/voiceover/script.json",
    cueIds: ["intro-boundary", "intro-roads"],
    text: APPROVED_COMBINED_OPENING
  });
  assert.deepEqual(voiceDesign.model, {
    id: VOICE_DESIGN_MODEL_ID,
    revision: VOICE_DESIGN_REVISION,
    package: { name: "qwen-tts", version: "0.1.1" },
    language: "Chinese",
    device: "cpu",
    generationMethod: "generate_voice_design",
    referenceAudio: null,
    referenceText: null
  });
  assert.equal(voiceDesign.sharedDeliveryClause, SHARED_DELIVERY_CLAUSE);
  assert.deepEqual(voiceDesign.voices.map(({ id }) => id), VOICE_DESIGN_IDS);
  assert.deepEqual(voiceDesign.voices.map(({ auditionId }) => auditionId), AUDITION_IDS.slice(3));
  assert.equal(new Set(voiceDesign.voices.map(({ timbreClause }) => timbreClause)).size, 6);
  assert.equal(new Set(voiceDesign.voices.map(({ seed }) => seed)).size, 1);
  assert.ok(Number.isSafeInteger(voiceDesign.voices[0].seed));
  voiceDesign.voices.forEach((voice) => {
    assert.equal(voice.instruction, voice.timbreClause + SHARED_DELIVERY_CLAUSE);
    const instructionBytes = Buffer.from(voice.instruction, "utf8");
    const sharedBytes = Buffer.from(SHARED_DELIVERY_CLAUSE, "utf8");
    assert.deepEqual(instructionBytes.subarray(instructionBytes.length - sharedBytes.length), sharedBytes);
    assert.equal(Object.hasOwn(voiceDesign.model, "speaker"), false, "VoiceDesign must not select a named speaker");
    const outputPath = `${config.output.directory}/${voice.id}.wav`;
    const ignored = spawnSync("git", ["check-ignore", "-q", outputPath], { cwd: ROOT });
    assert.equal(ignored.status, 0, `${outputPath} must remain ignored`);
  });
  assert.deepEqual(config.voiceDesign.generation, config.generation, "D-I must share the locked sampling parameters");
});

test("VoiceDesign model license and official generation path are backed by immutable saved evidence", () => {
  const evidence = requireJson(LICENSE_EVIDENCE_PATH);
  const voiceDesignEvidence = evidence.voiceDesignModel;
  assert.ok(voiceDesignEvidence, "immutable VoiceDesign model evidence must exist");
  const modelCardPath = path.join(PV_ROOT, voiceDesignEvidence.modelCardFile);
  const modelCard = fs.readFileSync(modelCardPath);

  assert.deepEqual(
    { id: voiceDesignEvidence.id, revision: voiceDesignEvidence.revision, spdx: voiceDesignEvidence.spdx },
    { id: VOICE_DESIGN_MODEL_ID, revision: VOICE_DESIGN_REVISION, spdx: "Apache-2.0" }
  );
  assert.equal(voiceDesignEvidence.sourceSha256, "621b7e88f1867bc03d817176fc1f7f55f4b5a70654b2a07fdcda1e169efb024b");
  assert.equal(sha256(modelCard), "cef0ef3f5366898466254afaebddb4ba1cd2e9d6dad376a3705b55cfcc8e0f92");
  assert.equal(voiceDesignEvidence.modelCardSha256, sha256(modelCard));
  assert.equal(voiceDesignEvidence.savedNormalization, "source line trailing whitespace trimmed, LF line endings and one final LF");
  assert.equal(voiceDesignEvidence.revisionUrl, `https://huggingface.co/${VOICE_DESIGN_MODEL_ID}/tree/${VOICE_DESIGN_REVISION}`);
  assert.match(voiceDesignEvidence.sourceUrl, new RegExp(VOICE_DESIGN_REVISION));
  assert.match(modelCard.toString("utf8"), /^---\s+license: apache-2\.0/m);
  assert.match(modelCard.toString("utf8"), /Qwen3-TTS-12Hz-1\.7B-VoiceDesign/);
  assert.match(modelCard.toString("utf8"), /generate_voice_design/);
});

test("audition manifest requires complete A-I entries and full VoiceDesign review metadata", () => {
  const config = requireJson(CONFIG_PATH);
  const manifest = requireJson(MANIFEST_PATH);
  const voiceDesignOutputs = manifest.outputs.slice(3);

  assert.deepEqual(manifest.outputs.map(({ auditionId }) => auditionId), AUDITION_IDS);
  assert.deepEqual(voiceDesignOutputs.map(({ style }) => style), VOICE_DESIGN_IDS);
  assert.equal(voiceDesignOutputs.length, 6);
  voiceDesignOutputs.forEach((output, index) => {
    const voice = config.voiceDesign.voices[index];
    assert.deepEqual(output.model, { id: VOICE_DESIGN_MODEL_ID, revision: VOICE_DESIGN_REVISION });
    assert.equal(output.text, APPROVED_COMBINED_OPENING);
    assert.equal(output.timbreClause, voice.timbreClause);
    assert.equal(output.sharedDeliveryClause, SHARED_DELIVERY_CLAUSE);
    assert.equal(output.instruction, voice.timbreClause + SHARED_DELIVERY_CLAUSE);
    assert.equal(output.seed, voice.seed);
    assert.equal(output.file, `${config.output.directory}/${voice.id}.wav`);
    assert.ok(Number.isInteger(output.sourceSampleRateHz) && output.sourceSampleRateHz > 0);
    assert.equal(output.normalizedSampleRateHz, 48000);
    assert.equal(output.channels, 1);
    assert.equal(output.subtype, "PCM_16");
    assert.ok(output.durationSeconds > 0.5);
    assert.ok(Number.isFinite(output.peakDbfs) && output.peakDbfs <= -0.9);
    assert.ok(Number.isFinite(output.rmsDbfs));
    assert.match(output.sha256, /^[a-f0-9]{64}$/);
    assert.equal(output.status, "user-review-required");
  });
});

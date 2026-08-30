const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const repositoryRoot = path.resolve(__dirname, "..");
const pvRoot = path.join(repositoryRoot, "video", "chapter-teaser");
const story = JSON.parse(fs.readFileSync(path.join(pvRoot, "story.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(pvRoot, "manifest.json"), "utf8"));

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(pvRoot, relativePath)).href);
}

test("chapter teaser timeline is measured, frame-aligned, and in the review duration window", async () => {
  const { flattenStoryCues } = await loadModule("src/audio-timeline.mjs");
  const sourceCues = flattenStoryCues(story);
  assert.equal(sourceCues.length, 45);
  assert.equal([...sourceCues.map((cue) => cue.text).join("")].length, 535);
  assert.equal(manifest.fps, 60);
  assert.equal(manifest.sampleRate, 48000);
  assert.equal(manifest.samplesPerFrame, 800);
  const storyDigest = crypto.createHash("sha256").update(fs.readFileSync(path.join(pvRoot, "story.json"))).digest("hex");
  assert.equal(manifest.source.storySha256, storyDigest);
  assert.ok(Math.abs(manifest.durationSeconds - manifest.totalFrames / manifest.fps) < 1e-6);
  assert.ok(manifest.durationSeconds >= 178 && manifest.durationSeconds <= 190);
  assert.equal(manifest.cues.length, sourceCues.length);

  let cursor = 0;
  for (const segment of manifest.segments) {
    assert.equal(segment.startFrame, cursor, `gap before ${segment.id}`);
    assert.equal(segment.endFrame - segment.startFrame, segment.durationFrames);
    assert.ok(Number.isInteger(segment.startFrame));
    assert.ok(Number.isInteger(segment.endFrame));
    cursor = segment.endFrame;
  }
  assert.equal(cursor, manifest.totalFrames);
});

test("all seven chapter cards are silent narration windows", () => {
  const cards = manifest.segments.filter((segment) => segment.kind === "chapter-card");
  assert.equal(cards.length, 7);
  for (const card of cards) {
    assert.equal(card.durationFrames, story.render.titleFrames);
    assert.deepEqual(card.narrationCueIds, []);
    assert.equal(card.transformFrame, card.startFrame + story.render.titleTransformFrame);
    assert.equal(
      manifest.cues.some((cue) => cue.startFrame < card.endFrame && cue.endFrame > card.startFrame),
      false,
      `narration overlaps ${card.id}`
    );
  }
});

test("subtitle artifacts are one line, stop-free, non-overlapping, and cue-exact", () => {
  assert.equal(manifest.subtitles.length, manifest.cues.length);
  manifest.subtitles.forEach((subtitle, index) => {
    const cue = manifest.cues[index];
    assert.equal(subtitle.cueId, cue.id);
    assert.equal(subtitle.startFrame, cue.startFrame);
    assert.equal(subtitle.endFrame, cue.endFrame);
    assert.doesNotMatch(subtitle.text, /[。.\r\n]/);
    if (index > 0) assert.ok(subtitle.startFrame >= manifest.subtitles[index - 1].endFrame);
  });

  const srt = fs.readFileSync(path.join(pvRoot, "captions.srt"), "utf8").trim();
  const srtBlocks = srt.split(/\r?\n\r?\n/);
  assert.equal(srtBlocks.length, manifest.subtitles.length);
  srtBlocks.forEach((block, index) => {
    const lines = block.split(/\r?\n/);
    assert.equal(lines.length, 3);
    assert.equal(lines[2], manifest.subtitles[index].text);
  });

  const ass = fs.readFileSync(path.join(pvRoot, "captions.ass"), "utf8");
  const dialogueLines = ass.split(/\r?\n/).filter((line) => line.startsWith("Dialogue:"));
  assert.equal(dialogueLines.length, manifest.subtitles.length);
  assert.match(ass, /Style: Caption,[^\n]+,0,2,144,144,90,1/);
  const assTexts = dialogueLines.map((line) => line.split(",").slice(9).join(","));
  assert.doesNotMatch(assTexts.join("\n"), /[。.]/);
});

test("score keeps seven independent musical worlds and leaves narration headroom", async () => {
  const {
    CHAPTER_SCORE_BLUEPRINTS,
    ORCHESTRAL_SCORE_SOURCE,
    buildScorePlan,
    SCORE_SEED,
    SCORE_STEMS,
    validateScorePlan,
    VOICE_DUCK_REDUCTION,
    voiceDuckGain
  } = await loadModule("src/audio-synth.mjs");
  const first = buildScorePlan(story, manifest);
  const second = buildScorePlan(story, manifest);
  assert.equal(SCORE_SEED, manifest.seed);
  assert.deepEqual(first, second);
  assert.equal(validateScorePlan(first, story), true);
  assert.deepEqual(Object.keys(first), [...SCORE_STEMS]);
  assert.ok(first.fx.length > 0);
  assert.equal(manifest.score.sharedChapterMelody, false);
  assert.deepEqual(manifest.score.deepStructure.pitchCell, ["D", "F", "G", "A", "C"]);
  assert.deepEqual(Object.keys(manifest.score.chapters), story.chapters.map((chapter) => chapter.id));

  const worlds = Object.values(CHAPTER_SCORE_BLUEPRINTS);
  const motiveSignatures = worlds.map((world) => JSON.stringify([world.motive, world.counterMotive ?? null]));
  const rhythmSignatures = worlds.map((world) => JSON.stringify([
    world.rhythmicIdentity,
    world.motive.rhythmSeconds,
    world.counterMotive?.rhythmSeconds ?? null
  ]));
  const leadSignatures = worlds.map((world) => world.leadParts.join("+"));
  assert.equal(new Set(motiveSignatures).size, 7);
  assert.equal(new Set(rhythmSignatures).size, 7);
  assert.equal(new Set(leadSignatures).size, 7);
  assert.ok(worlds.every((world) => world.character.length > 20));
  assert.ok(worlds.some((world) => world.motive.pitches.some((midi) => ![0, 2, 5, 7, 9].includes(midi % 12))));
  assert.equal(ORCHESTRAL_SCORE_SOURCE.sourceMusic.importedOrTranscribedReferenceMusic, false);

  const transitionFx = first.fx.filter((sourceEvent) => sourceEvent.role === "transition");
  assert.equal(transitionFx.length, ORCHESTRAL_SCORE_SOURCE.joins.length);
  assert.equal(new Set(transitionFx.map((sourceEvent) => sourceEvent.transition)).size, ORCHESTRAL_SCORE_SOURCE.joins.length);
  assert.equal(VOICE_DUCK_REDUCTION, 0.66);
  assert.equal(manifest.audio.mix.voiceDucking.maximumReduction, VOICE_DUCK_REDUCTION);
  assert.ok(Math.abs(voiceDuckGain(manifest.cues[0].startFrame, manifest.cues) - (1 - VOICE_DUCK_REDUCTION)) < 1e-9);
});

test("committed MusicXML sources and semantic frame warp are reproducible", async () => {
  const {
    ORCHESTRAL_PART_BUSES,
    ORCHESTRAL_SCORE_SOURCE,
    buildScoreTimeWarpAnchors,
    sourceSecondsAtFrame,
    validateOrchestralSources
  } = await loadModule("src/audio-synth.mjs");

  assert.equal(validateOrchestralSources(), true);
  assert.equal(Object.values(ORCHESTRAL_PART_BUSES).flat().length, 11);
  assert.deepEqual(Object.keys(ORCHESTRAL_PART_BUSES), ["piano", "strings", "bass", "choir", "fx"]);
  const anchors = buildScoreTimeWarpAnchors(manifest);
  assert.equal(anchors[0].targetFrame, 0);
  assert.equal(anchors[0].sourceSeconds, 0);
  assert.equal(anchors.at(-1).targetFrame, manifest.totalFrames);
  assert.equal(anchors.at(-1).sourceSeconds, ORCHESTRAL_SCORE_SOURCE.sourceDurationSeconds);
  for (const anchor of anchors) {
    assert.ok(Math.abs(sourceSecondsAtFrame(anchor.targetFrame, anchors) - anchor.sourceSeconds) < 1e-9);
  }
  assert.deepEqual(manifest.score.timeWarp.anchors, anchors);
  assert.equal(manifest.score.source.format, "11 committed MusicXML parts rendered with MuseScore Basic");
  assert.deepEqual(manifest.score.source.licenses, [
    "video/chapter-teaser/assets/licenses/audio/musescore-license.txt",
    "video/chapter-teaser/assets/licenses/audio/ms-basic-license.md"
  ]);
  for (const license of manifest.score.source.licenses) assert.equal(fs.existsSync(path.join(repositoryRoot, license)), true);
});

test("stale score masters are rejected by source fingerprint", async () => {
  const { scoreArtifactIsCurrent } = await loadModule("scripts/build-audio.mjs");
  const current = {
    sha256: "a".repeat(64),
    scorePlanSha256: manifest.score.source.planSha256
  };
  assert.equal(scoreArtifactIsCurrent(current, manifest.score), true);
  assert.equal(scoreArtifactIsCurrent({ ...current, scorePlanSha256: "0".repeat(64) }, manifest.score), false);
  assert.equal(scoreArtifactIsCurrent({ sha256: "a".repeat(64) }, manifest.score), false);
});

test("audio renderer makes deterministic 48 kHz stereo PCM", async (t) => {
  const { readWav } = await loadModule("src/audio-wav.mjs");
  const { renderScoreStem } = await loadModule("src/audio-synth.mjs");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-teaser-audio-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const firstPath = path.join(temporaryRoot, "first.wav");
  const secondPath = path.join(temporaryRoot, "second.wav");
  const render = (outputPath) => renderScoreStem({
    stem: "piano",
    events: [{ id: "test-d", startFrame: 12, durationFrames: 72, midi: 62, velocity: 0.7, pan: 0 }],
    totalFrames: 120,
    sampleRate: 48000,
    outputPath
  });
  render(firstPath);
  render(secondPath);
  const digest = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  assert.equal(digest(firstPath), digest(secondPath));
  const wav = readWav(firstPath);
  assert.equal(wav.sampleRate, 48000);
  assert.equal(wav.channels, 2);
  assert.equal(wav.bitsPerSample, 16);
  assert.equal(wav.frameCount, 120 * 800);
});

test("orchestral bus warp is deterministic and frame exact", async (t) => {
  const { readWav, writePcm16Stereo } = await loadModule("src/audio-wav.mjs");
  const { renderOrchestralScoreStem } = await loadModule("src/audio-synth.mjs");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-teaser-orchestra-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourcePath = path.join(temporaryRoot, "restrained-percussion.wav");
  const source = new Float32Array(48000 * 2 * 2);
  for (let frame = 0; frame < 48000 * 2; frame += 1) {
    const sample = Math.sin(Math.PI * 2 * 110 * frame / 48000) * 0.2;
    source[frame * 2] = sample;
    source[frame * 2 + 1] = sample;
  }
  writePcm16Stereo(sourcePath, source, 48000);
  const anchors = [
    { label: "start", sourceSeconds: 0, targetFrame: 0 },
    { label: "end", sourceSeconds: 2, targetFrame: 150 }
  ];
  const render = (outputPath) => renderOrchestralScoreStem({
    stem: "fx",
    sourcePartPaths: { "restrained-percussion": sourcePath },
    proceduralEvents: [],
    anchors,
    totalFrames: 150,
    sampleRate: 48000,
    outputPath
  });
  const firstPath = path.join(temporaryRoot, "first.wav");
  const secondPath = path.join(temporaryRoot, "second.wav");
  render(firstPath);
  render(secondPath);
  const digest = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  assert.equal(digest(firstPath), digest(secondPath));
  const wav = readWav(firstPath);
  assert.equal(wav.frameCount, 150 * 800);
  assert.equal(wav.sampleRate, 48000);
  assert.equal(wav.channels, 2);
});

test("manifest keeps every generated audio asset under the ignored output root", () => {
  assert.equal(manifest.outputRoot, ".tmp/chapter-teaser");
  assert.equal(manifest.voice.displayName, "Microsoft Kangkang");
  assert.equal(manifest.voice.rate, 0);
  assert.equal(manifest.voice.reviewOnly, true);
  assert.deepEqual(Object.keys(manifest.audio.scoreStems), ["piano", "strings", "bass", "choir", "fx"]);
  const paths = [
    manifest.audio.voiceStem,
    manifest.audio.scoreMix,
    manifest.audio.masterMix,
    ...Object.values(manifest.audio.scoreStems),
    ...manifest.cues.map((cue) => cue.voiceFile)
  ];
  assert.ok(paths.every((filePath) => filePath.startsWith(".tmp/chapter-teaser/")));
});

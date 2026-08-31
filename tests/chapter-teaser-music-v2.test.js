const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "chapter-teaser");
const plan = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "music-plan.json"), "utf8"));
const timing = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "narration-timing.json"), "utf8"));
const cacheRoot = path.join(ROOT, ".tmp", "chapter-teaser", "source", "music", "curated");
const sourceById = new Map(plan.sources.map((source) => [source.id, source]));

function durationSeconds(clip) {
  return (clip.targetEndFrame - clip.targetStartFrame) / plan.fps;
}

function sourceOutSeconds(clip) {
  return clip.sourceInSeconds + durationSeconds(clip);
}

test("elegant classical-HOYO score uses eleven works instead of re-cutting the reference", () => {
  assert.equal(plan.schemaVersion, 2);
  assert.equal(plan.selectionAudit.selected, "elegant-classical-hoyo");
  assert.match(plan.reference.role, /structural.*reference only/i);
  assert.equal(plan.sources.length, 11);
  assert.equal(plan.clips.length, 11);
  assert.deepEqual(plan.clips.map((clip) => clip.id), [
    "intro-satie", "intro-awakening", "plane", "cylinder", "torus", "mobius", "klein",
    "projective-recta", "projective-inversa", "sphere", "finale"
  ]);
  assert.equal(new Set(plan.clips.map((clip) => clip.sourceId)).size, 11);
  assert.equal(new Set(plan.sources.map((source) => source.work)).size, 11);
  assert.equal(plan.sources.some((source) => source.sha256 === plan.reference.sha256), false);
  assert.match(plan.selectionAudit.referenceDecision, /retained only as a structural reference/i);
  assert.equal(plan.editing.normalizationTargetLufs, -20);
  assert.equal(plan.editing.truePeakDb, -3);
  assert.equal(plan.editing.postMixGain, 0.62);
});

test("every selected recording is traceable, cached-only and selected for a distinct chapter mechanism", () => {
  const expectedWorks = [
    "Gnossienne No. 6",
    "Daphnis et Chloé: Lever du jour",
    "The Art of Fugue, BWV 1080: Contrapunctus I",
    "Symposion of Spectacle",
    "String Quartet in F major: II. Assez vif, très rythmé",
    "Prelude, Op. 67 No. 1",
    "Préludes, Book I: La cathédrale engloutie",
    "The Art of Fugue: Contrapunctus Inversus a4, Forma Recta",
    "The Art of Fugue: Contrapunctus Inversus a4, Forma Inversa",
    "Fontaine",
    "Symphony No. 3 in C minor, Op. 78 ‘Organ’: Finale"
  ];
  assert.deepEqual(plan.sources.map((source) => source.work), expectedWorks);
  for (const source of plan.sources) {
    assert.match(source.sourcePage, /^https:\/\//u);
    assert.equal(source.downloadUrl, null);
    assert.equal(source.cacheRequired, true);
    assert.equal(source.sha256.length, 64);
    assert.match(source.audioQuality, /(?:Opus, 48 kHz stereo|FLAC, 96 kHz stereo)/u);
  }
  for (const clip of plan.clips) {
    assert.ok(clip.selectionReason.length > 80, clip.id);
    assert.ok(clip.chapterRole.length > 30, clip.id);
    assert.equal("playbackRate" in clip, false);
  }
  const revealClips = plan.clips.filter((clip) => clip.reveal);
  assert.equal(revealClips.length, 7);
  assert.equal(new Set(revealClips.map((clip) => clip.chapterRole)).size, 7);
  const hoyoSources = new Set(plan.sources.filter((source) => source.composer === "HOYO-MiX").map((source) => source.id));
  assert.deepEqual(plan.clips.filter((clip) => hoyoSources.has(clip.sourceId)).map((clip) => clip.id), ["cylinder", "sphere"]);
  assert.deepEqual(
    plan.clips.filter((clip) => clip.id.startsWith("projective-")).map((clip) => clip.id),
    ["projective-recta", "projective-inversa"]
  );
});

test("phrase-aware adjacent edits cover the scored film and leave only a one-second cadence decay on the end card", () => {
  assert.equal(plan.editing.crossfadeCurve, "qsin");
  assert.equal(plan.editing.defaultCrossfadeFrames, 84);
  assert.equal(plan.editing.maxConcurrentFullRangeClips, 2);
  assert.equal(plan.clips[0].targetStartFrame, 0);
  const endCard = timing.visualSegments.find((segment) => segment.kind === "end-card");
  assert.ok(endCard);
  assert.equal(endCard.startFrame, 12474);
  assert.equal(plan.clips.at(-1).targetEndFrame, endCard.startFrame + 60);

  for (let index = 1; index < plan.clips.length; index += 1) {
    const previous = plan.clips[index - 1];
    const current = plan.clips[index];
    const overlap = previous.targetEndFrame - current.targetStartFrame;
    assert.equal(overlap, plan.editing.defaultCrossfadeFrames, `${previous.id} -> ${current.id}: ${overlap}`);
  }
  assert.equal(plan.clips.find((clip) => clip.id === "sphere").targetEndFrame, 11967);
  assert.equal(plan.clips.find((clip) => clip.id === "finale").targetStartFrame, 11883);

  for (let frame = 0; frame < endCard.startFrame; frame += 1) {
    const active = plan.clips.filter((clip) => frame >= clip.targetStartFrame && frame < clip.targetEndFrame);
    assert.ok(active.length >= 1 && active.length <= 2, `frame ${frame} has ${active.length} full-range beds`);
  }
  for (let frame = endCard.startFrame + 60; frame < timing.totalFrames; frame += 1) {
    const active = plan.clips.filter((clip) => frame >= clip.targetStartFrame && frame < clip.targetEndFrame);
    assert.equal(active.length, 0, `end-card frame ${frame} must be silent after the cadence decay`);
  }
});

test("all source excerpts stay in bounds and the measured phrase actions align to the picture", () => {
  for (const clip of plan.clips) {
    const source = sourceById.get(clip.sourceId);
    assert.ok(source);
    assert.ok(clip.sourceInSeconds >= 0);
    assert.ok(sourceOutSeconds(clip) <= source.durationSeconds + 1e-6, clip.id);
  }

  const chapterClips = plan.clips.filter((clip) => clip.reveal);
  assert.equal(chapterClips.length, 7);
  for (const clip of chapterClips) {
    const reveal = clip.reveal;
    assert.equal(reveal.vacuumStartFrame, reveal.impactFrame - plan.editing.chapterRevealGrammar.vacuumFrames);
    assert.equal(reveal.tailEndFrame, reveal.impactFrame + plan.editing.chapterRevealGrammar.tailFrames);
    assert.ok(reveal.cardStartFrame < reveal.vacuumStartFrame);
    assert.ok(reveal.impactFrame < clip.targetEndFrame);
    const alignedSourceSeconds = clip.sourceInSeconds + (reveal.impactFrame - clip.targetStartFrame) / plan.fps;
    assert.ok(Math.abs(alignedSourceSeconds - reveal.nativeImpactSourceSeconds) < 0.00001, clip.id);
  }

  const plane = plan.clips.find((clip) => clip.id === "plane");
  assert.equal(plane.targetStartFrame, 2114);
  assert.equal(plane.reveal.nativeImpactSourceSeconds, 12.2);
  const finale = plan.clips.at(-1);
  assert.ok(Math.abs(finale.sourceOutSeconds - finale.sourceInSeconds - 10.85) < 1e-9);
  assert.equal(durationSeconds(finale), 10.85);
  assert.equal(finale.sourceInSeconds, 146.762125);
  assert.equal(finale.sourceOutSeconds, 157.612125);
  assert.equal(finale.fadeOutFrames, 42);
  assert.equal(finale.waveformAudit.tuttiCadenceStartSeconds, 153.812125);
  assert.equal(finale.waveformAudit.previousCutSeconds, 156.612125);
  assert.equal(finale.waveformAudit.tailExtensionSeconds, 1);
  assert.equal(finale.waveformAudit.fadeOutStartSeconds, 156.912125);
  assert.equal(finale.waveformAudit.excludedQuietSoloEndSeconds, 163.662125);
  assert.equal(finale.waveformAudit.usesNaturalAudibleEnd, false);
  assert.equal(finale.waveformAudit.quietSoloSuppressedByFade, true);
  assert.equal(finale.waveformAudit.excludesSustainedQuietSolo, true);
  assert.equal(
    finale.targetStartFrame + Math.round((finale.waveformAudit.tuttiCadenceStartSeconds - finale.sourceInSeconds) * plan.fps),
    12306
  );
});

test("all eleven cached source hashes are exact and every edited source midpoint is audible", {
  skip: !plan.sources.every((source) => fs.existsSync(path.join(cacheRoot, source.filename)))
}, () => {
  const sink = process.platform === "win32" ? "NUL" : "/dev/null";
  for (const source of plan.sources) {
    const sourcePath = path.join(cacheRoot, source.filename);
    const digest = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
    assert.equal(digest, source.sha256, source.id);
  }

  for (const clip of plan.clips) {
    const source = sourceById.get(clip.sourceId);
    const sourcePath = path.join(cacheRoot, source.filename);
    const sourceMidpoint = clip.sourceInSeconds + durationSeconds(clip) / 2;
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-ss", sourceMidpoint.toFixed(6), "-t", "0.5", "-i", sourcePath,
      "-af", "volumedetect", "-f", "null", sink
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const match = output.match(/mean_volume:\s*(-?[0-9.]+) dB/);
    assert.ok(match, `${clip.id} midpoint volume was not measured`);
    assert.ok(Number(match[1]) > -60, `${clip.id} midpoint is effectively silent: ${match[1]} dB`);
  }
});

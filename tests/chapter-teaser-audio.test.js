const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const repositoryRoot = path.resolve(__dirname, "..");
const pvRoot = path.join(repositoryRoot, "video", "chapter-teaser");
const story = JSON.parse(fs.readFileSync(path.join(pvRoot, "story.json"), "utf8"));
const timing = JSON.parse(fs.readFileSync(path.join(pvRoot, "narration-timing.json"), "utf8"));
const musicPlan = JSON.parse(fs.readFileSync(path.join(pvRoot, "music-plan.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(pvRoot, "manifest.json"), "utf8"));

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(pvRoot, relativePath)).href);
}

test("formal narration is the one frame clock for the 214.95 second timeline", async () => {
  const { buildTimeline, flattenStoryCues } = await loadModule("src/audio-timeline.mjs");
  const sourceCues = flattenStoryCues(story);
  const rebuilt = buildTimeline(story, timing);
  assert.equal(sourceCues.length, 39);
  assert.equal(rebuilt.totalFrames, 12897);
  assert.equal(rebuilt.durationSeconds, 214.95);
  assert.equal(manifest.fps, 60);
  assert.equal(manifest.sampleRate, 48000);
  assert.equal(manifest.samplesPerFrame, 800);
  assert.equal(manifest.totalFrames, rebuilt.totalFrames);
  assert.deepEqual(manifest.segments, rebuilt.segments);
  assert.deepEqual(manifest.subtitles, rebuilt.subtitles);
  assert.equal(manifest.cues.length, 39);
  assert.equal(manifest.voice.sourceSha256, timing.sources.voice.sha256);
  assert.match(manifest.voice.processing, /no edits, reordering or time stretch/i);

  let cursor = 0;
  for (const segment of manifest.segments) {
    assert.equal(segment.startFrame, cursor, `gap before ${segment.id}`);
    assert.equal(segment.endFrame - segment.startFrame, segment.durationFrames);
    cursor = segment.endFrame;
  }
  assert.equal(cursor, 12897);
});

test("the exact four-second institution-logo silence contains neither voice nor captions", () => {
  const logo = manifest.segments.find((segment) => segment.kind === "institution-logo");
  assert.deepEqual([logo.startFrame, logo.endFrame, logo.durationFrames], [1225, 1466, 241]);
  assert.deepEqual(logo.narrationCueIds, []);
  assert.equal(
    manifest.subtitles.some((subtitle) => subtitle.startFrame < logo.endFrame && subtitle.endFrame > logo.startFrame),
    false
  );
  assert.equal(manifest.subtitles[3].endFrame, 1225);
  assert.equal(manifest.subtitles[4].startFrame, 1466);
});

test("all seven variable-length chapter cards remain silent title-only windows", () => {
  const cards = manifest.segments.filter((segment) => segment.kind === "chapter-card");
  assert.equal(cards.length, 7);
  for (const card of cards) {
    assert.deepEqual(card.narrationCueIds, []);
    assert.ok(card.durationFrames >= 325 && card.durationFrames <= 358);
    assert.ok(card.transformFrame > card.startFrame && card.transformFrame < card.endFrame);
    assert.equal(
      manifest.cues.some((cue) => cue.startFrame < card.endFrame && cue.endFrame > card.startFrame),
      false,
      `narration overlaps ${card.id}`
    );
  }
});

test("SRT and ASS are cue-exact, stop-free, one-line, sans-serif subtitles", () => {
  assert.equal(manifest.subtitles.length, 39);
  manifest.subtitles.forEach((subtitle, index) => {
    const cue = manifest.cues[index];
    assert.equal(subtitle.cueId, cue.id);
    assert.equal(subtitle.startFrame, cue.startFrame);
    assert.equal(subtitle.endFrame, cue.endFrame);
    assert.doesNotMatch(subtitle.text, /[。.\r\n]/u);
    assert.doesNotMatch(subtitle.text, /ACT\.|【|】/u);
    if (index > 0) assert.ok(subtitle.startFrame >= manifest.subtitles[index - 1].endFrame);
  });

  const srt = fs.readFileSync(path.join(pvRoot, "captions.srt"), "utf8").trim();
  const blocks = srt.split(/\r?\n\r?\n/);
  assert.equal(blocks.length, 39);
  blocks.forEach((block, index) => {
    const lines = block.split(/\r?\n/);
    assert.equal(lines.length, 3);
    assert.equal(lines[2], manifest.subtitles[index].text);
  });

  const ass = fs.readFileSync(path.join(pvRoot, "captions.ass"), "utf8");
  assert.match(ass, /Style: Caption,Topo Sans PV,44,/);
  assert.equal(ass.split(/\r?\n/).filter((line) => line.startsWith("Dialogue:")).length, 39);
  assert.match(srt, /--> 00:00:20,416/u, "Logo boundary must be floored to the prior subtitle unit");
  assert.match(ass, /,0:00:20\.41,Caption,/u, "ASS must not round into the first Logo frame");
  assert.match(srt, /--> 00:01:13,416/u, "Chapter-card boundary must not inherit narration");
  assert.match(ass, /,0:01:13\.41,Caption,/u, "ASS must not round into the ACT.II card");
});

test("libass resolves the bundled subtitle font without a system-font fallback", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-teaser-font-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.copyFileSync(
    path.join(pvRoot, "assets", "fonts", "topo-sans-pv-600.ttf"),
    path.join(temporaryRoot, "topo-sans-pv-600.ttf")
  );
  const filterPath = (filePath) => path.resolve(filePath)
    .replaceAll("\\", "/")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
  const subtitleFilter = [
    "setpts=PTS+6/TB",
    `subtitles=filename='${filterPath(path.join(pvRoot, "captions.ass"))}':fontsdir='${filterPath(temporaryRoot)}'`
  ].join(",");
  const result = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", [
    "-hide_banner", "-loglevel", "verbose",
    "-f", "lavfi", "-i", "color=c=black:s=320x180:r=60:d=0.05",
    "-vf", subtitleFilter,
    "-frames:v", "1", "-f", "null", "-"
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const log = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.equal(result.status, 0, log);
  assert.match(log, /fontselect: \(Topo Sans PV, 400, 0\) -> TopoSansPV-SemiBold/u);
  assert.doesNotMatch(log, /fontselect: \(Topo Sans PV[^\n]*-> (?:Arial|MicrosoftYaHei)/u);
});

test("curated score keeps source tempo and chapter-specific musical identities", () => {
  assert.equal(musicPlan.fps, 60);
  assert.equal(musicPlan.sampleRate, 48000);
  assert.equal(musicPlan.sources.length, 10);
  assert.equal(musicPlan.clips.length, 10);
  assert.equal(musicPlan.editing.normalizationTargetLufs, -25.5);
  for (const clip of musicPlan.clips) {
    assert.ok(Number.isInteger(clip.targetStartFrame));
    assert.ok(Number.isInteger(clip.targetEndFrame));
    assert.ok(clip.targetStartFrame >= 0 && clip.targetEndFrame <= timing.totalFrames);
    assert.ok(clip.targetEndFrame > clip.targetStartFrame);
    assert.equal("playbackRate" in clip, false);
  }
  const recta = musicPlan.clips.find((clip) => clip.id === "projective-recta");
  const inversa = musicPlan.clips.find((clip) => clip.id === "projective-inversa");
  assert.ok(recta.targetEndFrame > inversa.targetStartFrame, "mirror fugues must briefly coexist");
  assert.equal(musicPlan.clips.at(-1).sourceInSeconds, 118.593333);
  assert.equal(manifest.music.reference.sha256, "2856c83944d69c2779ab259e98f05a46c264221486777cd2cc158bd795d7c92f");
});

test("topology sound design is deterministic and follows card, stone, morph and logo events", async (t) => {
  const { buildSfxEvents } = await loadModule("scripts/build-audio.mjs");
  const { readWav } = await loadModule("src/audio-wav.mjs");
  const { renderScoreStem } = await loadModule("src/audio-synth.mjs");
  const firstPlan = buildSfxEvents(manifest);
  const secondPlan = buildSfxEvents(manifest);
  assert.deepEqual(firstPlan, secondPlan);
  assert.equal(firstPlan.filter((event) => event.role === "chapter-card").length, 7);
  assert.equal(firstPlan.filter((event) => event.role === "five-in-a-row").length, 35);
  assert.equal(firstPlan.filter((event) => event.role === "2d-to-3d").length, 6);
  assert.equal(firstPlan.filter((event) => event.role === "institution-logo").length, 1);
  assert.equal(firstPlan.filter((event) => event.role === "decisive-move").length, 1);

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-teaser-audio-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const firstPath = path.join(temporaryRoot, "first.wav");
  const secondPath = path.join(temporaryRoot, "second.wav");
  const sampleEvents = firstPlan.slice(0, 5).map((event) => ({ ...event, startFrame: event.startFrame % 120 }));
  for (const outputPath of [firstPath, secondPath]) {
    renderScoreStem({ stem: "fx", events: sampleEvents, totalFrames: 300, sampleRate: 48000, outputPath });
  }
  const digest = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  assert.equal(digest(firstPath), digest(secondPath));
  const wav = readWav(firstPath);
  assert.equal(wav.sampleRate, 48000);
  assert.equal(wav.channels, 2);
  assert.equal(wav.bitsPerSample, 16);
  assert.equal(wav.frameCount, 300 * 800);
});

test("delivery contract exposes clean picture, subtitles, music, narration and optional stems", () => {
  assert.equal(manifest.audio.originalVoice.startsWith(".tmp/chapter-teaser/"), true);
  assert.equal(manifest.audio.voiceStem.startsWith(".tmp/chapter-teaser/"), true);
  assert.equal(manifest.audio.musicStem.startsWith(".tmp/chapter-teaser/"), true);
  assert.equal(manifest.audio.sfxStem.startsWith(".tmp/chapter-teaser/"), true);
  assert.equal(manifest.audio.scoreMix.startsWith(".tmp/chapter-teaser/"), true);
  assert.equal(manifest.audio.masterMix.startsWith(".tmp/chapter-teaser/"), true);
  const packager = fs.readFileSync(path.join(pvRoot, "scripts", "package-deliverables.mjs"), "utf8");
  for (const token of ["finalVideo", "cleanVideo", "captionsSrt", "subtitleFont", "music", "narrationOriginal", "narrationPcm", "masterAudio"]) {
    assert.match(packager, new RegExp(token));
  }
  assert.match(packager, /subtitles=filename=/);
  assert.match(packager, /Clean review frame count mismatch/);
  assert.match(packager, /no longer matches manifest/);
});

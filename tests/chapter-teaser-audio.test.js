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
const Engine = require(path.join(repositoryRoot, "app", "assets", "topology.js"));
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

test("end-card tail enforcement produces strict PCM zero after resampling and SFX delay", async (t) => {
  const { enforceDigitalSilenceTail, inspectDigitalSilenceTail, renderVoiceStem } = await loadModule("scripts/build-audio.mjs");
  const { renderScoreStem } = await loadModule("src/audio-synth.mjs");
  const { readWav, writePcm16Stereo } = await loadModule("src/audio-wav.mjs");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-teaser-tail-silence-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

  const sourcePath = path.join(temporaryRoot, "source-44100.wav");
  const sourceResult = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2",
    "-ac", "2", "-c:a", "pcm_s16le", sourcePath
  ], { encoding: "utf8", windowsHide: true });
  assert.equal(sourceResult.status, 0, sourceResult.stderr);
  const voicePath = path.join(temporaryRoot, "voice.wav");
  renderVoiceStem({
    ffmpeg: "ffmpeg",
    sourcePath,
    outputPath: voicePath,
    totalSampleFrames: 96000,
    sampleRate: 48000,
    silentFromSampleFrame: 48000
  });
  const voiceAudit = inspectDigitalSilenceTail(voicePath, 48000);
  assert.deepEqual(
    { nonZeroSamples: voiceAudit.nonZeroSamples, maxAbsPcm16: voiceAudit.maxAbsPcm16, digitalSilence: voiceAudit.digitalSilence },
    { nonZeroSamples: 0, maxAbsPcm16: 0, digitalSilence: true }
  );
  assert.ok(readWav(voicePath).samples.some((sample, index) => index < 48000 * 2 && sample !== 0));

  const sfxPath = path.join(temporaryRoot, "sfx.wav");
  renderScoreStem({
    stem: "fx",
    events: [{ id: "room", startFrame: 0, durationFrames: 90, velocity: 0.1, pan: 0, kind: "paper-air", midi: 50 }],
    totalFrames: 90,
    sampleRate: 48000,
    outputPath: sfxPath,
    silentFromFrame: 60
  });
  assert.equal(inspectDigitalSilenceTail(sfxPath, 60 * 800).digitalSilence, true);

  const forcedPath = path.join(temporaryRoot, "forced.wav");
  const forcedSamples = new Float32Array(64 * 2).fill(0.25);
  writePcm16Stereo(forcedPath, forcedSamples, 48000);
  assert.ok(inspectDigitalSilenceTail(forcedPath, 40).nonZeroSamples > 0);
  const forcedAudit = enforceDigitalSilenceTail(forcedPath, 40);
  assert.equal(forcedAudit.nonZeroSamples, 0);
  assert.equal(forcedAudit.maxAbsPcm16, 0);
  assert.equal(forcedAudit.digitalSilence, true);
  const forcedWav = readWav(forcedPath);
  assert.ok(forcedWav.samples.slice(0, 40 * 2).every((sample) => sample !== 0));
  assert.ok(forcedWav.samples.slice(40 * 2).every((sample) => sample === 0));
});

test("the end card carries only sixty frames of faded cadence before digital silence", () => {
  const endCard = manifest.segments.find((segment) => segment.kind === "end-card");
  const finale = manifest.music.clips.at(-1);
  const silence = manifest.audio.metrics.tailDigitalSilence;
  assert.equal(endCard.startFrame, 12474);
  assert.equal(finale.targetEndFrame, endCard.startFrame + 60);
  assert.equal(finale.fadeOutFrames, 42);
  assert.equal(silence.musicStem.startFrame, 12534);
  assert.equal(silence.scoreMix.startFrame, 12534);
  assert.equal(silence.masterMix.startFrame, 12534);
  assert.equal(silence.sfxStem.startFrame, 12474);
  assert.equal(silence.voiceStem.startFrame, 12474);
  for (const audit of Object.values(silence)) {
    assert.equal(audit.digitalSilence, true);
    assert.equal(audit.nonZeroSamples, 0);
    assert.equal(audit.maxAbsPcm16, 0);
  }
});

test("platform packaging preserves approved video bitstreams and replaces only the final audio", () => {
  const source = fs.readFileSync(path.join(pvRoot, "scripts", "package-platform-deliveries.mjs"), "utf8");
  assert.match(source, /id: "bilibili"[\s\S]*width: 3840,[\s\S]*height: 2160/);
  assert.match(source, /id: "douyin"[\s\S]*width: 1080,[\s\S]*height: 1920/);
  assert.match(source, /id: "xiaohongshu"[\s\S]*width: 1080,[\s\S]*height: 1440/);
  assert.match(source, /"-c:v", "copy"/);
  assert.match(source, /videoBitstreamPreserved: true/);
  assert.match(source, /fullDecodePassed: true/);
  assert.match(source, /large4kMasterGenerated: false/);
  assert.doesNotMatch(source, /"-c:v", "prores|seven-realms-master\.mov/iu);
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
  assert.match(ass, /Style: Caption,Topo Sans PV,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0\.8,0,1,4\.2,0,2,120,120,86,1/);
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

test("elegant classical-HOYO score preserves source tempo, measured title actions and exact placement", () => {
  assert.equal(musicPlan.fps, 60);
  assert.equal(musicPlan.sampleRate, 48000);
  assert.equal(musicPlan.sources.length, 11);
  assert.equal(musicPlan.clips.length, 11);
  assert.equal(new Set(musicPlan.clips.map((clip) => clip.sourceId)).size, 11);
  assert.equal(musicPlan.editing.normalizationTargetLufs, -20);
  assert.equal(musicPlan.editing.postMixGain, 0.62);
  for (const clip of musicPlan.clips) {
    assert.ok(Number.isInteger(clip.targetStartFrame));
    assert.ok(Number.isInteger(clip.targetEndFrame));
    assert.ok(clip.targetStartFrame >= 0 && clip.targetEndFrame <= timing.totalFrames);
    assert.ok(clip.targetEndFrame > clip.targetStartFrame);
    assert.equal("playbackRate" in clip, false);
  }
  for (let index = 1; index < musicPlan.clips.length; index += 1) {
    const overlap = musicPlan.clips[index - 1].targetEndFrame - musicPlan.clips[index].targetStartFrame;
    assert.equal(overlap, musicPlan.editing.defaultCrossfadeFrames);
  }
  const revealClips = musicPlan.clips.filter((clip) => clip.reveal);
  assert.equal(revealClips.length, 7);
  for (const clip of revealClips) {
    const alignedSourceSeconds = clip.sourceInSeconds + (clip.reveal.impactFrame - clip.targetStartFrame) / musicPlan.fps;
    assert.ok(Math.abs(alignedSourceSeconds - clip.reveal.nativeImpactSourceSeconds) < 0.00001, clip.id);
  }
  const finale = musicPlan.clips.at(-1);
  assert.ok(Math.abs(finale.sourceOutSeconds - finale.sourceInSeconds - 10.85) < 1e-9);
  assert.equal((finale.targetEndFrame - finale.targetStartFrame) / musicPlan.fps, 10.85);
  assert.equal(finale.targetEndFrame, 12534);
  assert.equal(finale.sourceInSeconds, 146.762125);
  assert.equal(finale.sourceOutSeconds, 157.612125);
  assert.equal(finale.fadeOutFrames, 42);
  assert.equal(finale.waveformAudit.tailExtensionSeconds, 1);
  assert.equal(finale.waveformAudit.quietSoloSuppressedByFade, true);
  assert.equal(finale.waveformAudit.excludesSustainedQuietSolo, true);
  assert.equal(manifest.music.reference.sha256, "2856c83944d69c2779ab259e98f05a46c264221486777cd2cc158bd795d7c92f");
  assert.match(manifest.music.reference.role, /structural.*reference only/i);
  assert.equal(manifest.music.sources.length, 11);
  const coverage = manifest.audio.metrics.musicAlignment.coverage;
  assert.equal(coverage.length, musicPlan.clips.length);
  coverage.forEach((window, index) => {
    assert.equal(window.id, musicPlan.clips[index].id);
    assert.ok(window.rmsDb > -60, `${window.id} must remain audible at its chapter midpoint`);
  });
  assert.match(manifest.audio.metrics.musicAlignment.sourceNormalization, /once per unique source.*before clip trims/i);
  assert.match(manifest.audio.metrics.musicAlignment.chapterRevealAutomation, /before each measured title impact/);
  assert.ok(manifest.audio.metrics.musicAlignment.energy.rmsDbfs > -35);
  assert.ok(manifest.audio.metrics.musicAlignment.energy.rmsDbfs < -15);
  assert.ok(manifest.audio.metrics.musicAlignment.energy.peakDbfs < -2.5);
});

test("layered topology sound design is deterministic and locked to the compositor's real visual anchors", async (t) => {
  const { buildSfxEvents } = await loadModule("scripts/build-audio.mjs");
  const { readWav } = await loadModule("src/audio-wav.mjs");
  const { renderScoreStem } = await loadModule("src/audio-synth.mjs");
  const firstPlan = buildSfxEvents(manifest, story);
  const secondPlan = buildSfxEvents(manifest, story);
  const endCard = manifest.segments.find((segment) => segment.kind === "end-card");
  assert.ok(endCard);
  assert.equal(firstPlan.length, 172);
  assert.equal(firstPlan.some((event) => event.id === "end-card-arrival"), false);
  assert.equal(firstPlan.some((event) => event.id === "end-card-logo-bloom"), false);
  assert.ok(firstPlan.every((event) => event.startFrame + event.durationFrames <= endCard.startFrame));
  assert.deepEqual(firstPlan, secondPlan);
  assert.equal(firstPlan.filter((event) => event.role === "paper-environment").length, 1);
  assert.equal(firstPlan.filter((event) => event.role === "chapter-transition").length, 28);
  assert.equal(firstPlan.filter((event) => event.role === "five-in-a-row").length, 105);
  assert.equal(firstPlan.filter((event) => event.role === "2d-to-3d").length, 12);
  assert.equal(firstPlan.filter((event) => event.role === "institution-logo").length, 1);
  assert.equal(firstPlan.filter((event) => event.role === "decisive-move").length, 3);
  assert.equal(firstPlan.filter((event) => event.kind === "glyph-pulse").length, 7);

  const transitionStages = ["reverse-breath", "low-hit", "fine-shimmer", "space-tail"];
  for (const chapter of story.chapters) {
    const card = manifest.segments.find((segment) => segment.kind === "chapter-card" && segment.chapterId === chapter.id);
    const stageEvents = firstPlan.filter((event) => event.role === "chapter-transition" && event.chapterId === chapter.id);
    assert.deepEqual(stageEvents.map((event) => event.stage).sort(), [...transitionStages].sort(), `${chapter.id}: four-stage chapter reveal`);
    assert.equal(stageEvents.find((event) => event.stage === "reverse-breath").startFrame, card.startFrame - 46);
    assert.equal(stageEvents.find((event) => event.stage === "low-hit").startFrame, card.startFrame + 12);
    assert.equal(stageEvents.find((event) => event.stage === "fine-shimmer").startFrame, card.transformFrame);
  }

  const inverseSmootherstep = (target) => {
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 48; iteration += 1) {
      const midpoint = (low + high) / 2;
      const value = midpoint ** 3 * (midpoint * (midpoint * 6 - 15) + 10);
      if (value < target) low = midpoint;
      else high = midpoint;
    }
    return (low + high) / 2;
  };
  let expectedSeamEvents = 0;
  const topologySignatures = new Set();
  for (const chapter of story.chapters) {
    const segment = manifest.segments.find((candidate) => candidate.kind === "chapter" && candidate.chapterId === chapter.id);
    const rules = Engine.createRules({ type: chapter.id, width: chapter.width, height: chapter.height, target: 5 });
    const trace = Engine.tracePath(rules, Engine.toCell(rules, chapter.start[0], chapter.start[1]), chapter.direction, 5);
    const clicks = firstPlan
      .filter((event) => event.role === "five-in-a-row" && event.chapterId === chapter.id && event.layer === "transient")
      .sort((left, right) => left.stoneIndex - right.stoneIndex);
    assert.equal(clicks.length, 5, `${chapter.id}: five visible stone contacts`);
    clicks.forEach((click, stoneIndex) => {
      const targetReveal = Math.min(1, (stoneIndex + 0.9) / 5.25);
      const progress = 0.08 + 0.30 * inverseSmootherstep(targetReveal);
      assert.equal(click.startFrame, segment.startFrame + Math.round(segment.durationFrames * progress));
      assert.equal(click.visualAnchor, "drawChapterScene:reveal-smootherstep(0.08,0.38)");
      const board = firstPlan.find((event) => event.id === `${chapter.id}-stone-${stoneIndex + 1}-board`);
      const tail = firstPlan.find((event) => event.id === `${chapter.id}-stone-${stoneIndex + 1}-tail`);
      assert.equal(board.startFrame, click.startFrame + 1);
      assert.equal(tail.startFrame, click.startFrame + 4);
      assert.deepEqual(click.cell, (() => {
        const point = Engine.toPoint(rules, trace.cells[stoneIndex]);
        return [point.x, point.y];
      })());
    });
    topologySignatures.add(`${clicks[0].clickHz}/${clicks[0].boardHz}/${clicks[0].toneHz}`);

    trace.seams.forEach((seamMask, edgeIndex) => {
      if (!seamMask) return;
      expectedSeamEvents += 1;
      const seamEvent = firstPlan.find((event) => event.id === `${chapter.id}-seam-${edgeIndex + 1}`);
      const targetReveal = Math.min(1, (edgeIndex + 0.48) / 4.35);
      const progress = 0.08 + 0.30 * inverseSmootherstep(targetReveal);
      assert.equal(seamEvent.startFrame, segment.startFrame + Math.round(segment.durationFrames * progress));
      assert.equal(seamEvent.seamMask, seamMask);
      assert.equal(seamEvent.visualAnchor, "drawPath:edgeReveal>0.48");
    });

    const morphEvents = firstPlan.filter((event) => event.role === "2d-to-3d" && event.chapterId === chapter.id);
    if (chapter.id === "plane") {
      assert.equal(morphEvents.length, 0);
    } else {
      const motion = morphEvents.find((event) => event.layer === "motion");
      const arrival = morphEvents.find((event) => event.layer === "arrival");
      const expectedStart = segment.startFrame + Math.round(segment.durationFrames * 0.46);
      const expectedEnd = segment.startFrame + Math.round(segment.durationFrames * 0.84);
      assert.equal(motion.startFrame, expectedStart);
      assert.equal(motion.durationFrames, expectedEnd - expectedStart);
      assert.equal(arrival.startFrame, expectedEnd);
      assert.equal(motion.warpStyle, arrival.warpStyle);
    }
  }
  assert.equal(firstPlan.filter((event) => event.role === "topology-seam").length, expectedSeamEvents);
  assert.equal(topologySignatures.size, 7, "all seven worlds need distinct stone/board/room spectra");
  assert.ok(firstPlan.every((event) => event.velocity <= 0.56), "SFX gestures remain below the restrained velocity ceiling");
  assert.ok(firstPlan.every((event) => event.startFrame >= 0 && event.startFrame + event.durationFrames <= manifest.totalFrames));

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-teaser-audio-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const firstPath = path.join(temporaryRoot, "first.wav");
  const secondPath = path.join(temporaryRoot, "second.wav");
  const sampleEvents = [...new Map(firstPlan.map((event) => [event.kind, event])).values()]
    .map((event, index) => ({
      ...event,
      startFrame: index * 26,
      durationFrames: Math.min(event.durationFrames, 150)
    }));
  let renderMetrics;
  for (const outputPath of [firstPath, secondPath]) {
    renderMetrics = renderScoreStem({ stem: "fx", events: sampleEvents, totalFrames: 720, sampleRate: 48000, outputPath });
  }
  const digest = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  assert.equal(digest(firstPath), digest(secondPath));
  assert.equal(renderMetrics.eventCount, sampleEvents.length);
  assert.equal(Object.keys(renderMetrics.eventCountsByKind).length, sampleEvents.length);
  assert.ok(renderMetrics.peak <= 0.25 && renderMetrics.peak >= 0.249);
  assert.ok(renderMetrics.targetPeakDbfs < -12 && renderMetrics.targetPeakDbfs > -12.1);
  const wav = readWav(firstPath);
  assert.equal(wav.sampleRate, 48000);
  assert.equal(wav.channels, 2);
  assert.equal(wav.bitsPerSample, 16);
  assert.equal(wav.frameCount, 720 * 800);
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

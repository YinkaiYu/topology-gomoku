"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "footsteps-return");
const AUDIO_ROOT = path.join(PV_ROOT, "audio", "voiceover");
const FRAME_SECONDS = 1 / 60;

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(AUDIO_ROOT, file), "utf8"));
}

async function load(relativePath) {
  return import(new URL(`../${relativePath}`, `file://${__filename}`).href);
}

test("voiceover script keeps the approved narration verbatim with cue-level final VoiceDesign replacement IDs", async () => {
  const [{ narrationCues }, { masterTimeline }] = await Promise.all([
    load("video/footsteps-return/src/data/narration.js"),
    load("video/footsteps-return/src/data/timeline.js")
  ]);
  const script = readJson("script.json");
  const timing = readJson("timing.json");
  const review = readJson("review.json");

  assert.equal(script.purpose, "final-release-narration");
  assert.equal(script.voice.engine, "Qwen3-TTS VoiceDesign");
  assert.equal(script.voice.selectedAuditionId, "F");
  assert.equal(script.voice.selectedVoiceId, "cold-witness");
  assert.equal(Object.hasOwn(script.voice, "fallback"), false);
  assert.equal(timing.voice.modelId, "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign");
  assert.equal(timing.voice.generationMethod, "generate_voice_design");
  assert.equal(Object.hasOwn(timing.voice, "fallback"), false);
  assert.ok(timing.masterDurationSeconds >= 183.352 && timing.masterDurationSeconds <= 240,
    "natural final narration may expand the rejected-rhythm picture lock but must remain a bounded PV timeline");
  assert.equal(review.nativeListening.status, "user-review-required");
  assert.equal(review.trackDisposition, "final-voiceover-generated; user review required before final mix");
  assert.match(review.auditionMethod, /peak\/RMS, active-sample ratio, leading\/trailing silence, duration, file hash/i);
  assert.deepEqual(script.cues.map(({ id, text }) => ({ id, text })), narrationCues.map(({ id, spokenText }) => ({ id, text: spokenText })));
  assert.deepEqual(timing.cues.map(({ id }) => id), narrationCues.map(({ id }) => id));
  timing.cues.forEach((cue) => {
    assert.match(cue.outputFile, new RegExp(`${cue.id}\\.wav$`));
    assert.ok(cue.durationSeconds > 0, `${cue.id} needs a measured WAV duration`);
    assert.match(cue.sha256, /^[a-f0-9]{64}$/);
    assert.equal(cue.sampleRateHz, 48000);
    assert.equal(cue.channels, 1);
    assert.equal(cue.replacementId, cue.id);
    assert.ok(cue.peakDbfs <= -6.9 && cue.peakDbfs >= -10, `${cue.id} final WAV must retain conservative headroom`);
    assert.ok(Math.abs(cue.rmsDbfs - (-22)) <= 0.15, `${cue.id} final WAV must use the matched dry-voice level`);
    assert.ok(cue.rmsDbfs < cue.peakDbfs && cue.activeRatio > 0.25, `${cue.id} needs a non-flat speech waveform`);
  });

  const chapterCards = masterTimeline.scenes.filter(({ kind }) => kind === "chapter-card");
  chapterCards.forEach((card) => {
    assert.deepEqual(card.narrationCueIds, []);
    const end = card.start + card.duration;
    assert.equal(masterTimeline.narration.some((cue) => cue.start < end && cue.start + cue.duration > card.start), false, `${card.id} must remain silent`);
  });
});

test("captions split long narration into exactly 46 punctuation-free single-line entries", async () => {
  const [{ narrationCues }, { captionCues, captionStyle, voiceoverSchedule }] = await Promise.all([
    load("video/footsteps-return/src/data/narration.js"),
    load("video/footsteps-return/src/data/captions.js")
  ]);

  assert.equal(captionStyle.fontFamily, "Topo Serif");
  assert.equal(captionStyle.fontSize, 88);
  assert.equal(captionStyle.minFontSize, 84);
  assert.equal(captionStyle.maxFontSize, 96);
  assert.equal(captionStyle.fadeFrames, 7);
  assert.equal(captionStyle.safeWidth, 3456);
  assert.equal(captionStyle.safeBottom, 144);
  assert.equal(captionStyle.baselineBottom, 180);
  assert.equal(captionStyle.color, "#ffffff");
  assert.equal(captionStyle.strokeColor, "#000000");
  assert.equal(captionStyle.background, "none");
  assert.equal(captionStyle.shadow, "none");
  assert.equal(captionStyle.glow, "none");
  assert.equal(captionStyle.wordAnimation, false);

  assert.equal(captionCues.length, 46);
  narrationCues.forEach((narration) => {
    const clauses = captionCues.filter(({ narrationCueId }) => narrationCueId === narration.id);
    assert.ok(clauses.length > 0, `${narration.id} needs captions`);
    assert.equal(clauses.map(({ spokenText }) => spokenText).join(""), narration.spokenText, `${narration.id} clauses must reconstruct the approved narration`);
    if (narration.spokenText.length >= 30) {
      assert.ok(clauses.length > 1, `${narration.id} must split instead of shrinking or wrapping`);
    }
    clauses.forEach((caption) => {
      assert.doesNotMatch(caption.text, /\p{P}/u, `${caption.id} must omit every visible punctuation mark`);
      assert.equal(caption.text, caption.spokenText.replace(/\p{P}/gu, ""),
        `${caption.id} may preserve punctuation only in spoken narration`);
      assert.equal(caption.fadeInFrames, 7);
      assert.equal(caption.fadeOutFrames, 7);
      assert.equal(caption.hardClearAt, caption.end);
      assert.ok(caption.end - caption.start > 14 * FRAME_SECONDS, `${caption.id} needs room for whole-line fades`);
    });
  });

  assert.ok(captionCues.some(({ spokenText }) => /[，。：？]/u.test(spokenText)),
    "spoken narration must retain punctuation for synthesis and prosody");
  assert.deepEqual(voiceoverSchedule.map(({ cueId }) => cueId), narrationCues.map(({ id }) => id));
});

test("caption builder rejects any visible Unicode punctuation before emitting runtime data", async () => {
  const { buildCaptionArtifacts } = await load("video/footsteps-return/scripts/build-captions.mjs");
  const script = readJson("script.json");
  const timing = readJson("timing.json");
  script.cues[0].captions[0].visibleText += "，";
  assert.throws(() => buildCaptionArtifacts({ script, timing, write: false }), /visible captions cannot contain punctuation/i);
});

test("PV font and stylesheet URLs carry the dedicated subset cache key", () => {
  const html = fs.readFileSync(path.join(PV_ROOT, "index.html"), "utf8");
  const style = fs.readFileSync(path.join(PV_ROOT, "src", "styles.css"), "utf8");
  assert.match(html, /src\/styles\.css\?fontset=pv-task8-r1/);
  ["400", "600", "700"].forEach((weight) => {
    assert.match(style, new RegExp(`noto-serif-sc-${weight}\\.woff2\\?fontset=pv-task8-r1`));
  });
});

test("caption and narration schedules never overlap and stay inside their owning non-card scenes", async () => {
  const [{ captionCues }, { masterTimeline }] = await Promise.all([
    load("video/footsteps-return/src/data/captions.js"),
    load("video/footsteps-return/src/data/timeline.js")
  ]);

  const ordered = [...captionCues].sort((a, b) => a.start - b.start || a.end - b.end);
  ordered.forEach((cue, index) => {
    if (index > 0) {
      assert.ok(cue.start >= ordered[index - 1].end + FRAME_SECONDS - 1e-6, `${ordered[index - 1].id} must hard-clear before ${cue.id}`);
    }
    const narration = masterTimeline.narration.find(({ cueId }) => cue.narrationCueId === cueId);
    assert.ok(narration, `${cue.id} needs an owning narration cue`);
    assert.ok(cue.start >= narration.start - 1e-6);
    assert.ok(cue.end <= narration.start + narration.duration + 1e-6);
    const scene = masterTimeline.scenes.find(({ narrationCueIds }) => narrationCueIds.includes(cue.narrationCueId));
    assert.ok(scene && scene.kind !== "chapter-card", `${cue.id} needs a non-card scene`);
    assert.ok(cue.start >= scene.start && cue.end <= scene.start + scene.duration + 1e-6);
  });

  [...masterTimeline.narration].sort((a, b) => a.start - b.start).forEach((cue, index, cues) => {
    if (index > 0) assert.ok(cue.start >= cues[index - 1].start + cues[index - 1].duration);
  });
});

let browser;
let page;
let server;

test.before(async () => {
  const { startStaticServer } = await load("video/footsteps-return/scripts/serve-app.mjs");
  server = await startStaticServer({ root: PV_ROOT });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.__renderReady);
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

test("real Chromium keeps every Topo Serif caption on one 4K line with the approved plain style", async () => {
  const { captionCues } = await load("video/footsteps-return/src/data/captions.js");
  const samples = await page.evaluate(async (cues) => {
    const timeline = window.__timelines["footsteps-return"];
    const group = document.querySelector("[data-caption-group]");
    const output = [];
    for (const cue of cues) {
      timeline.time(cue.start + (cue.fadeInFrames + 1) / 60, false).pause();
      const text = document.querySelector(`[data-caption-cue="${cue.id}"]`);
      const copy = text.querySelector("[data-caption-copy]");
      const marker = text.querySelector("[data-caption-baseline-marker]");
      const range = document.createRange();
      range.selectNodeContents(copy ?? text);
      const style = getComputedStyle(text);
      const root = document.querySelector('[data-composition-id="footsteps-return"]');
      const rootStyle = getComputedStyle(root);
      const rootRect = root.getBoundingClientRect();
      const copyRect = (copy ?? text).getBoundingClientRect();
      const markerRect = marker?.getBoundingClientRect();
      output.push({
        id: cue.id,
        expectedText: cue.text,
        actualText: text.textContent,
        fontLoaded: document.fonts.check(`${style.fontWeight} ${style.fontSize} "Topo Serif"`),
        fontFamily: style.fontFamily.replaceAll('"', ""),
        fontSize: Number.parseFloat(style.fontSize),
        whiteSpace: style.whiteSpace,
        lineRects: range.getClientRects().length,
        textWidth: range.getBoundingClientRect().width,
        safeWidth: group.getBoundingClientRect().width,
        color: style.color,
        strokeWidth: style.webkitTextStrokeWidth,
        strokeColor: style.webkitTextStrokeColor,
        backgroundColor: style.backgroundColor,
        textShadow: style.textShadow,
        boxShadow: style.boxShadow,
        filter: style.filter,
        groupOpacity: Number(style.opacity),
        baselineReady: group.dataset.captionBaselineReady,
        baselineBottom: markerRect ? rootRect.bottom - markerRect.top : null,
        markerHeight: markerRect?.height ?? null,
        glyphTop: copyRect.top - rootRect.top,
        glyphBottom: rootRect.bottom - copyRect.bottom,
        safeTop: Number.parseFloat(rootStyle.getPropertyValue("--safe-top")),
        safeBottom: Number.parseFloat(rootStyle.getPropertyValue("--safe-bottom")),
        captionBaselineBottom: Number.parseFloat(rootStyle.getPropertyValue("--caption-baseline-bottom"))
      });
    }
    return output;
  }, captionCues);

  samples.forEach((sample) => {
    assert.equal(sample.actualText, sample.expectedText, `${sample.id} visible copy`);
    assert.equal(sample.fontLoaded, true, `${sample.id} must use the loaded font`);
    assert.equal(sample.fontFamily, "Topo Serif");
    assert.ok(sample.fontSize >= 84 && sample.fontSize <= 96);
    assert.equal(sample.whiteSpace, "nowrap");
    assert.equal(sample.lineRects, 1, `${sample.id} must occupy one rendered line`);
    assert.ok(sample.textWidth <= sample.safeWidth + 0.5, `${sample.id} width ${sample.textWidth} exceeds ${sample.safeWidth}`);
    assert.equal(sample.color, "rgb(255, 255, 255)");
    assert.equal(sample.strokeWidth, "4px");
    assert.equal(sample.strokeColor, "rgb(0, 0, 0)");
    assert.equal(sample.backgroundColor, "rgba(0, 0, 0, 0)");
    assert.equal(sample.textShadow, "none");
    assert.equal(sample.boxShadow, "none");
    assert.equal(sample.filter, "none");
    assert.ok(sample.groupOpacity > 0.99, `${sample.id} must finish its whole-line fade`);
    assert.equal(sample.baselineReady, "true");
    assert.ok(Math.abs(sample.baselineBottom - 180) <= 1, `${sample.id} baseline bottom ${sample.baselineBottom}`);
    assert.ok(sample.markerHeight <= 0.01, `${sample.id} baseline marker must be zero-height`);
    assert.ok(sample.glyphTop >= sample.safeTop - 0.5, `${sample.id} glyph top leaves the safe area`);
    assert.ok(sample.glyphBottom >= sample.safeBottom - 0.5, `${sample.id} glyph bottom ${sample.glyphBottom} leaves the safe area`);
    assert.equal(sample.safeBottom, 144);
    assert.equal(sample.captionBaselineBottom, 180);
  });
  assert.ok(Math.max(...samples.map(({ baselineBottom }) => baselineBottom)) - Math.min(...samples.map(({ baselineBottom }) => baselineBottom)) <= 0.01);
});

test("caption hard clears, chapter cards stay empty, and arbitrary seeks are reversible", async () => {
  const [{ captionCues }, { masterTimeline }] = await Promise.all([
    load("video/footsteps-return/src/data/captions.js"),
    load("video/footsteps-return/src/data/timeline.js")
  ]);
  const probes = [captionCues[0], captionCues[Math.floor(captionCues.length / 2)], captionCues.at(-1)];
  const result = await page.evaluate(({ probes: selected, cards }) => {
    const timeline = window.__timelines["footsteps-return"];
    const group = document.querySelector("[data-caption-group]");
    const sample = (time) => {
      timeline.time(time, false).pause();
      const visible = [...group.querySelectorAll("[data-caption-cue]")]
        .map((node) => ({ node, opacity: Number(getComputedStyle(node).opacity) }))
        .filter(({ opacity }) => opacity > 0.001);
      return {
        text: visible.length === 1 ? visible[0].node.textContent : "",
        opacity: visible.length === 1 ? visible[0].opacity : 0,
        visibleCount: visible.length
      };
    };
    const visible = selected.map((cue) => sample(cue.start + (cue.fadeInFrames + 1) / 60));
    const cleared = selected.map((cue) => sample(cue.hardClearAt + 1 / 240));
    const cardStates = cards.map((card) => sample(card.start + card.duration / 2));
    const first = sample(selected[0].start + (selected[0].fadeInFrames + 1) / 60);
    sample(selected[1].start + (selected[1].fadeInFrames + 1) / 60);
    const replay = sample(selected[0].start + (selected[0].fadeInFrames + 1) / 60);
    return { visible, cleared, cardStates, first, replay, captionGroupCount: document.querySelectorAll("[data-caption-group]").length };
  }, { probes, cards: masterTimeline.scenes.filter(({ kind }) => kind === "chapter-card") });

  assert.deepEqual(result.visible.map(({ text }) => text), probes.map(({ text }) => text));
  result.visible.forEach(({ opacity }) => assert.ok(opacity > 0.99));
  result.visible.forEach(({ visibleCount }) => assert.equal(visibleCount, 1));
  result.cleared.forEach((state) => assert.deepEqual(state, { text: "", opacity: 0, visibleCount: 0 }));
  result.cardStates.forEach((state) => assert.deepEqual(state, { text: "", opacity: 0, visibleCount: 0 }));
  assert.deepEqual(result.replay, result.first);
  assert.equal(result.captionGroupCount, 1);
});

test("caption review evidence is native 4K and the local caption-only render is reproducible", async () => {
  const [{ captionReviewPlan }, { captionCues }] = await Promise.all([
    load("video/footsteps-return/scripts/capture-caption-evidence.mjs"),
    load("video/footsteps-return/src/data/captions.js")
  ]);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", "pv-caption-scenes-task8-manifest.json"), "utf8"));
  assert.deepEqual(captionReviewPlan.map(({ id }) => id), [
    "intro-boundary-01",
    "plane-order-02",
    "cylinder-distance-01",
    "klein-two-returns-03",
    "sphere-boundary-01",
    "outro-world-01"
  ]);
  assert.deepEqual(manifest.viewport, { width: 3840, height: 2160, deviceScaleFactor: 1 });
  assert.equal(manifest.native4k, true);
  assert.deepEqual(manifest.cueMeasurements.map(({ id }) => id), captionCues.map(({ id }) => id));
  manifest.cueMeasurements.forEach((measurement) => {
    assert.equal(measurement.lineCount, 1);
    assert.ok(measurement.width <= measurement.safeWidth + 0.5);
    assert.ok(Math.abs(measurement.baselineBottom - 180) <= 1);
    assert.ok(measurement.glyphBottom >= 143.5);
    assert.equal(measurement.baselineReady, "true");
  });
  assert.deepEqual(manifest.frames.map(({ id }) => id), captionReviewPlan.map(({ id }) => id));
  manifest.frames.forEach((frame) => {
    assert.equal(frame.lineCount, 1);
    assert.ok(frame.width <= frame.safeWidth + 0.5);
    assert.equal(frame.fontFamily, "Topo Serif");
    assert.equal(frame.visibleCount, 1);
    assert.ok(Math.abs(frame.baselineBottom - 180) <= 1);
    assert.ok(frame.glyphBottom >= 143.5);
    const png = fs.readFileSync(path.join(ROOT, frame.path));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 3840);
    assert.equal(png.readUInt32BE(20), 2160);
  });
  const contactSheet = path.join(ROOT, "artifacts", "pv-caption-scenes-task8-contact-sheet.png");
  const reviewRender = path.join(PV_ROOT, "renders", "footsteps-return-caption-review.mp4");
  assert.ok(fs.statSync(contactSheet).size > 10_000);
  assert.deepEqual(
    { width: manifest.reviewRender.width, height: manifest.reviewRender.height, fps: manifest.reviewRender.fps, durationSeconds: manifest.reviewRender.durationSeconds },
    { width: 1920, height: 1080, fps: 30, durationSeconds: 69 }
  );
  assert.match(manifest.reviewRender.sha256, /^[a-f0-9]{64}$/);
  assert.ok(manifest.reviewRender.bytes > 10_000);
  if (fs.existsSync(reviewRender)) {
    const media = fs.readFileSync(reviewRender);
    assert.equal(media.length, manifest.reviewRender.bytes);
    assert.equal(createHash("sha256").update(media).digest("hex"), manifest.reviewRender.sha256);
  }
});

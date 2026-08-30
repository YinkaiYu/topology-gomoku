import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
import { narrationCues } from "../src/data/narration.js";
import { startStaticServer } from "./serve-app.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const pvRoot = path.join(repositoryRoot, "video", "footsteps-return");
const voiceoverRoot = path.join(pvRoot, "audio", "voiceover");
const timelineBaselinePath = path.join(voiceoverRoot, "timeline-baseline.json");
const scorePlanPath = path.join(pvRoot, "audio", "score", "score-plan.json");
const captionDataPath = path.join(pvRoot, "src", "data", "captions.js");
const indexPath = path.join(pvRoot, "index.html");
const FRAME_SECONDS = 1 / 60;
const CAPTION_GAP = FRAME_SECONDS;
const INTER_CUE_PAUSE = 0.36;
const CHAPTER_TRANSITION_BREATH = 2;

export const captionStyle = Object.freeze({
  fontFamily: "Topo Serif",
  fontSize: 88,
  minFontSize: 84,
  maxFontSize: 96,
  fadeFrames: 7,
  safeWidth: 3456,
  safeBottom: 144,
  baselineBottom: 180,
  color: "#ffffff",
  strokeColor: "#000000",
  strokeWidth: 4,
  background: "none",
  shadow: "none",
  glow: "none",
  wordAnimation: false
});

const SCENE_TEMPLATES = Object.freeze([
  { id: "intro", kind: "intro", minimumDuration: 19, cueIds: ["intro-boundary", "intro-roads", "intro-invitation"], transition: { kind: "surface-reveal", target: "chapter-card-plane" } },
  { id: "chapter-card-plane", kind: "chapter-card", chapterId: "plane", duration: 3, cueIds: [], transition: { kind: "match-cut", target: "chapter-plane" } },
  { id: "chapter-plane", kind: "chapter", chapterId: "plane", minimumDuration: 10, cueIds: ["plane-order"], transition: { kind: "surface-occlusion", target: "chapter-card-cylinder" } },
  { id: "chapter-card-cylinder", kind: "chapter-card", chapterId: "cylinder", duration: 3, cueIds: [], transition: { kind: "match-cut", target: "chapter-cylinder" } },
  { id: "chapter-cylinder", kind: "chapter", chapterId: "cylinder", minimumDuration: 11, cueIds: ["cylinder-cycle", "cylinder-distance"], transition: { kind: "surface-occlusion", target: "chapter-card-torus" } },
  { id: "chapter-card-torus", kind: "chapter-card", chapterId: "torus", duration: 3, cueIds: [], transition: { kind: "match-cut", target: "chapter-torus" } },
  { id: "chapter-torus", kind: "chapter", chapterId: "torus", minimumDuration: 12, cueIds: ["torus-cycles", "torus-shortest-path"], transition: { kind: "surface-occlusion", target: "chapter-card-mobius" } },
  { id: "chapter-card-mobius", kind: "chapter-card", chapterId: "mobius", duration: 3, cueIds: [], transition: { kind: "match-cut", target: "chapter-mobius" } },
  { id: "chapter-mobius", kind: "chapter", chapterId: "mobius", minimumDuration: 11, cueIds: ["mobius-turn", "mobius-one-side"], transition: { kind: "surface-occlusion", target: "chapter-card-klein" } },
  { id: "chapter-card-klein", kind: "chapter-card", chapterId: "klein", duration: 3, cueIds: [], transition: { kind: "match-cut", target: "chapter-klein" } },
  { id: "chapter-klein", kind: "chapter", chapterId: "klein", minimumDuration: 12, cueIds: ["klein-two-returns", "klein-memory"], transition: { kind: "surface-occlusion", target: "chapter-card-projective" } },
  { id: "chapter-card-projective", kind: "chapter-card", chapterId: "projective", duration: 3, cueIds: [], transition: { kind: "match-cut", target: "chapter-projective" } },
  { id: "chapter-projective", kind: "chapter", chapterId: "projective", minimumDuration: 12, cueIds: ["projective-reflection", "projective-twin"], transition: { kind: "surface-occlusion", target: "chapter-card-sphere" } },
  { id: "chapter-card-sphere", kind: "chapter-card", chapterId: "sphere", duration: 3, cueIds: [], transition: { kind: "match-cut", target: "chapter-sphere" } },
  { id: "chapter-sphere", kind: "chapter", chapterId: "sphere", minimumDuration: 20, cueIds: ["sphere-closure", "sphere-map", "sphere-boundary"], transition: { kind: "surface-occlusion", target: "seven-world-gallery" } },
  { id: "seven-world-gallery", kind: "seven-world-gallery", duration: 9.2, cueIds: [], transition: { kind: "match-cut", target: "outro" } },
  { id: "outro", kind: "outro", minimumDuration: 14, cueIds: ["outro-invocation", "outro-connection", "outro-stone", "outro-world"], transition: { kind: "fade-to-black", target: "end-card" } },
  { id: "end-card", kind: "end-card", duration: 4, cueIds: [], transition: { kind: "hold", target: null } }
]);

function round(value) {
  return Number(value.toFixed(6));
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function validateSource(script, timing) {
  const approved = narrationCues.map(({ id, semanticGroup, spokenText }) => ({ id, semanticGroup, text: spokenText }));
  const actual = script.cues.map(({ id, semanticGroup, text }) => ({ id, semanticGroup, text }));
  if (JSON.stringify(actual) !== JSON.stringify(approved)) {
    throw new Error("voiceover script no longer matches the approved Task 2 narration");
  }
  if (script.cues.some((cue) => cue.captions.map(({ spokenText }) => spokenText).join("") !== cue.text)) {
    throw new Error("caption clauses must reconstruct each approved narration cue verbatim");
  }
  if (script.cues.some((cue) => cue.captions.some(({ visibleText }) => /[。.]/.test(visibleText)))) {
    throw new Error("visible captions cannot contain full stops");
  }
  const timings = new Map(timing.cues.map((cue) => [cue.id, cue]));
  for (const cue of script.cues) {
    const measured = timings.get(cue.id);
    if (!measured || !(measured.durationSeconds > 0)) throw new Error(`missing measured duration for ${cue.id}`);
  }
  return timings;
}

function scheduleNarration(scene, start, timings, baseline) {
  const lead = scene.id === "outro" ? 0.12 : 0.42;
  const tail = scene.id === "intro" ? 0.8 : 0.92;
  const preferredDuration = baseline.scenes[scene.id]?.duration ?? scene.minimumDuration;
  let previousEnd = -Infinity;
  const entries = scene.cueIds.map((cueId, index) => {
    const duration = timings.get(cueId).durationSeconds;
    const preferredOffset = baseline.cueOffsetsSeconds[cueId] ?? lead;
    const preferredStart = start + preferredOffset;
    const minimumStart = index === 0 ? preferredStart : previousEnd + INTER_CUE_PAUSE;
    const actualStart = Math.max(preferredStart, minimumStart);
    const entry = {
      cueId,
      start: round(actualStart),
      duration: round(duration),
      subtitleGroupId: cueId,
      preferredOffsetSeconds: preferredOffset,
      startPreserved: Math.abs(actualStart - preferredStart) < 1e-6
    };
    previousEnd = actualStart + duration;
    return entry;
  });
  const requiredDuration = round(previousEnd + tail - start);
  return { entries, duration: Math.max(preferredDuration, scene.minimumDuration, requiredDuration) };
}

export function buildFlexibleTimeline(script, timing) {
  const timings = validateSource(script, timing);
  const baseline = readJson(timelineBaselinePath);
  const scenes = [];
  const narration = [];
  let cursor = 0;

  for (const template of SCENE_TEMPLATES) {
    if (template.id === "seven-world-gallery") {
      const scene = { ...template, start: round(cursor), duration: template.duration };
      scenes.push(scene);
      cursor = scene.start + 7;
      continue;
    }
    if (template.id === "outro") {
      const scheduled = scheduleNarration(template, cursor, timings, baseline);
      narration.push(...scheduled.entries);
      scenes.push({ ...template, start: round(cursor), duration: scheduled.duration });
      cursor += scheduled.duration;
      continue;
    }
    if (template.id === "end-card") {
      scenes.push({ ...template, start: round(cursor), duration: template.duration });
      cursor += template.duration;
      continue;
    }
    if (template.kind === "chapter-card") {
      scenes.push({ ...template, start: round(cursor), duration: template.duration });
      cursor += template.duration;
      continue;
    }

    const scheduled = scheduleNarration(template, cursor, timings, baseline);
    narration.push(...scheduled.entries);
    scenes.push({ ...template, start: round(cursor), duration: scheduled.duration });
    cursor += scheduled.duration;
    if (template.kind === "chapter" && template.id !== "chapter-sphere") cursor += CHAPTER_TRANSITION_BREATH;
  }

  const normalizedScenes = scenes.map(({ minimumDuration: _minimumDuration, cueIds, ...scene }) => ({
    ...scene,
    narrationCueIds: cueIds
  }));
  return {
    duration: round(cursor),
    scenes: normalizedScenes,
    narration,
    baseline
  };
}

function captionWeight(text) {
  return [...text].reduce((sum, character) => sum + ({ "，": 0.45, "。": 0.78, "？": 0.95, "：": 0.35 }[character] ?? 1), 0);
}

export function buildCaptionCues(script, narration) {
  const schedule = new Map(narration.map((cue) => [cue.cueId, cue]));
  const captions = [];
  for (const source of script.cues) {
    const owner = schedule.get(source.id);
    if (!owner) throw new Error(`missing narration schedule for ${source.id}`);
    const available = owner.duration - CAPTION_GAP * (source.captions.length - 1);
    const weights = source.captions.map(({ spokenText }) => captionWeight(spokenText));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let cursor = owner.start;
    source.captions.forEach((caption, index) => {
      const isLast = index === source.captions.length - 1;
      const duration = available * weights[index] / totalWeight;
      const end = isLast ? owner.start + owner.duration : cursor + duration;
      if (end - cursor <= captionStyle.fadeFrames * 2 * FRAME_SECONDS) {
        throw new Error(`${caption.id} is too short for whole-line fades`);
      }
      captions.push({
        id: caption.id,
        narrationCueId: source.id,
        spokenText: caption.spokenText,
        text: caption.visibleText,
        start: round(cursor),
        end: round(end),
        fadeInFrames: captionStyle.fadeFrames,
        fadeOutFrames: captionStyle.fadeFrames,
        hardClearAt: round(end)
      });
      cursor = end + CAPTION_GAP;
    });
  }
  for (let index = 1; index < captions.length; index += 1) {
    if (captions[index].start + 1e-6 < captions[index - 1].end + CAPTION_GAP) {
      throw new Error(`caption overlap: ${captions[index - 1].id} -> ${captions[index].id}`);
    }
  }
  return captions;
}

function serializeModule({ timeline, captions }) {
  const styleJson = JSON.stringify(captionStyle, null, 2);
  const scheduleJson = JSON.stringify(timeline.narration.map(({ preferredOffsetSeconds: _preferredOffsetSeconds, startPreserved: _startPreserved, ...cue }) => cue), null, 2);
  const timingJson = JSON.stringify({ duration: timeline.duration, scenes: timeline.scenes }, null, 2);
  const captionsJson = JSON.stringify(captions, null, 2);
  return `// Generated by scripts/build-captions.mjs from measured cue WAV durations.\nconst deepFreeze = (value) => {\n  if (value && typeof value === "object" && !Object.isFrozen(value)) {\n    Object.values(value).forEach(deepFreeze);\n    Object.freeze(value);\n  }\n  return value;\n};\n\nexport const captionStyle = deepFreeze(${styleJson});\n\nexport const voiceoverSchedule = deepFreeze(${scheduleJson});\n\nexport const compositionTiming = deepFreeze(${timingJson});\n\nexport const captionCues = deepFreeze(${captionsJson});\n`;
}

function updateTimingManifest(timing, timeline) {
  const schedule = new Map(timeline.narration.map((cue) => [cue.cueId, cue]));
  return {
    ...timing,
    masterDurationSeconds: timeline.duration,
    timingPolicy: {
      baseline: "video/footsteps-return/audio/voiceover/timeline-baseline.json",
      baselineMasterDurationSeconds: timeline.baseline.masterDurationSeconds,
      finalMasterDurationSeconds: timeline.duration,
      expansionSeconds: round(Math.max(0, timeline.duration - timeline.baseline.masterDurationSeconds)),
      rule: "Preserve approved cue offsets and picture durations where measured final speech fits; shift only the overflowing cue and downstream picture."
    },
    cues: timing.cues.map((cue) => {
      const entry = schedule.get(cue.id);
      return {
        ...cue,
        timelineStartSeconds: entry.start,
        timelineEndSeconds: round(entry.start + entry.duration),
        timingDecision: {
          preferredOffsetSeconds: entry.preferredOffsetSeconds,
          actualOffsetSeconds: round(entry.start - timeline.scenes.find(({ narrationCueIds }) => narrationCueIds.includes(cue.id)).start),
          startPreservedWithinScene: entry.startPreserved,
          timeCompressionFactor: cue.timeCompressionFactor ?? 1
        }
      };
    })
  };
}

function updateStaticDuration(duration) {
  const html = readFileSync(indexPath, "utf8");
  const next = html.replace(/(data-composition-id="footsteps-return"[\s\S]*?data-duration=")([0-9.]+)(")/, `$1${duration}$3`);
  if (next === html && !html.includes(`data-duration="${duration}"`)) throw new Error("cannot update the composition duration in index.html");
  writeFileSync(indexPath, next);
}

function updateScoreTimeline(timeline) {
  const plan = readJson(scorePlanPath);
  const duration = timeline.duration;
  const completeMeasures = Math.floor(duration / 4);
  let measureCount = completeMeasures + 1;
  let lastMeasureDivisions = Math.round((duration - completeMeasures * 4) * plan.render.divisionsPerQuarter);
  if (lastMeasureDivisions === 0) {
    measureCount = completeMeasures;
    lastMeasureDivisions = 4 * plan.render.divisionsPerQuarter;
  }
  const notationGridSeconds = plan.render.notationGridMilliseconds / 1000;
  const notatedDurationSeconds = round(Math.floor((duration + 1e-9) / notationGridSeconds) * notationGridSeconds, 3);
  const notatedLastMeasureDivisions = Math.round(
    (notatedDurationSeconds - (measureCount - 1) * 4) * plan.render.divisionsPerQuarter
  );
  const finalEventEnd = Math.max(...plan.gestures.flatMap((gesture) => {
    const repeat = gesture.repeat ?? { count: 1, every: 0 };
    return gesture.events.map((event) => round(
      gesture.start + (repeat.count - 1) * repeat.every + event.offset + event.duration,
      3
    ));
  }));
  plan.timeline = {
    ...plan.timeline,
    source: "src/data/captions.js compositionTiming (Task 8D measured final VoiceDesign timeline)",
    durationSeconds: duration,
    scenes: timeline.scenes.map(({ id, kind, chapterId = null, start, duration: sceneDuration }) => ({
      id,
      kind,
      chapterId,
      start,
      duration: sceneDuration
    }))
  };
  plan.render = {
    ...plan.render,
    measureCount,
    lastMeasureDivisions,
    notatedLastMeasureDivisions,
    notatedDurationSeconds,
    tailPolicy: `Score events end at ${finalEventEnd.toFixed(3)}. MusicXML uses an import-safe 1/32-note grid through ${notatedDurationSeconds.toFixed(3)}; rendered files add ${Math.round((duration - notatedDurationSeconds) * 1000)} ms of digital silence and are trimmed to the measured ${duration.toFixed(3)}-second final VoiceDesign timeline.`
  };
  writeFileSync(scorePlanPath, `${JSON.stringify(plan, null, 2)}\n`);
}

export function buildCaptionArtifacts({
  script = readJson(path.join(voiceoverRoot, "script.json")),
  timing = readJson(path.join(voiceoverRoot, "timing.json")),
  write = true
} = {}) {
  const timeline = buildFlexibleTimeline(script, timing);
  const captions = buildCaptionCues(script, timeline.narration);
  const updatedTiming = updateTimingManifest(timing, timeline);
  if (write) {
    writeFileSync(captionDataPath, serializeModule({ timeline, captions }));
    writeFileSync(path.join(voiceoverRoot, "timing.json"), `${JSON.stringify(updatedTiming, null, 2)}\n`);
    updateStaticDuration(timeline.duration);
    updateScoreTimeline(timeline);
  }
  return { timeline, captions, timing: updatedTiming };
}

export async function measureCaptionLayout(captions) {
  const server = await startStaticServer({ root: pvRoot });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
    await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.__renderReady);
    const measurements = await page.evaluate((cues) => {
      const timeline = window.__timelines["footsteps-return"];
      const group = document.querySelector("[data-caption-group]");
      const root = document.querySelector('[data-composition-id="footsteps-return"]');
      const rootRect = root.getBoundingClientRect();
      const rootStyle = getComputedStyle(root);
      return cues.map((cue) => {
        timeline.time(cue.start + (cue.fadeInFrames + 1) / 60, false).pause();
        const text = document.querySelector(`[data-caption-cue="${cue.id}"]`);
        const copy = text.querySelector("[data-caption-copy]");
        const marker = text.querySelector("[data-caption-baseline-marker]");
        const range = document.createRange();
        range.selectNodeContents(copy);
        return {
          id: cue.id,
          text: text.textContent,
          lineCount: range.getClientRects().length,
          width: range.getBoundingClientRect().width,
          safeWidth: group.getBoundingClientRect().width,
          font: getComputedStyle(text).fontFamily,
          baselineReady: group.dataset.captionBaselineReady,
          baselineBottom: rootRect.bottom - marker.getBoundingClientRect().top,
          glyphBottom: rootRect.bottom - copy.getBoundingClientRect().bottom,
          safeBottom: Number.parseFloat(rootStyle.getPropertyValue("--safe-bottom"))
        };
      });
    }, captions);
    const failure = measurements.find(({ text, id, lineCount, width, safeWidth, font, baselineReady, baselineBottom, glyphBottom, safeBottom }) => {
      const cue = captions.find((candidate) => candidate.id === id);
      return text !== cue.text
        || lineCount !== 1
        || width > safeWidth + 0.5
        || !font.includes("Topo Serif")
        || baselineReady !== "true"
        || Math.abs(baselineBottom - captionStyle.baselineBottom) > 1
        || glyphBottom < safeBottom - 0.5;
    });
    if (failure) throw new Error(`caption layout failed: ${JSON.stringify(failure)}`);
    return measurements;
  } finally {
    await browser.close();
    await server.close();
  }
}

async function main() {
  const artifacts = buildCaptionArtifacts();
  const measurements = await measureCaptionLayout(artifacts.captions);
  const widest = measurements.reduce((best, current) => current.width > best.width ? current : best, measurements[0]);
  console.log(`Built ${artifacts.captions.length} single-line captions; widest is ${widest.id} at ${widest.width.toFixed(2)}px / ${widest.safeWidth}px.`);
  return artifacts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPcm16StereoHeader,
  readPcm16StereoBlock,
  readWav,
  pcm16Sample,
  writePcm16Stereo
} from "./audio-wav.mjs";

export const SCORE_SEED = 0x7e11f007;
export const VOICE_DUCK_REDUCTION = 0.66;
export const THEME_MIDI = Object.freeze([62, 65, 67, 69, 72]);
export const SCORE_STEMS = Object.freeze(["piano", "strings", "bass", "choir", "fx"]);

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const scoreSourceRoot = path.join(moduleDirectory, "score");
const scoreSourcePath = path.join(scoreSourceRoot, "orchestral-source.json");
const sourceDocument = JSON.parse(fs.readFileSync(scoreSourcePath, "utf8"));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

export const ORCHESTRAL_SCORE_SOURCE = deepFreeze(sourceDocument);
export const CHAPTER_SCORE_BLUEPRINTS = deepFreeze(Object.fromEntries(
  sourceDocument.chapters.map((chapter) => [chapter.id, chapter])
));
export const ORCHESTRAL_PART_BUSES = deepFreeze(sourceDocument.buses);

const STEM_TARGET_PEAK = Object.freeze({
  piano: 0.31,
  strings: 0.26,
  bass: 0.24,
  choir: 0.21,
  fx: 0.25
});

const STEM_MIX_GAIN = Object.freeze({
  piano: 0.72,
  strings: 0.8,
  bass: 0.7,
  choir: 0.76,
  fx: 0.64
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function midiFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function hashString(value, seed = SCORE_SEED) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function xorshift32(state) {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function eventNoise(state, sampleIndex, salt = 0) {
  const mixed = (state ^ Math.imul((sampleIndex + 1) >>> 0, 374761393) ^ Math.imul((salt + 1) >>> 0, 668265263)) >>> 0;
  return xorshift32(mixed || 0x9e3779b9) / 0xffffffff * 2 - 1;
}

function interpolatedNoise(state, sampleIndex, stride, salt = 0) {
  const leftIndex = Math.floor(sampleIndex / stride);
  const amount = sampleIndex / stride - leftIndex;
  const smooth = amount * amount * (3 - 2 * amount);
  const left = eventNoise(state, leftIndex, salt);
  const right = eventNoise(state, leftIndex + 1, salt);
  return left + (right - left) * smooth;
}

function chirpPhase(startHz, endHz, time, duration) {
  const safeDuration = Math.max(duration, 1e-6);
  return Math.PI * 2 * (startHz * time + (endHz - startHz) * time * time / (2 * safeDuration));
}

function event(id, startFrame, durationFrames, midi, velocity, pan = 0, kind, metadata = {}) {
  return {
    id,
    startFrame,
    durationFrames,
    midi,
    velocity,
    pan,
    ...(kind ? { kind } : {}),
    ...metadata
  };
}

function addCardSound(plan, segment, index) {
  plan.fx.push(event(
    `${segment.id}-low-punctuation`,
    segment.startFrame,
    Math.min(168, segment.durationFrames),
    38 + index,
    0.54,
    0,
    "impact",
    { chapterId: segment.chapterId, role: "chapter-punctuation" }
  ));
  plan.fx.push(event(
    `${segment.id}-surface-air`,
    segment.startFrame + 18,
    Math.max(1, segment.durationFrames - 18),
    62,
    0.2,
    index % 2 ? 0.22 : -0.22,
    "surface",
    { chapterId: segment.chapterId, role: "chapter-punctuation" }
  ));
}

function addTransitionSound(plan, timeline, join) {
  const toCard = timeline.segments.find((segment) => segment.id === `${join.to}-card`);
  const toChapter = timeline.segments.find((segment) => segment.id === join.to);
  const boundarySegment = join.to === "tableau"
    ? timeline.segments.find((segment) => segment.id === "seven-worlds")
    : join.to === "finale"
      ? timeline.segments.find((segment) => segment.id === "finale")
      : toCard;
  if (!boundarySegment) return;
  const transitionId = `${join.from}-to-${join.to}`;
  const startFrame = Math.max(0, boundarySegment.startFrame - 36);
  const destinationFrame = toChapter?.startFrame ?? boundarySegment.startFrame + 96;
  const endFrame = Math.min(timeline.totalFrames, destinationFrame + 48);
  plan.fx.push(event(
    `${transitionId}-seam`,
    startFrame,
    Math.max(1, endFrame - startFrame),
    50,
    0.16,
    0,
    "seam",
    { role: "transition", transition: `${join.from}->${join.to}` }
  ));
}

/**
 * Builds the deterministic sound-design layer. The chapter melodies and the
 * orchestral arrangement live in the committed MusicXML sources; this layer
 * adds only topology punctuation and seam relays.
 */
export function buildScorePlan(story, timeline) {
  const plan = { piano: [], strings: [], bass: [], choir: [], fx: [] };

  timeline.segments.filter((segment) => segment.kind === "chapter-card")
    .forEach((segment, index) => addCardSound(plan, segment, index));

  for (const join of ORCHESTRAL_SCORE_SOURCE.joins) addTransitionSound(plan, timeline, join);

  for (const cue of timeline.cues) {
    plan.fx.push(event(
      `${cue.id}-stone`,
      cue.startFrame,
      34,
      62,
      cue.sectionId === "sphere" ? 0.28 : 0.17,
      0,
      "stone",
      { role: "move-punctuation", sectionId: cue.sectionId }
    ));
  }

  for (const events of Object.values(plan)) {
    events.sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
  }
  return plan;
}

function motifSignature(chapter) {
  const primary = `${chapter.motive.pitches.join(",")}|${chapter.motive.rhythmSeconds.join(",")}`;
  const counter = chapter.counterMotive
    ? `|${chapter.counterMotive.pitches.join(",")}|${chapter.counterMotive.rhythmSeconds.join(",")}`
    : "";
  return primary + counter;
}

export function validateScorePlan(plan, story) {
  invariant(JSON.stringify(Object.keys(plan)) === JSON.stringify(SCORE_STEMS), "Score plan must keep the five expandable mix buses");
  for (const [stem, events] of Object.entries(plan)) {
    invariant(Array.isArray(events), `${stem} score bus must contain an event array`);
    for (const sourceEvent of events) {
      invariant(Number.isInteger(sourceEvent.startFrame) && sourceEvent.startFrame >= 0, `${stem}/${sourceEvent.id} has an invalid start frame`);
      invariant(Number.isInteger(sourceEvent.durationFrames) && sourceEvent.durationFrames > 0, `${stem}/${sourceEvent.id} has an invalid duration`);
      invariant(Number.isFinite(sourceEvent.velocity) && sourceEvent.velocity > 0, `${stem}/${sourceEvent.id} has an invalid velocity`);
    }
  }

  const storyChapterIds = story?.chapters?.map((chapter) => chapter.id) ?? Object.keys(CHAPTER_SCORE_BLUEPRINTS);
  invariant(
    JSON.stringify(Object.keys(CHAPTER_SCORE_BLUEPRINTS)) === JSON.stringify(storyChapterIds),
    "Orchestral chapter blueprints must match story chapter order"
  );
  const signatures = Object.values(CHAPTER_SCORE_BLUEPRINTS).map(motifSignature);
  invariant(new Set(signatures).size === signatures.length, "Every chapter must have an independent motive and rhythm language");
  const leadSignatures = Object.values(CHAPTER_SCORE_BLUEPRINTS).map((chapter) => chapter.leadParts.join("+"));
  invariant(new Set(leadSignatures).size === leadSignatures.length, "Every chapter must have a distinct leading instrumentation profile");
  invariant(
    Object.values(CHAPTER_SCORE_BLUEPRINTS).every((chapter) => chapter.character && chapter.character.length > 20),
    "Every chapter must declare its own musical character"
  );
  return true;
}

// Kept as a compatibility alias for earlier callers. It now validates the
// independent-world score contract instead of forcing every note into one cell.
export function validatePentatonicPlan(plan, story) {
  return validateScorePlan(plan, story);
}

export function orchestralSourcePartPath(partId) {
  return path.join(scoreSourceRoot, "stems", `${partId}.musicxml`);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function validateOrchestralSources() {
  const seen = new Set();
  for (const parts of Object.values(ORCHESTRAL_PART_BUSES)) {
    for (const part of parts) {
      invariant(!seen.has(part.id), `Orchestral part ${part.id} is assigned to more than one bus`);
      seen.add(part.id);
      const sourcePath = orchestralSourcePartPath(part.id);
      invariant(fs.existsSync(sourcePath), `Missing committed orchestral source ${sourcePath}`);
      invariant(sha256(sourcePath) === part.sha256, `Orchestral source checksum changed for ${part.id}`);
    }
  }
  invariant(seen.size === 11, "The orchestral source must contain eleven independent parts");
  return true;
}

function targetFrameForAnchor(anchor, timeline) {
  if (anchor.target === "start") return 0;
  if (anchor.target === "end") return timeline.totalFrames;
  const segment = timeline.segments.find((candidate) => candidate.id === anchor.targetSegment);
  invariant(segment, `Missing timeline segment for score anchor ${anchor.label}: ${anchor.targetSegment}`);
  return anchor.targetEdge === "end" ? segment.endFrame : segment.startFrame;
}

export function buildScoreTimeWarpAnchors(timeline) {
  const anchors = ORCHESTRAL_SCORE_SOURCE.timelineAnchors.map((anchor) => ({
    label: anchor.label,
    sourceSeconds: anchor.sourceSeconds,
    targetFrame: targetFrameForAnchor(anchor, timeline)
  }));
  anchors.forEach((anchor, index) => {
    invariant(Number.isInteger(anchor.targetFrame), `${anchor.label} must land on an integer frame`);
    if (index === 0) return;
    const previous = anchors[index - 1];
    invariant(anchor.sourceSeconds > previous.sourceSeconds, `Source score anchors are not increasing at ${anchor.label}`);
    invariant(anchor.targetFrame > previous.targetFrame, `Target score anchors are not increasing at ${anchor.label}`);
    const sourceSpan = anchor.sourceSeconds - previous.sourceSeconds;
    const targetSpan = (anchor.targetFrame - previous.targetFrame) / timeline.fps;
    const ratio = targetSpan / sourceSpan;
    invariant(ratio >= 0.72 && ratio <= 1.8, `Score time-warp ratio ${ratio.toFixed(3)} is unsafe at ${anchor.label}`);
  });
  invariant(anchors[0].targetFrame === 0, "Score time-warp must begin at frame zero");
  invariant(anchors.at(-1).targetFrame === timeline.totalFrames, "Score time-warp must end on the final frame boundary");
  return anchors;
}

export function sourceSecondsAtFrame(frame, anchors) {
  invariant(frame >= anchors[0].targetFrame && frame <= anchors.at(-1).targetFrame, "Frame is outside score time-warp anchors");
  let rightIndex = 1;
  while (rightIndex < anchors.length && frame > anchors[rightIndex].targetFrame) rightIndex += 1;
  const right = anchors[Math.min(rightIndex, anchors.length - 1)];
  const left = anchors[Math.max(0, rightIndex - 1)];
  const progress = right.targetFrame === left.targetFrame
    ? 0
    : (frame - left.targetFrame) / (right.targetFrame - left.targetFrame);
  return left.sourceSeconds + (right.sourceSeconds - left.sourceSeconds) * progress;
}

function oscillatorSample(stem, sourceEvent, sampleIndex, sampleRate, state) {
  const time = sampleIndex / sampleRate;
  const duration = sourceEvent.durationFrames / 60;
  const frequency = midiFrequency(sourceEvent.midi ?? 62);
  const attackRelease = (attack, release) => Math.min(1, time / attack, Math.max(0, (duration - time) / release));
  if (stem === "piano") {
    const attack = Math.min(1, time * 120);
    const decay = Math.exp(-time * (sourceEvent.kind === "felt" ? 1.7 : 1.4));
    const phase = Math.PI * 2 * frequency * time;
    return (Math.sin(phase) + 0.3 * Math.sin(phase * 2.003) + 0.1 * Math.sin(phase * 3.997)) * attack * decay * 0.55;
  }
  if (stem === "strings") {
    const envelope = attackRelease(sourceEvent.kind === "harmonic" ? 0.65 : 0.82, 1.25);
    const vibrato = 1 + 0.002 * Math.sin(Math.PI * 2 * 5.1 * time + (state & 31));
    const phase = Math.PI * 2 * frequency * vibrato * time;
    return (Math.sin(phase) + 0.28 * Math.sin(phase * 2) + 0.1 * Math.sin(phase * 3)) * envelope * 0.46;
  }
  if (stem === "bass") {
    const envelope = Math.min(1, time / 0.05) * Math.exp(-time * 0.62) * Math.min(1, (duration - time) / 0.15);
    const phase = Math.PI * 2 * frequency * time;
    return (Math.sin(phase) + 0.24 * Math.sin(phase * 2)) * envelope * 0.65;
  }
  if (stem === "choir") {
    const envelope = attackRelease(1.1, 1.65);
    const vibrato = 0.0025 * Math.sin(Math.PI * 2 * 4.6 * time + (state & 15));
    const phase = Math.PI * 2 * frequency * (1 + vibrato) * time;
    return (0.76 * Math.sin(phase) + 0.27 * Math.sin(phase * 2) + 0.13 * Math.sin(phase * 3)) * envelope * 0.43;
  }

  const progress = clamp(time / Math.max(duration, 1e-6), 0, 1);
  const noise = eventNoise(state, sampleIndex);
  const attack = Math.min(1, time / 0.008);
  const tail = Math.max(0, 1 - progress);
  const toneHz = sourceEvent.toneHz ?? frequency;
  const boardHz = sourceEvent.boardHz ?? toneHz * 0.66;
  const clickHz = sourceEvent.clickHz ?? toneHz * 4.2;

  if (sourceEvent.kind === "paper-air") {
    const edgeFade = Math.min(1, time / 2.4, Math.max(0, duration - time) / 2.4);
    const air = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / 38)), 2);
    const fiber = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / 950)), 7);
    const breathing = 0.76 + 0.24 * Math.sin(Math.PI * 2 * 0.071 * time + (state & 31));
    return (air * 0.12 + fiber * 0.025 + Math.sin(Math.PI * 2 * 37 * time) * 0.018) * edgeFade * breathing;
  }
  if (sourceEvent.kind === "reverse-breath") {
    const endTaper = Math.min(1, Math.max(0, 1 - progress) / 0.055);
    const rise = progress ** 1.85 * endTaper;
    const air = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / 620)), 11);
    const sweep = Math.sin(chirpPhase(toneHz * 0.72, toneHz * 3.4, time, duration));
    return (air * 0.48 + sweep * 0.18 + noise * 0.035) * rise;
  }
  if (sourceEvent.kind === "chapter-impact" || sourceEvent.kind === "end-card-hit") {
    const impactHz = sourceEvent.impactHz ?? 44;
    const sub = Math.sin(chirpPhase(impactHz * 1.45, impactHz * 0.72, time, Math.min(duration, 0.9)));
    const body = Math.sin(chirpPhase(impactHz * 2.1, impactHz * 1.18, time, Math.min(duration, 0.72)));
    const transient = noise * Math.exp(-time * 42);
    const decay = Math.exp(-time * (sourceEvent.kind === "end-card-hit" ? 3.9 : 3.25));
    return (sub * 0.78 + body * 0.21 + transient * 0.24) * attack * decay;
  }
  if (sourceEvent.kind === "title-shimmer" || sourceEvent.kind === "glyph-pulse" || sourceEvent.kind === "logo-bloom") {
    const speed = sourceEvent.kind === "glyph-pulse" ? 5.2 : sourceEvent.kind === "logo-bloom" ? 1.85 : 2.7;
    const bellAttack = Math.min(1, time / (sourceEvent.kind === "logo-bloom" ? 0.08 : 0.014));
    const decay = Math.exp(-time * speed) * tail ** 0.18;
    const phase = Math.PI * 2 * toneHz * time;
    const shimmer = Math.sin(phase) + 0.37 * Math.sin(phase * 2.003) + 0.16 * Math.sin(phase * 3.987);
    const dust = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / 2200)), 13) * 0.035;
    return (shimmer * 0.34 + dust) * bellAttack * decay;
  }
  if (sourceEvent.kind === "space-tail" || sourceEvent.kind === "room-tail") {
    const decayRate = sourceEvent.kind === "room-tail" ? 2.75 : 1.72;
    const diffuse = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / 310)), 17);
    const phase = Math.PI * 2 * toneHz * time;
    const body = Math.sin(phase) * 0.22 + Math.sin(phase * 1.503) * 0.12 + diffuse * 0.12;
    return body * Math.min(1, time / 0.025) * Math.exp(-time * decayRate) * tail ** 0.2;
  }
  if (sourceEvent.kind === "stone-click" || sourceEvent.kind === "final-stone") {
    const clickFrequency = sourceEvent.kind === "final-stone" ? clickHz * 0.74 : clickHz;
    const phase = Math.PI * 2 * clickFrequency * time;
    const ceramic = 0.56 * Math.sin(phase) + 0.26 * Math.sin(phase * 1.731) + 0.11 * Math.sin(phase * 2.817);
    const snap = noise * Math.exp(-time * 105);
    const body = Math.exp(-time * (sourceEvent.kind === "final-stone" ? 31 : 49));
    return (ceramic * body + snap * 0.22) * attack;
  }
  if (sourceEvent.kind === "board-resonance" || sourceEvent.kind === "final-board") {
    const resonance = sourceEvent.kind === "final-board" ? boardHz * 0.72 : boardHz;
    const phase = Math.PI * 2 * resonance * time;
    const modes = Math.sin(phase) + 0.43 * Math.sin(phase * 1.487) + 0.17 * Math.sin(phase * 2.121);
    const knock = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / 720)), 19) * Math.exp(-time * 17);
    return (modes * 0.42 + knock * 0.15) * attack * Math.exp(-time * (sourceEvent.kind === "final-board" ? 2.9 : 4.7));
  }
  if (sourceEvent.kind === "final-tail") {
    const bloom = 1 - Math.exp(-time * 7);
    const phase = Math.PI * 2 * toneHz * time;
    const halo = Math.sin(phase) * 0.28 + Math.sin(phase * 1.5) * 0.19 + Math.sin(phase * 2) * 0.08;
    const diffuse = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / 180)), 23) * 0.1;
    return (halo + diffuse) * bloom * Math.exp(-time * 0.92) * tail ** 0.35;
  }
  if (sourceEvent.kind === "seam-crossing") {
    const envelope = Math.sin(Math.PI * progress) ** 1.55;
    const twist = Boolean((sourceEvent.seamMask ?? 0) & 4);
    const air = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / (twist ? 840 : 520))), 29);
    if (twist) {
      const crossing = Math.sin(chirpPhase(toneHz * 2.4, toneHz * 0.72, time, duration))
        - Math.sin(chirpPhase(toneHz * 0.72, toneHz * 2.4, time, duration));
      return (crossing * 0.18 + air * 0.32 + noise * 0.035) * envelope;
    }
    return (Math.sin(chirpPhase(toneHz * 0.65, toneHz * 2.25, time, duration)) * 0.26 + air * 0.36) * envelope;
  }
  if (sourceEvent.kind === "topology-warp") {
    const envelope = Math.sin(Math.PI * progress) ** 1.35;
    const air = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / 420)), 31);
    switch (sourceEvent.warpStyle) {
      case "axial-hollow":
        return (Math.sin(chirpPhase(toneHz * 0.58, toneHz * 1.82, time, duration)) * 0.31 + air * 0.25) * envelope;
      case "dual-orbit": {
        const beat = 0.58 + 0.42 * Math.sin(Math.PI * 2 * 1.65 * time);
        return (Math.sin(Math.PI * 2 * toneHz * time) + Math.sin(Math.PI * 2 * toneHz * 1.035 * time)) * 0.18 * beat * envelope + air * 0.12 * envelope;
      }
      case "half-twist": {
        const flip = Math.cos(Math.PI * progress);
        const sweep = Math.sin(chirpPhase(toneHz * 0.72, toneHz * 1.9, time, duration));
        return (sweep * flip * 0.29 + air * (0.22 + Math.abs(flip) * 0.08)) * envelope;
      }
      case "bottle-fold":
        return (Math.sin(chirpPhase(toneHz * 2.05, toneHz * 0.61, time, duration)) * 0.24
          + Math.sin(chirpPhase(toneHz * 0.81, toneHz * 1.28, time, duration)) * 0.16
          + air * 0.2) * envelope;
      case "mirror-cross": {
        const ascending = Math.sin(chirpPhase(toneHz * 0.52, toneHz * 2.3, time, duration));
        const descending = Math.sin(chirpPhase(toneHz * 2.3, toneHz * 0.52, time, duration));
        return (ascending - descending) * 0.19 * envelope + air * 0.17 * envelope;
      }
      case "harmonic-bloom": {
        const bloom = progress ** 0.72;
        const phase = Math.PI * 2 * toneHz * time;
        return (Math.sin(phase) * 0.23 + Math.sin(phase * 1.5) * 0.18 + Math.sin(phase * 2) * 0.09 + air * 0.1) * envelope * bloom;
      }
      default:
        return (Math.sin(chirpPhase(toneHz * 0.72, toneHz * 2.05, time, duration)) * 0.25 + air * 0.24) * envelope;
    }
  }
  if (sourceEvent.kind === "topology-lock") {
    const phase = Math.PI * 2 * toneHz * time;
    const styleOffset = (sourceEvent.profileIndex ?? 0) * 0.013;
    const bell = Math.sin(phase) + 0.3 * Math.sin(phase * (1.5 + styleOffset)) + 0.13 * Math.sin(phase * (2.01 - styleOffset));
    return bell * 0.32 * attack * Math.exp(-time * (2.8 - Math.min(0.7, (sourceEvent.profileIndex ?? 0) * 0.08)));
  }
  if (sourceEvent.kind === "convergence") {
    const envelope = Math.sin(Math.PI * progress) ** 0.82;
    const chord = [110, 146.83, 196, 246.94].reduce((sum, hz, index) => sum + Math.sin(Math.PI * 2 * hz * time + index * 0.37), 0) / 4;
    const air = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / 170)), 37);
    return (chord * 0.34 + air * 0.13) * envelope;
  }
  if (sourceEvent.kind === "final-breath") {
    const endTaper = Math.min(1, tail / 0.08);
    const rise = progress ** 2.2 * endTaper;
    const air = interpolatedNoise(state, sampleIndex, Math.max(1, Math.round(sampleRate / 560)), 41);
    return (air * 0.47 + Math.sin(chirpPhase(72, 238, time, duration)) * 0.18) * rise;
  }
  if (sourceEvent.kind === "impact") {
    const phase = Math.PI * 2 * (44 - 13 * progress) * time;
    return (0.82 * Math.sin(phase) + 0.18 * noise) * Math.exp(-time * 2.8);
  }
  if (sourceEvent.kind === "stone") {
    return (0.6 * Math.sin(Math.PI * 2 * 830 * time) + 0.35 * Math.sin(Math.PI * 2 * 214 * time) + 0.12 * noise) * Math.exp(-time * 19);
  }
  if (sourceEvent.kind === "seam") {
    const envelope = Math.sin(Math.PI * progress) ** 1.5;
    return (0.5 * noise + 0.5 * Math.sin(Math.PI * 2 * (95 + 260 * progress) * time)) * envelope * 0.35;
  }
  const envelope = Math.sin(Math.PI * progress);
  return noise * envelope * 0.2 + Math.sin(Math.PI * 2 * 62 * time) * envelope * 0.07;
}

function addProceduralEvents(samples, stem, events, totalFrames, sampleRate) {
  const samplesPerFrame = sampleRate / 60;
  for (const sourceEvent of events) {
    const startSample = sourceEvent.startFrame * samplesPerFrame;
    const eventSamples = Math.min(
      sourceEvent.durationFrames * samplesPerFrame,
      totalFrames * samplesPerFrame - startSample
    );
    const leftGain = Math.cos((clamp(sourceEvent.pan, -1, 1) + 1) * Math.PI / 4) * sourceEvent.velocity;
    const rightGain = Math.sin((clamp(sourceEvent.pan, -1, 1) + 1) * Math.PI / 4) * sourceEvent.velocity;
    const state = hashString(sourceEvent.id);
    for (let sampleIndex = 0; sampleIndex < eventSamples; sampleIndex += 1) {
      const sample = oscillatorSample(stem, sourceEvent, sampleIndex, sampleRate, state);
      const destination = (startSample + sampleIndex) * 2;
      samples[destination] += sample * leftGain;
      samples[destination + 1] += sample * rightGain;
    }
  }
}

function normalize(samples, targetPeak) {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
  invariant(peak > 0, "Rendered stem contains no signal");
  const gain = targetPeak / peak;
  let squareSum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] *= gain;
    squareSum += samples[index] ** 2;
  }
  return { peak: targetPeak, rms: Math.sqrt(squareSum / samples.length), normalizationGain: gain };
}

function addCrossDelay(samples, sampleRate, amount, delaySeconds) {
  const delaySamples = Math.round(delaySeconds * sampleRate) * 2;
  for (let index = delaySamples; index < samples.length; index += 2) {
    const delayedLeft = samples[index - delaySamples];
    const delayedRight = samples[index - delaySamples + 1];
    samples[index] += delayedRight * amount;
    samples[index + 1] += delayedLeft * amount;
  }
}

export function renderScoreStem({ stem, events, totalFrames, sampleRate, outputPath }) {
  const samplesPerFrame = sampleRate / 60;
  invariant(Number.isInteger(samplesPerFrame), "Sample rate must map exactly to 60 fps");
  const samples = new Float32Array(totalFrames * samplesPerFrame * 2);
  addProceduralEvents(samples, stem, events, totalFrames, sampleRate);
  if (stem !== "bass") addCrossDelay(samples, sampleRate, stem === "fx" ? 0.08 : 0.06, stem === "choir" ? 0.233 : 0.173);
  const metrics = normalize(samples, STEM_TARGET_PEAK[stem]);
  writePcm16Stereo(outputPath, samples, sampleRate);
  const countBy = (field) => Object.fromEntries([...events.reduce((counts, sourceEvent) => {
    const key = String(sourceEvent[field] ?? "unspecified");
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map())].sort(([left], [right]) => left.localeCompare(right)));
  return {
    ...metrics,
    targetPeakDbfs: 20 * Math.log10(STEM_TARGET_PEAK[stem]),
    eventCount: events.length,
    eventCountsByKind: countBy("kind"),
    eventCountsByRole: countBy("role"),
    renderer: "deterministic-procedural-layer"
  };
}

function sourceSample(wav, frame, channel) {
  const clamped = clamp(frame, 0, wav.frameCount - 1);
  const left = Math.floor(clamped);
  const right = Math.min(wav.frameCount - 1, left + 1);
  const blend = clamped - left;
  const sourceChannel = Math.min(channel, wav.channels - 1);
  const a = wav.samples[left * wav.channels + sourceChannel];
  const b = wav.samples[right * wav.channels + sourceChannel];
  return a + (b - a) * blend;
}

function mixWarpedPart(samples, wav, part, anchors, totalFrames, sampleRate) {
  const totalSampleFrames = totalFrames * sampleRate / 60;
  const pan = clamp(part.pan, -1, 1);
  const panLeft = Math.cos((pan + 1) * Math.PI / 4) * part.gain;
  const panRight = Math.sin((pan + 1) * Math.PI / 4) * part.gain;
  for (let anchorIndex = 1; anchorIndex < anchors.length; anchorIndex += 1) {
    const leftAnchor = anchors[anchorIndex - 1];
    const rightAnchor = anchors[anchorIndex];
    const destinationStart = leftAnchor.targetFrame * sampleRate / 60;
    const destinationEnd = rightAnchor.targetFrame * sampleRate / 60;
    const destinationSpan = destinationEnd - destinationStart;
    const sourceStart = leftAnchor.sourceSeconds * wav.sampleRate;
    const sourceSpan = (rightAnchor.sourceSeconds - leftAnchor.sourceSeconds) * wav.sampleRate;
    for (let destinationFrame = destinationStart; destinationFrame < destinationEnd && destinationFrame < totalSampleFrames; destinationFrame += 1) {
      const progress = (destinationFrame - destinationStart) / destinationSpan;
      const sourceFrame = sourceStart + sourceSpan * progress;
      const mono = wav.channels === 1
        ? sourceSample(wav, sourceFrame, 0)
        : (sourceSample(wav, sourceFrame, 0) + sourceSample(wav, sourceFrame, 1)) * 0.5;
      const destination = destinationFrame * 2;
      samples[destination] += mono * panLeft;
      samples[destination + 1] += mono * panRight;
    }
  }
}

export function renderOrchestralScoreStem({
  stem,
  sourcePartPaths,
  proceduralEvents,
  anchors,
  totalFrames,
  sampleRate,
  outputPath
}) {
  invariant(SCORE_STEMS.includes(stem), `Unknown orchestral bus ${stem}`);
  invariant(Number.isInteger(sampleRate / 60), "Orchestral score requires frame-aligned 48 kHz audio");
  const parts = ORCHESTRAL_PART_BUSES[stem];
  invariant(parts.length > 0, `${stem} has no assigned orchestral source parts`);
  const samples = new Float32Array(totalFrames * sampleRate / 60 * 2);
  for (const part of parts) {
    const sourcePath = sourcePartPaths[part.id];
    invariant(sourcePath && fs.existsSync(sourcePath), `Missing rendered orchestral part ${part.id}`);
    const wav = readWav(sourcePath);
    invariant(wav.sampleRate === sampleRate, `${part.id} must be normalized to ${sampleRate} Hz`);
    mixWarpedPart(samples, wav, part, anchors, totalFrames, sampleRate);
  }
  addProceduralEvents(samples, stem, proceduralEvents, totalFrames, sampleRate);
  const metrics = normalize(samples, STEM_TARGET_PEAK[stem]);
  writePcm16Stereo(outputPath, samples, sampleRate);
  return {
    ...metrics,
    eventCount: proceduralEvents.length,
    sourcePartCount: parts.length,
    sourceParts: parts.map((part) => part.id),
    renderer: "MuseScore-Basic-MusicXML-piecewise-frame-warp"
  };
}

export function voiceDuckGain(frame, cues) {
  let duck = 0;
  for (const cue of cues) {
    const attackStart = cue.startFrame - 12;
    const releaseEnd = cue.endFrame + 24;
    if (frame < attackStart || frame >= releaseEnd) continue;
    const attack = clamp((frame - attackStart) / 12, 0, 1);
    const release = clamp((releaseEnd - frame) / 24, 0, 1);
    duck = Math.max(duck, Math.min(attack, release));
  }
  return 1 - duck * VOICE_DUCK_REDUCTION;
}

export function mixPcm16Stereo({
  inputs,
  outputPath,
  totalFrames,
  sampleRate,
  frameGain = () => 1,
  softLimit = true
}) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const descriptors = inputs.map((input) => ({ ...input, fd: fs.openSync(input.path, "r") }));
  const output = fs.openSync(outputPath, "w");
  let peak = 0;
  let squareSum = 0;
  let sampleCount = 0;
  try {
    fs.writeSync(output, createPcm16StereoHeader(totalFrames, sampleRate));
    const blockFrames = 16384;
    for (let frameStart = 0; frameStart < totalFrames; frameStart += blockFrames) {
      const frames = Math.min(blockFrames, totalFrames - frameStart);
      const blocks = descriptors.map((input) => readPcm16StereoBlock(input.fd, frameStart, frames, totalFrames));
      const encoded = Buffer.allocUnsafe(frames * 4);
      for (let frameOffset = 0; frameOffset < frames; frameOffset += 1) {
        const absoluteFrame = frameStart + frameOffset;
        const dynamicGain = frameGain(absoluteFrame);
        const inputGains = descriptors.map((input) =>
          typeof input.gain === "function" ? input.gain(absoluteFrame) : input.gain
        );
        for (let channel = 0; channel < 2; channel += 1) {
          let mixed = 0;
          descriptors.forEach((input, inputIndex) => {
            mixed += pcm16Sample(blocks[inputIndex], frameOffset * 2 + channel) * inputGains[inputIndex];
          });
          mixed *= dynamicGain;
          if (softLimit) mixed = Math.tanh(mixed * 1.08) / Math.tanh(1.08);
          mixed = clamp(mixed, -0.96, 0.96);
          peak = Math.max(peak, Math.abs(mixed));
          squareSum += mixed * mixed;
          sampleCount += 1;
          const integer = mixed < 0 ? Math.round(mixed * 32768) : Math.round(mixed * 32767);
          encoded.writeInt16LE(integer, (frameOffset * 2 + channel) * 2);
        }
      }
      fs.writeSync(output, encoded);
    }
  } finally {
    fs.closeSync(output);
    descriptors.forEach(({ fd }) => fs.closeSync(fd));
  }
  return { peak, rms: Math.sqrt(squareSum / sampleCount) };
}

export function scoreMixInputs(stemPaths) {
  return SCORE_STEMS.map((stem) => ({ path: stemPaths[stem], gain: STEM_MIX_GAIN[stem] }));
}

export function scoreManifestDescription() {
  return {
    source: {
      format: "11 committed MusicXML parts rendered with MuseScore Basic",
      title: ORCHESTRAL_SCORE_SOURCE.title,
      composerCredit: ORCHESTRAL_SCORE_SOURCE.composerCredit,
      copyright: ORCHESTRAL_SCORE_SOURCE.copyright,
      original: true,
      importedOrTranscribedReferenceMusic: false,
      sourceDurationSeconds: ORCHESTRAL_SCORE_SOURCE.sourceDurationSeconds,
      plan: "video/chapter-teaser/src/score/orchestral-source.json",
      planSha256: sha256(scoreSourcePath),
      musicXmlParts: Object.fromEntries(Object.values(ORCHESTRAL_PART_BUSES).flat().map((part) => [part.id, {
        path: `video/chapter-teaser/src/score/stems/${part.id}.musicxml`,
        sha256: part.sha256
      }]))
    },
    deepStructure: ORCHESTRAL_SCORE_SOURCE.deepStructure,
    sharedChapterMelody: false,
    chapters: Object.fromEntries(ORCHESTRAL_SCORE_SOURCE.chapters.map((chapter) => [chapter.id, {
      mode: chapter.mode,
      motive: chapter.motive,
      ...(chapter.counterMotive ? { counterMotive: chapter.counterMotive } : {}),
      rhythmicIdentity: chapter.rhythmicIdentity,
      leadParts: chapter.leadParts,
      supportingPalette: chapter.supportingPalette,
      character: chapter.character
    }])),
    continuity: {
      method: "Phrase overlap, pre-cut pickup, harmonic pivot, rhythmic handoff and timbral relay preserved by piecewise continuous frame warp",
      joins: ORCHESTRAL_SCORE_SOURCE.joins
    },
    buses: Object.fromEntries(Object.entries(ORCHESTRAL_PART_BUSES).map(([stem, parts]) => [stem, parts.map((part) => part.id)]))
  };
}

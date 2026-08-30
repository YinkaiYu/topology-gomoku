import { topologyChapterDefinitions } from "../../compositions/chapters/index.js";
import { captionCues } from "../data/captions.js";
import { findGameRenderShot } from "../data/game-render-shots.js";
import { masterTimeline } from "../data/timeline.js";
import { chapterPhaseUnits } from "../game-render/adapter.js";
import { CHAPTER_MOTION_TIMING, chapterFrameAt } from "./topology-surfaces.js";

export const SFX_SAMPLE_RATE = 48_000;

function progressForChapterEvent(demo, event) {
  const units = chapterPhaseUnits(demo);
  const total = units.reduce((sum, unit) => sum + unit.weight, 0);
  let cursor = 0;
  for (const unit of units) {
    if (event.kind === "drop-complete" && unit.phase === "drop" && unit.step === event.step) {
      return (cursor + unit.weight) / total;
    }
    if (event.kind === "crossing-breathe" && unit.phase === "breathe" && unit.step === event.step) {
      return (cursor + unit.weight * event.breathPhase) / total;
    }
    if (event.kind === "morph-start" && unit.phase === "morph") return cursor / total;
    cursor += unit.weight;
  }
  throw new Error(`SFX event ${event.kind} cannot be resolved for ${demo.id}`);
}

function onsetSample(rawTime, eventKind) {
  const exact = rawTime * SFX_SAMPLE_RATE;
  if (eventKind === "drop-complete" || eventKind === "morph-start") {
    return Math.ceil(exact - 1e-8);
  }
  return Math.round(exact);
}

function sceneForCue(cue) {
  const scene = masterTimeline.scenes.find(({ id }) => id === cue.sceneId);
  if (!scene) throw new Error(`Unknown SFX scene ${cue.sceneId}`);
  return scene;
}

export function resolveSfxCueEvent(cue) {
  if (!cue?.event?.kind) throw new Error(`SFX cue ${cue?.id ?? "unknown"} has no semantic event`);
  const scene = sceneForCue(cue);
  const event = cue.event;
  let rawTime;
  let frame;
  let frameAfter;

  if (event.kind === "scene-start") {
    rawTime = scene.start;
  } else if (event.kind === "caption-start") {
    const caption = captionCues.find(({ id }) => id === event.captionId);
    if (!caption) throw new Error(`Unknown SFX caption ${event.captionId}`);
    rawTime = caption.start;
  } else if (event.kind === "exit-occlusion-start") {
    if (scene.kind !== "chapter") throw new Error(`${cue.id} exit occlusion must bind a chapter`);
    rawTime = scene.start + scene.duration - CHAPTER_MOTION_TIMING.exitOcclusionDurationSeconds;
  } else if (["drop-complete", "crossing-breathe", "morph-start"].includes(event.kind)) {
    if (scene.kind !== "chapter") throw new Error(`${cue.id} render phase must bind a chapter`);
    const definition = topologyChapterDefinitions[scene.chapterId];
    const { demo } = findGameRenderShot(scene.chapterId, event.demoId);
    if (!definition.liveRender.demos.includes(event.demoId)) throw new Error(`${event.demoId} is not active in ${scene.chapterId}`);
    if (event.kind === "crossing-breathe" && !demo.crossings.includes(event.step)) {
      throw new Error(`${event.demoId} step ${event.step} is not a crossing`);
    }
    const progress = progressForChapterEvent(demo, event);
    const motionDuration = scene.duration - CHAPTER_MOTION_TIMING.progressEndOffsetSeconds;
    rawTime = scene.start + CHAPTER_MOTION_TIMING.progressStartOffsetSeconds + progress * motionDuration;
    const boundaryBias = event.kind === "drop-complete" || event.kind === "morph-start" ? 1e-12 : 0;
    frame = chapterFrameAt(definition, progress - boundaryBias);
    if (event.kind === "morph-start") {
      frameAfter = chapterFrameAt(definition, progress + 1 / SFX_SAMPLE_RATE / motionDuration);
    }
  } else {
    throw new Error(`Unsupported SFX event ${event.kind}`);
  }

  const sampleIndex = onsetSample(rawTime, event.kind);
  return Object.freeze({
    event,
    scene,
    rawTime,
    sampleIndex,
    time: sampleIndex / SFX_SAMPLE_RATE,
    frame,
    frameAfter
  });
}

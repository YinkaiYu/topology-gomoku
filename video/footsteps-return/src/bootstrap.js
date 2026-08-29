import { masterTimeline } from "./data/timeline.js";
import { fitCompositionText } from "./runtime/fit-text.js";
import { buildMasterTimeline } from "./runtime/master-timeline.js";

export const composition = Object.freeze({
  id: "footsteps-return",
  duration: masterTimeline.duration,
  width: 3840,
  height: 2160,
  fps: 60
});

export function createCompositionTimeline(gsap, {
  document: documentRef = document,
  stage = documentRef.querySelector("[data-scene-layer]")
} = {}) {
  return buildMasterTimeline({ document: documentRef, gsap, stage }).timeline;
}

export function bootstrapComposition({
  hostWindow = window,
  document: documentRef = document,
  gsap = hostWindow.gsap
} = {}) {
  const root = documentRef.querySelector(`[data-composition-id="${composition.id}"]`);
  const stage = root?.querySelector("[data-scene-layer]");
  if (!root || !stage) {
    throw new Error("Footsteps Return master stage is missing");
  }

  const { timeline, registry } = buildMasterTimeline({ document: documentRef, gsap, stage });
  hostWindow.__timelines = hostWindow.__timelines || {};
  hostWindow.__timelines[composition.id] = timeline;
  hostWindow.__pvSceneRegistry = registry;

  const fontsReady = documentRef.fonts?.ready ?? Promise.resolve();
  hostWindow.__renderReady = Promise.resolve(fontsReady).then(() => {
    fitCompositionText(root);
    documentRef.documentElement.dataset.renderReady = "true";
    return Object.freeze({ composition, sceneIds: Object.keys(registry) });
  });

  return Object.freeze({ timeline, registry, renderReady: hostWindow.__renderReady });
}

import { createTopologyChapterScene, defineChapterScene } from "../../src/runtime/topology-surfaces.js";

export const kleinChapter = defineChapterScene({
  id: "klein",
  liveRender: { adapter: "GameRenderAdapter", source: "./render-game.html?sourceRoot=./assets/game-source", topology: "klein", demos: ["preserved-crossing", "reflected-crossing"], canvas: "single-persistent", alpha: true, approved: true },
  identity: { light: "#7f6ca8", cameraPath: "paired-memory-orbit" },
  evidence: { kind: "preserved-reflected-pair", pathActions: ["preserved", "reflected"], edgeAction: "mixed", handoff: "paired-memory" },
  entryTransition: { kind: "match-cut" },
  exitOcclusion: { kind: "surface-occlusion", geometry: "klein-neck" },
  morphMode: "native",
  camera: {
    from: { scale: 0.95, x: 2, y: 0, z: 0 },
    formed: { scale: 1, x: 5, y: -9, z: 3 },
    rotation: { scale: 1.02, x: 8, y: 15, z: 5 }
  },
  surface: { engine: "three", role: "photographic-shadow-only", mapping: "TopologyMorph.surfacePoint", subdivisions: [96, 72], effects: { antialias: "multisample", depthOfField: "restrained", motionBlur: "deterministic-subframe", volumetricLight: "low-density", particles: 48 } }
});

export function createKleinChapterScene(documentRef, sceneDefinition) {
  return createTopologyChapterScene(documentRef, sceneDefinition, kleinChapter);
}

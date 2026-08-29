import { createTopologyChapterScene, defineChapterScene } from "../../src/runtime/topology-surfaces.js";

export const mobiusChapter = defineChapterScene({
  id: "mobius",
  liveRender: { adapter: "GameRenderAdapter", source: "./render-game.html?sourceRoot=./assets/game-source", topology: "mobius", demos: ["reflected-crossing"], canvas: "single-persistent", alpha: true, approved: true },
  identity: { light: "#d95b4f", cameraPath: "half-roll-reveal" },
  evidence: { kind: "half-twist", halfTurns: 1, edgeAction: "single-pair-reflected" },
  entryTransition: { kind: "match-cut" },
  exitOcclusion: { kind: "surface-occlusion", geometry: "mobius-ribbon" },
  morphMode: "native",
  camera: {
    from: { scale: 0.96, x: -1, y: -2, z: 0 },
    formed: { scale: 1.01, x: 10, y: -3, z: -4 },
    rotation: { scale: 1.02, x: 17, y: 8, z: -8 }
  },
  surface: { engine: "three", role: "photographic-shadow-only", mapping: "TopologyMorph.surfacePoint", subdivisions: [96, 72], effects: { antialias: "multisample", depthOfField: "restrained", motionBlur: "deterministic-subframe", volumetricLight: "low-density", particles: 48 } }
});

export function createMobiusChapterScene(documentRef, sceneDefinition) {
  return createTopologyChapterScene(documentRef, sceneDefinition, mobiusChapter);
}

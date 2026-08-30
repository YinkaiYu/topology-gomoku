import { createTopologyChapterScene, defineChapterScene } from "../../src/runtime/topology-surfaces.js";

export const cylinderChapter = defineChapterScene({
  id: "cylinder",
  liveRender: { adapter: "GameRenderAdapter", source: "./render-game.html?sourceRoot=./assets/game-source", topology: "cylinder", demos: ["horizontal-wrap"], canvas: "single-persistent", alpha: true, approved: true },
  identity: { light: "#3f8c87", cameraPath: "axial-side-closure" },
  evidence: { kind: "single-cycle", cycles: 1, edgeAction: "opposite-sides-preserved" },
  entryTransition: { kind: "match-cut" },
  exitOcclusion: { kind: "surface-occlusion", geometry: "cylinder-section" },
  morphMode: "native",
  camera: {
    from: { scale: 0.965, x: 1, y: -2, z: 0 },
    formed: { scale: 1, x: 4, y: -8, z: -1 },
    rotation: { scale: 1.015, x: 5, y: 12, z: -1.8 }
  },
  surface: { engine: "three", role: "photographic-shadow-only", mapping: "TopologyMorph.surfacePoint", subdivisions: [96, 72], effects: { antialias: "multisample", depthOfField: "restrained", motionBlur: "deterministic-subframe", volumetricLight: "low-density", particles: 48 } }
});

export function createCylinderChapterScene(documentRef, sceneDefinition) {
  return createTopologyChapterScene(documentRef, sceneDefinition, cylinderChapter);
}

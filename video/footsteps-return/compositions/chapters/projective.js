import { createTopologyChapterScene, defineChapterScene } from "../../src/runtime/topology-surfaces.js";

export const projectiveChapter = defineChapterScene({
  id: "projective",
  liveRender: { adapter: "GameRenderAdapter", source: "./render-game.html?sourceRoot=./assets/game-source", topology: "projective", demos: ["mirrored-crossings"], canvas: "single-persistent", alpha: true, approved: true },
  identity: { light: "#8b7556", cameraPath: "mirrored-convergence" },
  evidence: { kind: "all-edge-reflection", reflectedEdgePairs: 2, edgeAction: "all-reflected" },
  entryTransition: { kind: "match-cut" },
  exitOcclusion: { kind: "surface-occlusion", geometry: "projective-crosscap" },
  morphMode: "native",
  camera: {
    from: { scale: 0.955, x: 0, y: -1, z: 0 },
    formed: { scale: 1.005, x: 9, y: -7, z: 3 },
    rotation: { scale: 1.015, x: 14, y: 9, z: 7 }
  },
  surface: { engine: "three", role: "photographic-shadow-only", mapping: "TopologyMorph.surfacePoint", subdivisions: [96, 72], effects: { antialias: "multisample", depthOfField: "restrained", motionBlur: "deterministic-subframe", volumetricLight: "low-density", particles: 48 } }
});

export function createProjectiveChapterScene(documentRef, sceneDefinition) {
  return createTopologyChapterScene(documentRef, sceneDefinition, projectiveChapter);
}

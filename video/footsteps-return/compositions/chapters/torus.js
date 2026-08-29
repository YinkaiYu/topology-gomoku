import { createTopologyChapterScene, defineChapterScene } from "../../src/runtime/topology-surfaces.js";

export const torusChapter = defineChapterScene({
  id: "torus",
  liveRender: { adapter: "GameRenderAdapter", source: "./render-game.html?sourceRoot=./assets/game-source", topology: "torus", demos: ["two-seam-diagonal"], canvas: "single-persistent", alpha: true, approved: true },
  identity: { light: "#385f78", cameraPath: "dual-axis-orbit" },
  evidence: { kind: "double-cycle", cycles: 2, edgeAction: "both-opposite-pairs-preserved" },
  entryTransition: { kind: "match-cut" },
  exitOcclusion: { kind: "surface-occlusion", geometry: "torus-aperture" },
  morphMode: "native",
  camera: {
    from: { scale: 0.95, x: 0, y: 1, z: 0 },
    formed: { scale: 1.015, x: 8, y: -5, z: 2 },
    rotation: { scale: 1.025, x: 13, y: 13, z: 4 }
  },
  surface: { engine: "three", role: "photographic-shadow-only", mapping: "TopologyMorph.surfacePoint", subdivisions: [96, 72], effects: { antialias: "multisample", depthOfField: "restrained", motionBlur: "deterministic-subframe", volumetricLight: "low-density", particles: 48 } }
});

export function createTorusChapterScene(documentRef, sceneDefinition) {
  return createTopologyChapterScene(documentRef, sceneDefinition, torusChapter);
}

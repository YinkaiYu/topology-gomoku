import { createTopologyChapterScene, defineChapterScene } from "../../src/runtime/topology-surfaces.js";

export const sphereChapter = defineChapterScene({
  id: "sphere",
  liveRender: { adapter: "GameRenderAdapter", source: "./render-game.html?sourceRoot=./assets/game-source", topology: "sphere", demos: ["adjacent-edge-turn"], canvas: "single-persistent", alpha: true, approved: true },
  identity: { light: "#c79244", cameraPath: "adjacent-polar-arc" },
  evidence: { kind: "adjacent-edge-continuation", adjacentEdgePairs: 2, edgeAction: "adjacent-pairs" },
  entryTransition: { kind: "match-cut" },
  exitOcclusion: { kind: "surface-occlusion", geometry: "sphere-horizon" },
  morphMode: "native",
  camera: {
    from: { scale: 0.945, x: 1, y: 0, z: 0 },
    formed: { scale: 1.01, x: 7, y: -6, z: -2 },
    rotation: { scale: 1.025, x: 10, y: 14, z: -4 }
  },
  surface: { engine: "three", role: "photographic-shadow-only", mapping: "TopologyMorph.surfacePoint", subdivisions: [96, 72], effects: { antialias: "multisample", depthOfField: "restrained", motionBlur: "deterministic-subframe", volumetricLight: "low-density", particles: 48 } }
});

export function createSphereChapterScene(documentRef, sceneDefinition) {
  return createTopologyChapterScene(documentRef, sceneDefinition, sphereChapter);
}

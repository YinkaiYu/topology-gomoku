import { createTopologyChapterScene, defineChapterScene } from "../../src/runtime/topology-surfaces.js";

export const planeChapter = defineChapterScene({
  id: "plane",
  liveRender: { adapter: "GameRenderAdapter", source: "./render-game.html?sourceRoot=./assets/game-source", topology: "plane", demos: ["ordinary-five"], canvas: "single-persistent", alpha: true, approved: true },
  identity: { light: "#21302c", cameraPath: "suspended-plane-lift" },
  evidence: { kind: "finite-plane", cycles: 0, edgeAction: "bounded" },
  entryTransition: { kind: "match-cut" },
  exitOcclusion: { kind: "surface-occlusion", geometry: "plane-shadow" },
  morphMode: "identity",
  camera: {
    from: { scale: 0.96, x: 0, y: 0, z: 0 },
    formed: { scale: 1.01, x: 7, y: -4, z: -1.4 },
    rotation: { scale: 1.015, x: 11, y: 4, z: -2.2 }
  },
  surface: { engine: "game-render-adapter", role: "identity-board", mapping: "TopologyMorph.surfacePoint" }
});

export function createPlaneChapterScene(documentRef, sceneDefinition) {
  return createTopologyChapterScene(documentRef, sceneDefinition, planeChapter);
}

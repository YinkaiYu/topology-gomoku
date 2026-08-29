import { createSceneElement } from "./shared/scene.js";

export const introTiming = Object.freeze({
  boardAt: 0.24,
  boardDuration: 1.56,
  adjacencyAt: 2.45,
  adjacencyDuration: 1.34,
  disappearAt: 5.86,
  disappearDuration: 1.18,
  hiddenHeroAt: 8.4,
  returnAt: 10.62,
  returnDuration: 2.24,
  revealHeroAt: 14.2
});

function decorative(documentRef, className) {
  const element = documentRef.createElement("div");
  element.className = className;
  element.dataset.layoutIgnore = "";
  element.setAttribute("aria-hidden", "true");
  return element;
}

export function createIntroScene(documentRef, sceneDefinition) {
  const composition = documentRef.createElement("div");
  composition.className = "intro-composition";
  composition.setAttribute("aria-hidden", "true");

  const darkness = decorative(documentRef, "intro-composition__darkness");
  const board = decorative(documentRef, "intro-board-edge");
  board.dataset.introBoardEdge = "";
  board.dataset.boardSource = "game-render-adapter";
  const gameFrame = documentRef.createElement("iframe");
  gameFrame.className = "intro-board-edge__game-render";
  gameFrame.dataset.introGameRender = "";
  gameFrame.src = "./render-game.html?sourceRoot=./assets/game-source";
  gameFrame.title = "真实游戏棋盘渲染层";
  gameFrame.setAttribute("tabindex", "-1");
  gameFrame.setAttribute("aria-hidden", "true");
  board.append(gameFrame);

  const adjacency = decorative(documentRef, "intro-hidden-adjacency");
  adjacency.dataset.introHiddenAdjacency = "";
  const fog = decorative(documentRef, "intro-hidden-adjacency__fog");
  adjacency.append(fog);

  composition.append(darkness, board, adjacency);
  return createSceneElement(documentRef, sceneDefinition, composition);
}

function waitForAdapter(frame) {
  if (frame.contentWindow?.gameRender) {
    return Promise.resolve(frame.contentWindow.gameRender);
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("intro game render adapter load timeout")), 5000);
    frame.addEventListener("load", () => {
      clearTimeout(timeout);
      if (!frame.contentWindow?.gameRender) {
        reject(new Error("intro game render adapter is unavailable"));
        return;
      }
      resolve(frame.contentWindow.gameRender);
    }, { once: true });
  });
}

export async function prepareIntroScene(scene) {
  const frame = scene?.querySelector?.("iframe[data-intro-game-render]");
  if (!frame) {
    throw new Error("intro scene needs the real game render adapter iframe");
  }
  const adapter = await waitForAdapter(frame);
  await adapter.selectShot("plane", { demo: "ordinary-five" });
  const status = await adapter.render({
    topology: "plane",
    shot: "helper",
    demo: "ordinary-five",
    lessonStep: 5,
    dropProgress: 0,
    breathPhase: 0.68,
    morphProgress: 0,
    rotation: { x: 0, y: 0, z: 0 },
    freezeRotation: true
  });
  if (!adapter.renderReady().ready) {
    throw new Error("intro real game canvas is not ready");
  }
  scene.dataset.introRenderReady = "true";
  scene.dataset.introTopology = "plane";
  return Object.freeze(status);
}

export function addIntroReveal(timeline, scene, start) {
  const board = scene.querySelector("[data-intro-board-edge]");
  const adjacency = scene.querySelector("[data-intro-hidden-adjacency]");
  const { boardAt, boardDuration, adjacencyAt, adjacencyDuration, disappearAt, disappearDuration, returnAt, returnDuration } = introTiming;

  timeline.to(board, {
    opacity: 0.92,
    x: 0,
    y: 0,
    scale: 1,
    duration: boardDuration,
    ease: "power2.out"
  }, start + boardAt);
  timeline.to(adjacency, {
    opacity: 0.16,
    scale: 1,
    duration: adjacencyDuration,
    ease: "sine.out"
  }, start + adjacencyAt);
  timeline.to(adjacency, {
    opacity: 0.94,
    scale: 1.01,
    duration: disappearDuration,
    ease: "power1.in"
  }, start + disappearAt);
  timeline.to(adjacency, {
    opacity: 0.04,
    scale: 1,
    duration: returnDuration,
    ease: "power3.out"
  }, start + returnAt);
}

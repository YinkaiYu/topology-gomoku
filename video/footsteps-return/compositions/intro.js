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
  board.dataset.boardSource = "real-html-board";

  const surface = decorative(documentRef, "intro-board-edge__surface");
  const boundary = decorative(documentRef, "intro-board-edge__boundary");
  const stones = decorative(documentRef, "intro-board-edge__stones");
  for (let index = 0; index < 5; index += 1) {
    const stone = decorative(documentRef, "intro-board-edge__stone");
    stone.style.setProperty("--stone-index", String(index));
    stones.append(stone);
  }
  board.append(surface, boundary, stones);

  const adjacency = decorative(documentRef, "intro-hidden-adjacency");
  adjacency.dataset.introHiddenAdjacency = "";
  const leftAperture = decorative(documentRef, "intro-hidden-adjacency__aperture intro-hidden-adjacency__aperture--left");
  const rightAperture = decorative(documentRef, "intro-hidden-adjacency__aperture intro-hidden-adjacency__aperture--right");
  const refraction = decorative(documentRef, "intro-hidden-adjacency__refraction");
  adjacency.append(leftAperture, rightAperture, refraction);

  composition.append(darkness, board, adjacency);
  return createSceneElement(documentRef, sceneDefinition, composition);
}

export function addIntroReveal(timeline, scene, start) {
  const board = scene.querySelector("[data-intro-board-edge]");
  const adjacency = scene.querySelector("[data-intro-hidden-adjacency]");
  const refraction = scene.querySelector(".intro-hidden-adjacency__refraction");
  const { boardAt, boardDuration, adjacencyAt, adjacencyDuration, disappearAt, disappearDuration, returnAt, returnDuration } = introTiming;

  timeline.fromTo(board, { opacity: 0, x: 34, y: 18, scale: 1.012 }, {
    opacity: 0.92,
    x: 0,
    y: 0,
    scale: 1,
    duration: boardDuration,
    ease: "power2.out",
    immediateRender: false
  }, start + boardAt);
  timeline.fromTo(adjacency, { opacity: 0, scale: 0.985 }, {
    opacity: 0.82,
    scale: 1,
    duration: adjacencyDuration,
    ease: "sine.out",
    immediateRender: false
  }, start + adjacencyAt);
  timeline.to(adjacency, {
    opacity: 0,
    scale: 1.01,
    duration: disappearDuration,
    ease: "power1.in"
  }, start + disappearAt);
  timeline.fromTo(adjacency, { opacity: 0, scale: 1.012 }, {
    opacity: 0.86,
    scale: 1,
    duration: returnDuration,
    ease: "power3.out",
    immediateRender: false
  }, start + returnAt);
  timeline.fromTo(refraction, { x: -24, opacity: 0.18 }, {
    x: 18,
    opacity: 0.72,
    duration: 5.2,
    ease: "sine.inOut",
    immediateRender: false
  }, start + returnAt + 0.18);
}

import { createSceneElement } from "./shared/scene.js";

const chapterAppearance = Object.freeze({
  plane: Object.freeze({ light: "#21302c", silhouette: "plane.svg" }),
  cylinder: Object.freeze({ light: "#3f8c87", silhouette: "cylinder.svg" }),
  torus: Object.freeze({ light: "#3f8c87", silhouette: "torus.svg" }),
  mobius: Object.freeze({ light: "#d95b4f", silhouette: "mobius.svg" }),
  klein: Object.freeze({ light: "#7f6ca8", silhouette: "klein.svg" }),
  projective: Object.freeze({ light: "#8b7556", silhouette: "projective.svg" }),
  sphere: Object.freeze({ light: "#c79244", silhouette: "sphere.svg" })
});

export const chapterTitleTiming = Object.freeze({
  ambient: Object.freeze({ volumeAt: 0.14, volumeDuration: 1.15, silhouetteAt: 0.2, silhouetteDuration: 0.92 }),
  phaseA: Object.freeze({ actAt: 0.24, actDuration: 0.42, chapterAt: 0.3, chapterDuration: 0.58, heroAt: 1.04 }),
  swap: Object.freeze({ at: 1.34, duration: 0.34, blur: 3 }),
  phaseB: Object.freeze({ heroAt: 1.95, readableUntil: 2.38 })
});

function textElement(documentRef, className, attribute, text) {
  const element = documentRef.createElement("div");
  element.className = className;
  element.dataset[attribute] = "";
  element.textContent = text;
  return element;
}

export function createChapterTitleScene(documentRef, sceneDefinition, chapter) {
  const appearance = chapterAppearance[chapter.id];
  if (!appearance) {
    throw new Error(`unknown chapter appearance ${chapter.id}`);
  }

  const card = documentRef.createElement("div");
  card.className = "chapter-card";
  card.dataset.chapterCard = chapter.id;
  card.style.setProperty("--chapter-light", appearance.light);

  const volume = documentRef.createElement("div");
  volume.className = "chapter-card__volume";
  volume.dataset.chapterVolume = "";
  volume.dataset.revealOpacity = "0.5";
  volume.dataset.layoutIgnore = "";
  volume.setAttribute("aria-hidden", "true");

  const silhouette = documentRef.createElement("img");
  silhouette.className = "chapter-card__silhouette";
  silhouette.dataset.chapterSilhouette = "";
  silhouette.dataset.revealOpacity = chapter.id === "plane" ? "0.075" : "0.24";
  silhouette.dataset.layoutIgnore = "";
  silhouette.src = `/assets/topologies/${appearance.silhouette}`;
  silhouette.alt = "";
  silhouette.setAttribute("aria-hidden", "true");

  const copy = documentRef.createElement("div");
  copy.className = "chapter-card__copy";
  const topSlot = documentRef.createElement("div");
  topSlot.className = "chapter-card__top-slot";
  topSlot.dataset.chapterTopSlot = "";
  const act = textElement(documentRef, "chapter-card__act", "chapterAct", chapter.title.act);
  const chapterName = textElement(documentRef, "chapter-card__chapter", "chapterName", chapter.title.chapter);
  const topology = textElement(documentRef, "chapter-card__topology", "topologyName", chapter.title.topology);
  chapterName.dataset.fitText = "";
  chapterName.dataset.maxWidth = "1520";
  topology.dataset.fitText = "";
  topology.dataset.maxWidth = "1520";
  topSlot.append(act, topology);
  copy.append(topSlot, chapterName);

  card.append(volume, silhouette, copy);
  return createSceneElement(documentRef, sceneDefinition, card);
}

export function addChapterTitleReveal(timeline, scene, start) {
  const volume = scene.querySelector("[data-chapter-volume]");
  const silhouette = scene.querySelector("[data-chapter-silhouette]");
  const act = scene.querySelector("[data-chapter-act]");
  const chapter = scene.querySelector("[data-chapter-name]");
  const topology = scene.querySelector("[data-topology-name]");

  const { ambient, phaseA, swap } = chapterTitleTiming;
  timeline.to(volume, { opacity: Number(volume.dataset.revealOpacity), scale: 1, duration: ambient.volumeDuration, ease: "sine.out" }, start + ambient.volumeAt);
  timeline.to(silhouette, { opacity: Number(silhouette.dataset.revealOpacity), scale: 1, duration: ambient.silhouetteDuration, ease: "power1.out" }, start + ambient.silhouetteAt);
  timeline.to(act, { opacity: 1, y: 0, duration: phaseA.actDuration, ease: "power2.out" }, start + phaseA.actAt);
  timeline.to(chapter, { opacity: 1, y: 0, duration: phaseA.chapterDuration, ease: "power3.out" }, start + phaseA.chapterAt);
  timeline.to(act, { opacity: 0, filter: `blur(${swap.blur}px)`, duration: swap.duration, ease: "sine.inOut" }, start + swap.at);
  timeline.to(topology, { opacity: 1, filter: "blur(0px)", duration: swap.duration, ease: "sine.inOut" }, start + swap.at);
}

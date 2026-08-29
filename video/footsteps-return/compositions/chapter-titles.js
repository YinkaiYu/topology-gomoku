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
  const act = textElement(documentRef, "chapter-card__act", "chapterAct", chapter.title.act);
  const chapterName = textElement(documentRef, "chapter-card__chapter", "chapterName", chapter.title.chapter);
  const topology = textElement(documentRef, "chapter-card__topology", "topologyName", chapter.title.topology);
  chapterName.dataset.fitText = "";
  chapterName.dataset.maxWidth = "1520";
  topology.dataset.fitText = "";
  topology.dataset.maxWidth = "1520";
  copy.append(act, chapterName, topology);

  card.append(volume, silhouette, copy);
  return createSceneElement(documentRef, sceneDefinition, card);
}

export function addChapterTitleReveal(timeline, scene, start) {
  const volume = scene.querySelector("[data-chapter-volume]");
  const silhouette = scene.querySelector("[data-chapter-silhouette]");
  const act = scene.querySelector("[data-chapter-act]");
  const chapter = scene.querySelector("[data-chapter-name]");
  const topology = scene.querySelector("[data-topology-name]");

  timeline.to(volume, { opacity: Number(volume.dataset.revealOpacity), scale: 1, duration: 1.15, ease: "sine.out" }, start + 0.14);
  timeline.to(silhouette, { opacity: Number(silhouette.dataset.revealOpacity), scale: 1, duration: 0.92, ease: "power1.out" }, start + 0.2);
  timeline.to(act, { opacity: 1, y: 0, duration: 0.54, ease: "power2.out" }, start + 0.34);
  timeline.to(chapter, { opacity: 1, y: 0, duration: 0.72, ease: "power3.out" }, start + 0.43);
  timeline.to(topology, { opacity: 1, y: 0, duration: 0.62, ease: "sine.out" }, start + 0.58);
}

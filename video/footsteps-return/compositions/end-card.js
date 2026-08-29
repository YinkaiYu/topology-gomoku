import { createSceneElement } from "./shared/scene.js";

export const endCardTiming = Object.freeze({
  ruleAt: 0.18,
  ruleDuration: 0.72,
  titleAt: 0.32,
  titleDuration: 0.92,
  subtitleAt: 0.68,
  subtitleDuration: 0.74,
  logoAt: 0.84,
  logoDuration: 1.08,
  heroAt: 2.65
});

export function createEndCardScene(documentRef, sceneDefinition) {
  const card = documentRef.createElement("div");
  card.className = "end-card";

  const glow = documentRef.createElement("div");
  glow.className = "end-card__glow";
  glow.dataset.layoutIgnore = "";
  glow.setAttribute("aria-hidden", "true");

  const identity = documentRef.createElement("div");
  identity.className = "end-card__identity";

  const copy = documentRef.createElement("div");
  copy.className = "end-card__copy";
  const title = documentRef.createElement("h1");
  title.className = "end-card__title";
  title.dataset.gameTitleMark = "";
  title.textContent = "拓扑五子棋";
  const subtitle = documentRef.createElement("p");
  subtitle.className = "end-card__subtitle";
  subtitle.dataset.endCardSubtitle = "";
  subtitle.textContent = "章节预告 PV—「足迹回环」";
  copy.append(title, subtitle);

  const divider = documentRef.createElement("div");
  divider.className = "end-card__divider";
  divider.dataset.endCardRule = "";
  divider.setAttribute("aria-hidden", "true");

  const institute = documentRef.createElement("div");
  institute.className = "end-card__institute";
  const logo = documentRef.createElement("img");
  logo.className = "end-card__iop-logo";
  logo.dataset.iopMark = "";
  logo.src = "/assets/brand/iop-logo.png";
  logo.alt = "中国科学院物理研究所标识";
  institute.append(logo);

  identity.append(copy, divider, institute);
  card.append(glow, identity);
  return createSceneElement(documentRef, sceneDefinition, card);
}

export function addEndCardReveal(timeline, scene, start) {
  const rule = scene.querySelector("[data-end-card-rule]");
  const title = scene.querySelector("[data-game-title-mark]");
  const subtitle = scene.querySelector("[data-end-card-subtitle]");
  const logo = scene.querySelector("[data-iop-mark]");
  const timing = endCardTiming;

  timeline.from(rule, {
    scaleY: 0,
    duration: timing.ruleDuration,
    ease: "power1.out",
    immediateRender: false
  }, start + timing.ruleAt);
  timeline.from(title, {
    opacity: 0,
    y: 30,
    filter: "blur(10px)",
    duration: timing.titleDuration,
    ease: "power3.out",
    immediateRender: false
  }, start + timing.titleAt);
  timeline.from(subtitle, {
    opacity: 0,
    y: 18,
    duration: timing.subtitleDuration,
    ease: "sine.out",
    immediateRender: false
  }, start + timing.subtitleAt);
  timeline.from(logo, {
    opacity: 0,
    scale: 0.94,
    filter: "blur(12px)",
    duration: timing.logoDuration,
    ease: "power2.out",
    immediateRender: false
  }, start + timing.logoAt);
}

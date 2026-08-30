const freeze = Object.freeze;

export const TRANSITION_DURATION = 0.62;
export const CINEMATIC_TRANSITION_STAGES = freeze([
  "spatial-occlusion",
  "controlled-focus-pull",
  "color-dip-black",
  "silhouette-match-cut"
]);

const ANIMATED_PROPERTIES = freeze(["opacity", "filter", "scale"]);
const BLACK_DIP = freeze({ peak: 0.74, at: 0.22, duration: 0.18, releaseAt: 0.4, releaseDuration: 0.22 });
const FOCUS_PULL = freeze({ outgoingBlur: 4, incomingBlur: 6, ease: "sine.inOut" });

const profile = (id, shape, clipPath, maskImage = "none") => freeze({
  id,
  shape,
  clipPath,
  maskImage,
  width: 720,
  height: 720
});

export const TRANSITION_GEOMETRIES = freeze({
  "board-edge": profile("board-edge", "edge", "polygon(3% 16%, 94% 4%, 100% 84%, 11% 98%)"),
  "plane-silhouette": profile("plane-silhouette", "plane", "polygon(5% 17%, 95% 6%, 91% 91%, 8% 84%)"),
  "plane-board": profile("plane-board", "plane", "polygon(8% 12%, 92% 12%, 92% 88%, 8% 88%)"),
  "plane-shadow": profile("plane-shadow", "shadow-plane", "polygon(8% 18%, 92% 12%, 89% 86%, 11% 92%)"),
  "cylinder-silhouette": profile("cylinder-silhouette", "cylinder", "ellipse(40% 32% at 50% 50%)"),
  "cylinder-board": profile("cylinder-board", "cylinder", "ellipse(39% 30% at 50% 50%)"),
  "cylinder-section": profile("cylinder-section", "cylinder-section", "ellipse(24% 18% at 50% 50%)", "radial-gradient(ellipse 24% 18% at 50% 50%, #000 0 88%, transparent 100%)"),
  "torus-silhouette": profile("torus-silhouette", "torus", "ellipse(39% 34% at 50% 50%)"),
  "torus-board": profile("torus-board", "torus", "ellipse(38% 33% at 50% 50%)"),
  "torus-aperture": profile("torus-aperture", "torus-aperture", "ellipse(24% 18% at 50% 50%)", "radial-gradient(ellipse 24% 18% at 50% 50%, transparent 0 43%, #000 47% 72%, transparent 76%)"),
  "torus-inner-ring": profile("torus-inner-ring", "torus-inner-ring", "ellipse(24% 18% at 50% 50%)", "radial-gradient(ellipse 24% 18% at 50% 50%, transparent 0 43%, #000 47% 72%, transparent 76%)"),
  "mobius-silhouette": profile("mobius-silhouette", "mobius", "ellipse(38% 31% at 50% 50%)"),
  "mobius-board": profile("mobius-board", "mobius", "ellipse(36% 30% at 50% 50%)"),
  "mobius-ribbon": profile("mobius-ribbon", "mobius-ribbon", "polygon(19% 38%, 34% 18%, 70% 13%, 87% 39%, 68% 80%, 30% 84%)"),
  "mobius-twist-center": profile("mobius-twist-center", "mobius-twist-center", "ellipse(18% 27% at 50% 50%)", "radial-gradient(ellipse 18% 27% at 50% 50%, #000 0 82%, transparent 100%)"),
  "mobius-grazing-mirror": profile("mobius-grazing-mirror", "mobius-grazing-mirror", "polygon(26% 18%, 73% 24%, 86% 51%, 68% 79%, 28% 84%, 13% 52%)"),
  "klein-silhouette": profile("klein-silhouette", "klein", "ellipse(37% 34% at 50% 50%)"),
  "klein-board": profile("klein-board", "klein", "ellipse(35% 32% at 50% 50%)"),
  "klein-neck": profile("klein-neck", "klein-neck", "ellipse(22% 30% at 50% 50%)", "radial-gradient(ellipse 22% 30% at 50% 50%, #000 0 84%, transparent 100%)"),
  "klein-cross": profile("klein-cross", "klein-cross", "polygon(42% 7%, 58% 7%, 64% 37%, 92% 43%, 92% 57%, 64% 63%, 58% 93%, 42% 93%, 36% 63%, 8% 57%, 8% 43%, 36% 37%)"),
  "projective-silhouette": profile("projective-silhouette", "projective", "ellipse(39% 35% at 50% 50%)"),
  "projective-board": profile("projective-board", "projective", "ellipse(37% 33% at 50% 50%)"),
  "projective-crosscap": profile("projective-crosscap", "projective-crosscap", "ellipse(24% 32% at 50% 50%)", "radial-gradient(ellipse 24% 32% at 50% 50%, #000 0 83%, transparent 100%)"),
  "projective-reflection": profile("projective-reflection", "projective-reflection", "polygon(17% 47%, 34% 14%, 67% 14%, 84% 47%, 67% 86%, 34% 86%)"),
  "sphere-silhouette": profile("sphere-silhouette", "sphere", "circle(38% at 50% 50%)"),
  "sphere-board": profile("sphere-board", "sphere", "circle(36% at 50% 50%)"),
  "sphere-horizon": profile("sphere-horizon", "sphere-horizon", "ellipse(31% 16% at 50% 50%)", "radial-gradient(ellipse 31% 16% at 50% 50%, #000 0 84%, transparent 100%)"),
  "gallery-sphere": profile("gallery-sphere", "gallery-sphere", "circle(37% at 50% 50%)", "radial-gradient(circle at 50% 50%, #000 0 78%, transparent 82%)"),
  "outro-darkness": profile("outro-darkness", "dark-aperture", "circle(25% at 50% 50%)", "radial-gradient(circle at 50% 50%, #000 0 74%, transparent 80%)"),
  "end-card-darkness": profile("end-card-darkness", "closing-light", "circle(23% at 50% 50%)", "radial-gradient(circle at 50% 50%, #000 0 70%, transparent 77%)")
});

function selector(attribute, value) {
  return `[${attribute}="${value}"]`;
}

const transition = (from, to, occlusionSource, matchSource, matchTarget, note) => {
  const sourceGeometry = TRANSITION_GEOMETRIES[matchSource] ?? TRANSITION_GEOMETRIES["board-edge"];
  const targetGeometry = TRANSITION_GEOMETRIES[matchTarget] ?? TRANSITION_GEOMETRIES["board-edge"];
  const occlusionGeometry = TRANSITION_GEOMETRIES[occlusionSource] ?? sourceGeometry;
  const matchId = `${matchSource}->${matchTarget}`;
  return freeze({
    id: `${from}--${to}`,
    from,
    to,
    kind: "cinematic",
    family: "cinematic-spatial-match",
    duration: TRANSITION_DURATION,
    stages: CINEMATIC_TRANSITION_STAGES,
    animatedProperties: ANIMATED_PROPERTIES,
    matchId,
    occlusion: freeze({
      mode: "real-geometry",
      source: occlusionSource,
      selector: selector("data-occlusion", occlusionSource),
      geometry: occlusionGeometry
    }),
    match: freeze({
      id: matchId,
      outgoingSelector: selector("data-match-shape", matchSource),
      incomingSelector: selector("data-match-shape", matchTarget),
      outgoingGeometry: sourceGeometry,
      incomingGeometry: targetGeometry
    }),
    focusPull: FOCUS_PULL,
    colorDip: BLACK_DIP,
    silhouetteMatch: freeze({ source: matchSource, target: matchTarget, note })
  });
};

export const transitionContracts = freeze([
  transition("intro", "chapter-card-plane", "intro-board-edge", "board-edge", "plane-silhouette", "board edge narrows into the first plane contour"),
  transition("chapter-card-plane", "chapter-plane", "plane-silhouette", "plane-silhouette", "plane-board", "the card contour resolves to the real flat board"),
  transition("chapter-plane", "chapter-card-cylinder", "plane-shadow", "plane-board", "cylinder-silhouette", "the lifted board falls behind its first wrapped wall"),
  transition("chapter-card-cylinder", "chapter-cylinder", "cylinder-section", "cylinder-silhouette", "cylinder-board", "the cylinder card opens on the same wall contour"),
  transition("chapter-cylinder", "chapter-card-torus", "cylinder-section", "cylinder-section", "torus-inner-ring", "a cylinder section becomes the torus inner ring"),
  transition("chapter-card-torus", "chapter-torus", "torus-inner-ring", "torus-silhouette", "torus-board", "the torus contour settles into the real board"),
  transition("chapter-torus", "chapter-card-mobius", "torus-aperture", "torus-inner-ring", "mobius-twist-center", "the torus aperture rolls into the Möbius twist center"),
  transition("chapter-card-mobius", "chapter-mobius", "mobius-twist-center", "mobius-silhouette", "mobius-board", "the twist contour resolves to the real board"),
  transition("chapter-mobius", "chapter-card-klein", "mobius-ribbon", "mobius-grazing-mirror", "klein-cross", "a grazing Möbius reflection meets the Klein crossing"),
  transition("chapter-card-klein", "chapter-klein", "klein-cross", "klein-silhouette", "klein-board", "the cross contour opens into the real Klein board"),
  transition("chapter-klein", "chapter-card-projective", "klein-neck", "klein-cross", "projective-crosscap", "the Klein neck darkens into the crosscap contour"),
  transition("chapter-card-projective", "chapter-projective", "projective-crosscap", "projective-silhouette", "projective-board", "the crosscap card resolves to the real board"),
  transition("chapter-projective", "chapter-card-sphere", "projective-crosscap", "projective-reflection", "sphere-horizon", "the reflected crosscap closes into a spherical horizon"),
  transition("chapter-card-sphere", "chapter-sphere", "sphere-horizon", "sphere-silhouette", "sphere-board", "the horizon contour resolves to the real board"),
  transition("chapter-sphere", "seven-world-gallery", "sphere-horizon", "sphere-horizon", "gallery-sphere", "the final horizon opens into the dark gallery"),
  transition("seven-world-gallery", "outro", "gallery-sphere", "gallery-sphere", "outro-darkness", "the withdrawn gallery leaves an unmarked dark field"),
  transition("outro", "end-card", "outro-darkness", "outro-darkness", "end-card-darkness", "the last black dip leaves the title card its cadence")
]);

const contractByPair = new Map(transitionContracts.map((contract) => [`${contract.from}--${contract.to}`, contract]));

export function getTransitionContract(from, to) {
  const contract = contractByPair.get(`${from}--${to}`);
  if (!contract) throw new Error(`missing cinematic transition contract: ${from} -> ${to}`);
  return contract;
}

function requireElement(value, label) {
  if (!value || typeof value.querySelector !== "function") throw new TypeError(`${label} must be a DOM element`);
}

function createTransitionLayer(documentRef, stage, contract) {
  requireElement(stage, "transition stage");
  const layer = documentRef.createElement("div");
  layer.className = "pv-transition-layer";
  layer.dataset.pvTransitionLayer = contract.id;
  layer.dataset.transitionFrom = contract.from;
  layer.dataset.transitionTo = contract.to;
  layer.dataset.transitionFamily = contract.family;
  layer.dataset.transitionOcclusion = contract.occlusion.source;
  layer.dataset.occlusionSelector = contract.occlusion.selector;
  layer.dataset.transitionMatch = contract.matchId;
  layer.dataset.transitionSource = contract.silhouetteMatch.source;
  layer.dataset.transitionTarget = contract.silhouetteMatch.target;
  layer.setAttribute("aria-hidden", "true");
  layer.style.position = "absolute";
  layer.style.inset = "0";
  layer.style.zIndex = "20";
  layer.style.pointerEvents = "none";
  layer.style.backgroundColor = "#060908";
  layer.style.opacity = "0";
  stage.append(layer);
  return layer;
}

function fallbackGeometry(documentRef, scene, attribute, value) {
  const element = documentRef.createElement("span");
  element.className = "pv-transition-geometry pv-transition-geometry--fallback";
  element.dataset[attribute === "data-match-shape" ? "matchShape" : "occlusion"] = value;
  element.setAttribute("aria-hidden", "true");
  scene.append(element);
  return element;
}

function resolveGeometry(documentRef, scene, attribute, value) {
  requireElement(scene, "transition scene");
  const candidates = [...scene.querySelectorAll(selector(attribute, value))];
  if (attribute === "data-occlusion") {
    const chapterShape = candidates.find((element) => element.matches(".chapter-exit-occlusion__shape"));
    if (chapterShape) return chapterShape;
  }
  return candidates[0] ?? fallbackGeometry(documentRef, scene, attribute, value);
}

function consumeGeometry(element, geometry, role) {
  element.classList.add("pv-transition-geometry");
  element.dataset.transitionGeometry = geometry.id;
  element.dataset.transitionGeometryRole = role;
  element.dataset.transitionGeometryShape = geometry.shape;
  element.style.clipPath = geometry.clipPath;
  element.style.webkitClipPath = geometry.clipPath;
  element.style.maskImage = geometry.maskImage;
  element.style.webkitMaskImage = geometry.maskImage;
  element.style.setProperty("--transition-geometry-width", `${geometry.width}px`);
  element.style.setProperty("--transition-geometry-height", `${geometry.height}px`);
  return element;
}

function animateGeometry(timeline, element, start, duration, persistent) {
  const endOpacity = persistent ? 0.2 : 0;
  timeline.fromTo(element, {
    opacity: 0,
    scale: 0.94,
    filter: "brightness(0.18) blur(8px)"
  }, {
    opacity: 0.86,
    scale: 1,
    filter: "brightness(0.62) blur(0px)",
    duration: duration * 0.58,
    ease: "sine.inOut",
    immediateRender: false
  }, start);
  timeline.to(element, {
    opacity: endOpacity,
    duration: duration * 0.28,
    ease: "sine.inOut",
    immediateRender: false
  }, start + duration * 0.58);
}

function isPersistentGeometry(element) {
  return element.matches("[data-chapter-exit-occlusion] .chapter-exit-occlusion__shape, [data-chapter-board], [data-intro-board-edge], [data-gallery-shape]");
}

function consumeContractGeometry(documentRef, from, to, contract, layer) {
  const occlusion = resolveGeometry(documentRef, from, "data-occlusion", contract.occlusion.source);
  const outgoing = resolveGeometry(documentRef, from, "data-match-shape", contract.silhouetteMatch.source);
  const incoming = resolveGeometry(documentRef, to, "data-match-shape", contract.silhouetteMatch.target);
  consumeGeometry(occlusion, contract.occlusion.geometry, "occlusion");
  occlusion.dataset.transitionOcclusionConsumed = "true";
  occlusion.dataset.transitionOcclusionContract = contract.occlusion.source;
  consumeGeometry(outgoing, contract.match.outgoingGeometry, "outgoing-match");
  consumeGeometry(incoming, contract.match.incomingGeometry, "incoming-match");
  layer.dataset.occlusionConsumed = "true";
  layer.dataset.transitionOcclusionGeometry = contract.occlusion.geometry.id;
  layer.dataset.transitionOcclusionShape = contract.occlusion.geometry.shape;
  layer.dataset.transitionOcclusionNode = occlusion.className || occlusion.tagName.toLowerCase();
  layer.dataset.transitionGeometry = `${contract.match.outgoingGeometry.id}|${contract.match.incomingGeometry.id}`;
  layer.dataset.transitionShape = `${contract.match.outgoingGeometry.shape}->${contract.match.incomingGeometry.shape}`;
  return { occlusion, outgoing, incoming };
}

export function addCinematicTransition(timeline, {
  document: documentRef,
  stage,
  from,
  to,
  contract,
  start,
  duration = TRANSITION_DURATION
}) {
  if (!timeline?.to || !timeline?.fromTo || !timeline?.set) throw new TypeError("GSAP timeline is required for cinematic transitions");
  requireElement(from, "transition source");
  requireElement(to, "transition target");
  const layer = createTransitionLayer(documentRef, stage, contract);
  const { occlusion, outgoing, incoming } = consumeContractGeometry(documentRef, from, to, contract, layer);
  const focus = contract.focusPull;
  const dip = contract.colorDip;
  timeline.set(layer, { opacity: 0, scale: 1, filter: "blur(0px)" }, start);
  timeline.fromTo(from, { filter: "blur(0px)" }, {
    filter: `blur(${focus.outgoingBlur}px)`,
    opacity: contract.from === "seven-world-gallery" ? 0.2 : 0,
    duration,
    ease: focus.ease,
    immediateRender: false
  }, start);
  timeline.fromTo(to, { filter: `blur(${focus.incomingBlur}px)`, opacity: 0 }, {
    filter: "blur(0px)",
    opacity: 1,
    duration,
    ease: focus.ease,
    immediateRender: false
  }, start);
  timeline.to(layer, { opacity: dip.peak, duration: dip.duration, ease: "power2.in", immediateRender: false }, start + dip.at);
  timeline.to(layer, { opacity: 0, duration: dip.releaseDuration, ease: "power2.out" }, start + dip.releaseAt);
  if (occlusion !== outgoing) animateGeometry(timeline, occlusion, start + duration * 0.04, duration * 0.82, true);
  animateGeometry(timeline, outgoing, start + duration * 0.08, duration * 0.82, isPersistentGeometry(outgoing));
  animateGeometry(timeline, incoming, start + duration * 0.18, duration * 0.82, isPersistentGeometry(incoming));
  return layer;
}

export function validateTransitionContracts(sceneDefinitions) {
  if (!Array.isArray(sceneDefinitions)) throw new TypeError("scene definitions must be an array");
  const expected = sceneDefinitions.slice(0, -1).map((scene, index) => `${scene.id}--${sceneDefinitions[index + 1].id}`);
  const actual = transitionContracts.map((contract) => contract.id);
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
    throw new Error("cinematic transition contracts do not cover adjacent scenes in order");
  }
  sceneDefinitions.slice(0, -1).forEach((scene, index) => {
    const next = sceneDefinitions[index + 1];
    if (scene.transition?.target !== next.id) throw new Error(`scene transition target mismatch: ${scene.id}`);
  });
  return true;
}

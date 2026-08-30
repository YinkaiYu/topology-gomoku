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
  "intro-board-edge": profile("intro-board-edge", "intro-edge", "polygon(3% 16%, 94% 4%, 100% 84%, 11% 98%)"),
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

const matchGeometry = (id, outgoingGeometryId, incomingGeometryId) => freeze({
  id,
  outgoingGeometryId,
  incomingGeometryId
});

export const TRANSITION_MATCH_GEOMETRIES = freeze(Object.fromEntries([
  matchGeometry("board-edge->plane-silhouette", "board-edge", "plane-silhouette"),
  matchGeometry("plane-silhouette->plane-board", "plane-silhouette", "plane-board"),
  matchGeometry("plane-board->cylinder-silhouette", "plane-board", "cylinder-silhouette"),
  matchGeometry("cylinder-silhouette->cylinder-board", "cylinder-silhouette", "cylinder-board"),
  matchGeometry("cylinder-section->torus-inner-ring", "cylinder-section", "torus-inner-ring"),
  matchGeometry("torus-silhouette->torus-board", "torus-silhouette", "torus-board"),
  matchGeometry("torus-inner-ring->mobius-twist-center", "torus-inner-ring", "mobius-twist-center"),
  matchGeometry("mobius-silhouette->mobius-board", "mobius-silhouette", "mobius-board"),
  matchGeometry("mobius-grazing-mirror->klein-cross", "mobius-grazing-mirror", "klein-cross"),
  matchGeometry("klein-silhouette->klein-board", "klein-silhouette", "klein-board"),
  matchGeometry("klein-cross->projective-crosscap", "klein-cross", "projective-crosscap"),
  matchGeometry("projective-silhouette->projective-board", "projective-silhouette", "projective-board"),
  matchGeometry("projective-reflection->sphere-horizon", "projective-reflection", "sphere-horizon"),
  matchGeometry("sphere-silhouette->sphere-board", "sphere-silhouette", "sphere-board"),
  matchGeometry("sphere-horizon->gallery-sphere", "sphere-horizon", "gallery-sphere"),
  matchGeometry("gallery-sphere->outro-darkness", "gallery-sphere", "outro-darkness"),
  matchGeometry("outro-darkness->end-card-darkness", "outro-darkness", "end-card-darkness")
].map((entry) => [entry.id, entry])));

function geometryResolutionError({ contractId, selector: geometrySelector, side, geometryId }) {
  return new Error(`transition ${contractId} ${side} selector "${geometrySelector}" failed to resolve geometry "${geometryId}"`);
}

function resolveGeometryProfile(geometryId, side, context) {
  const geometry = TRANSITION_GEOMETRIES[geometryId];
  if (!geometry) throw geometryResolutionError({ ...context, side, geometryId });
  return geometry;
}

export function resolveTransitionMatchGeometry(matchId, side, context) {
  const match = TRANSITION_MATCH_GEOMETRIES[matchId];
  const geometryId = side === "outgoing-match"
    ? match?.outgoingGeometryId
    : side === "incoming-match"
      ? match?.incomingGeometryId
      : null;
  if (!geometryId) throw geometryResolutionError({ ...context, side, geometryId: matchId });
  return resolveGeometryProfile(geometryId, side, context);
}

function selector(attribute, value) {
  return `[${attribute}="${value}"]`;
}

const transition = (from, to, occlusionSource, matchSource, matchTarget, note, handoff = null) => {
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
      geometryId: occlusionSource
    }),
    match: freeze({
      id: matchId,
      outgoingSelector: selector("data-match-shape", matchSource),
      incomingSelector: selector("data-match-shape", matchTarget)
    }),
    focusPull: FOCUS_PULL,
    colorDip: BLACK_DIP,
    silhouetteMatch: freeze({ source: matchSource, target: matchTarget, note }),
    handoff: handoff ? freeze(handoff) : null
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
  transition("seven-world-gallery", "outro", "gallery-sphere", "gallery-sphere", "outro-darkness", "the withdrawn gallery leaves an unmarked dark field", {
    outgoingAt: TRANSITION_DURATION,
    outgoingDuration: 2.28,
    incomingAt: 0.42,
    incomingDuration: 2.48
  }),
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
  layer.dataset.occlusionConsumed = "false";
  layer.setAttribute("aria-hidden", "true");
  layer.style.position = "absolute";
  layer.style.inset = "0";
  layer.style.zIndex = "20";
  layer.style.pointerEvents = "none";

  const dip = documentRef.createElement("div");
  dip.className = "pv-transition-dip-layer";
  dip.dataset.transitionDip = contract.id;
  dip.setAttribute("aria-hidden", "true");
  layer.append(dip);
  stage.append(layer);
  return { layer, dip };
}

function preferredGeometrySource(candidates) {
  return candidates.find((element) => element.matches(
    ".chapter-exit-occlusion__shape, [data-match-role], [data-outro-closing-light]"
  )) ?? candidates[0];
}

function resolveGeometrySource(scene, geometrySelector, contractId, side) {
  requireElement(scene, "transition scene");
  let candidates;
  try {
    candidates = [...scene.querySelectorAll(geometrySelector)];
  } catch {
    throw geometryResolutionError({ contractId, selector: geometrySelector, side, geometryId: "source-node" });
  }
  const source = preferredGeometrySource(candidates);
  if (!source) throw geometryResolutionError({ contractId, selector: geometrySelector, side, geometryId: "source-node" });
  return source;
}

function geometryBinding(contract, side, source, geometry, geometrySelector) {
  return freeze({
    contractId: contract.id,
    side,
    source,
    selector: geometrySelector,
    geometry,
    matchId: side === "occlusion" ? null : contract.matchId
  });
}

export function validateTransitionGeometryBindings(sceneRegistry, contracts = transitionContracts) {
  if (!sceneRegistry || typeof sceneRegistry !== "object") throw new TypeError("transition scene registry is required");
  const bindings = new Map();
  contracts.forEach((contract) => {
    const from = sceneRegistry[contract.from];
    const to = sceneRegistry[contract.to];
    requireElement(from, `transition ${contract.id} source scene`);
    requireElement(to, `transition ${contract.id} target scene`);
    const occlusion = geometryBinding(
      contract,
      "occlusion",
      resolveGeometrySource(from, contract.occlusion.selector, contract.id, "occlusion"),
      resolveGeometryProfile(contract.occlusion.geometryId, "occlusion", {
        contractId: contract.id,
        selector: contract.occlusion.selector
      }),
      contract.occlusion.selector
    );
    const outgoing = geometryBinding(
      contract,
      "outgoing-match",
      resolveGeometrySource(from, contract.match.outgoingSelector, contract.id, "outgoing-match"),
      resolveTransitionMatchGeometry(contract.matchId, "outgoing-match", {
        contractId: contract.id,
        selector: contract.match.outgoingSelector
      }),
      contract.match.outgoingSelector
    );
    const incoming = geometryBinding(
      contract,
      "incoming-match",
      resolveGeometrySource(to, contract.match.incomingSelector, contract.id, "incoming-match"),
      resolveTransitionMatchGeometry(contract.matchId, "incoming-match", {
        contractId: contract.id,
        selector: contract.match.incomingSelector
      }),
      contract.match.incomingSelector
    );
    bindings.set(contract.id, freeze({ occlusion, outgoing, incoming }));
  });
  return bindings;
}

function createGeometryRuntimeNode(documentRef, runtime, binding, index) {
  const { geometry, side, contractId, selector: geometrySelector, source, matchId } = binding;
  const node = documentRef.createElement("div");
  node.className = `pv-transition-geometry-layer pv-transition-geometry-layer--${side}`;
  node.dataset.transitionGeometrySide = side;
  node.dataset.transitionGeometryNode = `${contractId}:${side}`;
  node.dataset.transitionGeometry = geometry.id;
  node.dataset.transitionGeometryShape = geometry.shape;
  node.dataset.transitionGeometrySelector = geometrySelector;
  node.dataset.transitionGeometrySource = source.className || source.tagName.toLowerCase();
  node.dataset.transitionGeometryApplied = "false";
  if (matchId) node.dataset.transitionMatchId = matchId;
  node.style.zIndex = String(index + 2);
  node.style.width = `${geometry.width}px`;
  node.style.height = `${geometry.height}px`;
  node.style.marginLeft = `${geometry.width / -2}px`;
  node.style.marginTop = `${geometry.height / -2}px`;
  node.style.clipPath = geometry.clipPath;
  node.style.webkitClipPath = geometry.clipPath;
  node.style.maskImage = geometry.maskImage;
  node.style.webkitMaskImage = geometry.maskImage;
  node.style.setProperty("--transition-geometry-width", `${geometry.width}px`);
  node.style.setProperty("--transition-geometry-height", `${geometry.height}px`);
  runtime.append(node);
  if (!node.style.clipPath && (!node.style.maskImage || node.style.maskImage === "none")) {
    throw geometryResolutionError({ contractId, selector: geometrySelector, side, geometryId: geometry.id });
  }
  node.dataset.transitionGeometryApplied = "true";
  return node;
}

function createContractGeometryRuntime(documentRef, runtime, contract, binding) {
  const occlusion = createGeometryRuntimeNode(documentRef, runtime, binding.occlusion, 0);
  const outgoing = createGeometryRuntimeNode(documentRef, runtime, binding.outgoing, 1);
  const incoming = createGeometryRuntimeNode(documentRef, runtime, binding.incoming, 2);
  const allApplied = [occlusion, outgoing, incoming]
    .every((node) => node.dataset.transitionGeometryApplied === "true");
  if (!allApplied) {
    throw new Error(`transition ${contract.id} geometry runtime was not fully applied`);
  }
  runtime.dataset.occlusionConsumed = "true";
  runtime.dataset.transitionOcclusionGeometry = binding.occlusion.geometry.id;
  runtime.dataset.transitionOcclusionShape = binding.occlusion.geometry.shape;
  runtime.dataset.transitionOcclusionNode = binding.occlusion.source.className || binding.occlusion.source.tagName.toLowerCase();
  runtime.dataset.transitionGeometry = `${binding.outgoing.geometry.id}|${binding.incoming.geometry.id}`;
  runtime.dataset.transitionShape = `${binding.outgoing.geometry.shape}->${binding.incoming.geometry.shape}`;
  return { occlusion, outgoing, incoming };
}

function animateGeometry(timeline, element, {
  start,
  revealDuration,
  peakOpacity,
  fadeAt,
  fadeDuration,
  endOpacity = 0
}) {
  timeline.fromTo(element, {
    opacity: 0,
    scale: 0.94,
    filter: "brightness(0.2) blur(8px)"
  }, {
    opacity: peakOpacity,
    scale: 1,
    filter: "brightness(0.78) blur(0px)",
    duration: revealDuration,
    ease: "sine.inOut",
    immediateRender: false
  }, start);
  timeline.to(element, {
    opacity: endOpacity,
    duration: fadeDuration,
    ease: "sine.inOut",
    immediateRender: false
  }, fadeAt);
}

export function addCinematicTransition(timeline, {
  document: documentRef,
  stage,
  from,
  to,
  contract,
  start,
  duration = TRANSITION_DURATION,
  geometryBinding: binding = null
}) {
  if (!timeline?.to || !timeline?.fromTo || !timeline?.set) throw new TypeError("GSAP timeline is required for cinematic transitions");
  requireElement(from, "transition source");
  requireElement(to, "transition target");
  const resolvedBinding = binding ?? validateTransitionGeometryBindings({ [contract.from]: from, [contract.to]: to }, [contract]).get(contract.id);
  const { layer, dip: dipLayer } = createTransitionLayer(documentRef, stage, contract);
  const { occlusion, outgoing, incoming } = createContractGeometryRuntime(documentRef, layer, contract, resolvedBinding);
  const focus = contract.focusPull;
  const dip = contract.colorDip;
  const handoff = contract.handoff ?? {
    outgoingAt: 0,
    outgoingDuration: duration,
    incomingAt: 0,
    incomingDuration: duration
  };
  timeline.set(layer, { opacity: 1, scale: 1, filter: "blur(0px)" }, start);
  timeline.set(dipLayer, { opacity: 0 }, start);
  timeline.fromTo(from, { filter: "blur(0px)" }, {
    filter: `blur(${focus.outgoingBlur}px)`,
    opacity: 0,
    duration: handoff.outgoingDuration,
    ease: focus.ease,
    immediateRender: false
  }, start + handoff.outgoingAt);
  timeline.fromTo(to, { filter: `blur(${focus.incomingBlur}px)`, opacity: 0 }, {
    filter: "blur(0px)",
    opacity: 1,
    duration: handoff.incomingDuration,
    ease: focus.ease,
    immediateRender: false
  }, start + handoff.incomingAt);
  timeline.to(dipLayer, { opacity: dip.peak, duration: dip.duration, ease: "power2.in", immediateRender: false }, start + dip.at);
  timeline.to(dipLayer, { opacity: 0, duration: dip.releaseDuration, ease: "power2.out" }, start + dip.releaseAt);
  animateGeometry(timeline, occlusion, {
    start: start + duration * 0.04,
    revealDuration: duration * 0.46,
    peakOpacity: 0.72,
    fadeAt: start + duration * 0.56,
    fadeDuration: duration * 0.32
  });
  animateGeometry(timeline, outgoing, {
    start: start + duration * 0.08,
    revealDuration: duration * 0.44,
    peakOpacity: 0.7,
    fadeAt: start + duration * 0.58,
    fadeDuration: duration * 0.3
  });
  const incomingHold = contract.to.startsWith("chapter-card-") ? 0.36 : 0.18;
  animateGeometry(timeline, incoming, {
    start: start + duration * 0.18,
    revealDuration: duration * 0.42,
    peakOpacity: 0.76,
    fadeAt: start + duration + incomingHold,
    fadeDuration: 0.28
  });
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

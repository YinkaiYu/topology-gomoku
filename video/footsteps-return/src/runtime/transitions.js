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

const transition = (from, to, occlusionSource, matchSource, matchTarget, note) => freeze({
  id: `${from}--${to}`,
  from,
  to,
  kind: "cinematic",
  family: "cinematic-spatial-match",
  duration: TRANSITION_DURATION,
  stages: CINEMATIC_TRANSITION_STAGES,
  animatedProperties: ANIMATED_PROPERTIES,
  occlusion: freeze({ mode: "real-geometry", source: occlusionSource }),
  focusPull: FOCUS_PULL,
  colorDip: BLACK_DIP,
  silhouetteMatch: freeze({ source: matchSource, target: matchTarget, note })
});

export const transitionContracts = freeze([
  transition("intro", "chapter-card-plane", "intro-board-edge", "board-edge", "plane-silhouette", "board edge narrows into the first plane contour"),
  transition("chapter-card-plane", "chapter-plane", "plane-silhouette", "plane-silhouette", "plane-board", "the card contour resolves to the real flat board"),
  transition("chapter-plane", "chapter-card-cylinder", "plane-shadow", "plane-board", "cylinder-silhouette", "the lifted board falls behind its first wrapped wall"),
  transition("chapter-card-cylinder", "chapter-cylinder", "cylinder-silhouette", "cylinder-silhouette", "cylinder-board", "the cylinder card opens on the same wall contour"),
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
  layer.dataset.transitionMatch = `${contract.silhouetteMatch.source}->${contract.silhouetteMatch.target}`;
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

function firstMatchElement(scene, matchId) {
  if (matchId === "gallery-sphere") {
    return scene.querySelector('[data-gallery-shape="sphere"] img');
  }
  if (matchId?.endsWith("-board")) {
    return scene.querySelector("[data-chapter-board]") ?? scene.querySelector("[data-chapter-silhouette]");
  }
  const exitGeometry = scene.querySelector("[data-chapter-exit-occlusion] .chapter-exit-occlusion__shape");
  if (exitGeometry) return exitGeometry;
  return scene.querySelector("[data-chapter-silhouette], [data-intro-board-edge], [data-gallery-shape] img");
}

function addSilhouetteMatch(timeline, from, to, contract, start, duration) {
  const outgoing = firstMatchElement(from, contract.silhouetteMatch.source);
  const incoming = firstMatchElement(to, contract.silhouetteMatch.target);
  if (outgoing) {
    timeline.to(outgoing, {
      filter: "brightness(0.32) blur(5px)",
      scale: 1.025,
      duration: duration * 0.72,
      ease: "sine.inOut"
    }, start + duration * 0.12);
  }
  if (incoming) {
    timeline.fromTo(incoming, {
      filter: "brightness(0.14) blur(8px)",
      scale: 0.985
    }, {
      filter: "brightness(0.62) blur(0px)",
      scale: 1,
      duration: duration * 0.72,
      ease: "sine.inOut",
      immediateRender: false
    }, start + duration * 0.28);
  }
  return contract.silhouetteMatch;
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
  const focus = contract.focusPull;
  const dip = contract.colorDip;
  timeline.set(layer, { opacity: 0, scale: 1, filter: "blur(0px)" }, start);
  timeline.fromTo(from, { filter: "blur(0px)" }, {
    filter: `blur(${focus.outgoingBlur}px)`,
    opacity: 0,
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
  addSilhouetteMatch(timeline, from, to, contract, start, duration);
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

import { masterTimeline } from "./data/timeline.js";
import { prepareIntroScene } from "../compositions/intro.js";
import { fitCompositionText } from "./runtime/fit-text.js";
import { buildMasterTimeline } from "./runtime/master-timeline.js";
import { alignCaptionBaselines } from "./runtime/captions.js";
import { prepareTopologyChapterScenes } from "./runtime/topology-surfaces.js";
import { prepareSevenWorldGalleryScenes } from "../compositions/seven-worlds.js";
import { hashBytesSha256, hashMixRenderContract } from "./runtime/mix-contract.js";

export const composition = Object.freeze({
  id: "footsteps-return",
  duration: masterTimeline.duration,
  width: 3840,
  height: 2160,
  fps: 60
});

const REQUIRED_FONT_WEIGHTS = Object.freeze(["400", "600", "700"]);

function readyGate(ready, detail) {
  if (!ready) throw new Error(`render readiness failed: ${detail}`);
  return Object.freeze({ ready: true, detail });
}

async function loadFinalMix(documentRef, hostWindow) {
  const response = await hostWindow.fetch(new URL("./audio/mix.json", documentRef.baseURI), { cache: "no-store" });
  if (!response.ok) throw new Error(`render readiness failed: mix manifest returned HTTP ${response.status}`);
  const manifest = await response.json();
  const mixerScriptPath = manifest?.processing?.implementation?.mixerScript;
  const mixerScriptResponse = mixerScriptPath
    ? await hostWindow.fetch(new URL(mixerScriptPath, documentRef.baseURI), { cache: "no-store" })
    : null;
  if (!mixerScriptResponse?.ok) {
    throw new Error("render readiness failed: mixer implementation is missing");
  }
  const mixerScriptSha256 = await hashBytesSha256(await mixerScriptResponse.arrayBuffer(), hostWindow.crypto);
  const renderContractSha256 = await hashMixRenderContract(manifest, hostWindow.crypto);
  if (
    manifest?.composition?.id !== composition.id
      || manifest.composition.durationSeconds !== composition.duration
      || manifest.output?.status !== "measured"
      || manifest.processing.implementation.mixerScriptSha256 !== mixerScriptSha256
      || manifest.output.renderContractSha256 !== renderContractSha256
  ) {
    throw new Error("render readiness failed: final mix manifest is absent, stale, or unmeasured");
  }
  return manifest;
}

function waitForMasterAudio(documentRef, duration) {
  const audio = documentRef.querySelector("[data-master-audio]");
  if (!audio) return Promise.reject(new Error("render readiness failed: final master audio element is missing"));
  const validate = () => {
    if (audio.error) throw new Error(`render readiness failed: final master audio failed to load (${audio.error.code})`);
    if (!Number.isFinite(audio.duration) || Math.abs(audio.duration - duration) > 1 / 48_000) {
      throw new Error(`render readiness failed: final master audio duration ${audio.duration} does not match ${duration}`);
    }
    return audio;
  };
  if (audio.readyState >= 1) return Promise.resolve().then(validate);
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("render readiness failed: final master audio metadata timed out"));
    }, 5_000);
    const onLoaded = () => {
      cleanup();
      try { resolve(validate()); } catch (error) { reject(error); }
    };
    const onError = () => {
      cleanup();
      reject(new Error(`render readiness failed: final master audio failed to load (${audio.error?.code ?? "unknown"})`));
    };
    const cleanup = () => {
      clearTimeout(timeoutId);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
    };
    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.load();
  });
}

function buildReadinessGates({ documentRef, registry, introStatus, chapterControllers, galleryControllers, mixManifest, masterAudio }) {
  const fontFaces = [...(documentRef.fonts ?? [])]
    .filter((face) => face.family.replaceAll('"', "") === "Topo Serif");
  const loadedFontWeights = fontFaces.filter(({ status }) => status === "loaded").map(({ weight }) => weight).sort();
  const chapterAdapterStates = Object.values(chapterControllers).map((controller) => controller.adapter?.renderReady?.());
  const galleryAdapterStates = Object.values(galleryControllers).map((controller) => controller.adapter?.renderReady?.());
  const webglCanvases = [...documentRef.querySelectorAll("[data-chapter-surface-canvas]")];
  const webglContexts = webglCanvases.map((canvas) => canvas.getContext("webgl2") || canvas.getContext("webgl"));
  const webglFallbacks = [...documentRef.querySelectorAll("[data-chapter-surface-layer][data-surface-fallback]")];
  const outputDurationReady = Math.abs(masterAudio.duration - mixManifest.composition.durationSeconds) <= 1 / 48_000;

  return Object.freeze({
    fonts: readyGate(documentRef.fonts?.status === "loaded" && JSON.stringify(loadedFontWeights) === JSON.stringify(REQUIRED_FONT_WEIGHTS), `Topo Serif weights ${loadedFontWeights.join("/")} loaded`),
    liveGameAdapter: readyGate(
      registry.intro?.dataset.introRenderReady === "true"
        && Boolean(introStatus)
        && chapterAdapterStates.length === 7 && chapterAdapterStates.every(({ ready }) => ready)
        && galleryAdapterStates.length === 7 && galleryAdapterStates.every(({ ready }) => ready),
      "intro plus seven chapter and seven gallery adapters report ready"
    ),
    narration: readyGate(
      outputDurationReady
        && mixManifest.inputs.narration.selectedAuditionId === "F"
        && mixManifest.inputs.narration.selectedVoiceId === "cold-witness"
        && mixManifest.inputs.narration.cues.length === 21,
      "21 measured F cold-witness cues are present in the final master"
    ),
    score: readyGate(
      outputDurationReady
        && mixManifest.inputs.score.durationSeconds === composition.duration
        && mixManifest.inputs.score.file.endsWith("/audio/score/rendered/master.wav"),
      "214.040-second retimed score is present in the final master"
    ),
    sfx: readyGate(
      outputDurationReady
        && mixManifest.inputs.sfx.continuousBed === false
        && mixManifest.inputs.sfx.cues.length === 21,
      "21 sparse SFX cues are present with no continuous bed"
    ),
    webgl: readyGate(
      webglCanvases.length === 6
        && webglFallbacks.length === 0
        && webglContexts.every((context) => context && !context.isContextLost()),
      `${webglCanvases.length} non-Plane WebGL surfaces initialized with live contexts and no fallback`
    )
  });
}

export function createCompositionTimeline(gsap, {
  document: documentRef = document,
  stage = documentRef.querySelector("[data-scene-layer]")
} = {}) {
  return buildMasterTimeline({ document: documentRef, gsap, stage }).timeline;
}

export function bootstrapComposition({
  hostWindow = window,
  document: documentRef = document,
  gsap = hostWindow.gsap
} = {}) {
  const root = documentRef.querySelector(`[data-composition-id="${composition.id}"]`);
  const stage = root?.querySelector("[data-scene-layer]");
  if (!root || !stage) {
    throw new Error("Footsteps Return master stage is missing");
  }

  const { timeline, registry } = buildMasterTimeline({ document: documentRef, gsap, stage });
  hostWindow.__timelines = hostWindow.__timelines || {};
  hostWindow.__timelines[composition.id] = timeline;
  hostWindow.__pvSceneRegistry = registry;

  const fontsReady = documentRef.fonts?.ready ?? Promise.resolve();
  const introReady = prepareIntroScene(registry.intro);
  const chaptersReady = prepareTopologyChapterScenes(registry).then((controllers) => {
    hostWindow.__pvChapterControllers = controllers;
    return controllers;
  });
  const galleryReady = prepareSevenWorldGalleryScenes(registry).then((controllers) => {
    hostWindow.__pvGalleryControllers = controllers;
    return controllers;
  });
  const mixReady = loadFinalMix(documentRef, hostWindow);
  const masterAudioReady = waitForMasterAudio(documentRef, composition.duration);
  hostWindow.__renderReady = Promise.all([fontsReady, introReady, chaptersReady, galleryReady, mixReady, masterAudioReady]).then(([, introStatus, chapterControllers, galleryControllers, mixManifest, masterAudio]) => {
    fitCompositionText(root);
    alignCaptionBaselines({ document: documentRef, root });
    const readiness = buildReadinessGates({ documentRef, registry, introStatus, chapterControllers, galleryControllers, mixManifest, masterAudio });
    hostWindow.__pvRenderReadiness = readiness;
    documentRef.documentElement.dataset.renderReady = "true";
    return Object.freeze({ composition, sceneIds: Object.keys(registry), readiness });
  }).catch((error) => {
    documentRef.documentElement.dataset.renderReady = "false";
    documentRef.documentElement.dataset.renderReadyError = error.message;
    throw error;
  });

  return Object.freeze({ timeline, registry, renderReady: hostWindow.__renderReady });
}

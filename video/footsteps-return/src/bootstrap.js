import { masterTimeline } from "./data/timeline.js";
import { prepareIntroScene } from "../compositions/intro.js";
import { fitCompositionText } from "./runtime/fit-text.js";
import { buildMasterTimeline } from "./runtime/master-timeline.js";
import { alignCaptionBaselines } from "./runtime/captions.js";
import { prepareTopologyChapterScenes } from "./runtime/topology-surfaces.js";
import { prepareSevenWorldGalleryScenes } from "../compositions/seven-worlds.js";
import { hashBytesSha256, hashMixRenderContract } from "./runtime/mix-contract.js";
import { IncrementalSha256 } from "./runtime/incremental-sha256.js";

export const composition = Object.freeze({
  id: "footsteps-return",
  duration: masterTimeline.duration,
  width: 3840,
  height: 2160,
  fps: 60
});

const REQUIRED_FONT_WEIGHTS = Object.freeze(["400", "600", "700"]);
const FINAL_AUDIO_FETCH_TIMEOUT_MS = 30_000;
const MAX_AUTHENTICATED_AUDIO_BYTES = 128 * 1024 * 1024;

function readyGate(ready, detail) {
  if (!ready) throw new Error(`render readiness failed: ${detail}`);
  return Object.freeze({ ready: true, detail });
}

function detachUnauthenticatedMasterSource(documentRef) {
  const audio = documentRef.querySelector("[data-master-audio]");
  const declaredSource = audio?.dataset.source || audio?.getAttribute("src");
  if (!audio || !declaredSource) return;
  audio.dataset.source = declaredSource;
  audio.preload = "none";
  if (audio.hasAttribute("src")) audio.removeAttribute("src");
  audio.load();
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

async function authenticateMasterAudio(documentRef, hostWindow, manifest) {
  const audio = documentRef.querySelector("[data-master-audio]");
  if (!audio) throw new Error("render readiness failed: final master audio element is missing");
  const declaredSource = audio.dataset.source || audio.getAttribute("src");
  const outputFile = manifest?.composition?.outputFile;
  if (!declaredSource || !outputFile?.startsWith("video/footsteps-return/")) {
    throw new Error("render readiness failed: final master audio source contract is missing");
  }
  const expectedUrl = new URL(`./${outputFile.slice("video/footsteps-return/".length)}`, documentRef.baseURI);
  const declaredUrl = new URL(declaredSource, documentRef.baseURI);
  if (declaredUrl.href !== expectedUrl.href) {
    throw new Error("render readiness failed: final master audio URL does not match the measured mix output");
  }
  const expectedBytes = Number(manifest.output?.bytes);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > MAX_AUTHENTICATED_AUDIO_BYTES) {
    throw new Error(`render readiness failed: final master audio byte contract ${expectedBytes} is unsafe`);
  }

  audio.dataset.source = declaredSource;
  audio.preload = "none";
  audio.removeAttribute("src");
  audio.load();
  const controller = new hostWindow.AbortController();
  let timedOut = false;
  const timeoutId = hostWindow.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FINAL_AUDIO_FETCH_TIMEOUT_MS);
  let reader;
  let objectUrl;
  try {
    const response = await hostWindow.fetch(expectedUrl, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`final master audio returned HTTP ${response.status}`);
    if (!response.body) throw new Error("final master audio response is not streamable");
    reader = response.body.getReader();
    const chunks = [];
    const hasher = new IncrementalSha256();
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > expectedBytes) throw new Error(`final master audio exceeded ${expectedBytes} authenticated bytes`);
      hasher.update(value);
      chunks.push(value);
    }
    if (receivedBytes !== expectedBytes) {
      throw new Error(`final master audio byte count ${receivedBytes} does not match ${expectedBytes}`);
    }
    const hash = hasher.digestHex();
    if (hash !== manifest.output.sha256) {
      throw new Error(`final master audio SHA-256 mismatch (${hash})`);
    }

    const blob = new Blob(chunks, { type: response.headers.get("content-type") || "audio/wav" });
    chunks.length = 0;
    objectUrl = hostWindow.URL.createObjectURL(blob);
    audio.src = objectUrl;
    audio.preload = "metadata";
    const loadedAudio = await waitForMasterAudio(documentRef, manifest.composition.durationSeconds);
    audio.dataset.authenticatedSha256 = hash;
    audio.dataset.authenticatedBytes = String(receivedBytes);
    audio.dataset.authenticatedSource = expectedUrl.href;
    audio.dataset.audioAuthenticated = "true";
    hostWindow.addEventListener("pagehide", () => hostWindow.URL.revokeObjectURL(objectUrl), { once: true });
    return Object.freeze({ audio: loadedAudio, sha256: hash, bytes: receivedBytes, sourceUrl: expectedUrl.href, objectUrl });
  } catch (error) {
    if (reader) await reader.cancel().catch(() => {});
    if (objectUrl) hostWindow.URL.revokeObjectURL(objectUrl);
    audio.removeAttribute("src");
    audio.dataset.audioAuthenticated = "false";
    const reason = timedOut ? "final master audio authentication timed out" : (error?.message || String(error));
    throw new Error(`render readiness failed: ${reason}`);
  } finally {
    hostWindow.clearTimeout(timeoutId);
  }
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
  const authenticatedOutputReady = masterAudio.sha256 === mixManifest.output.sha256
    && masterAudio.bytes === mixManifest.output.bytes
    && masterAudio.sourceUrl.endsWith("/audio/mix/footsteps-return-draft.wav")
    && Math.abs(masterAudio.audio.duration - mixManifest.composition.durationSeconds) <= 1 / 48_000;

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
      authenticatedOutputReady
        && mixManifest.inputs.narration.selectedAuditionId === "F"
        && mixManifest.inputs.narration.selectedVoiceId === "cold-witness"
        && mixManifest.inputs.narration.cues.length === 21,
      "authenticated master is bound to a manifest declaring 21 measured F cold-witness narration cues"
    ),
    score: readyGate(
      authenticatedOutputReady
        && mixManifest.inputs.score.durationSeconds === composition.duration
        && mixManifest.inputs.score.file.endsWith("/audio/score/rendered/master.wav"),
      "authenticated master is bound to a manifest declaring the 214.040-second retimed score source"
    ),
    sfx: readyGate(
      authenticatedOutputReady
        && mixManifest.inputs.sfx.continuousBed === false
        && mixManifest.inputs.sfx.cues.length === 21,
      "authenticated master is bound to a manifest declaring 21 sparse SFX cues and no continuous bed"
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
  hostWindow.__renderReady = false;
  documentRef.documentElement.dataset.renderReady = "false";
  detachUnauthenticatedMasterSource(documentRef);

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
  const masterAudioReady = mixReady.then((manifest) => authenticateMasterAudio(documentRef, hostWindow, manifest));
  const renderReadyPromise = Promise.all([fontsReady, introReady, chaptersReady, galleryReady, mixReady, masterAudioReady]).then(([, introStatus, chapterControllers, galleryControllers, mixManifest, masterAudio]) => {
    fitCompositionText(root);
    alignCaptionBaselines({ document: documentRef, root });
    const readiness = buildReadinessGates({ documentRef, registry, introStatus, chapterControllers, galleryControllers, mixManifest, masterAudio });
    hostWindow.__pvRenderReadiness = readiness;
    documentRef.documentElement.dataset.renderReady = "true";
    hostWindow.__renderReady = true;
    return Object.freeze({ composition, sceneIds: Object.keys(registry), readiness });
  }).catch((error) => {
    hostWindow.__renderReady = false;
    documentRef.documentElement.dataset.renderReady = "false";
    documentRef.documentElement.dataset.renderReadyError = error.message;
    throw error;
  });
  hostWindow.__pvRenderReadyPromise = renderReadyPromise;

  return Object.freeze({ timeline, registry, renderReady: renderReadyPromise });
}

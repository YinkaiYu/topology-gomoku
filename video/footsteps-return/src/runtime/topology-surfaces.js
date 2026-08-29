import * as THREE from "../vendor/three.module.min.js";
import { createSceneElement } from "../../compositions/shared/scene.js";
import { findGameRenderShot } from "../data/game-render-shots.js";
import { chapterStateAt } from "../game-render/adapter.js";

const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = (value) => {
  const amount = clamp(value);
  return amount * amount * (3 - 2 * amount);
};
const freeze = (value) => Object.freeze(value);

function frozenPoint(value) {
  return freeze({ scale: value.scale, x: value.x, y: value.y, z: value.z });
}

export function defineChapterScene(specification) {
  const surface = { ...specification.surface };
  if (specification.surface.subdivisions) surface.subdivisions = freeze([...specification.surface.subdivisions]);
  if (specification.surface.effects) surface.effects = freeze({ ...specification.surface.effects });
  const definition = {
    ...specification,
    liveRender: freeze({
      ...specification.liveRender,
      demos: freeze([...specification.liveRender.demos])
    }),
    identity: freeze({ ...specification.identity }),
    evidence: freeze(Object.fromEntries(Object.entries(specification.evidence).map(([key, value]) => [key, Array.isArray(value) ? freeze([...value]) : value]))),
    entryTransition: freeze({ ...specification.entryTransition }),
    exitOcclusion: freeze({ ...specification.exitOcclusion }),
    camera: freeze({
      from: frozenPoint(specification.camera.from),
      formed: frozenPoint(specification.camera.formed),
      rotation: frozenPoint(specification.camera.rotation)
    }),
    surface: freeze(surface)
  };
  return freeze(definition);
}

function winningHoldProgress(demo) {
  const beforeWin = 1 + 5 + demo.crossings.length * 2;
  const total = beforeWin + 1.25 + 4 + 1 + 1.5;
  return (beforeWin + 0.625) / total;
}

function chapterSegments(definition) {
  const demos = definition.liveRender.demos;
  if (demos.length === 1) {
    return [{ demo: demos[0], start: 0, end: 1, localEnd: 1, final: true }];
  }
  const firstDemo = findGameRenderShot(definition.id, demos[0]).demo;
  return [
    { kind: "path", demo: demos[0], start: 0, end: 0.38, localEnd: winningHoldProgress(firstDemo), final: false },
    { kind: "paired-memory", fromDemo: demos[0], toDemo: demos[1], demo: "paired-memory", start: 0.38, end: 0.5, final: false },
    { kind: "path", demo: demos[1], start: 0.5, end: 1, localEnd: 1, final: true }
  ];
}

export function chapterFrameAt(definition, progress) {
  const amount = clamp(progress);
  const segments = chapterSegments(definition);
  const segment = segments.find((candidate, index) => amount < candidate.end || (candidate.kind === "paired-memory" && amount <= candidate.end) || index === segments.length - 1);
  const span = segment.end - segment.start;
  const segmentProgress = clamp((amount - segment.start) / span);
  if (segment.kind === "paired-memory") {
    return freeze({
      phase: "paired-memory",
      lessonStep: segmentProgress < 1 ? 5 : 0,
      pendingStep: 0,
      dropProgress: 0,
      breathPhase: 0,
      winningFive: false,
      morphProgress: 0,
      rotation: freeze({ x: 0, y: 0, z: 0 }),
      topology: definition.id,
      demo: "paired-memory",
      memoryDemos: freeze([segment.fromDemo, segment.toDemo]),
      memoryProgress: segmentProgress,
      crossings: freeze([]),
      chapterProgress: amount,
      pathProgress: 0,
      surfaceProgress: 0,
      finalPath: false
    });
  }
  const local = segmentProgress * segment.localEnd;
  const { definition: shot, demo } = findGameRenderShot(definition.id, segment.demo);
  const state = chapterStateAt(shot, demo, local);
  return freeze({
    ...state,
    demo: demo.id,
    crossings: demo.crossings,
    chapterProgress: amount,
    pathProgress: local,
    surfaceProgress: definition.morphMode === "identity" ? 0 : state.morphProgress,
    finalPath: segment.final
  });
}

function closestSample(candidates, predicate, score) {
  let best = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (!predicate(candidate.frame)) continue;
    const candidateScore = score(candidate.frame);
    if (candidateScore < bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  if (!best) throw new Error("chapter sample plan could not represent a required phase");
  return freeze({
    progress: best.progress,
    demo: best.frame.demo,
    phase: best.frame.phase,
    step: best.frame.pendingStep || best.frame.lessonStep,
    crossings: best.frame.crossings
  });
}

export function buildChapterSamples(definition) {
  const candidates = Array.from({ length: 10001 }, (_, index) => {
    const progress = index / 10000;
    return { progress, frame: chapterFrameAt(definition, progress) };
  });
  const samples = [];
  for (const demoId of definition.liveRender.demos) {
    const demoCandidates = candidates.filter(({ frame }) => frame.demo === demoId);
    const crossings = findGameRenderShot(definition.id, demoId).demo.crossings;
    samples.push(closestSample(demoCandidates, (frame) => frame.phase === "establish", (frame) => frame.pathProgress));
    for (let step = 1; step <= 5; step += 1) {
      if (crossings.includes(step)) {
        samples.push(closestSample(demoCandidates, (frame) => frame.phase === "breathe" && frame.pendingStep === step, (frame) => Math.abs(frame.breathPhase - 0.62)));
      }
      samples.push(closestSample(demoCandidates, (frame) => frame.phase === "drop" && frame.pendingStep === step, (frame) => Math.abs(frame.dropProgress - 0.999)));
    }
    samples.push(closestSample(demoCandidates, (frame) => frame.phase === "win-hold", (frame) => Math.abs(frame.pathProgress - 0.58)));
    if (demoId === definition.liveRender.demos.at(-1)) {
      samples.push(closestSample(demoCandidates, (frame) => frame.phase === "morph", (frame) => frame.morphProgress));
      samples.push(closestSample(demoCandidates, (frame) => frame.phase === "morph", (frame) => Math.abs(frame.morphProgress - 1)));
      samples.push(closestSample(demoCandidates, (frame) => frame.phase === "settled", (frame) => Math.abs(frame.pathProgress - 0.88)));
      samples.push(closestSample(demoCandidates, (frame) => frame.phase === "rotation", (frame) => Math.abs(frame.pathProgress - 1)));
    }
  }
  if (definition.liveRender.demos.length > 1) {
    for (const target of [0, 0.5, 1]) {
      const sample = closestSample(candidates, (frame) => frame.phase === "paired-memory", (frame) => Math.abs(frame.memoryProgress - target));
      samples.push(freeze({ ...sample, demo: "paired-memory", memoryProgress: target }));
    }
  }
  return freeze(samples);
}

function buildSurfaceGeometry(morph, topology, horizontalSegments, verticalSegments) {
  const positions = [];
  const indices = [];
  for (let row = 0; row <= verticalSegments; row += 1) {
    for (let column = 0; column <= horizontalSegments; column += 1) {
      positions.push(...morph.surfacePoint(topology, column / horizontalSegments, row / verticalSegments));
    }
  }
  const stride = horizontalSegments + 1;
  for (let row = 0; row < verticalSegments; row += 1) {
    for (let column = 0; column < horizontalSegments; column += 1) {
      const topLeft = row * stride + column;
      const bottomLeft = (row + 1) * stride + column;
      indices.push(topLeft, bottomLeft, topLeft + 1, bottomLeft, bottomLeft + 1, topLeft + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function deterministicParticles(count) {
  const positions = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399963229728653;
    const radius = 1.8 + (index % 9) * 0.19;
    positions.push(Math.cos(angle) * radius, ((index * 37) % 31) / 9 - 1.7, Math.sin(angle) * radius - 0.8);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function createThreeSurface(layer, definition) {
  const morph = globalThis.TopologyMorph;
  if (!morph?.surfacePoint) throw new Error("TopologyMorph.surfacePoint is required for PV surfaces");
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.setSize(3840, 2160, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "chapter-surface-layer__canvas";
  renderer.domElement.dataset.chapterSurfaceCanvas = definition.id;
  renderer.domElement.dataset.layoutIgnore = "";
  renderer.domElement.setAttribute("aria-hidden", "true");
  layer.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060908, 0.075);
  const camera = new THREE.PerspectiveCamera(31, 16 / 9, 0.1, 100);
  camera.position.set(0, 0.1, 7.2);
  camera.lookAt(0, 0, 0);

  const [horizontalSegments, verticalSegments] = definition.surface.subdivisions;
  const geometry = buildSurfaceGeometry(morph, definition.id, horizontalSegments, verticalSegments);
  const color = new THREE.Color(definition.identity.light);
  const material = new THREE.MeshPhysicalMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.08),
    roughness: 0.72,
    metalness: 0.03,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const focusGhost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide }));
  focusGhost.scale.setScalar(1.035);
  scene.add(focusGhost);
  const motionGhost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.022, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(motionGhost);

  const points = new THREE.Points(deterministicParticles(definition.surface.effects.particles), new THREE.PointsMaterial({ color, size: 0.014, transparent: true, opacity: 0.18, depthWrite: false }));
  scene.add(points);
  const volume = new THREE.Mesh(new THREE.ConeGeometry(1.25, 4.8, 48, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.018, depthWrite: false, side: THREE.DoubleSide }));
  volume.position.set(-2.4, 1.8, -1.8);
  volume.rotation.z = -0.72;
  scene.add(volume);
  scene.add(new THREE.HemisphereLight(0xf2efe7, 0x060908, 0.68));
  const key = new THREE.DirectionalLight(color, 1.4);
  key.position.set(-3.5, 4.2, 4.8);
  scene.add(key);

  return freeze({
    render(frame) {
      const visibility = smooth((frame.surfaceProgress - 0.06) / 0.94);
      renderer.domElement.style.opacity = String(visibility * 0.28);
      const rotationProgress = frame.phase === "rotation" ? Math.min(1, Math.abs(frame.rotation.y) / 0.72) : 0;
      mesh.rotation.set(0.12 + rotationProgress * 0.08, -0.38 + rotationProgress * 0.38, -0.08 + rotationProgress * 0.04);
      focusGhost.rotation.copy(mesh.rotation);
      motionGhost.rotation.set(mesh.rotation.x - rotationProgress * 0.014, mesh.rotation.y - rotationProgress * 0.028, mesh.rotation.z);
      points.rotation.y = frame.chapterProgress * 0.18;
      volume.material.opacity = 0.012 + visibility * 0.014;
      renderer.render(scene, camera);
      return frame.surfaceProgress;
    }
  });
}

function createSurfaceRenderer(layer, definition) {
  if (definition.id === "plane") {
    return freeze({ render: () => 0 });
  }
  try {
    return createThreeSurface(layer, definition);
  } catch (error) {
    layer.dataset.surfaceFallback = error.message;
    return freeze({ render: (frame) => frame.surfaceProgress });
  }
}

function waitForAdapter(frame) {
  if (frame.contentWindow?.gameRender) return Promise.resolve(frame.contentWindow.gameRender);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("chapter game render adapter load timeout")), 5000);
    frame.addEventListener("load", () => {
      clearTimeout(timeout);
      if (!frame.contentWindow?.gameRender) reject(new Error("chapter game render adapter is unavailable"));
      else resolve(frame.contentWindow.gameRender);
    }, { once: true });
  });
}

function interpolateCamera(definition, frame) {
  let amount = frame.morphProgress;
  let from = definition.camera.from;
  let to = definition.camera.formed;
  if (frame.phase === "rotation") {
    amount = Math.min(1, Math.abs(frame.rotation.y) / 0.72);
    from = definition.camera.formed;
    to = definition.camera.rotation;
  }
  const eased = smooth(amount);
  return {
    scale: from.scale + (to.scale - from.scale) * eased,
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
    z: from.z + (to.z - from.z) * eased
  };
}

function applyCamera(board, definition, frame) {
  const camera = interpolateCamera(definition, frame);
  const scale = 2.52 * camera.scale;
  board.style.transform = `translate(-50%, -50%) scale(${scale}) rotateX(${camera.x}deg) rotateY(${camera.y}deg) rotateZ(${camera.z}deg)`;
}

function snapshot(result, frame, surfaceProgress) {
  return freeze({
    ...result,
    phase: frame.phase,
    breathPhase: frame.breathPhase,
    morphProgress: frame.morphProgress,
    surfaceProgress,
    demo: frame.demo
  });
}

export class TopologyChapterController {
  constructor(scene, definition) {
    this.scene = scene;
    this.definition = definition;
    this.frame = scene.querySelector("iframe[data-chapter-game-render]");
    this.board = scene.querySelector("[data-chapter-board]");
    this.surface = createSurfaceRenderer(scene.querySelector("[data-chapter-surface-layer]"), definition);
    this.samples = buildChapterSamples(definition);
    this.sceneStart = Number(scene.dataset.sceneStart);
    this.sceneDuration = Number(scene.dataset.sceneDuration);
  }

  get instanceId() {
    return this.adapter?.frame?.contentWindow?.__PV_CONTROL__?.instanceId ?? null;
  }

  async prepare() {
    this.adapter = await waitForAdapter(this.frame);
    await this.adapter.selectShot(this.definition.id, { demo: this.definition.liveRender.demos[0] });
    await this.renderProgress(0);
    this.scene.dataset.chapterRenderReady = "true";
    return this;
  }

  renderProgress(progress) {
    if (!this.adapter) throw new Error(`${this.definition.id} chapter controller is not ready`);
    const frame = chapterFrameAt(this.definition, progress);
    const rendered = frame.phase === "paired-memory"
      ? this.adapter.render({ pairedMemory: { fromDemo: frame.memoryDemos[0], toDemo: frame.memoryDemos[1], progress: frame.memoryProgress } })
      : this.adapter.render({ chapterProgress: frame.pathProgress, topology: this.definition.id, demo: frame.demo });
    const finish = (result) => {
      applyCamera(this.board, this.definition, frame);
      const surfaceProgress = this.surface.render(frame);
      this.scene.dataset.chapterPhase = frame.phase;
      this.scene.dataset.chapterDemo = frame.demo;
      return snapshot(result, frame, surfaceProgress);
    };
    return rendered && typeof rendered.then === "function" ? rendered.then(finish) : finish(rendered);
  }
}

export function createTopologyChapterScene(documentRef, sceneDefinition, definition) {
  const composition = documentRef.createElement("div");
  composition.className = "chapter-composition";
  composition.dataset.chapterComposition = definition.id;
  composition.style.setProperty("--chapter-light", definition.identity.light);

  const atmosphere = documentRef.createElement("div");
  atmosphere.className = "chapter-composition__atmosphere";
  atmosphere.dataset.sceneAtmosphere = definition.id;
  atmosphere.dataset.layoutIgnore = "";
  atmosphere.setAttribute("aria-hidden", "true");

  const surface = documentRef.createElement("div");
  surface.className = "chapter-surface-layer";
  surface.dataset.chapterSurfaceLayer = definition.id;
  surface.dataset.layoutIgnore = "";
  surface.setAttribute("aria-hidden", "true");

  const board = documentRef.createElement("div");
  board.className = "chapter-board";
  board.dataset.chapterBoard = definition.id;
  board.dataset.boardSource = "game-render-adapter";
  board.dataset.layoutIgnore = "";
  const frame = documentRef.createElement("iframe");
  frame.className = "chapter-board__game-render";
  frame.dataset.chapterGameRender = definition.id;
  frame.src = definition.liveRender.source;
  frame.title = `${definition.id} 真实游戏透明渲染层`;
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("aria-hidden", "true");
  board.append(frame);

  const occluder = documentRef.createElement("div");
  occluder.className = "chapter-exit-occlusion";
  occluder.dataset.chapterExitOcclusion = definition.id;
  occluder.dataset.occlusionGeometry = definition.exitOcclusion.geometry;
  occluder.dataset.layoutIgnore = "";
  occluder.setAttribute("aria-hidden", "true");
  const occluderShape = documentRef.createElement("img");
  occluderShape.className = "chapter-exit-occlusion__shape";
  occluderShape.src = `./assets/topology/${definition.id}.svg`;
  occluderShape.alt = "";
  occluder.append(occluderShape);

  composition.append(atmosphere, surface, board, occluder);
  const scene = createSceneElement(documentRef, sceneDefinition, composition);
  scene.__chapterDefinition = definition;
  scene.__chapterController = new TopologyChapterController(scene, definition);
  return scene;
}

export function addTopologyChapterMotion(timeline, scene, start, duration) {
  const board = scene.querySelector("[data-chapter-board]");
  const atmosphere = scene.querySelector("[data-scene-atmosphere]");
  const occluder = scene.querySelector("[data-chapter-exit-occlusion]");
  const progress = { value: 0 };
  timeline.from(atmosphere, { opacity: 0, scale: 0.985, duration: 0.72, ease: "sine.out", immediateRender: false }, start + 0.1);
  timeline.from(board, { opacity: 0, filter: "blur(5px)", duration: 0.66, ease: "power3.out", immediateRender: false }, start + 0.16);
  timeline.to(progress, {
    value: 1,
    duration: Math.max(1, duration - 1.18),
    ease: "none",
    onUpdate() {
      scene.__chapterController?.renderProgress(progress.value);
    }
  }, start + 0.22);
  timeline.fromTo(occluder, { opacity: 0, scale: 0.94 }, {
    opacity: 1,
    scale: 1,
    duration: 0.72,
    ease: "power2.in",
    immediateRender: false
  }, start + duration - 0.72);
}

export async function prepareTopologyChapterScenes(registry) {
  const controllers = Object.values(registry)
    .filter((scene) => scene.dataset.sceneKind === "chapter" && scene.__chapterController)
    .map((scene) => scene.__chapterController);
  await Promise.all(controllers.map((controller) => controller.prepare()));
  return freeze(Object.fromEntries(controllers.map((controller) => [controller.definition.id, controller])));
}

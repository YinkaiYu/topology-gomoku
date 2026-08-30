import { chapters } from "../src/data/chapters.js";
import { GameRenderAdapter } from "../src/game-render/adapter.js";
import { findGameRenderShot } from "../src/data/game-render-shots.js";
import { createSceneElement } from "./shared/scene.js";

const freeze = Object.freeze;

const GALLERY_LIGHTS = freeze({
  plane: "#21302c",
  cylinder: "#3f8c87",
  torus: "#385f78",
  mobius: "#d95b4f",
  klein: "#7f6ca8",
  projective: "#8b7556",
  sphere: "#c79244"
});

const GALLERY_DEMOS = freeze({
  plane: "ordinary-five",
  cylinder: "horizontal-wrap",
  torus: "two-seam-diagonal",
  mobius: "reflected-crossing",
  klein: "reflected-crossing",
  projective: "mirrored-crossings",
  sphere: "adjacent-edge-turn"
});

const GALLERY_ROTATIONS = freeze({
  plane: freeze({ x: 0, y: 0, z: 0 }),
  cylinder: freeze({ x: -0.08, y: 0.26, z: -0.02 }),
  torus: freeze({ x: 0.12, y: -0.28, z: 0.03 }),
  mobius: freeze({ x: -0.12, y: 0.34, z: -0.08 }),
  klein: freeze({ x: 0.14, y: -0.32, z: 0.08 }),
  projective: freeze({ x: -0.1, y: 0.24, z: -0.04 }),
  sphere: freeze({ x: 0.08, y: -0.18, z: 0.02 })
});

const GALLERY_LAYOUT = freeze([
  freeze({ x: 15, y: 24, scale: 0.86 }),
  freeze({ x: 38, y: 22, scale: 0.88 }),
  freeze({ x: 62, y: 22, scale: 0.9 }),
  freeze({ x: 85, y: 24, scale: 0.86 }),
  freeze({ x: 26, y: 70, scale: 0.9 }),
  freeze({ x: 52, y: 72, scale: 0.92 }),
  freeze({ x: 78, y: 70, scale: 0.9 })
]);

export const galleryTiming = freeze({
  firstSurfaceAt: 0.22,
  surfaceStagger: 0.38,
  surfaceDuration: 0.58,
  cameraWithdrawAt: 2.8,
  cameraWithdrawDuration: 6.4,
  cameraEndScale: 0.78,
  cameraEndRotation: -1.4
});

function buildGalleryShape(chapter, index) {
  const demoId = GALLERY_DEMOS[chapter.id];
  const { definition: shot, demo } = findGameRenderShot(chapter.id, demoId);
  return freeze({
    id: chapter.id,
    light: GALLERY_LIGHTS[chapter.id],
    demo: demo.id,
    rotation: GALLERY_ROTATIONS[chapter.id],
    layout: GALLERY_LAYOUT[index],
    path: freeze({
      id: `${chapter.id}:${demo.id}`,
      sourcePathIndex: demo.sourcePathIndex,
      sourceModule: "src/data/game-render-shots.js",
      points: demo.points,
      seams: demo.seams,
      crossings: demo.crossings,
      board: shot.board
    })
  });
}

export const sevenWorldGalleryShapes = freeze(chapters.map(buildGalleryShape));
export const galleryPathIds = freeze(sevenWorldGalleryShapes.map(({ path }) => path.id));

function createGalleryShape(documentRef, shape) {
  const item = documentRef.createElement("figure");
  item.className = "seven-world-gallery__shape";
  item.dataset.galleryShape = shape.id;
  item.dataset.galleryDemo = shape.demo;
  item.dataset.galleryPathId = shape.path.id;
  item.dataset.galleryPathSource = shape.path.sourceModule;
  item.dataset.sourcePathIndex = String(shape.path.sourcePathIndex);
  item.dataset.galleryPathCrossings = shape.path.crossings.join(",");
  item.dataset.galleryRevealOrder = String(shape.layout ? GALLERY_LAYOUT.indexOf(shape.layout) : -1);
  if (shape.id === "sphere") {
    item.dataset.matchShape = "gallery-sphere";
    item.dataset.occlusion = "gallery-sphere";
  }
  item.style.setProperty("--gallery-light", shape.light);
  item.style.left = `${shape.layout.x}%`;
  item.style.top = `${shape.layout.y}%`;
  item.style.setProperty("--gallery-scale", String(shape.layout.scale));
  item.setAttribute("aria-hidden", "true");

  const canvas = documentRef.createElement("canvas");
  canvas.className = "seven-world-gallery__canvas";
  canvas.dataset.galleryCanvas = shape.id;
  canvas.dataset.galleryPathId = shape.path.id;
  canvas.dataset.galleryPathSource = shape.path.sourceModule;
  canvas.dataset.sourcePathIndex = String(shape.path.sourcePathIndex);
  canvas.dataset.galleryLiveCells = "[]";
  canvas.dataset.gallerySeams = JSON.stringify(shape.path.seams);
  canvas.dataset.galleryCanvasReady = "false";
  canvas.dataset.galleryAlpha = "false";
  canvas.dataset.galleryMappedCompletion = "false";
  canvas.width = 640;
  canvas.height = 640;
  canvas.setAttribute("aria-hidden", "true");

  const frame = documentRef.createElement("iframe");
  frame.className = "seven-world-gallery__adapter";
  frame.dataset.galleryGameRender = shape.id;
  frame.dataset.sourceRoot = "./assets/game-source";
  frame.title = `${shape.id} real GameRenderAdapter gallery source`;
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("aria-hidden", "true");

  item.append(canvas, frame);
  return item;
}

export function createSevenWorldGalleryScene(documentRef, sceneDefinition) {
  const composition = documentRef.createElement("div");
  composition.className = "seven-world-gallery";
  composition.dataset.sevenWorldGallery = "true";
  composition.dataset.galleryPathSource = "src/data/game-render-shots.js";
  composition.setAttribute("aria-hidden", "true");

  const field = documentRef.createElement("div");
  field.className = "seven-world-gallery__field";
  field.dataset.sceneAtmosphere = "seven-world-gallery";
  field.dataset.layoutIgnore = "";
  field.setAttribute("aria-hidden", "true");

  const camera = documentRef.createElement("div");
  camera.className = "seven-world-gallery__camera";
  camera.dataset.galleryCamera = "";
  camera.dataset.galleryCameraPosition = "center";
  camera.dataset.layoutIgnore = "";
  camera.setAttribute("aria-hidden", "true");
  sevenWorldGalleryShapes.forEach((shape) => camera.append(createGalleryShape(documentRef, shape)));

  composition.append(field, camera);
  return createSceneElement(documentRef, sceneDefinition, composition);
}

function copyAdapterFrame(controller, result) {
  const source = controller.adapter.boardCanvas();
  controller.canvas.width = source.width;
  controller.canvas.height = source.height;
  const context = controller.canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  context.clearRect(0, 0, controller.canvas.width, controller.canvas.height);
  context.drawImage(source, 0, 0);
  const status = result ?? controller.adapter.frame.contentWindow?.__PV_GAME__?.status?.() ?? {};
  const liveCells = status.winningPoints?.length ? status.winningPoints : controller.shape.path.points;
  controller.canvas.dataset.galleryLiveCells = JSON.stringify(liveCells);
  controller.canvas.dataset.gallerySeams = JSON.stringify(controller.shape.path.seams);
  controller.canvas.dataset.galleryCanvasReady = "true";
  controller.canvas.dataset.galleryMappedCompletion = String(Boolean(status.winningPoints?.length === 5));
  controller.canvas.dataset.galleryAdapterInstance = String(status.instanceId ?? controller.instanceId ?? "");
  controller.canvas.dataset.galleryTopology = controller.shape.id;
  controller.canvas.dataset.galleryDemo = controller.shape.demo;
  const pixels = context.getImageData(0, 0, Math.min(640, controller.canvas.width), Math.min(640, controller.canvas.height)).data;
  let hasAlpha = false;
  for (let index = 3; index < pixels.length; index += 64) {
    if (pixels[index] > 0) {
      hasAlpha = true;
      break;
    }
  }
  controller.canvas.dataset.galleryAlpha = String(hasAlpha);
  controller.instanceId = status.instanceId ?? controller.instanceId;
  return result;
}

export class SevenWorldGalleryController {
  constructor(scene, shape) {
    this.id = shape.id;
    this.scene = scene;
    this.shape = shape;
    this.canvas = scene.querySelector(`[data-gallery-canvas="${shape.id}"]`);
    this.frame = scene.querySelector(`iframe[data-gallery-game-render="${shape.id}"]`);
    if (!this.canvas || !this.frame) throw new Error(`gallery ${shape.id} needs a visible canvas and adapter frame`);
    this.adapter = new GameRenderAdapter(this.frame);
    this.definition = null;
    this.demo = null;
    this.instanceId = null;
  }

  async prepare() {
    await this.adapter.selectShot(this.shape.id, { demo: this.shape.demo });
    this.definition = this.adapter.definition;
    this.demo = this.adapter.demo;
    const result = await this.adapter.render({
      topology: this.shape.id,
      demo: this.shape.demo,
      shot: "completion",
      winningFive: true,
      morphProgress: this.shape.id === "plane" ? 0 : 1,
      rotation: this.shape.rotation,
      freezeRotation: false
    });
    this.instanceId = result.instanceId ?? this.adapter.instanceId;
    copyAdapterFrame(this, result);
    this.scene.dataset.galleryRenderReady = "true";
    return this;
  }

  renderCompletion() {
    const result = this.adapter.render({
      topology: this.shape.id,
      demo: this.shape.demo,
      shot: "completion",
      winningFive: true,
      morphProgress: this.shape.id === "plane" ? 0 : 1,
      rotation: this.shape.rotation,
      freezeRotation: false
    });
    if (result && typeof result.then === "function") return result.then((value) => copyAdapterFrame(this, value));
    return copyAdapterFrame(this, result);
  }
}

export async function prepareSevenWorldGalleryScenes(registry) {
  const scene = registry["seven-world-gallery"];
  if (!scene) throw new Error("seven-world gallery scene is missing from registry");
  const controllers = sevenWorldGalleryShapes.map((shape) => new SevenWorldGalleryController(scene, shape));
  await Promise.all(controllers.map((controller) => controller.prepare()));
  return freeze(Object.fromEntries(controllers.map((controller) => [controller.id, controller])));
}

export function addSevenWorldGalleryMotion(timeline, scene, start, duration) {
  const camera = scene.querySelector("[data-gallery-camera]");
  const shapes = [...scene.querySelectorAll("[data-gallery-shape]")];
  if (!camera || shapes.length !== sevenWorldGalleryShapes.length) throw new Error("seven-world gallery needs all seven shapes before motion is added");
  timeline.set(camera, { scale: 1, rotation: 0, filter: "blur(0px)" }, start);
  timeline.set(camera, { onUpdate: () => { camera.dataset.galleryCameraPosition = "center"; } }, start);
  shapes.forEach((shape, index) => {
    const revealAt = start + galleryTiming.firstSurfaceAt + index * galleryTiming.surfaceStagger;
    timeline.fromTo(shape, {
      opacity: 0,
      scale: 0.92,
      filter: "blur(5px)"
    }, {
      opacity: 1,
      scale: 1,
      filter: "blur(0px)",
      duration: galleryTiming.surfaceDuration,
      ease: "sine.out",
      immediateRender: false
    }, revealAt);
  });
  const withdrawAt = start + galleryTiming.cameraWithdrawAt;
  timeline.to(camera, {
    scale: galleryTiming.cameraEndScale,
    rotation: galleryTiming.cameraEndRotation,
    duration: galleryTiming.cameraWithdrawDuration,
    ease: "sine.inOut",
    onUpdate: () => {
      camera.dataset.galleryCameraPosition = "withdrawn-center";
    },
    onComplete: () => {
      camera.dataset.galleryCameraPosition = "withdrawn-center";
    }
  }, withdrawAt);
  if (start + duration + 1e-6 < withdrawAt + galleryTiming.cameraWithdrawDuration) {
    throw new Error("seven-world gallery duration must include the complete camera withdrawal");
  }
}

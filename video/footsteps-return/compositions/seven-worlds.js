import { chapters } from "../src/data/chapters.js";
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
  pathDelay: 0.16,
  pathDuration: 0.66,
  cameraWithdrawAt: 3.08,
  cameraWithdrawDuration: 3.62,
  cameraEndScale: 0.78
});

function pointsForDemo(shot, demo) {
  return demo.points
    .map(([x, y]) => `${((x + 0.5) / shot.board.width * 100).toFixed(3)},${((y + 0.5) / shot.board.height * 100).toFixed(3)}`)
    .join(" ");
}

function buildGalleryShape(chapter, index, pathOffset) {
  const { definition: shot } = findGameRenderShot(chapter.id);
  return freeze({
    id: chapter.id,
    light: GALLERY_LIGHTS[chapter.id],
    asset: `./assets/topology/${chapter.id}.svg`,
    layout: GALLERY_LAYOUT[index],
    paths: freeze(shot.demos.map((demo, pathIndex) => freeze({
      id: `${chapter.id}:${demo.id}`,
      sourcePathIndex: demo.sourcePathIndex,
      sourceModule: "src/data/game-render-shots.js",
      order: pathOffset + pathIndex,
      points: demo.points,
      seams: demo.seams,
      crossings: demo.crossings,
      polyline: pointsForDemo(shot, demo)
    })))
  });
}

let pathOffset = 0;
export const sevenWorldGalleryShapes = freeze(chapters.map((chapter, index) => {
  const shape = buildGalleryShape(chapter, index, pathOffset);
  pathOffset += shape.paths.length;
  return shape;
}));
export const galleryPathIds = freeze(sevenWorldGalleryShapes.flatMap(({ paths }) => paths.map(({ id }) => id)));

function createPath(documentRef, shape, path) {
  const line = documentRef.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.dataset.galleryPath = path.id;
  line.dataset.pathSource = path.sourceModule;
  line.dataset.sourcePathIndex = String(path.sourcePathIndex);
  line.dataset.pathOrder = String(path.order);
  line.dataset.pathCrossings = path.crossings.join(",");
  line.setAttribute("points", path.polyline);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", shape.light);
  line.setAttribute("stroke-width", "1.35");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  line.setAttribute("stroke-dasharray", "2.6 1.8");
  line.setAttribute("stroke-dashoffset", "120");
  line.setAttribute("vector-effect", "non-scaling-stroke");
  line.style.opacity = "0";
  line.setAttribute("aria-hidden", "true");
  return line;
}

function createGalleryShape(documentRef, shape) {
  const item = documentRef.createElement("figure");
  item.className = "seven-world-gallery__shape";
  item.dataset.galleryShape = shape.id;
  item.dataset.galleryShapeIndex = String(shape.layout ? GALLERY_LAYOUT.indexOf(shape.layout) : -1);
  item.dataset.pathIds = shape.paths.map(({ id }) => id).join(",");
  item.style.setProperty("--gallery-light", shape.light);
  item.style.left = `${shape.layout.x}%`;
  item.style.top = `${shape.layout.y}%`;
  item.style.setProperty("--gallery-scale", String(shape.layout.scale));
  item.setAttribute("aria-hidden", "true");

  const surface = documentRef.createElement("img");
  surface.className = "seven-world-gallery__surface";
  surface.src = shape.asset;
  surface.alt = "";
  surface.draggable = false;

  const pathLayer = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
  pathLayer.classList.add("seven-world-gallery__paths");
  pathLayer.setAttribute("viewBox", "0 0 100 100");
  pathLayer.setAttribute("preserveAspectRatio", "none");
  pathLayer.setAttribute("aria-hidden", "true");
  shape.paths.forEach((path) => pathLayer.append(createPath(documentRef, shape, path)));

  item.append(surface, pathLayer);
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
  camera.dataset.layoutIgnore = "";
  camera.setAttribute("aria-hidden", "true");
  sevenWorldGalleryShapes.forEach((shape) => camera.append(createGalleryShape(documentRef, shape)));

  composition.append(field, camera);
  return createSceneElement(documentRef, sceneDefinition, composition);
}

export function addSevenWorldGalleryMotion(timeline, scene, start, duration) {
  const camera = scene.querySelector("[data-gallery-camera]");
  const shapes = [...scene.querySelectorAll("[data-gallery-shape]")];
  if (!camera || shapes.length !== sevenWorldGalleryShapes.length) throw new Error("seven-world gallery needs all seven shapes before motion is added");
  timeline.set(camera, { scale: 1, filter: "blur(0px)" }, start);
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
    [...shape.querySelectorAll("[data-gallery-path]")].forEach((path) => {
      timeline.to(path, {
        opacity: 0.82,
        strokeDashoffset: 0,
        duration: galleryTiming.pathDuration,
        ease: "sine.inOut"
      }, revealAt + galleryTiming.pathDelay);
    });
  });
  const withdrawAt = start + Math.min(galleryTiming.cameraWithdrawAt, Math.max(0, duration - galleryTiming.cameraWithdrawDuration));
  timeline.to(camera, {
    scale: galleryTiming.cameraEndScale,
    duration: galleryTiming.cameraWithdrawDuration,
    ease: "sine.inOut"
  }, withdrawAt);
}

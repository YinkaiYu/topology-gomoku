import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { masterTimeline } from "../src/data/timeline.js";
import { transitionContracts } from "../src/runtime/transitions.js";
import { startStaticServer } from "./serve-app.mjs";

const artifactDirectory = "artifacts/pv-transition-scenes-task7";
const viewport = Object.freeze({ width: 3840, height: 2160, deviceScaleFactor: 1 });

function sceneStart(id) {
  const scene = masterTimeline.scenes.find((candidate) => candidate.id === id);
  if (!scene) throw new Error(`unknown scene ${id}`);
  return scene.start;
}

function transitionBoundary(from, to) {
  const contract = transitionContracts.find((candidate) => candidate.from === from && candidate.to === to);
  if (!contract) throw new Error(`unknown transition ${from}->${to}`);
  return sceneStart(to) - contract.duration;
}

const expectedGeometry = (occlusion, outgoing, incoming) => Object.freeze({ occlusion, outgoing, incoming });

const frame = (id, seek, phase, contractId, geometry, filename, description) => Object.freeze({
  id,
  seek,
  phase,
  contractId,
  expectedGeometry: geometry,
  filename,
  description,
  path: `${artifactDirectory}/${filename}`
});

export const transitionCapturePlan = Object.freeze([
  frame("cylinder-to-torus-pre", transitionBoundary("chapter-cylinder", "chapter-card-torus") + 0.17, "pre", "chapter-cylinder--chapter-card-torus", expectedGeometry("cylinder-section", "cylinder-section", "torus-inner-ring"), "task7-cylinder-to-torus-pre.png", "cylinder section entering the torus inner-ring match"),
  frame("cylinder-to-torus-mid", transitionBoundary("chapter-cylinder", "chapter-card-torus") + 0.31, "mid", "chapter-cylinder--chapter-card-torus", expectedGeometry("cylinder-section", "cylinder-section", "torus-inner-ring"), "task7-cylinder-to-torus-mid.png", "cylinder section matched to the torus inner ring during the black dip"),
  frame("cylinder-to-torus-post", sceneStart("chapter-card-torus") + 0.02, "post", "chapter-cylinder--chapter-card-torus", expectedGeometry("cylinder-section", "cylinder-section", "torus-inner-ring"), "task7-cylinder-to-torus-post.png", "incoming torus ring held through the delayed card reveal"),
  frame("torus-to-mobius-mid", transitionBoundary("chapter-torus", "chapter-card-mobius") + 0.31, "mid", "chapter-torus--chapter-card-mobius", expectedGeometry("torus-aperture", "torus-inner-ring", "mobius-twist-center"), "task7-torus-to-mobius-mid.png", "torus aperture matched to the Möbius twist center"),
  frame("mobius-to-klein-mid", transitionBoundary("chapter-mobius", "chapter-card-klein") + 0.31, "mid", "chapter-mobius--chapter-card-klein", expectedGeometry("mobius-ribbon", "mobius-grazing-mirror", "klein-cross"), "task7-mobius-to-klein-mid.png", "Möbius grazing mirror matched to the Klein crossing"),
  frame("gallery-withdrawal-before-outro", 146.9, "overlap-before", "seven-world-gallery--outro", expectedGeometry("gallery-sphere", "gallery-sphere", "outro-darkness"), "task7-gallery-withdrawal-146.90s.png", "gallery withdrawal immediately before the first outro narration cue"),
  frame("gallery-withdrawal-during-outro", 148.4, "overlap-during", "seven-world-gallery--outro", expectedGeometry("gallery-sphere", "gallery-sphere", "outro-darkness"), "task7-gallery-withdrawal-148.40s.png", "gallery withdrawal continuing under the first outro narration cue")
]);

async function measurePixels(page, png) {
  const metrics = await page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 270;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixelCount = canvas.width * canvas.height;
    let luminanceSum = 0;
    let luminanceSquareSum = 0;
    let nonPureColorPixels = 0;
    const corners = [
      [data[0], data[1], data[2]],
      [data[(canvas.width - 1) * 4], data[(canvas.width - 1) * 4 + 1], data[(canvas.width - 1) * 4 + 2]],
      [data[(canvas.height - 1) * canvas.width * 4], data[(canvas.height - 1) * canvas.width * 4 + 1], data[(canvas.height - 1) * canvas.width * 4 + 2]],
      [data[(pixelCount - 1) * 4], data[(pixelCount - 1) * 4 + 1], data[(pixelCount - 1) * 4 + 2]]
    ];
    const background = [0, 1, 2].map((channel) => Math.round(corners.reduce((sum, color) => sum + color[channel], 0) / corners.length));
    let contentPixels = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const luminance = (red + green + blue) / 3;
      luminanceSum += luminance;
      luminanceSquareSum += luminance * luminance;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) >= 5 || luminance >= 13) {
        nonPureColorPixels += 1;
      }
      if (Math.max(Math.abs(red - background[0]), Math.abs(green - background[1]), Math.abs(blue - background[2])) >= 6) {
        const pixelIndex = index / 4;
        const x = pixelIndex % canvas.width;
        const y = Math.floor(pixelIndex / canvas.width);
        contentPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const mean = luminanceSum / pixelCount;
    return {
      mean,
      variance: luminanceSquareSum / pixelCount - mean * mean,
      nonPureColorRatio: nonPureColorPixels / pixelCount,
      background: { red: background[0], green: background[1], blue: background[2] },
      contentBbox: contentPixels > 0 ? {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixelRatio: contentPixels / pixelCount
      } : null
    };
  }, `data:image/png;base64,${png.toString("base64")}`);
  return Object.freeze(metrics);
}

function contactSheetMarkup(frames) {
  const cells = frames.map((item) => `<figure><img src="${item.dataUrl}" alt=""><figcaption>${item.id} · ${item.seek.toFixed(2)}s · ${item.phase}</figcaption></figure>`).join("");
  return `<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;width:3840px;height:2160px;overflow:hidden;background:#060908;color:#f2efe7;font:26px Georgia,serif}
    .grid{display:grid;grid-template-columns:repeat(4,960px);grid-template-rows:repeat(2,1080px);width:3840px;height:2160px}.grid figure{position:relative;margin:0;overflow:hidden;border:1px solid #21302c;background:#060908}.grid img{display:block;width:100%;height:100%;object-fit:contain}.grid figcaption{position:absolute;left:24px;bottom:22px;padding:10px 14px;background:rgba(6,9,8,.78);letter-spacing:.04em}
  </style><div class="grid">${cells}</div>`;
}

async function settle(page, seek) {
  return page.evaluate(async (time) => {
    const timeline = window.__timelines["footsteps-return"];
    timeline.time(time, false).pause();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      timelineTime: timeline.time(),
      renderReady: document.documentElement.dataset.renderReady === "true"
    };
  }, seek);
}

async function observe(page, planned) {
  return page.evaluate(({ id, seek, contractId }) => {
    const layer = document.querySelector(`[data-pv-transition-layer="${contractId}"]`);
    const gallery = document.querySelector('[data-scene-id="seven-world-gallery"]');
    const camera = gallery?.querySelector("[data-gallery-camera]");
    const source = layer?.dataset.transitionSource;
    const target = layer?.dataset.transitionTarget;
    const sourceScene = layer ? document.querySelector(`[data-scene-id="${layer.dataset.transitionFrom}"]`) : null;
    const targetScene = layer ? document.querySelector(`[data-scene-id="${layer.dataset.transitionTo}"]`) : null;
    const bbox = (node) => {
      const rect = node?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    return {
      id,
      seek,
      contractId,
      renderReady: document.documentElement.dataset.renderReady === "true",
      layer: layer ? {
        occlusion: layer.dataset.transitionOcclusion,
        occlusionGeometry: layer.dataset.transitionOcclusionGeometry,
        occlusionConsumed: layer.dataset.occlusionConsumed === "true",
        match: layer.dataset.transitionMatch,
        shape: layer.dataset.transitionShape,
        source,
        target,
        sourceBbox: bbox(sourceScene?.querySelector(`[data-match-shape="${source}"]`)),
        targetBbox: bbox(targetScene?.querySelector(`[data-match-shape="${target}"]`))
      } : null,
      geometry: layer ? [...layer.querySelectorAll("[data-transition-geometry-side]")].map((node) => {
        const style = getComputedStyle(node);
        return {
          side: node.dataset.transitionGeometrySide,
          geometry: node.dataset.transitionGeometry,
          shape: node.dataset.transitionGeometryShape,
          matchId: node.dataset.transitionMatchId || null,
          opacity: Number(style.opacity),
          clipPath: style.clipPath,
          maskImage: style.maskImage,
          bbox: bbox(node)
        };
      }) : [],
      galleryCamera: camera ? {
        transform: getComputedStyle(camera).transform,
        position: camera.dataset.galleryCameraPosition,
        overlapsOutroNarration: seek >= 147 && seek <= 149.2
      } : null
    };
  }, planned);
}

export async function captureTransitionEvidence({ projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") } = {}) {
  const repositoryRoot = path.resolve(projectRoot, "..", "..");
  const captureDirectory = path.join(repositoryRoot, artifactDirectory);
  await mkdir(captureDirectory, { recursive: true });
  const server = await startStaticServer({ root: projectRoot });
  const browser = await chromium.launch({ headless: true });
  const manifest = [];
  try {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor });
    await page.goto(`${server.url}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.__renderReady);

    for (const planned of transitionCapturePlan) {
      const settled = await settle(page, planned.seek);
      const observation = await observe(page, planned);
      const screenshot = await page.screenshot();
      await writeFile(path.join(captureDirectory, planned.filename), screenshot);
      manifest.push(Object.freeze({
        ...planned,
        viewport,
        native4k: true,
        timelineTime: settled.timelineTime,
        observation,
        pixels: await measurePixels(page, screenshot)
      }));
    }

    const contactFrames = await Promise.all(manifest.map(async (item) => ({
      ...item,
      dataUrl: `data:image/png;base64,${(await readFile(path.join(repositoryRoot, item.path))).toString("base64")}`
    })));
    const sheet = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor });
    await sheet.setContent(contactSheetMarkup(contactFrames), { waitUntil: "load" });
    await sheet.screenshot({ path: path.join(repositoryRoot, `${artifactDirectory}-contact-sheet.png`) });

    const manifestPath = path.join(repositoryRoot, `${artifactDirectory}-manifest.json`);
    await writeFile(manifestPath, `${JSON.stringify({ task: "task7-transitions", viewport, native4k: true, frames: manifest }, null, 2)}\n`, "utf8");
    return Object.freeze(manifest);
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await captureTransitionEvidence();
  console.log(`Captured ${manifest.length} native 4K transition frames and ${artifactDirectory}-contact-sheet.png.`);
}

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { captionCues } from "../src/data/captions.js";
import { findFfmpeg } from "./doctor.mjs";
import { startStaticServer } from "./serve-app.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const projectRoot = path.join(repositoryRoot, "video", "footsteps-return");
const artifactDirectory = "artifacts/pv-caption-scenes-task8";
const viewport = Object.freeze({ width: 3840, height: 2160, deviceScaleFactor: 1 });
const evidenceCueIds = Object.freeze([
  "intro-boundary-01",
  "plane-order-02",
  "cylinder-distance-01",
  "klein-two-returns-03",
  "sphere-boundary-01",
  "outro-world-01"
]);

function cueById(id) {
  const cue = captionCues.find((candidate) => candidate.id === id);
  if (!cue) throw new Error(`unknown caption review cue ${id}`);
  return cue;
}

export const captionReviewPlan = Object.freeze(evidenceCueIds.map((id) => {
  const cue = cueById(id);
  return Object.freeze({
    id,
    seek: cue.start + (cue.fadeInFrames + 1) / 60,
    text: cue.text,
    filename: `task8-${id}.png`,
    path: `${artifactDirectory}/task8-${id}.png`
  });
}));

async function settle(page, seek) {
  await page.evaluate(async (time) => {
    const timeline = window.__timelines["footsteps-return"];
    timeline.time(time, false).pause();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, seek);
}

async function inspectCaption(page, planned) {
  return page.evaluate(({ id, text: expectedText }) => {
    const group = document.querySelector("[data-caption-group]");
    const node = document.querySelector(`[data-caption-cue="${id}"]`);
    const range = document.createRange();
    range.selectNodeContents(node);
    const style = getComputedStyle(node);
    const visibleCount = [...group.querySelectorAll("[data-caption-cue]")]
      .filter((candidate) => Number(getComputedStyle(candidate).opacity) > 0.001).length;
    return {
      text: node.textContent,
      expectedText,
      visibleCount,
      lineCount: range.getClientRects().length,
      width: range.getBoundingClientRect().width,
      safeWidth: group.getBoundingClientRect().width,
      fontFamily: style.fontFamily.replaceAll('"', ""),
      fontSize: Number.parseFloat(style.fontSize),
      opacity: Number(style.opacity)
    };
  }, planned);
}

function contactSheetMarkup(frames) {
  const cells = frames.map((frame) => `
    <figure>
      <img src="${frame.dataUrl}" alt="">
      <figcaption>${frame.id}<small>${frame.text}</small></figcaption>
    </figure>`).join("");
  return `<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;width:3840px;height:2160px;overflow:hidden;background:#060908;color:#fff;font:26px Georgia,serif}
    .grid{display:grid;grid-template-columns:repeat(3,1280px);grid-template-rows:repeat(2,1080px);width:3840px;height:2160px}
    figure{position:relative;margin:0;overflow:hidden;border:1px solid #21302c;background:#060908}
    img{display:block;width:100%;height:100%;object-fit:cover}
    figcaption{position:absolute;left:22px;bottom:20px;padding:10px 14px;background:rgba(6,9,8,.82);letter-spacing:.03em}
    small{display:block;margin-top:5px;color:#d8d5cc;font-size:20px}
  </style><div class="grid">${cells}</div>`;
}

function requireSuccessful(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
}

async function buildCaptionOnlyRender(page, outputDirectory) {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) throw new Error("FFmpeg is required for the caption-only review render");
  const frameDirectory = path.join(projectRoot, "captures", "caption-review-frames");
  const capturesRoot = path.join(projectRoot, "captures") + path.sep;
  if (!frameDirectory.startsWith(capturesRoot)) throw new Error(`unsafe caption frame directory ${frameDirectory}`);
  await rm(frameDirectory, { recursive: true, force: true });
  await mkdir(frameDirectory, { recursive: true });
  await page.addStyleTag({ content: "[data-scene-layer]{visibility:hidden!important} [data-composition-id]{background:#060908!important}" });
  await page.evaluate(() => { document.querySelector("[data-caption-group]").style.visibility = "hidden"; });
  const blank = await page.screenshot();
  await page.evaluate(() => { document.querySelector("[data-caption-group]").style.visibility = "visible"; });

  let frameIndex = 0;
  for (const cue of captionCues) {
    await settle(page, cue.start + (cue.fadeInFrames + 1) / 60);
    const caption = await page.screenshot();
    for (const image of [caption, caption, blank]) {
      await writeFile(path.join(frameDirectory, `frame-${String(frameIndex).padStart(3, "0")}.png`), image);
      frameIndex += 1;
    }
  }

  await mkdir(outputDirectory, { recursive: true });
  const output = path.join(outputDirectory, "footsteps-return-caption-review.mp4");
  const result = spawnSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-framerate", "2", "-i", path.join(frameDirectory, "frame-%03d.png"),
    "-vf", "scale=1920:1080:flags=lanczos", "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
    output
  ], { stdio: "inherit" });
  requireSuccessful(result, "caption-only review render");
  const media = await readFile(output);
  return Object.freeze({
    path: "video/footsteps-return/renders/footsteps-return-caption-review.mp4",
    width: 1920,
    height: 1080,
    fps: 30,
    durationSeconds: captionCues.length * 1.5,
    bytes: media.length,
    sha256: createHash("sha256").update(media).digest("hex")
  });
}

export async function captureCaptionEvidence() {
  const captureDirectory = path.join(repositoryRoot, artifactDirectory);
  await mkdir(captureDirectory, { recursive: true });
  const server = await startStaticServer({ root: projectRoot });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor });
    await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.__renderReady);
    const frames = [];
    for (const planned of captionReviewPlan) {
      await settle(page, planned.seek);
      const inspection = await inspectCaption(page, planned);
      if (inspection.text !== planned.text || inspection.visibleCount !== 1 || inspection.lineCount !== 1 || inspection.width > inspection.safeWidth + 0.5 || inspection.opacity < 0.99) {
        throw new Error(`caption evidence inspection failed: ${JSON.stringify({ ...planned, ...inspection })}`);
      }
      const screenshot = await page.screenshot();
      await writeFile(path.join(captureDirectory, planned.filename), screenshot);
      frames.push(Object.freeze({ ...planned, ...inspection }));
    }

    const sheetFrames = await Promise.all(frames.map(async (frame) => ({
      ...frame,
      dataUrl: `data:image/png;base64,${(await readFile(path.join(repositoryRoot, frame.path))).toString("base64")}`
    })));
    const sheet = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor });
    await sheet.setContent(contactSheetMarkup(sheetFrames), { waitUntil: "load" });
    await sheet.screenshot({ path: path.join(repositoryRoot, `${artifactDirectory}-contact-sheet.png`) });
    await sheet.close();

    const reviewRender = await buildCaptionOnlyRender(page, path.join(projectRoot, "renders"));
    await writeFile(
      path.join(repositoryRoot, `${artifactDirectory}-manifest.json`),
      `${JSON.stringify({ task: "task8-captions", viewport, native4k: true, frames, reviewRender }, null, 2)}\n`,
      "utf8"
    );
    return Object.freeze({ frames, reviewRender });
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const result = await captureCaptionEvidence();
  console.log(`Captured ${result.frames.length} native 4K caption frames and ${captionCues.length}-cue caption-only review render.`);
}

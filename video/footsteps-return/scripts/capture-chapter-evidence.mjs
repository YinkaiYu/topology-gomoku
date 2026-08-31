import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./serve-app.mjs";

const artifactDirectory = "artifacts/pv-chapter-scenes-task6";
const frame = (id, kind, shot, demo, crossingIndex, filename) => Object.freeze({
  id,
  kind,
  shot,
  demo,
  crossingIndex,
  filename,
  path: `${artifactDirectory}/${filename}`
});

export const chapterCapturePlan = Object.freeze([
  frame("plane", "evidence", "finite-five", "ordinary-five", null, "task6-plane-finite-five.png"),
  frame("plane", "hero", "morph-hero", "ordinary-five", null, "task6-plane-morph-hero.png"),
  frame("cylinder", "evidence", "crossing-breathe", "horizontal-wrap", 0, "task6-cylinder-crossing-1.png"),
  frame("cylinder", "hero", "morph-hero", "horizontal-wrap", null, "task6-cylinder-morph-hero.png"),
  frame("torus", "evidence", "crossing-breathe", "two-seam-diagonal", 0, "task6-torus-crossing-1.png"),
  frame("torus", "evidence", "crossing-breathe", "two-seam-diagonal", 1, "task6-torus-crossing-2.png"),
  frame("torus", "hero", "morph-hero", "two-seam-diagonal", null, "task6-torus-morph-hero.png"),
  frame("mobius", "evidence", "crossing-breathe", "reflected-crossing", 0, "task6-mobius-crossing-1.png"),
  frame("mobius", "hero", "morph-hero", "reflected-crossing", null, "task6-mobius-morph-hero.png"),
  frame("klein", "evidence", "crossing-breathe", "preserved-crossing", 0, "task6-klein-preserved-crossing.png"),
  frame("klein", "evidence", "crossing-breathe", "reflected-crossing", 1, "task6-klein-reflected-crossing.png"),
  frame("klein", "hero", "morph-hero", "reflected-crossing", null, "task6-klein-morph-hero.png"),
  frame("projective", "evidence", "crossing-breathe", "mirrored-crossings", 0, "task6-projective-crossing-1.png"),
  frame("projective", "evidence", "crossing-breathe", "mirrored-crossings", 1, "task6-projective-crossing-2.png"),
  frame("projective", "hero", "morph-hero", "mirrored-crossings", null, "task6-projective-morph-hero.png"),
  frame("sphere", "evidence", "crossing-breathe", "adjacent-edge-turn", 0, "task6-sphere-crossing-1.png"),
  frame("sphere", "hero", "morph-hero", "adjacent-edge-turn", null, "task6-sphere-morph-hero.png")
]);

function contactSheetMarkup(manifest) {
  const cells = manifest.map((item) => `<figure><img src="${item.dataUrl}"><figcaption>${item.id} · ${item.shot} · ${item.demo}${item.crossingIndex === null ? "" : ` · crossing ${item.crossingIndex + 1}`}</figcaption></figure>`).join("");
  return `<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#060908;color:#f2efe7;font:18px Georgia,serif}
    .grid{display:grid;grid-template-columns:repeat(5,384px);grid-auto-rows:270px}.grid figure{position:relative;margin:0;overflow:hidden;border:1px solid #21302c;background:#060908}
    .grid img{display:block;width:100%;height:100%;object-fit:cover}.grid figcaption{position:absolute;left:14px;bottom:12px;padding:5px 9px;background:rgba(6,9,8,.78);letter-spacing:.04em}
  </style><div class="grid">${cells}</div>`;
}

export async function captureChapterEvidence({ projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") } = {}) {
  const repositoryRoot = path.resolve(projectRoot, "..", "..");
  const captureDirectory = path.join(repositoryRoot, artifactDirectory);
  await mkdir(captureDirectory, { recursive: true });
  const server = await startStaticServer({ root: projectRoot });
  const browser = await chromium.launch({ headless: true });
  const manifest = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.__pvRenderReadyPromise);
    await page.addStyleTag({ content: "html,body{width:1920px!important;height:1080px!important;overflow:hidden!important}[data-composition-id=footsteps-return]{transform:scale(.5);transform-origin:0 0}.caption-group{display:none!important}" });

    for (const planned of chapterCapturePlan) {
      const timing = await page.evaluate((entry) => {
        const controller = window.__pvChapterControllers[entry.id];
        const matchingDemo = controller.samples.filter((sample) => sample.demo === entry.demo);
        let sample;
        if (entry.shot === "finite-five") sample = matchingDemo.findLast((candidate) => candidate.phase === "drop" && candidate.step === 5);
        else if (entry.shot === "crossing-breathe") sample = matchingDemo.filter((candidate) => candidate.phase === "breathe").at(entry.crossingIndex);
        else sample = matchingDemo.filter((candidate) => candidate.phase === "morph").at(-1);
        if (!sample) throw new Error(`missing capture sample ${entry.id}/${entry.demo}/${entry.shot}/${entry.crossingIndex}`);
        return { sample, start: controller.sceneStart, duration: controller.sceneDuration };
      }, planned);
      const time = timing.start + 0.22 + timing.sample.progress * (timing.duration - 1.18);
      await page.evaluate(async ({ chapterId, progress, timePosition }) => {
        window.__timelines["footsteps-return"].time(timePosition, false).pause();
        await window.__pvChapterControllers[chapterId].renderProgress(progress);
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      }, { chapterId: planned.id, progress: timing.sample.progress, timePosition: time });
      await page.screenshot({ path: path.join(captureDirectory, planned.filename) });
      manifest.push(Object.freeze({ ...planned, phase: timing.sample.phase, step: timing.sample.step, progress: timing.sample.progress }));
    }

    const contactFrames = await Promise.all(manifest.map(async (item) => ({ ...item, dataUrl: `data:image/png;base64,${(await readFile(path.join(repositoryRoot, item.path))).toString("base64")}` })));
    const sheet = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await sheet.setContent(contactSheetMarkup(contactFrames), { waitUntil: "networkidle" });
    await sheet.screenshot({ path: path.join(repositoryRoot, "artifacts", "pv-chapter-scenes-task6-contact-sheet.png") });
    return Object.freeze(manifest);
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await captureChapterEvidence();
  console.log(`Captured ${manifest.length} chapter frames and artifacts/pv-chapter-scenes-task6-contact-sheet.png.`);
}

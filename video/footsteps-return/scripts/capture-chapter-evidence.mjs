import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./serve-app.mjs";

const chapterIds = ["plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"];

export const chapterCapturePlan = Object.freeze(chapterIds.flatMap((id) => [
  Object.freeze({ id, kind: "evidence", filename: `task6-${id}-evidence.png` }),
  Object.freeze({ id, kind: "hero", filename: `task6-${id}-hero.png` })
]));

function contactSheetMarkup(manifest, serverUrl) {
  const cells = manifest.map((item) => `<figure><img src="${serverUrl}/captures/${item.filename}"><figcaption>${item.id} · ${item.kind} · ${item.demo}</figcaption></figure>`).join("");
  return `<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#060908;color:#f2efe7;font:18px Georgia,serif}
    .grid{display:grid;grid-template-columns:repeat(4,480px);grid-auto-rows:270px}.grid figure{position:relative;margin:0;overflow:hidden;border:1px solid #21302c;background:#060908}
    .grid img{display:block;width:100%;height:100%;object-fit:cover}.grid figcaption{position:absolute;left:14px;bottom:12px;padding:5px 9px;background:rgba(6,9,8,.78);letter-spacing:.04em}
  </style><div class="grid">${cells}</div>`;
}

export async function captureChapterEvidence({ projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") } = {}) {
  const captureDirectory = path.join(projectRoot, "captures");
  await mkdir(captureDirectory, { recursive: true });
  const server = await startStaticServer({ root: projectRoot });
  const browser = await chromium.launch({ headless: true });
  const manifest = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.__renderReady);
    await page.addStyleTag({ content: "html,body{width:1920px!important;height:1080px!important;overflow:hidden!important}[data-composition-id=footsteps-return]{transform:scale(.5);transform-origin:0 0}.caption-group{display:none!important}" });

    for (const id of chapterIds) {
      const timing = await page.evaluate((chapterId) => {
        const controller = window.__pvChapterControllers[chapterId];
        const evidence = chapterId === "plane"
          ? controller.samples.findLast((sample) => sample.phase === "drop" && sample.step === 5)
          : controller.samples.findLast((sample) => sample.phase === "breathe");
        const hero = controller.samples.filter((sample) => sample.phase === "morph").at(-1);
        return { evidence, hero, start: controller.sceneStart, duration: controller.sceneDuration };
      }, id);

      for (const kind of ["evidence", "hero"]) {
        const sample = timing[kind];
        const time = timing.start + 0.22 + sample.progress * (timing.duration - 1.18);
        await page.evaluate(async ({ chapterId, progress, timePosition }) => {
          window.__timelines["footsteps-return"].time(timePosition, false).pause();
          await window.__pvChapterControllers[chapterId].renderProgress(progress);
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        }, { chapterId: id, progress: sample.progress, timePosition: time });
        const filename = `task6-${id}-${kind}.png`;
        await page.screenshot({ path: path.join(captureDirectory, filename) });
        manifest.push(Object.freeze({ id, kind, filename, demo: sample.demo, phase: sample.phase, progress: sample.progress }));
      }
    }

    const sheet = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await sheet.setContent(contactSheetMarkup(manifest, server.url), { waitUntil: "networkidle" });
    await sheet.screenshot({ path: path.join(captureDirectory, "task6-chapter-contact-sheet.png") });
    return Object.freeze(manifest);
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await captureChapterEvidence();
  console.log(`Captured ${manifest.length} chapter frames and task6-chapter-contact-sheet.png.`);
}

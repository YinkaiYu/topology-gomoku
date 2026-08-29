import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { chromium } from "playwright";
import { gameRenderShots } from "../src/data/game-render-shots.js";
import { startStaticServer } from "./serve-app.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
const fail = (message) => { throw new Error(`game-render verify: ${message}`); };
const assertEqual = (actual, expected, label) => { if (!isDeepStrictEqual(actual, expected)) fail(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); };
const server = await startStaticServer({ root });
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 700, height: 700 }, deviceScaleFactor: 1, colorScheme: "light", locale: "zh-CN" });
  await page.goto(`${server.url}/video/footsteps-return/render-game.html`, { waitUntil: "networkidle" });
  const stage = page.frameLocator("#game-render-frame").locator("#boardStage");
  const screenshot = () => stage.screenshot({ omitBackground: true });
  const render = (state) => page.evaluate((value) => window.gameRender.render(value), state);
  const select = (topology, demo) => page.evaluate(([id, demoId]) => window.gameRender.selectShot(id, { demo: demoId }), [topology, demo]);
  const baseState = (definition, demo, overrides = {}) => ({
    topology: definition.id, shot: "helper", demo: demo.id, lessonStep: 0, dropProgress: 0,
    breathPhase: 0, morphProgress: 0, rotation: { x: 0, y: 0, z: 0 }, freezeRotation: true, ...overrides
  });
  let pathCount = 0;
  let crossingCount = 0;
  let alphaChecked = false;
  let maxQueueSize = 0;

  for (const definition of gameRenderShots) {
    const initialDemo = definition.demos[0];
    const readiness = await select(definition.id, initialDemo.id);
    if (!readiness.ready) fail(`${definition.id} fonts/canvas were not ready`);
    const instanceId = readiness.status.instanceId;

    for (const demo of definition.demos) {
      pathCount += 1;
      const establish = await render(baseState(definition, demo));
      if (establish.instanceId !== instanceId) fail(`${definition.id}/${demo.id} reloaded the iframe`);
      if (establish.sourcePathIndex !== demo.sourcePathIndex) fail(`${definition.id}/${demo.id} selected source path ${establish.sourcePathIndex}`);
      assertEqual(establish.lessonPoints, demo.points, `${definition.id}/${demo.id} real lesson points`);
      assertEqual(establish.lessonSeams, demo.seams, `${definition.id}/${demo.id} real lesson seams`);
      if (establish.visiblePromptCalls !== 0 || !(establish.suppressedTextCalls > 0)) fail(`${definition.id}/${demo.id} rendered its lesson prompt text`);

      const stableA = await screenshot();
      await page.waitForTimeout(80);
      const stableB = await screenshot();
      if (digest(stableA) !== digest(stableB)) fail(`${definition.id}/${demo.id} advanced without render(state)`);

      if (!alphaChecked) {
        const alphas = await page.evaluate(async (url) => {
          const image = new Image(); image.src = url; await image.decode();
          const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
          return [[0,0],[image.width-1,0],[0,image.height-1],[image.width-1,image.height-1]].map(([x,y]) => context.getImageData(x,y,1,1).data[3]);
        }, `data:image/png;base64,${stableA.toString("base64")}`);
        if (alphas.some(Boolean)) fail(`transparent corner alpha mismatch: ${alphas.join(",")}`);
        alphaChecked = true;
      }

      for (const beforeStep of demo.crossings) {
        crossingCount += 1;
        const crossing = await render(baseState(definition, demo, { lessonStep: beforeStep - 1, breathPhase: .35 }));
        const expectedSeam = demo.seams[beforeStep - 2];
        const cue = crossing.lessonSeamCues.find((item) => item.pending && item.index === beforeStep - 1 && item.pathIndex === demo.sourcePathIndex);
        if (!cue || cue.seam !== expectedSeam) fail(`${definition.id}/${demo.id} crossing before step ${beforeStep} lacked its real pending seam cue`);
        if (crossing.visiblePromptCalls !== 0 || !(crossing.suppressedTextCalls > 0)) fail(`${definition.id}/${demo.id} rendered lesson prompt text`);
      }

      for (let step = 1; step <= 5; step += 1) {
        const early = await render(baseState(definition, demo, { lessonStep: step - 1, dropProgress: .2 }));
        const late = await render(baseState(definition, demo, { lessonStep: step - 1, dropProgress: .8 }));
        if (early.lessonStep !== step || late.lessonStep !== step) fail(`${definition.id}/${demo.id} did not complete native drop ${step}`);
        if (step === 5) assertEqual(late.winningPoints.map(String).sort(), demo.points.map(String).sort(), `${definition.id}/${demo.id} final native five`);
      }

      const earlyState = baseState(definition, demo, { lessonStep: 1, breathPhase: .2 });
      const earlyHash = digest(await (async () => { await render(earlyState); return screenshot(); })());
      const completionState = (morphProgress, rotation = { x: 0, y: 0, z: 0 }) => baseState(definition, demo, { shot: "completion", lessonStep: 5, dropProgress: 1, morphProgress, rotation });
      await render(completionState(1, { x: -.18, y: .72, z: .04 }));
      const lateHash = digest(await screenshot());
      const pulledBackHash = digest(await (async () => { await render(earlyState); return screenshot(); })());
      if (earlyHash !== pulledBackHash) fail(`${definition.id}/${demo.id} late→early reconstruction changed pixels`);

      const flat = await (async () => { await render(completionState(0)); return screenshot(); })();
      const middle = await (async () => { await render(completionState(.5)); return screenshot(); })();
      const formed = await (async () => { await render(completionState(1)); return screenshot(); })();
      const formedAgain = await (async () => { await render(completionState(1)); return screenshot(); })();
      const rotated = await (async () => { await render(completionState(1, { x: -.18, y: .72, z: .04 })); return screenshot(); })();
      const morphHashes = [flat, middle, formed].map(digest);
      if (definition.morphMode === "identity") {
        if (new Set(morphHashes).size !== 1 || digest(rotated) !== digest(formed)) fail("plane morph/rotation must remain an identity transform");
      } else {
        if (new Set(morphHashes).size !== 3) fail(`${definition.id}/${demo.id} morph 0/.5/1 pixels must differ`);
        if (digest(rotated) === digest(formed)) fail(`${definition.id}/${demo.id} rotation did not change formed pixels`);
      }
      if (digest(formed) !== digest(formedAgain)) fail(`${definition.id}/${demo.id} identical completion state changed pixels`);
      if (digest(rotated) !== lateHash) fail(`${definition.id}/${demo.id} complete→early→complete reconstruction changed pixels`);
      const finalStatus = await page.evaluate(() => window.gameRender.renderReady().status);
      if (finalStatus.visiblePromptCalls !== 0 || !(finalStatus.paperDots > 0)) fail(`${definition.id}/${demo.id} prompt/paper suppression failed`);
      maxQueueSize = Math.max(maxQueueSize, finalStatus.queueSize);
    }
  }

  await select("cylinder", "horizontal-wrap");
  const beforeLongRun = await page.evaluate(() => window.gameRender.renderReady().status);
  for (let index = 0; index < 240; index += 1) {
    const status = await render({ topology:"cylinder", shot:"helper", demo:"horizontal-wrap", lessonStep:index % 5, dropProgress:(index % 7) / 8, breathPhase:(index % 11) / 11, morphProgress:0, rotation:{x:0,y:0,z:0}, freezeRotation:true });
    maxQueueSize = Math.max(maxQueueSize, status.queueSize);
  }
  const afterLongRun = await page.evaluate(() => window.gameRender.renderReady().status);
  if (maxQueueSize > 1) fail(`RAF queue grew to ${maxQueueSize}`);
  if (afterLongRun.explicitRenders - beforeLongRun.explicitRenders !== 240) fail("explicit render counter did not advance exactly once per state");
  if (afterLongRun.rafRequests - beforeLongRun.rafRequests > 240) fail("render(state) requested more than one RAF per frame");

  await page.evaluate(async () => {
    try { await window.gameRender.render({ topology:"cylinder", demo:"unknown", lessonStep:0 }); }
    catch (error) { return; }
    throw new Error("unknown demo did not fail");
  });
  console.log(`game-render verify: paths=${pathCount}/8 crossings=${crossingCount} alpha=0/0/0/0 reversible=yes plane=identity nativeMorph=6 rafQueue<=${maxQueueSize}`);
} finally {
  await browser.close();
  await server.close();
}

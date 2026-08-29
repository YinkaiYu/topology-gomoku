import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./serve-app.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
const server = await startStaticServer({ root });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 700, height: 700 }, deviceScaleFactor: 1, colorScheme: "light", locale: "zh-CN" });
  await page.goto(`${server.url}/video/footsteps-return/render-game.html`, { waitUntil: "networkidle" });
  const readiness = await page.evaluate(() => window.gameRender.selectShot("cylinder", { demo: "horizontal-wrap" }));
  if (!readiness.ready) throw new Error("renderReady did not include loaded fonts and canvas readiness");
  const stage = page.frameLocator("#game-render-frame").locator("#boardStage");
  const shot = () => stage.screenshot({ omitBackground: true, animations: "disabled" });
  const render = (state) => page.evaluate((value) => window.gameRender.render(value), state);
  const helperState = { topology:"cylinder", shot:"helper", demo:"horizontal-wrap", lessonStep:2, dropProgress:0, breathPhase:.35, morphProgress:0, rotation:{x:0,y:0,z:0}, freezeRotation:true };
  const helperStatus = await render(helperState); const helperA = await shot(); await render(helperState); const helperB = await shot();
  if (digest(helperA) !== digest(helperB)) throw new Error("identical render(state) changed pixels");
  await page.waitForTimeout(100); if (digest(helperB) !== digest(await shot())) throw new Error("iframe advanced without explicit render(state)");
  if (!(helperStatus.suppressedTextCalls > 0) || helperStatus.visiblePromptCalls !== 0 || !(helperStatus.lessonStrokeCalls > 0)) throw new Error(`helper instrumentation failed: ${JSON.stringify(helperStatus)}`);
  await render({ ...helperState, dropProgress:.25 }); const earlyDrop = await shot();
  await render({ ...helperState, dropProgress:.75 }); const lateDrop = await shot();
  if (digest(earlyDrop) === digest(lateDrop)) throw new Error("drop progress did not change real stone pixels");
  const alphas = await page.evaluate(async (url) => { const image=new Image();image.src=url;await image.decode();const canvas=document.createElement("canvas");canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0);return [[0,0],[image.width-1,0],[0,image.height-1],[image.width-1,image.height-1]].map(([x,y])=>ctx.getImageData(x,y,1,1).data[3]); }, `data:image/png;base64,${helperA.toString("base64")}`);
  if (alphas.some(Boolean)) throw new Error(`transparent corner alpha mismatch: ${alphas.join(",")}`);
  const completion = async (morphProgress, rotation={x:0,y:0,z:0}) => { await render({topology:"cylinder",shot:"completion",demo:"horizontal-wrap",lessonStep:5,dropProgress:1,breathPhase:0,morphProgress,rotation,freezeRotation:true}); return shot(); };
  const flat=await completion(0), middle=await completion(.5), formed=await completion(1), formedAgain=await completion(1);
  if (new Set([flat,middle,formed].map(digest)).size !== 3) throw new Error("morph 0/0.5/1 pixels must differ");
  if (digest(formed) !== digest(formedAgain)) throw new Error("fixed completion state changed pixels");
  const rotated=await completion(1,{x:-.18,y:.72,z:.04}); if (digest(rotated) === digest(formed)) throw new Error("rotation did not change pixels");
  const status=await page.evaluate(()=>window.gameRender.renderReady().status); if (!(status.paperDots>0)) throw new Error("paper texture suppression was not exercised");
  console.log(`game-render verify: alpha=${alphas.join("/")} helper=${digest(helperA).slice(0,12)} drop=changed morph=3/3 rotation=changed deterministic=yes`);
} finally { await browser.close(); await server.close(); }

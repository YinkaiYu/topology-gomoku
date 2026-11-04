"use strict";
// Synthetic seats exercise readiness; they are not a model performance record.
const { chromium } = require("playwright");
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const { startServer } = require("../arena/server.cjs");
const ROOT = path.resolve(__dirname, ".."), BASE = "302ffff";
const EVIDENCE = path.join(ROOT, "artifacts/arena-ready");
async function shot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
  await page.screenshot({ path: path.join(EVIDENCE, name), animations: "disabled" });
}
(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-ready-qa-"));
  const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
  const browser = await chromium.launch({ headless: true });
  const call = (name, args = {}) => app.arena.call(name, args, { hostAuthorized: true });
  const baseline = Object.fromEntries(["index.html", "arena.css", "arena.js"].map(name => [name, execFileSync("git", ["show", `${BASE}:arena/public/${name}`], { cwd: ROOT })]));
  const results = [];
  try {
    for (const viewport of [{ width:1280, height:720 }, { width:1920, height:1080 }, { width:1024, height:768 }, { width:1440, height:1080 }]) {
      const size = `${viewport.width}x${viewport.height}`, context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage(), before = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const { gameId } = call("arena_create", { topology:"mobius", mode:"duel", width:7, height:7, players:{black:{name:"黑方",avatar:"claude-color"},white:{name:"白方",avatar:"deepseek-color"}} });
      const tokens = {};
      await page.goto(`${app.url}/?game=${gameId}`);
      await page.waitForFunction(() => document.getElementById("turn-label").textContent.includes("等待入席"));
      for (const role of ["black", "white"]) tokens[role] = call("arena_join", { ...call("arena_invite", { gameId, role }), name:role }).token;
      await page.waitForFunction(() => document.getElementById("turn-label").textContent === "第 0 手 · 双方准备中");
      assert.equal(call("arena_state", { gameId }).clock.active, null);
      assert.equal(await page.locator(".turn-activity").count(), 0);
      await before.route("**/*", async route => {
        const path = new URL(route.request().url()).pathname, name = path === "/" ? "index.html" : path.slice(1), body = baseline[name];
        if (body) await route.fulfill({ body, contentType: name.endsWith("css") ? "text/css" : name.endsWith("js") ? "text/javascript" : "text/html" });
        else await route.continue();
      });
      await before.goto(`${app.url}/?game=${gameId}`);
      await before.waitForFunction(() => document.getElementById("turn-label").textContent === "第 0 手 · 已就绪");
      await shot(before, `preparing-before-${size}.png`); await shot(page, `preparing-${size}.png`);
      await before.close();
      const board = await page.locator("#board").boundingBox();
      call("arena_rules", { gameId, token:tokens.black });
      call("arena_ready", { gameId, token:tokens.black });
      await page.waitForFunction(() => document.getElementById("turn-label").textContent === "第 0 手 · 等待白方就绪");
      assert.deepEqual(call("arena_state", { gameId }).clock.remainingMs, { black:300000, white:300000 });
      await page.locator("#settings-button").click();
      assert.equal(await page.locator("#start-button").count(), 0);
      assert.equal(await page.locator("#ready-black").textContent(), "已就绪");
      assert.equal(await page.locator("#ready-white").textContent(), "准备中");
      await shot(page, `ready-settings-${size}.png`);
      await page.locator("#settings-dialog [data-close]").click();
      call("arena_rules", { gameId, token:tokens.white });
      call("arena_ready", { gameId, token:tokens.white });
      await page.waitForFunction(() => document.getElementById("turn-label").textContent === "第 0 手 · 黑方行棋");
      await page.locator('.turn-activity[data-role="black"]').waitFor();
      assert.equal(call("arena_state", { gameId }).clock.active, "black");
      assert.deepEqual(await page.locator("#board").boundingBox(), board);
      await page.locator("#settings-button").click();
      assert.equal(await page.locator("#ready-black").isVisible(), false);
      assert.equal(await page.locator("#ready-white").isVisible(), false);
      await page.locator("#timeline-button").click();
      assert.equal(await page.locator('.timeline li[data-kind="ready"]').count(), 2);
      await page.locator("#timeline-dialog [data-close]").click();
      await page.locator("#pause-button").click(); await page.locator("#resume-button").click();
      await page.locator("#settings-dialog").waitFor({state:"hidden"});
      assert.equal(call("arena_state", { gameId }).phase, "playing");
      if (size === "1280x720") await shot(page, "automatic-start.png");
      assert.deepEqual(errors, []);
      results.push({ viewport, preparingClock:null, automaticStart:"black", boardShift:false, errors });
      call("arena_control", { gameId, action:"stop" }); await context.close();
    }
    const ai = call("arena_create", { topology:"plane", mode:"ai" });
    const joined = call("arena_join", { ...call("arena_invite", { gameId:ai.gameId, role:"black" }), name:"黑方" });
    assert.equal(joined.state.seats.white.ready, true);
    call("arena_rules", { gameId:ai.gameId, token:joined.token });
    assert.equal(call("arena_ready", { gameId:ai.gameId, token:joined.token }).phase, "playing");
    fs.writeFileSync(path.join(EVIDENCE, "results.json"), JSON.stringify({ baseline:BASE, fixture:"Same empty 7×7 mobius, two joined unready synthetic seats before/after", results }, null, 2));
    console.log("Readiness browser QA passed: 4 viewports and built-in AI readiness.");
  } finally { await browser.close(); await app.close(); fs.rmSync(directory, { recursive:true, force:true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

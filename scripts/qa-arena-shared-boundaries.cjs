"use strict";
// Isolated, synthetic matches. Never connect to an existing Arena service.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process"), { chromium } = require("playwright");
const { createHash } = require("node:crypto");
const { startServer } = require("../arena/server.cjs");
const ROOT = path.resolve(__dirname, ".."), BASE = "7a191cd";
const OUT = path.join(ROOT, "artifacts/arena-shared-1.41.2");
const VIEWS = [{ width: 1280, height: 720 }, { width: 1024, height: 768 }];
const git = (...args) => execFileSync("git", args, { cwd: ROOT });
async function ready(page) {
  await page.locator("#match").waitFor({ state: "visible" });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function setView(page, value) {
  await page.locator("#view-range").evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event("input", { bubbles: true })); }, String(value));
  await ready(page);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const data = fs.mkdtempSync(path.join(ROOT, ".tmp/arena-boundary-"));
  const app = await startServer({ port: 0, dataDir: data, writeRuntime: false });
  const call = (name, args = {}) => app.arena.call(name, args, { hostAuthorized: true });
  const browser = await chromium.launch({ headless: true });
  const baseline = { "/arena.js": git("show", `${BASE}:arena/public/arena.js`), "/assets/board-art.js": git("show", `${BASE}:app/assets/board-art.js`) };
  const cases = [];
  try {
    for (const viewport of VIEWS) for (const topology of ["plane", "mobius", "sphere"]) {
      const { gameId } = call("arena_create", { topology, mode: "duel", width: 7, height: 7, clock: null });
      const tokens = {};
      for (const role of ["black", "white"]) tokens[role] = call("arena_join", { ...call("arena_invite", { gameId, role }), name: role }).token;
      for (const role of ["black", "white"]) call("arena_ready", { gameId, token: tokens[role] });
      for (const [index, cell] of [0, 6, 42, 48].entries()) call("arena_move", { gameId, token: tokens[index % 2 ? "white" : "black"], cell, expectedVersion: index, requestId: `edge-${index}` });
      call("arena_control", { gameId, action: "pause" });
      const images = {}, errors = [];
      for (const revision of ["before", "after"]) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        if (revision === "before") await page.route("**/*", route => {
          const body = baseline[new URL(route.request().url()).pathname];
          return body ? route.fulfill({ body, contentType: "text/javascript" }) : route.continue();
        });
        try {
          await page.goto(`${app.url}/?game=${gameId}`); await ready(page);
          await page.waitForFunction(() => document.getElementById("board").getAttribute("aria-label").includes("第 4 手"));
          const bounds = await page.locator("#board").boundingBox();
          assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
          await setView(page, 0);
          images[revision] = createHash("sha256").update(await page.locator("#board").evaluate(canvas => canvas.toDataURL())).digest("hex");
          for (const progress of topology === "plane" ? [0] : [0, 0.2, 25, 100, 0]) {
            await setView(page, progress);
            if (progress === 0 || (topology === "sphere" && progress === 25)) await page.screenshot({ path: path.join(OUT, `${revision}-${topology}-${progress}-${viewport.width}x${viewport.height}.png`), animations: "disabled" });
          }
          assert.equal(createHash("sha256").update(await page.locator("#board").evaluate(canvas => canvas.toDataURL())).digest("hex"), images[revision], "2D returns to identical geometry");
          if (revision === "after") {
            await page.locator("#previous-move").click();
            assert.deepEqual(await page.locator("#board").boundingBox(), bounds);
            await page.locator("#return-live").click();
            assert.deepEqual(await page.locator("#board").boundingBox(), bounds);
            await page.locator("#settings-button").click();
            await page.locator("#settings-dialog").waitFor({ state: "visible" });
            await page.locator("#settings-dialog [data-close]").click();
            assert.deepEqual(await page.locator("#board").boundingBox(), bounds);
          }
        } finally { await context.close(); }
      }
      assert.equal(images.after, images.before, `${topology}: existing Arena 2D view is preserved`);
      assert.deepEqual(errors, []);
      cases.push({ viewport, topology, flatCanvasIdentical: true, edgeMoves: [0, 6, 42, 48], morphRoundTrip: topology !== "plane", fixedReplayAndSettingsGeometry: true, errors });
      call("arena_control", { gameId, action: "stop" });
    }
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ baseline: BASE, sharedMain: "ba8e3abce800e64c28ac76160690d0a5b1483c19", fixture: "Synthetic paused 7x7 match, four corner moves, no player dialogue or real service data", cases }, null, 2) + "\n");
    console.log(`Arena shared boundary QA passed: ${cases.length} viewport/topology cases.`);
  } finally { await browser.close(); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

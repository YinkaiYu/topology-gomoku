"use strict";

// Run against a freshly prepared static Zhihu delivery copy. Supply Playwright
// through NODE_PATH and pass --app <directory>; no project dependency is added.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const APP = path.resolve(option("--app", path.join(ROOT, ".tmp/zhihu-1.41.2/app")));
const OUT = path.resolve(option("--output", path.join(ROOT, "artifacts/zhihu-1.41.2")));
const TRACKING = "https://tracking.aiworks.site/api/v1/event_tracking";
const MIME = { ".html": "text/html;charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const listen = server => new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)); });
const close = server => new Promise(resolve => server.close(resolve));
async function settled(frame) {
  await frame.waitForFunction(() => !document.getElementById("appShell").classList.contains("is-navigating"));
  await frame.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function runCase(browser, appUrl, hostUrl, viewport, embedded) {
  const errors = [], trackingIntercepted = [], unexpectedExternal = [], failedRequests = [];
  const label = `${embedded ? "iframe" : "top"}-${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true, reducedMotion: "reduce" });
  await context.route("**/*", async route => {
    const url = route.request().url();
    if (url.startsWith(TRACKING)) {
      trackingIntercepted.push({ method: route.request().method() });
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" });
    } else if (url.startsWith(appUrl + "/") || url.startsWith(hostUrl + "/")) await route.continue();
    else { unexpectedExternal.push(url); await route.abort(); }
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", request => failedRequests.push({ url: request.url(), error: request.failure().errorText }));
  const screenshots = [];
  async function shot(name) {
    const filename = `${label}-${name}.png`;
    await page.screenshot({ path: path.join(OUT, filename), animations: "disabled" });
    screenshots.push(`artifacts/${path.basename(OUT)}/${filename}`);
  }
  try {
    await page.goto(embedded ? hostUrl : appUrl);
    const frame = embedded ? await page.locator("iframe").elementHandle().then(element => element.contentFrame()) : page.mainFrame();
    await frame.locator("#homeScreen.is-active").waitFor();
    await settled(frame);
    assert.equal(await frame.locator("html").getAttribute("data-host-platform"), "zhihu");
    assert.equal(await frame.locator("html").getAttribute("data-host-layout"), "compact");
    assert.equal(await frame.locator(".level-card").count(), 7);
    assert.equal(await frame.locator(".level-card.is-locked").count(), 6);
    assert.equal(await frame.evaluate(() => document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth), false);
    await shot("home");
    await frame.locator('[data-mode="duel"]').tap();
    await frame.locator('[data-level="2"]').tap();
    await settled(frame);
    await frame.waitForFunction(() => document.getElementById("turnStatus").textContent === "黑方回合");
    await frame.evaluate(() => {
      window.__zhihuMoves = [];
      const original = TopologyGomoku.checkWin;
      TopologyGomoku.checkWin = function(board, rules, cell, player) {
        const result = original.apply(this, arguments);
        __zhihuMoves.push({ cell, player, won: Boolean(result) });
        return result;
      };
    });
    await frame.locator("#gameSettingsButton").tap();
    await frame.locator("#settingsSheet.is-visible").waitFor();
    await frame.locator("#hintSwitch").tap();
    await shot("settings");
    await frame.locator("#settingsDoneButton").tap();
    await frame.locator("#settingsSheet").waitFor({ state: "hidden" });
    const sequence = [26, 0, 27, 2, 21, 4, 22, 6, 23];
    for (const [index, cell] of sequence.entries()) {
      const canvas = frame.locator("#boardCanvas");
      const bounds = await canvas.boundingBox();
      const point = await canvas.evaluate((element, cell) => {
        const level = TopologyGameContent.LEVELS[2];
        const layout = TopologyBoardArt.computeLayout(element.clientWidth, element.clientHeight, level);
        return { x: layout.left + cell % level.width * layout.cell, y: layout.top + Math.floor(cell / level.width) * layout.cell };
      }, cell);
      await page.touchscreen.tap(bounds.x + point.x, bounds.y + point.y);
      await frame.waitForFunction(count => window.__zhihuMoves.length === count, index + 1);
      if (index === sequence.length - 2) { await page.waitForTimeout(1100); await shot("boundary"); }
    }
    await frame.waitForFunction(() => document.getElementById("turnStatus").textContent === "黑方胜");
    const moves = await frame.evaluate(() => window.__zhihuMoves);
    assert.deepEqual(moves.map(move => move.cell), sequence);
    assert.equal(moves.at(-1).won, true);
    const saved = await frame.evaluate(() => JSON.parse(localStorage.getItem("topology-gomoku:v1")));
    assert.equal(saved.completed[2], true);
    assert.equal(saved.hints, false);
    await page.reload();
    const reloaded = embedded ? await page.locator("iframe").elementHandle().then(element => element.contentFrame()) : page.mainFrame();
    await reloaded.locator("#homeScreen.is-active").waitFor();
    await settled(reloaded);
    assert.equal(await reloaded.locator('[data-level="2"]').evaluate(element => element.classList.contains("is-locked")), false);
    assert.equal(await reloaded.evaluate(() => JSON.parse(localStorage.getItem("topology-gomoku:v1")).hints), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedExternal, []);
    assert.deepEqual(failedRequests, []);
    assert.equal(await reloaded.locator("script[data-aiworks-event-tracking-bridge]").getAttribute("data-aiworks-event-tracking-ticket"), "__AIWORKS_EVENT_TRACKING_TICKET__");
    assert.equal(trackingIntercepted.length, 0, "unmaterialized local delivery must not report events");
    return { viewport, embedded, crossOrigin: embedded, compactLayout: true, crossBoundaryWin: true, persistedProgress: true, persistedSettings: true, moves, trackingTicket: "unmaterialized", trackingIntercepted, errors, unexpectedExternal, failedRequests, screenshots };
  } finally { await context.close(); }
}
(async () => {
  assert.ok(fs.existsSync(path.join(APP, "_tmp/frontend.deploy.json")), "Prepare the static delivery first");
  fs.mkdirSync(OUT, { recursive: true });
  const app = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).slice(1) || "index.html";
    if (relative === "favicon.ico") { response.writeHead(204).end(); return; }
    const file = path.resolve(APP, relative);
    if (!file.startsWith(APP + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  const appUrl = await listen(app);
  const host = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
    response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block;overflow:hidden}</style><iframe src="${appUrl}/" allow="autoplay"></iframe>`);
  });
  const hostUrl = await listen(host);
  const browser = await chromium.launch({ headless: true });
  try {
    const result = { version: require("../package.json").version, sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(), browser: browser.version(), realDevice: false, timestamp: new Date().toISOString(), cases: [] };
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) for (const embedded of [false, true]) {
      result.cases.push(await runCase(browser, appUrl, hostUrl, viewport, embedded));
      console.log(`Passed ${embedded ? "cross-origin iframe" : "top-level"} ${viewport.width}x${viewport.height}`);
    }
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(result, null, 2) + "\n");
  } finally { await browser.close(); await close(host); await close(app); }
})().catch(error => { console.error(error); process.exitCode = 1; });

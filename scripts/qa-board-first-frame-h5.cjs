"use strict";

// Exercise the actual H5 canvas at tiny positive progress, including a stone
// that is entering or rebounding. Supply Playwright through NODE_PATH.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const BASE = args.find(value => value.startsWith("--baseline="))?.slice(11) || "50fdb3b";
const OUT = path.join(ROOT, args.find(value => value.startsWith("--out="))?.slice(6) || "artifacts/board-first-frame-h5");
const TYPES = ["cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const VIEWS = [{ width: 1280, height: 720 }, { width: 390, height: 844 }];
const PROGRESS = [1e-7, 1e-5, 0.001, 0.0011, 0.005, 0.02];
const MOVES = [0, 8, 2, 10, 14, 23, 18, 31];
const cache = new Map();

function resource(file, before) {
  if (!before) return fs.readFileSync(path.join(ROOT, "app", file));
  if (!cache.has(file)) cache.set(file, execFileSync("git", ["show", `${BASE}:app/${file}`], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 }));
  return cache.get(file);
}
function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost"), before = url.pathname.startsWith("/before/");
    const file = decodeURIComponent(before ? url.pathname.slice(8) : url.pathname.slice(1)) || "index.html";
    if (file.includes("..") || file.includes("\\")) { response.writeHead(403).end(); return; }
    if (file === "favicon.ico") { response.writeHead(204).end(); return; }
    try {
      const mime = { ".html": "text/html;charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
      response.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      response.setHeader("Cache-Control", "no-store");
      response.end(resource(file, before));
    } catch { response.writeHead(404).end(); }
  });
}

// Expose only controlled setup/render operations; the tested drawing routines
// remain the ones shipped by game.js, with the actual layout and canvas.
const HOOK = `window.firstFrameQA = {
  start: function(index) { startLevel(index, { mode: "duel" }); },
  seed: function(mode) {
    game.demo = null; game.lesson = null; game.completion = null; game.board.fill(0);
    if (mode !== "empty") ${JSON.stringify(MOVES)}.forEach(function(cell, index) { game.board[cell] = index % 2 + 1; });
    game.lastMove = mode === "empty" ? -1 : 31;
    renderState.lastMoveAt = mode === "drop" || mode === "press" ? 19940 : 0;
    renderState.lastMoveFromPress = mode === "press";
    renderState.seamPulseAt = 0; renderState.seamPulseBits = 0;
    renderState.hoverCell = -1; renderState.pressedCell = -1;
    game.view = createInteractiveViewState(); resizeCanvas();
  },
  draw: function(morph) {
    game.view.progress = morph; game.view.rotation = { x: 0, y: 0, z: 0 };
    drawBoard(20000);
  }
};`;

async function measure(page, mode, progress) {
  return page.evaluate(({ mode, progress }) => {
    firstFrameQA.seed(mode); firstFrameQA.draw(0);
    const canvas = document.getElementById("boardCanvas"), ctx = canvas.getContext("2d");
    const base = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const flat = canvas.toDataURL(), rows = [];
    for (const morph of progress) {
      firstFrameQA.draw(morph);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0, maximum = 0, changedPixels = 0;
      for (let index = 0; index < base.length; index += 4) {
        let difference = 0;
        for (let channel = 0; channel < 3; channel++) {
          // Compare visible colors over white, not meaningless RGB values in
          // transparent pixels when the new material has just begun to appear.
          const after = pixels[index + channel] * pixels[index + 3] / 255 + 255 - pixels[index + 3];
          const before = base[index + channel] * base[index + 3] / 255 + 255 - base[index + 3];
          const delta = Math.abs(after - before);
          sum += delta; maximum = Math.max(maximum, delta); difference += delta;
        }
        if (difference) changedPixels++;
      }
      rows.push({ morph, meanRgbDifference: sum / (base.length / 4 * 3), maximumChannelDifference: maximum, changedPixels });
    }
    firstFrameQA.draw(0);
    return { flat, roundTripIdentical: canvas.toDataURL() === flat, canvas: { width: canvas.width, height: canvas.height }, rows };
  }, { mode, progress });
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  const cases = [], screenshots = [];
  try {
    for (const viewport of VIEWS) {
      const revisions = {};
      for (const revision of ["before", "after"]) {
        const before = revision === "before";
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
        const page = await context.newPage(), errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await context.addInitScript(() => {
          const raf = requestAnimationFrame.bind(window);
          performance.now = () => 20000;
          window.requestAnimationFrame = callback => raf(() => callback(20000));
          localStorage.setItem("topology-gomoku:v1", JSON.stringify({ unlocked: 6, learnedLevels: [0, 1, 2, 3, 4, 5, 6], sound: false, hints: false, mode: "duel" }));
        });
        await page.route("**/assets/game.js", route => route.fulfill({ contentType: "text/javascript",
          body: resource("assets/game.js", before).toString().replace("  initialize();", HOOK + "\n  initialize();") }));
        await page.goto(`http://127.0.0.1:${server.address().port}/${before ? "before/" : ""}`);
        await page.evaluate(() => document.fonts.ready);
        revisions[revision] = [];
        for (let index = 0; index < TYPES.length; index++) {
          await page.evaluate(index => firstFrameQA.start(index + 1), index);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          for (const mode of ["empty", "rest", "drop", "press"]) {
            const measured = await measure(page, mode, before ? [0.0011] : PROGRESS);
            const flatSha256 = createHash("sha256").update(measured.flat).digest("hex");
            delete measured.flat;
            assert.ok(measured.roundTripIdentical, "returning to 2D retains every pixel");
            revisions[revision].push({ topology: TYPES[index], mode, flatSha256, ...measured });
          }
          if (!before && TYPES[index] === "sphere") {
            await page.evaluate(() => { firstFrameQA.seed("rest"); firstFrameQA.draw(0.0011); });
            const file = `after-sphere-first-step-${viewport.width}x${viewport.height}.png`;
            await page.screenshot({ path: path.join(OUT, file), animations: "disabled" }); screenshots.push(file);
          }
        }
        assert.deepEqual(errors, []);
        await context.close();
      }
      for (let index = 0; index < revisions.after.length; index++) {
        const before = revisions.before[index], after = revisions.after[index];
        assert.equal(after.flatSha256, before.flatSha256, `${after.topology}/${after.mode}: existing 2D canvas unchanged`);
        assert.ok(after.rows[0].meanRgbDifference < 0.001 && after.rows[0].maximumChannelDifference < 2,
          `${after.topology}/${after.mode}: the tiny positive frame converges to 2D`);
        cases.push({ viewport, topology: after.topology, mode: after.mode, canvas: after.canvas,
          flatSha256: after.flatSha256, flatUnchanged: true, roundTripIdentical: after.roundTripIdentical,
          beforeFirstStep: before.rows[0], after: after.rows });
      }
    }
    const sources = Object.fromEntries(["game", "board-art", "topology-morph"].map(name => [name,
      createHash("sha256").update(fs.readFileSync(path.join(ROOT, "app/assets", name + ".js"))).digest("hex")]));
    const result = { baseline: BASE, fixture: { moves: MOVES, time: 20000, modes: ["empty", "rest", "drop", "press"] },
      comparison: "RGB composited over white; 0–255 channel scale", sources, cases, screenshots };
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ cases: cases.length, flatUnchanged: cases.length,
      maximumNearZeroMean: Math.max(...cases.map(row => row.after[0].meanRgbDifference)),
      maximumNearZeroChannel: Math.max(...cases.map(row => row.after[0].maximumChannelDifference)) }));
  } finally { await browser.close(); server.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });

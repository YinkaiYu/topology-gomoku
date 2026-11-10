"use strict";

// Reproducible actual-game and shared-renderer evidence. Supply Playwright via NODE_PATH.
// --serve --port=4330 serves the actual app; /before/ is the immutable baseline.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const args = process.argv.slice(2), cache = new Map();
const ROOT = path.resolve(__dirname, "..");
const BASE = args.find(value => value.startsWith("--baseline="))?.slice(11) || "1d6a488";
const OUT = path.join(ROOT, args.find(value => value.startsWith("--out="))?.slice(6) || "artifacts/board-perspective");
const PROGRESS = args.includes("--seam-motion") ? [0, .12, .3, .5, .72, .9, 1]
  : args.includes("--h5-only") ? [0, .25, .5, .75, 1] : [0, .5, 1];
const port = Number(args.find(value => value.startsWith("--port="))?.slice(7)) || 4330;
const TYPES = ["cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const VIEWPORTS = [{ width: 1280, height: 720 }, { width: 390, height: 844 }];
const digest = data => crypto.createHash("sha256").update(data).digest("hex");

function resource(file, before) {
  if (!before) return fs.readFileSync(path.join(ROOT, "app", file));
  if (!cache.has(file)) cache.set(file, execFileSync("git", ["show", `${BASE}:app/${file}`], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 }));
  return cache.get(file);
}
function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost"), before = url.pathname.startsWith("/before/");
    const file = decodeURIComponent(before ? url.pathname.slice(8) : url.pathname.slice(1)) || "index.html";
    if (url.pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    if (file.includes("..") || file.includes("\\")) { response.writeHead(403).end(); return; }
    try {
      const mime = { ".html": "text/html;charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
      response.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      response.setHeader("Cache-Control", "no-store");
      response.end(resource(file, before));
    } catch { response.writeHead(404).end(); }
  });
}
function installClock() {
  const raf = window.requestAnimationFrame.bind(window), now = performance.now.bind(performance);
  window.perspectiveQA = { moves: [], fixedTime: null, orientation: null };
  performance.now = () => perspectiveQA.fixedTime ?? now();
  window.requestAnimationFrame = callback => raf(time => callback(perspectiveQA.fixedTime ?? time));
  localStorage.setItem("topology-gomoku:v1", JSON.stringify({ unlocked: 6, learnedLevels: [0, 1, 2, 3, 4, 5, 6], sound: false, hints: false, mode: "duel" }));
}
async function frame(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function openGame(browser, url, viewport, type, revision) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true, reducedMotion: "reduce" });
  await context.addInitScript(installClock);
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url + (revision === "before" ? "before/" : ""));
  await frame(page);
  await page.evaluate(() => {
    const checkWin = TopologyGomoku.checkWin, project = TopologyMorph.project;
    TopologyGomoku.checkWin = function (board, rules, cell, player) {
      const result = checkWin.apply(this, arguments);
      perspectiveQA.moves.push({ cell, player, won: Boolean(result) });
      return result;
    };
    TopologyMorph.project = function (type, u, v, width, height, orientation) {
      const canvas = document.getElementById("boardCanvas");
      if (canvas && Math.abs(canvas.clientWidth - width) < 1 && Math.abs(canvas.clientHeight - height) < 1) perspectiveQA.orientation = { ...orientation };
      return project.apply(this, arguments);
    };
    if (TopologyMorph.createDepthBuffer) {
      const createDepthBuffer = TopologyMorph.createDepthBuffer;
      TopologyMorph.createDepthBuffer = function (width, height) {
        const buffer = createDepthBuffer.apply(this, arguments);
        const canvas = document.getElementById("boardCanvas");
        if (canvas && Math.abs(canvas.clientWidth - width) < 1 && Math.abs(canvas.clientHeight - height) < 1) perspectiveQA.depthBuffer = buffer;
        return buffer;
      };
    }
  });
  await page.locator('[data-mode="duel"]').click();
  await page.locator(`[data-level="${TYPES.indexOf(type) + 1}"]`).click();
  await page.waitForFunction(() => document.getElementById("turnStatus").textContent === "黑方回合" && !document.getElementById("appShell").classList.contains("is-navigating"));
  await frame(page);
  return { context, page, errors };
}
async function geometry(page, type) {
  return page.evaluate(type => {
    const canvas = document.getElementById("boardCanvas"), rect = canvas.getBoundingClientRect();
    const level = TopologyGameContent.LEVELS.find(level => level.topology === type);
    const layout = TopologyBoardArt.computeLayout(canvas.clientWidth, canvas.clientHeight, level);
    return { level, layout, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, moves: perspectiveQA.moves };
  }, type);
}
async function tapCell(page, type, cell) {
  const { level, layout, rect, moves } = await geometry(page, type);
  await page.touchscreen.tap(rect.x + layout.left + (cell % level.width) * layout.cell, rect.y + layout.top + Math.floor(cell / level.width) * layout.cell);
  await page.waitForFunction(count => perspectiveQA.moves.length === count, moves.length + 1);
  assert.equal((await geometry(page, type)).moves.at(-1).cell + 0, cell);
}
async function setProgress(page, value) {
  await page.locator("#dimensionSlider").evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event("input", { bubbles: true })); }, value);
  await page.waitForFunction(value => Math.abs(Number(document.getElementById("dimensionSlider").value) - value) < 1e-6, value);
  await frame(page);
}
async function capture(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  return path.relative(ROOT, file).split(path.sep).join("/");
}

async function gameEvidence(browser, url, result) {
  for (const viewport of VIEWPORTS) for (const type of TYPES) {
    const comparisons = {};
    for (const revision of ["before", "after"]) {
      const { context, page, errors } = await openGame(browser, url, viewport, type, revision);
      try {
        const { level } = await geometry(page, type), w = level.width;
        const moves = [0, w + 1, 2, w + 3, 2 * w, 3 * w + 2, 2 * w + 4, 4 * w + 3];
        for (const cell of moves) await tapCell(page, type, cell);
        await page.waitForTimeout(1100);
        await page.evaluate(() => { perspectiveQA.fixedTime = 20000; });
        for (const progress of PROGRESS) {
          await setProgress(page, progress);
          const hash = digest(await page.evaluate(() => document.getElementById("boardCanvas").toDataURL()));
          if (!comparisons[progress]) comparisons[progress] = {};
          comparisons[progress][revision] = hash;
          const keep = args.includes("--seam-motion")
            ? type === "sphere" && [0, .3, .5, .72, .9, 1].includes(progress) ||
              viewport.width === 1280 && ["klein", "projective"].includes(type) && [0.5, 1].includes(progress)
            : args.includes("--h5-only")
            ? viewport.width === 1280 && ["klein", "projective"].includes(type) && [0.5, 1].includes(progress)
            : viewport.width === 1280 || ["torus", "sphere", "projective"].includes(type) && progress !== .5;
          const file = keep ? await capture(page, `${revision}-game-${type}-${progress}-${viewport.width}x${viewport.height}`) : null;
          result.actualGame.push({ revision, type, viewport, progress, moves, canvasSha256: hash, file });
        }
        assert.deepEqual(errors, []);
        assert.equal((await geometry(page, type)).moves.length, moves.length);
        if (revision === "after") {
          const hit = await page.evaluate(type => {
            const canvas = document.getElementById("boardCanvas"), rect = canvas.getBoundingClientRect();
            const level = TopologyGameContent.LEVELS.find(level => level.topology === type);
            const rules = TopologyGomoku.createRules({ type, width: level.width, height: level.height });
            const orientation = { ...perspectiveQA.orientation }, occupied = new Set(perspectiveQA.moves.map(move => move.cell));
            const points = Array.from({ length: rules.cellCount }, (_, cell) => {
              const uv = TopologyMorph.stoneUV(rules, cell);
              return { ...TopologyMorph.project(type, uv.u, uv.v, canvas.clientWidth, canvas.clientHeight, orientation), cell };
            });
            const visible = points.filter(point => perspectiveQA.depthBuffer.visible(point));
            const available = visible.filter(point => !occupied.has(point.cell));
            available.sort((a, b) => b.depth - a.depth);
            const point = available[0];
            return { cell: point.cell, x: point.x + rect.x, y: point.y + rect.y, visibleCells: visible.length, hiddenCells: points.length - visible.length };
          }, type);
          await page.touchscreen.tap(hit.x, hit.y);
          await page.waitForFunction(count => perspectiveQA.moves.length === count, moves.length + 1);
          assert.equal((await geometry(page, type)).moves.at(-1).cell, hit.cell, "actual 3D pointer placement uses projected visible cell");
          result.spatialHits.push({ type, viewport, ...hit });
        }
      } finally { await context.close(); }
    }
    assert.equal(comparisons[0].before, comparisons[0].after, `${type}/${viewport.width}: 2D pixels unchanged`);
    result.flatUnchanged.push({ type, viewport, sha256: comparisons[0].after });
  }
}

async function moduleEvidence(browser, url, result) {
  for (const revision of ["before", "after"]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1800 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(url + (revision === "before" ? "before/" : ""));
      await page.evaluate(types => {
        document.body.innerHTML = '<main id="gallery" style="display:grid;grid-template-columns:600px 600px;width:1200px;height:1800px"></main>';
        const gallery = document.getElementById("gallery");
        window.moduleQA = [];
        for (const type of types) {
          const canvas = document.createElement("canvas"); canvas.width = canvas.height = 600; gallery.append(canvas);
          const level = { ...TopologyGameContent.LEVELS.find(item => item.topology === type), width: 7, height: 7 };
          const rules = TopologyGomoku.createRules({ type, width: 7, height: 7 }), board = new Int8Array(49);
          [0, 8, 2, 10, 14, 23, 18, 31].forEach((cell, i) => { board[cell] = i % 2 + 1; });
          moduleQA.push({ canvas, game: { level, rules, board, lastMove: 31, winningMask: null, winAt: 0 }, layout: TopologyBoardArt.computeLayout(600, 600, rules) });
        }
      }, TYPES);
      if (revision === "after") await page.evaluate(() => {
        window.surfaceCoverage = [];
        window.qaFillSurface = TopologyMorph.fillSurface;
        TopologyMorph.fillSurface = function (ctx, patches) {
          qaFillSurface(ctx, patches);
          let triangles = 0, missing = 0;
          for (const patch of patches) for (let i = 1; i < patch.points.length - 1; i++) {
            const [a, b, c] = [patch.points[0], patch.points[i], patch.points[i + 1]];
            if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 1e-7) continue;
            triangles++;
            if (!ctx.isPointInPath((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3)) missing++;
          }
          surfaceCoverage.push({ triangles, missing });
        };
      });
      for (const progress of [0, .5, 1]) for (const rotated of progress === 1 ? [false, true] : [false]) {
        const hashes = await page.evaluate(({ progress, rotated }) => moduleQA.map(({ canvas, game, layout }) => {
          const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, 600, 600);
          ctx.fillStyle = TopologyBoardArt.TOKENS.paper; ctx.fillRect(0, 0, 600, 600);
          const options = { game, layout, time: 20000, morph: progress, rotation: rotated ? { x: .6, y: .75, z: -.15 } : { x: 0, y: 0, z: 0 } };
          if (progress) TopologyBoardArt.drawCompletion(ctx, options); else TopologyBoardArt.drawBoard(ctx, options);
          return canvas.toDataURL();
        }), { progress, rotated });
        const file = await capture(page, `${revision}-module-gallery-${progress}${rotated ? "-rotated" : ""}`);
        result.sharedGallery.push({ revision, progress, rotated, types: TYPES, sha256: hashes.map(digest), file });
      }
      if (revision === "after") {
        const coverage = await page.evaluate(() => { TopologyMorph.fillSurface = qaFillSurface; return surfaceCoverage; });
        for (const item of coverage) assert.equal(item.missing, 0, "actual Canvas silhouette covers every dense surface triangle centroid");
        result.surfaceCoverage = coverage;
        const bounds = await page.evaluate(types => {
          const results = [];
          for (const type of types) for (const size of [5, 7, 19]) for (const dimensions of [[600, 600], [960, 540], [400, 300]]) for (const rotated of [false, true]) {
            const [width, height] = dimensions, canvas = document.createElement("canvas");
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext("2d"), faces = [], arc = ctx.arc;
            ctx.arc = function (x, y, radius) {
              const m = ctx.getTransform(), cx = m.a * x + m.c * y + m.e, cy = m.b * x + m.d * y + m.f;
              const rx = radius * Math.hypot(m.a, m.c), ry = radius * Math.hypot(m.b, m.d);
              faces.push({ left: cx - rx - .5, right: cx + rx + .5, top: cy - ry - .5, bottom: cy + ry + .5 });
              return arc.apply(this, arguments);
            };
            const level = { ...TopologyGameContent.LEVELS.find(item => item.topology === type), width: size, height: size };
            const rules = TopologyGomoku.createRules({ type, width: size, height: size });
            const game = { level, rules, board: Int8Array.from({ length: size * size }, (_, i) => i % 2 + 1), lastMove: -1 };
            const layout = TopologyBoardArt.computeLayout(width, height, rules);
            TopologyBoardArt.drawCompletion(ctx, { game, layout, time: 20000, morph: 1, rotation: rotated ? { x: .6, y: .75, z: -.15 } : { x: 0, y: 0, z: 0 } });
            const margin = Math.min(...faces.flatMap(face => [face.left, width - face.right, face.top, height - face.bottom]));
            results.push({ type, size, dimensions, rotated, stones: faces.length, minFaceMarginPx: margin });
          }
          return results;
        }, TYPES);
        for (const item of bounds) {
          assert.ok(item.stones >= item.size * item.size && item.stones <= item.size * item.size * 4, "face, faint, shadow and clipping passes remain within the canvas");
          assert.ok(item.minFaceMarginPx >= 0, `${item.type}/${item.size}/${item.dimensions}/${item.rotated}: stone stays inside canvas`);
        }
        result.stoneBounds = bounds;
      }
      const performanceResults = await page.evaluate(types => {
        const rows = [];
        for (const type of types) for (const size of [7, 19]) {
          const canvas = document.createElement("canvas"); canvas.width = canvas.height = 600;
          const ctx = canvas.getContext("2d"), level = { ...TopologyGameContent.LEVELS.find(item => item.topology === type), width: size, height: size };
          const rules = TopologyGomoku.createRules({ type, width: size, height: size });
          const board = Int8Array.from({ length: size * size }, (_, i) => i % 2 + 1);
          const game = { level, rules, board, lastMove: -1, winningMask: null, winAt: 0 };
          const layout = TopologyBoardArt.computeLayout(600, 600, rules), timings = [], readback = [];
          for (let i = 0; i < 22; i++) {
            const start = performance.now();
            ctx.clearRect(0, 0, 600, 600);
            TopologyBoardArt.drawCompletion(ctx, { game, layout, time: 20000, morph: 1, rotation: { x: .3, y: i * .025, z: 0 } });
            if (i >= 2) timings.push(performance.now() - start);
            // Flush deferred Canvas raster work; report separately from draw-call CPU cost.
            ctx.getImageData(0, 0, 600, 600);
            if (i >= 2) readback.push(performance.now() - start);
          }
          timings.sort((a, b) => a - b);
          readback.sort((a, b) => a - b);
          rows.push({ type, size, samples: timings.length, medianMs: timings[Math.floor(timings.length / 2)], p95Ms: timings[Math.floor(timings.length * .95)], maxMs: timings.at(-1), drawAndReadbackMedianMs: readback[Math.floor(readback.length / 2)], drawAndReadbackP95Ms: readback[Math.floor(readback.length * .95)] });
        }
        return rows;
      }, TYPES);
      result.performance.push(...performanceResults.map(row => ({ revision, ...row })));
      const frames = await page.evaluate(async () => {
        const results = [];
        for (const type of ["torus", "sphere"]) for (const size of [7, 19]) {
          const canvas = document.createElement("canvas"); canvas.width = canvas.height = 600;
          document.body.replaceChildren(canvas);
          const ctx = canvas.getContext("2d");
          const level = { ...TopologyGameContent.LEVELS.find(item => item.topology === type), width: size, height: size };
          const rules = TopologyGomoku.createRules({ type, width: size, height: size });
          const board = new Int8Array(size * size);
          if (size === 7) [0, 8, 2, 10, 14, 23, 18, 31].forEach((cell, i) => { board[cell] = i % 2 + 1; });
          else board.forEach((_, i) => { board[i] = i % 2 + 1; });
          const game = { level, rules, board, lastMove: -1 };
          const layout = TopologyBoardArt.computeLayout(600, 600, rules), intervals = [];
          let previous = null;
          for (let i = 0; i < 44; i++) {
            const time = await new Promise(requestAnimationFrame);
            if (i >= 4 && previous !== null) intervals.push(time - previous);
            previous = time;
            ctx.clearRect(0, 0, 600, 600);
            TopologyBoardArt.drawCompletion(ctx, { game, layout, time: 20000, morph: 1, rotation: { x: .3, y: i * .025, z: 0 } });
          }
          intervals.sort((a, b) => a - b);
          results.push({ type, size, stones: board.filter(Boolean).length, samples: intervals.length, medianMs: intervals[Math.floor(intervals.length / 2)], p95Ms: intervals[Math.floor(intervals.length * .95)] });
        }
        return results;
      });
      result.animationFrames.push(...frames.map(row => ({ revision, ...row })));
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  }
  const before = result.sharedGallery.find(row => row.revision === "before" && row.progress === 0);
  const after = result.sharedGallery.find(row => row.revision === "after" && row.progress === 0);
  assert.deepEqual(before.sha256, after.sha256, "shared renderer flat pixels unchanged");
}

async function run(url) {
  const { chromium } = require("playwright"), browser = await chromium.launch({ headless: true });
  const result = args.includes("--module-only") && fs.existsSync(path.join(OUT, "results.json"))
    ? JSON.parse(fs.readFileSync(path.join(OUT, "results.json"), "utf8"))
    : { baseline: BASE, viewports: VIEWPORTS, actualGame: [], flatUnchanged: [], spatialHits: [], sharedGallery: [], performance: [], animationFrames: [] };
  fs.mkdirSync(OUT, { recursive: true });
  try {
    if (!args.includes("--module-only")) await gameEvidence(browser, url, result);
    result.sharedGallery = [];
    result.performance = [];
    result.animationFrames = [];
    if (!args.includes("--h5-only")) await moduleEvidence(browser, url, result);
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ actualGame: result.actualGame.length, flatUnchanged: result.flatUnchanged.length, spatialHits: result.spatialHits.length, galleries: result.sharedGallery.length, performanceCases: result.performance.length, animationFrames: result.animationFrames }));
    return result;
  } finally { await browser.close(); }
}
if (require.main === module) {
  const server = createServer();
  (async () => {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(args.includes("--serve") ? port : 0, "127.0.0.1", resolve); });
    const url = `http://127.0.0.1:${server.address().port}/`;
    if (args.includes("--serve")) { console.log("Preview: " + url); return; }
    try { await run(url); } finally { server.close(); }
  })().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
}
module.exports = { createServer, run };

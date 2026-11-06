"use strict";

// Browser evidence for issue #8. Use an existing Playwright installation.
// --serve --port=4329 serves the actual game and its immutable /before/ baseline.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, ".."), BASE = "b234185";
const OUT = path.join(ROOT, "artifacts/shared-boundary-guides");
const args = process.argv.slice(2), cache = new Map();
const port = Number(args.find(value => value.startsWith("--port="))?.slice(7)) || 4329;
const TYPES = ["plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const VIEWPORTS = [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 390, height: 560 }];

function resource(file, before) {
  if (!before) return fs.readFileSync(path.join(ROOT, "app", file));
  if (!cache.has(file)) cache.set(file, execFileSync("git", ["show", `${BASE}:app/${file}`], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 }));
  return cache.get(file);
}
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost"), before = url.pathname.startsWith("/before/");
  const relative = decodeURIComponent(before ? url.pathname.slice(8) : url.pathname.slice(1)) || "index.html";
  if (url.pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
  if (relative.includes("..") || relative.includes("\\")) { response.writeHead(403).end(); return; }
  try {
    const mime = { ".html": "text/html;charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
    response.setHeader("Content-Type", mime[path.extname(relative)] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    response.end(resource(relative, before));
  } catch { response.writeHead(404).end(); }
});

function canvasRecorder() {
  const proto = CanvasRenderingContext2D.prototype, states = new WeakMap();
  function record(ctx) { if (!states.has(ctx)) states.set(ctx, { path: [], strokes: [] }); return states.get(ctx); }
  for (const method of ["clearRect", "beginPath", "moveTo", "lineTo", "stroke"]) {
    const original = proto[method];
    proto[method] = function (...values) {
      const state = record(this);
      if (method === "clearRect") state.strokes = [];
      if (method === "beginPath") state.path = [];
      if (method === "moveTo" || method === "lineTo") state.path.push(values.slice(0, 2));
      if (method === "stroke" && state.path.length) state.strokes.push({ color: this.strokeStyle, alpha: this.globalAlpha, width: this.lineWidth, points: state.path.slice() });
      return original.apply(this, values);
    };
  }
  window.boundaryQA = { strokes: canvas => record(canvas.getContext("2d")).strokes };
}
async function frame(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function snapshot(page, type, revision, viewport, label = "edges") {
  await frame(page);
  const name = `${revision}-${type}-${label}-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: path.join(OUT, name), animations: "disabled" });
  return `artifacts/shared-boundary-guides/${name}`;
}
async function openGame(browser, url, viewport, type, before) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true, reducedMotion: "reduce" });
  await context.addInitScript(canvasRecorder);
  await context.addInitScript(() => {
    localStorage.setItem("topology-gomoku:v1", JSON.stringify({ unlocked: 6, learnedLevels: [0, 1, 2, 3, 4, 5, 6], sound: false, hints: false, mode: "duel" }));
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url + (before ? "before/" : ""));
  await frame(page);
  await page.evaluate(() => {
    window.boundaryQA.moves = [];
    const original = TopologyGomoku.checkWin;
    TopologyGomoku.checkWin = function (board, rules, cell, player) {
      const result = original.apply(this, arguments);
      boundaryQA.moves.push({ cell, player, won: Boolean(result) });
      return result;
    };
  });
  await page.locator('[data-mode="duel"]').click();
  await page.locator(`[data-level="${TYPES.indexOf(type)}"]`).click();
  await page.waitForFunction(() => document.getElementById("turnStatus").textContent === "黑方回合" && !document.getElementById("appShell").classList.contains("is-navigating"));
  await frame(page);
  return { context, page, errors };
}
async function geometry(page, type) {
  return page.evaluate(type => {
    const canvas = document.getElementById("boardCanvas"), rect = canvas.getBoundingClientRect();
    const level = TopologyGameContent.LEVELS.find(level => level.topology === type);
    const layout = TopologyBoardArt.computeLayout(canvas.clientWidth, canvas.clientHeight, level);
    return { level, layout, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, strokes: boundaryQA.strokes(canvas), moves: boundaryQA.moves };
  }, type);
}
function near(actual, expected, message) { assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`); }
function checkGrid(data, extended) {
  const { level, layout, strokes } = data;
  const lines = strokes.filter(stroke => stroke.points.length === 2 && stroke.color.replace(/\s/g, "") === "rgba(108,103,94,0.5)");
  assert.equal(lines.length, level.width + level.height, `${level.topology}: all grid lines`);
  const half = extended ? layout.cell / 2 : 0;
  const x = level.xConnection || level.topology === "sphere" ? half : 0;
  const y = level.yConnection || level.topology === "sphere" ? half : 0;
  for (let index = 0; index < level.width; index++) {
    near(lines[index].points[0][0], layout.left + index * layout.cell, "vertical intersection x");
    near(lines[index].points[0][1], layout.top - y, "top grid endpoint");
    near(lines[index].points[1][1], layout.bottom + y, "bottom grid endpoint");
  }
  for (let index = 0; index < level.height; index++) {
    const line = lines[level.width + index];
    near(line.points[0][1], layout.top + index * layout.cell, "horizontal intersection y");
    near(line.points[0][0], layout.left - x, "left grid endpoint");
    near(line.points[1][0], layout.right + x, "right grid endpoint");
  }
  const rails = strokes.filter(stroke => stroke.points.length === 2 && ["#3f8c87", "#c79244"].includes(stroke.color));
  const offset = extended ? layout.cell / 2 : Math.min(15, layout.cell * .4);
  const bounds = { left: layout.left - offset, right: layout.right + offset, top: layout.top - offset, bottom: layout.bottom + offset };
  for (const rail of rails) {
    const [a, b] = rail.points;
    if (a[0] === b[0]) assert.ok(Math.abs(a[0] - bounds.left) < 1e-6 || Math.abs(a[0] - bounds.right) < 1e-6, "vertical rail at half-cell endpoint");
    else assert.ok(Math.abs(a[1] - bounds.top) < 1e-6 || Math.abs(a[1] - bounds.bottom) < 1e-6, "horizontal rail at half-cell endpoint");
    for (const point of rail.points) assert.ok(point[0] >= 5 && point[0] <= layout.width - 5 && point[1] >= 5 && point[1] <= layout.height - 5, "rail and arrow fit canvas");
  }
  assert.equal(rails.length, (x || level.xConnection || level.topology === "sphere" ? 2 : 0) + (y || level.yConnection || level.topology === "sphere" ? 2 : 0));
  return { cell: layout.cell, gridLines: lines.length, rails: rails.length, center: [layout.left, layout.top, layout.right, layout.bottom], canvas: [layout.width, layout.height] };
}
async function tapCell(page, type, cell) {
  const { level, layout, rect, moves } = await geometry(page, type);
  await page.touchscreen.tap(rect.x + layout.left + (cell % level.width) * layout.cell, rect.y + layout.top + Math.floor(cell / level.width) * layout.cell);
  await page.waitForFunction(count => boundaryQA.moves.length === count, moves.length + 1);
  assert.equal((await geometry(page, type)).moves.at(-1).cell + 0, cell, "real edge hit reaches the expected cell");
}
async function setProgress(page, value) {
  await page.locator("#dimensionSlider").evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event("input", { bubbles: true })); }, value);
  await page.waitForFunction(value => Math.abs(Number(document.getElementById("dimensionSlider").value) - value) < 1e-6, value);
  await frame(page);
}

async function run(url) {
  const { chromium } = require("playwright"), browser = await chromium.launch({ headless: true });
  const result = { baseline: BASE, viewports: VIEWPORTS, realGame: [], morph: [], sharedRenderer: [], crossBoundaryWin: null };
  fs.mkdirSync(OUT, { recursive: true });
  try {
    for (const viewport of VIEWPORTS) for (const type of TYPES) {
      const layouts = [];
      for (const revision of ["before", "after"]) {
        const { context, page, errors } = await openGame(browser, url, viewport, type, revision === "before");
        try {
          const initial = await geometry(page, type), geometryResult = checkGrid(initial, revision === "after");
          layouts.push(initial.layout);
          const { width, height } = initial.level;
          for (const cell of [0, width - 1, (height - 1) * width, width * height - 1]) await tapCell(page, type, cell);
          // Wait for the same settled last-move state, with no seam pulse in flight.
          await page.waitForTimeout(1050);
          const file = ["plane", "torus", "mobius", "sphere"].includes(type) ? await snapshot(page, type, revision, viewport) : null;
          result.realGame.push({ revision, type, viewport, geometry: geometryResult, edgeMoves: (await geometry(page, type)).moves, file });
          if (type !== "plane") {
            for (const progress of [.002, .25, .5, 1, 0]) {
              await setProgress(page, progress);
              if (progress === 0) checkGrid(await geometry(page, type), revision === "after");
              const file = viewport.width === 1280 && ["torus", "sphere"].includes(type) && [.002, .25, .5].includes(progress) ? await snapshot(page, type, revision, viewport, `morph-${progress}`) : null;
              result.morph.push({ revision, type, viewport, progress, file });
            }
          }
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
      assert.deepEqual(layouts[0], layouts[1], `${type}: original cell positions stay unchanged`);
    }
    // Exercise the shared module independently at small/large board dimensions.
    const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    await context.addInitScript(canvasRecorder);
    const page = await context.newPage();
    await page.goto(url);
    for (const type of TYPES) for (const size of [5, 7, 19]) for (const canvas of [[800, 600], [300, 220]]) {
      const fixture = await page.evaluate(({ type, size, canvas }) => {
        const level = { ...TopologyGameContent.LEVELS.find(item => item.topology === type), width: size, height: size };
        const rules = TopologyGomoku.createRules({ type, width: size, height: size }), board = new Int8Array(size * size);
        const element = document.createElement("canvas"); element.width = canvas[0]; element.height = canvas[1];
        const layout = TopologyBoardArt.computeLayout(...canvas, rules), game = { level, rules, board, lastMove: -1 };
        TopologyBoardArt.drawBoard(element.getContext("2d"), { game, layout, time: 2000 });
        const strokes = boundaryQA.strokes(element);
        return { level, layout, strokes, allCellsHit: [...board].every((_, cell) => { const p = TopologyBoardArt.cellCenter(rules, layout, cell); return TopologyBoardArt.hitTestCell(rules, layout, p.x, p.y) === cell; }) };
      }, { type, size, canvas });
      assert.equal(fixture.allCellsHit, true);
      result.sharedRenderer.push({ type, size, canvas, ...checkGrid(fixture, true) });
    }
    await context.close();
    // Real pointer-driven wrapped five, with a reviewable pre-win edge position.
    const crossing = await openGame(browser, url, VIEWPORTS[0], "torus", false);
    try {
      const sequence = [26, 0, 27, 2, 21, 4, 22, 6, 23];
      for (const cell of sequence.slice(0, -1)) await tapCell(crossing.page, "torus", cell);
      await crossing.page.waitForTimeout(1050);
      const file = await snapshot(crossing.page, "torus", "after", VIEWPORTS[0], "cross-boundary");
      await tapCell(crossing.page, "torus", sequence.at(-1));
      const moves = (await geometry(crossing.page, "torus")).moves;
      assert.equal(moves.at(-1).won, true);
      result.crossBoundaryWin = { sequence, winner: "black", file };
      assert.deepEqual(crossing.errors, []);
    } finally { await crossing.context.close(); }
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ realGameCases: result.realGame.length, morphChecks: result.morph.length, sharedRendererCases: result.sharedRenderer.length, crossBoundaryWin: true }));
  } finally { await browser.close(); }
}
(async () => {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(args.includes("--serve") ? port : 0, "127.0.0.1", resolve); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  if (args.includes("--serve")) { console.log("Preview: " + url); return; }
  try { await run(url); } finally { server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });

"use strict";

// Small, fixed-content Canvas comparison for complete 2D rails and the first morph frame.
// Playwright is supplied through NODE_PATH. No running game service is touched.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto"), { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), BASE = "a2f05bdfa5952ffa5ac259f84745717a1dcca6e9";
const OUTPUT = "artifacts/board-corner-rails", OUT = path.join(ROOT, OUTPUT);
const TYPES = ["sphere", "torus", "klein", "projective", "cylinder", "mobius", "plane"];
const SOURCES = ["topology.js", "topology-morph.js", "board-view-logic.js", "level-config.js", "board-art.js"];
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

async function pageFor(browser, revision, results) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 720 }, deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><body style="margin:0;background:#f2efe7"><main style="display:grid;grid-template-columns:repeat(4,480px)"></main></body>');
  results.sources[revision] = {};
  for (const name of SOURCES) {
    const file = "app/assets/" + name;
    const source = revision === "before" ? execFileSync("git", ["show", `${BASE}:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }) : fs.readFileSync(path.join(ROOT, file), "utf8");
    results.sources[revision][file] = hash(source); await page.addScriptTag({ content: source });
  }
  await page.evaluate(() => {
    window.qa = {};
    qa.colored = color => { const value = color.replace(/\s/g, ""); return ["#3f8c87", "#c79244"].includes(value) || value.startsWith("rgba(63,140,135,") || value.startsWith("rgba(199,146,68,"); };
    qa.draw = function (type, width, height, progress) {
      if (type === "sphere") height = width;
      const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 360;
      const ctx = canvas.getContext("2d"), strokes = []; let points = [];
      const original = Object.fromEntries(["beginPath", "moveTo", "lineTo", "stroke"].map(name => [name, ctx[name]]));
      ctx.beginPath = function () { points = []; return original.beginPath.apply(this, arguments); };
      for (const name of ["moveTo", "lineTo"]) ctx[name] = function (x, y) { points.push([x, y]); return original[name].apply(this, arguments); };
      ctx.stroke = function () {
        if (points.length && qa.colored(this.strokeStyle) && this.globalAlpha > .05) strokes.push({ color: this.strokeStyle, points: points.slice() });
        return original.stroke.apply(this, arguments);
      };
      const level = { ...TopologyGameContent.LEVELS.find(row => row.topology === type), width, height };
      const rules = TopologyGomoku.createRules({ type, width, height }), board = new Int8Array(width * height);
      const game = { level, rules, board, lastMove: -1 }, layout = TopologyBoardArt.computeLayout(480, 360, rules);
      ctx.fillStyle = TopologyBoardArt.TOKENS.paper; ctx.fillRect(0, 0, 480, 360);
      if (progress && type !== "plane") TopologyBoardArt.drawCompletion(ctx, { game, layout, morph: progress, time: 20000 });
      else TopologyBoardArt.drawBoard(ctx, { game, layout, time: 20000 });
      const bounds = TopologyBoardArt.boundaryGeometry(rules, layout);
      return { canvas, data: { type, width, height, progress, bounds, layout, rails: strokes,
        image: canvas.toDataURL(), allCellsHit: Array.from(board, (_, cell) => {
          const point = TopologyBoardArt.cellCenter(rules, layout, cell);
          return TopologyBoardArt.hitTestCell(rules, layout, point.x, point.y) === cell;
        }).every(Boolean) } };
    };
  });
  return page;
}

function verify(row, final) {
  const paired = ["sphere", "torus", "klein", "projective"].includes(row.type);
  const expected = paired ? ["left", "right", "top", "bottom"] : row.type === "plane" ? [] : ["left", "right"];
  const corners = { left: [[row.bounds.left, row.bounds.top], [row.bounds.left, row.bounds.bottom]],
    right: [[row.bounds.right, row.bounds.top], [row.bounds.right, row.bounds.bottom]],
    top: [[row.bounds.left, row.bounds.top], [row.bounds.right, row.bounds.top]],
    bottom: [[row.bounds.left, row.bounds.bottom], [row.bounds.right, row.bounds.bottom]] };
  const covered = {};
  for (const side of expected) {
    const axis = side === "left" || side === "right" ? 0 : 1;
    const rails = row.rails.filter(rail => rail.points.every(point => Math.abs(point[axis] - row.bounds[side]) < .01));
    covered[side] = Math.max(...corners[side].map(corner => Math.min(...rails.flatMap(rail => rail.points.map(point => Math.hypot(point[0] - corner[0], point[1] - corner[1]))))));
  }
  assert.ok(row.allCellsHit, `${row.type}/${row.width}x${row.height}: unchanged cell hit targets`);
  if (row.type === "plane") assert.equal(row.rails.length, 0, "plane gains no colored boundary frame");
  if (row.progress === 0) assert.equal(row.rails.length, expected.length, `${row.type}: only connected sides have rails`);
  if (final) for (const side of expected) assert.ok(covered[side] < .01, `${row.type}/${row.width}x${row.height}/${row.progress}: ${side} reaches both corners`);
  return covered;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const results = { baseline: BASE, canvas: [480, 360], viewport: [1920, 720], dpr: 1, cases: [], evidence: [], sources: {},
    notes: ["Shared production Canvas renderer; empty board and fixed time. Contact sheets put 2D on the first row and morph=0.00001 on the second.", "Corner continuity checks rail endpoints, since the first morph frame also changes surface material and grid styling."] };
  const browser = await chromium.launch({ headless: true });
  try {
    for (const revision of ["before", "after"]) {
      const page = await pageFor(browser, revision, results), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      for (const dimensions of [[7, 6], [5, 5], [19, 19]]) for (const type of TYPES) for (const progress of [0, .00001]) {
        const row = await page.evaluate(({ type, dimensions, progress }) => qa.draw(type, ...dimensions, progress).data, { type, dimensions, progress });
        const imageSha256 = hash(row.image); delete row.image;
        const cornerDistancePx = verify(row, revision === "after");
        row.rails = row.rails.map(rail => ({ color: rail.color, pointCount: rail.points.length,
          firstPoint: rail.points[0], lastPoint: rail.points[rail.points.length - 1] }));
        results.cases.push({ revision, ...row, imageSha256, cornerDistancePx });
      }
      for (const [label, types] of [["paired", TYPES.slice(0, 4)], ["open", TYPES.slice(4)]]) {
        await page.evaluate(types => {
          const main = document.querySelector("main"); main.replaceChildren();
          main.style.gridTemplateColumns = `repeat(${types.length},480px)`;
          for (const progress of [0, .00001]) for (const type of types) main.append(qa.draw(type, 7, 6, progress).canvas);
        }, types);
        await page.setViewportSize({ width: types.length * 480, height: 720 });
        const file = `${OUTPUT}/${revision}-${label}-first-frame.png`;
        await page.screenshot({ path: path.join(ROOT, file) }); results.evidence.push({ revision, types, dimensions: types.map(type => ({ type, width: 7, height: type === "sphere" ? 7 : 6 })), progress: [0, .00001], file });
      }
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
  for (const row of results.cases.filter(row => row.revision === "after" && row.progress === 0 && ["plane", "cylinder", "mobius"].includes(row.type))) {
    const before = results.cases.find(item => item.revision === "before" && item.type === row.type && item.width === row.width && item.height === row.height && item.progress === 0);
    assert.equal(row.imageSha256, before.imageSha256, `${row.type}/${row.width}x${row.height}: open edges remain pixel-identical`);
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify({ cases: results.cases.length, images: results.evidence.length, results: `${OUTPUT}/results.json` }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

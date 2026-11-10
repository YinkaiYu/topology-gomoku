"use strict";

// Compare the real 2D renderer with the completion renderer at its lower endpoint.
// Playwright is supplied through NODE_PATH; no running game service is touched.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto"), { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), BASE = "50fdb3bd6455e1cd76ee168d290462bc8fed0150";
const OUTPUT = "artifacts/board-first-frame", OUT = path.join(ROOT, OUTPUT);
const TYPES = ["cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const SOURCES = ["topology.js", "topology-morph.js", "board-view-logic.js", "level-config.js", "board-art.js"];
const PROGRESS = [0, 1e-8, .001, .01], SIZE = 360;
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

async function pageFor(browser, revision, results) {
  const page = await browser.newPage({ viewport: { width: SIZE * 5, height: SIZE * 2 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><body style="margin:0;background:#f2efe7"><main style="display:grid;grid-template-columns:repeat(5,${SIZE}px)"></main></body>`);
  results.sources[revision] = {};
  for (const name of SOURCES) {
    const file = "app/assets/" + name;
    const source = revision === "before" ? execFileSync("git", ["show", `${BASE}:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }) : fs.readFileSync(path.join(ROOT, file), "utf8");
    results.sources[revision][file] = hash(source); await page.addScriptTag({ content: source });
  }
  await page.evaluate(({ SIZE, PROGRESS }) => {
    window.qa = {};
    qa.fixture = function (type, occupied) {
      const rules = TopologyGomoku.createRules({ type, width: 7, height: 7 });
      const level = { ...TopologyGameContent.LEVELS.find(row => row.topology === type), width: 7, height: 7 };
      const board = new Int8Array(49), moves = occupied ? [0, 6, 42, 48, 24, 25, 17, 31] : [];
      moves.forEach((cell, index) => { board[cell] = index % 2 + 1; });
      const game = { level, rules, board, lastMove: occupied ? 31 : -1, lastMoveAt: occupied ? 19880 : 0 };
      return { game, layout: TopologyBoardArt.computeLayout(SIZE, SIZE, rules) };
    };
    qa.canvas = function () { const canvas = document.createElement("canvas"); canvas.width = SIZE; canvas.height = SIZE; return canvas; };
    qa.render = function (canvas, fixture, progress) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, SIZE, SIZE); ctx.fillStyle = TopologyBoardArt.TOKENS.paper; ctx.fillRect(0, 0, SIZE, SIZE);
      const options = { ...fixture, morph: progress, rotation: { x: .3, y: -.45, z: .1 }, time: 20000 };
      if (progress === "2d") TopologyBoardArt.drawBoard(ctx, options);
      else TopologyBoardArt.drawCompletion(ctx, options);
      return ctx.getImageData(0, 0, SIZE, SIZE).data;
    };
    qa.regions = function ({ game, layout }) {
      const dots = [], material = [], lastMove = [];
      function square(target, x, y, radius) {
        for (let iy = Math.max(0, Math.ceil(y - radius)); iy <= Math.min(SIZE - 1, Math.floor(y + radius)); iy++)
          for (let ix = Math.max(0, Math.ceil(x - radius)); ix <= Math.min(SIZE - 1, Math.floor(x + radius)); ix++) target.push(iy * SIZE + ix);
      }
      for (let cell = 0; cell < game.board.length; cell++) {
        const point = TopologyBoardArt.cellCenter(game.rules, layout, cell);
        if (!game.board[cell]) square(dots, point.x, point.y, 2);
        if (cell === game.lastMove) square(lastMove, point.x, point.y, layout.cell * .45);
        if (cell % 7 < 6 && cell < 42) square(material, point.x + layout.cell / 2, point.y + layout.cell / 2, 2);
      }
      return { dots: [...new Set(dots)], material: [...new Set(material)], lastMove };
    };
    qa.diff = function (before, after, indices) {
      const length = indices ? indices.length : SIZE * SIZE;
      let changedPixels = 0, significantPixels = 0, sum = 0, maxChannelError = 0;
      for (let i = 0; i < length; i++) {
        const offset = (indices ? indices[i] : i) * 4; let pixelMax = 0;
        for (let c = 0; c < 3; c++) { const delta = Math.abs(before[offset + c] - after[offset + c]); sum += delta; pixelMax = Math.max(pixelMax, delta); }
        if (pixelMax) changedPixels++; if (pixelMax > 8) significantPixels++;
        maxChannelError = Math.max(maxChannelError, pixelMax);
      }
      return { pixels: length, changedPixels, significantPixels, meanRgbError: length ? Number((sum / (length * 3)).toFixed(8)) : 0, maxChannelError };
    };
    qa.run = function (type, occupied) {
      const fixture = qa.fixture(type, occupied), canvas = qa.canvas(), regions = qa.regions(fixture);
      const reference = qa.render(canvas, fixture, "2d"), forwardPixels = [], forward = [];
      for (const progress of PROGRESS) {
        const pixels = qa.render(canvas, fixture, progress); forwardPixels.push(pixels);
        forward.push({ progress, whole: qa.diff(reference, pixels), dots: qa.diff(reference, pixels, regions.dots), material: qa.diff(reference, pixels, regions.material), lastMove: qa.diff(reference, pixels, regions.lastMove) });
      }
      qa.render(canvas, fixture, 1);
      const reverse = [...PROGRESS].reverse().map(progress => {
        const pixels = qa.render(canvas, fixture, progress), index = PROGRESS.indexOf(progress);
        return { progress, versusForward: qa.diff(forwardPixels[index], pixels) };
      });
      qa.render(canvas, fixture, "2d");
      return { type, occupied, forward, reverse, referenceImage: canvas.toDataURL(), final2d: qa.diff(reference, canvas.getContext("2d").getImageData(0, 0, SIZE, SIZE).data) };
    };
    qa.gallery = function (type) {
      const main = document.querySelector("main"); main.replaceChildren();
      for (const occupied of [false, true]) for (const progress of ["2d", ...PROGRESS]) {
        const canvas = qa.canvas(); qa.render(canvas, qa.fixture(type, occupied), progress); main.append(canvas);
      }
    };
  }, { SIZE, PROGRESS });
  return page;
}

function verify(row) {
  assert.equal(row.forward[0].whole.changedPixels, 0, `${row.type}/${row.occupied}: morph=0 must be pixel-identical to 2D`);
  assert.equal(row.final2d.changedPixels, 0, `${row.type}/${row.occupied}: return to 2D must restore every pixel`);
  for (const reverse of row.reverse) assert.equal(reverse.versusForward.changedPixels, 0, `${row.type}/${row.occupied}/${reverse.progress}: direction must not change the rendered image`);
  // One hundred-millionth of a transition is far below a pixel. A material or dot
  // jump remains measurable here; normal geometry motion has converged to zero.
  for (const region of ["whole", "dots", "material", "lastMove"]) {
    assert.ok(row.forward[1][region].meanRgbError <= .001, `${row.type}/${row.occupied}: ${region} error must approach zero at epsilon`);
    assert.equal(row.forward[1][region].significantPixels, 0, `${row.type}/${row.occupied}: ${region} has an epsilon discontinuity`);
    assert.ok(row.forward[2][region].meanRgbError <= row.forward[3][region].meanRgbError + .02, `${row.type}/${row.occupied}: ${region} error must converge as progress decreases`);
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const resultsFile = path.join(OUT, "results.json"), afterOnly = process.argv.includes("--after-only"), beforeOnly = process.argv.includes("--before-only");
  const results = (afterOnly || beforeOnly) && fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, "utf8")) : {
    baseline: BASE, canvas: [SIZE, SIZE], viewport: [SIZE * 5, SIZE * 2], dpr: 1, time: 20000,
    progress: PROGRESS, dimensions: [7, 7], rotation: { x: .3, y: -.45, z: .1 }, cases: [], sources: {}, evidence: [],
    notes: ["Completion is called directly even at morph=0, so a harness branch cannot hide the renderer handoff.", "Each contact sheet: columns 2D, 0, 1e-8, 0.001, 0.01; rows empty board and eight stones with a recent last-move marker.", "One reused context runs forward, visits morph=1, returns through each near-zero progress, then renders 2D; all reverse images must equal forward images.", "Mean RGB error uses raw 0–255 channels. Regions separately sample unoccupied grid points, cell interiors and the last-move stone."]
  };
  assert.equal(results.baseline, BASE);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const revision of afterOnly ? ["after"] : beforeOnly ? ["before"] : ["before", "after"]) {
      results.cases = results.cases.filter(row => row.revision !== revision); results.evidence = results.evidence.filter(row => row.revision !== revision);
      const page = await pageFor(browser, revision, results), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      for (const type of TYPES) for (const occupied of [false, true]) {
        const row = await page.evaluate(({ type, occupied }) => qa.run(type, occupied), { type, occupied });
        row.referenceSha256 = hash(row.referenceImage); delete row.referenceImage;
        results.cases.push({ revision, ...row });
      }
      for (const type of ["torus", "sphere"]) {
        await page.evaluate(type => qa.gallery(type), type);
        const file = `${OUTPUT}/${revision}-${type}-first-frame.png`;
        await page.screenshot({ path: path.join(ROOT, file) }); results.evidence.push({ revision, type, file });
      }
      assert.deepEqual(errors, []); await page.close();
      fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2) + "\n");
      if (revision === "after") {
        for (const row of results.cases.filter(row => row.revision === "after")) {
          verify(row);
          const before = results.cases.find(item => item.revision === "before" && item.type === row.type && item.occupied === row.occupied);
          if (before) assert.equal(row.referenceSha256, before.referenceSha256, `${row.type}/${row.occupied}: existing 2D image stays unchanged`);
        }
        for (const [file, expected] of Object.entries(results.sources.after)) assert.equal(hash(fs.readFileSync(path.join(ROOT, file), "utf8")), expected, `${file}: source changed during QA`);
      }
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({ cases: results.cases.length, images: results.evidence.length, results: `${OUTPUT}/results.json` }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

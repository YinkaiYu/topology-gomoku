"use strict";

// Fixed-content Canvas evidence for continuous depth, silhouette motion and partial stones.
// Playwright is supplied by the caller through NODE_PATH; no service or user game is touched.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), BASE = "921c52d";
const OUT = path.join(ROOT, "artifacts/board-occlusion");
const TYPES = ["cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const SOURCES = ["topology.js", "topology-morph.js", "board-view-logic.js", "level-config.js", "board-art.js"];
const MOVES = [0, 6, 42, 48, 24, 25, 17, 31];
const args = process.argv.slice(2);

async function createPage(browser, revision) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1800 }, deviceScaleFactor: 1 });
  page.qaSources = {};
  await page.setContent('<!doctype html><html><body style="margin:0;background:#f2efe7"><main style="display:grid;grid-template-columns:600px 600px"></main></body></html>');
  for (const name of SOURCES) {
    const relative = "app/assets/" + name;
    const content = revision === "before"
      ? execFileSync("git", ["show", `${BASE}:${relative}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
      : fs.readFileSync(path.join(ROOT, relative), "utf8");
    page.qaSources[relative] = crypto.createHash("sha256").update(content).digest("hex");
    await page.addScriptTag({ content });
  }
  await page.evaluate(({ types, moves }) => {
    window.qa = { types, moves, fixtures: [] };
    qa.make = function (type, size = 7, full = false) {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 600;
      const level = { ...TopologyGameContent.LEVELS.find(item => item.topology === type), width: size, height: size };
      const rules = TopologyGomoku.createRules({ type, width: size, height: size });
      const board = new Int8Array(size * size);
      if (full) board.forEach((_, i) => { board[i] = i % 2 + 1; });
      else moves.forEach((cell, i) => { board[cell] = i % 2 + 1; });
      return { canvas, game: { level, rules, board, lastMove: -1 }, layout: TopologyBoardArt.computeLayout(600, 600, rules) };
    };
    qa.orientation = function (amount = 0) {
      return { x: .42 + amount * .35, y: -.58 + amount, z: -.08, morph: 1, perspective: 1 };
    };
    qa.render = function (fixture, amount = 0, extra = {}) {
      const ctx = fixture.canvas.getContext("2d");
      ctx.clearRect(0, 0, 600, 600);
      ctx.fillStyle = TopologyBoardArt.TOKENS.paper;
      ctx.fillRect(0, 0, 600, 600);
      const depth = TopologyBoardArt.drawCompletion(ctx, { game: fixture.game, layout: fixture.layout, morph: 1,
        orientation: qa.orientation(amount), time: 20000, ...extra });
      return depth;
    };
    for (const type of types) {
      const fixture = qa.make(type); document.querySelector("main").append(fixture.canvas); qa.fixtures.push(fixture);
    }
  }, { types: TYPES, moves: MOVES });
  return page;
}

async function saveDataUrl(name, data) {
  const file = `artifacts/board-occlusion/${name}.png`;
  fs.writeFileSync(path.join(ROOT, file), Buffer.from(data.split(",")[1], "base64"));
  return file;
}

async function visualEvidence(page, revision, results) {
  await page.evaluate(() => { qa.fixtures.forEach(fixture => qa.render(fixture)); });
  const gallery = `artifacts/board-occlusion/${revision}-six-surfaces.png`;
  await page.screenshot({ path: path.join(ROOT, gallery) });
  results.evidence.push({ revision, kind: "six-surfaces", file: gallery });
  for (const type of TYPES) {
    const sequence = await page.evaluate(type => {
      const fixture = qa.make(type), strip = document.createElement("canvas");
      strip.width = 2400; strip.height = 600;
      const ctx = strip.getContext("2d");
      const amounts = [0, .04, .08, .12];
      amounts.forEach((amount, i) => { qa.render(fixture, amount); ctx.drawImage(fixture.canvas, i * 600, 0); });
      return { amounts, data: strip.toDataURL() };
    }, type);
    const file = await saveDataUrl(`${revision}-${type}-drag-sequence`, sequence.data);
    results.evidence.push({ revision, type, kind: "small-drag-sequence", amounts: sequence.amounts, file });
  }
}

async function silhouetteEvidence(page, revision, results) {
  const evidence = await page.evaluate(() => {
    const fixture = qa.make("torus");
    fixture.canvas.width = fixture.canvas.height = 300;
    fixture.game.board.fill(0);
    fixture.layout = TopologyBoardArt.computeLayout(300, 300, fixture.game.rules);
    const ctx = fixture.canvas.getContext("2d"), createDepth = TopologyMorph.createDepthBuffer;
    const strip = document.createElement("canvas"); strip.width = 1800; strip.height = 600;
    const stripCtx = strip.getContext("2d"); stripCtx.imageSmoothingEnabled = false;
    let current;
    TopologyMorph.createDepthBuffer = function () {
      const depth = createDepth.apply(this, arguments), strokePath = depth.strokePath;
      let pathIndex = 0;
      depth.strokePath = function (target, points) {
        if (pathIndex++ !== 7) return strokePath.apply(this, arguments);
        const begin = target.beginPath, move = target.moveTo, line = target.lineTo, stroke = target.stroke;
        let runs = [], active, last;
        target.beginPath = function () { runs = []; active = null; last = null; return begin.apply(this, arguments); };
        target.moveTo = function (x, y) { active = { length: 0 }; runs.push(active); last = { x, y }; return move.apply(this, arguments); };
        target.lineTo = function (x, y) { if (active && last) active.length += Math.hypot(x - last.x, y - last.y); last = { x, y }; return line.apply(this, arguments); };
        target.stroke = function () { current.push({ alpha: this.globalAlpha, runs: runs.map(run => ({ ...run })) }); return stroke.apply(this, arguments); };
        try { return strokePath.apply(this, arguments); }
        finally { target.beginPath = begin; target.moveTo = move; target.lineTo = line; target.stroke = stroke; }
      };
      return depth;
    };
    const samples = [];
    try {
      for (let step = 0; step <= 40; step++) {
        const rotation = step * .0025; current = [];
        ctx.clearRect(0, 0, 300, 300); ctx.fillStyle = TopologyBoardArt.TOKENS.paper; ctx.fillRect(0, 0, 300, 300);
        TopologyBoardArt.drawCompletion(ctx, { game: fixture.game, layout: fixture.layout, morph: 1, time: 20000,
          rotation: { x: rotation, y: 0, z: 0 } });
        const sharp = current.at(-1), lengths = sharp.runs.map(run => run.length).filter(length => length > 1e-6);
        samples.push({ rotation, sharpSubpaths: lengths.length, sharpLengthsPx: lengths });
        const imageIndex = [0, 12, 40].indexOf(step);
        if (imageIndex >= 0) stripCtx.drawImage(fixture.canvas, imageIndex * 600, 0, 600, 600);
      }
    } finally { TopologyMorph.createDepthBuffer = createDepth; }
    return { type: "torus", canvas: [300, 300], grid: [7, 7], view: "default", rotations: [0, .03, .1],
      samples, maxSubpaths: Math.max(...samples.map(row => row.sharpSubpaths)), data: strip.toDataURL() };
  });
  if (revision === "after") {
    assert.ok(evidence.maxSubpaths <= 2, "small default torus outer ring has no dashed islands throughout the drag");
    assert.ok(evidence.samples.every(row => row.sharpLengthsPx.every(length => length > 5)), "grazing ring does not grow tiny visible fragments");
  }
  const file = await saveDataUrl(`${revision}-torus-300-silhouette`, evidence.data);
  delete evidence.data;
  results.silhouette.push({ revision, ...evidence, file });
}

async function performanceEvidence(page, revision, results) {
  const measurements = await page.evaluate(async types => {
    const results = [];
    for (const type of types) for (const size of [7, 19]) {
      const fixture = qa.make(type, size, size === 19), cpu = [], flush = [], intervals = [];
      const ctx = fixture.canvas.getContext("2d");
      for (let frame = 0; frame < 16; frame++) {
        const started = performance.now(); qa.render(fixture, frame * .012);
        if (frame >= 3) cpu.push(performance.now() - started);
        ctx.getImageData(0, 0, 600, 600);
        if (frame >= 3) flush.push(performance.now() - started);
      }
      document.body.replaceChildren(fixture.canvas);
      let last;
      for (let frame = 0; frame < 38; frame++) {
        const time = await new Promise(requestAnimationFrame);
        if (frame >= 5) intervals.push(time - last);
        last = time; qa.render(fixture, frame * .012);
      }
      const stats = array => { array.sort((a, b) => a - b); return { median: array[Math.floor(array.length / 2)], p95: array[Math.floor(array.length * .95)], max: array.at(-1) }; };
      results.push({ type, size, stones: size === 19 ? 361 : 8, drawMs: stats(cpu), drawAndReadbackMs: stats(flush), animationFrameMs: stats(intervals) });
    }
    return results;
  }, TYPES);
  results.performance.push(...measurements.map(item => ({ revision, ...item })));
}

async function partialStoneEvidence(page, results) {
  for (const type of TYPES) {
    const evidence = await page.evaluate(type => {
      const fixture = qa.make(type); fixture.game.board.fill(0);
      const ctx = fixture.canvas.getContext("2d"), originalPaint = TopologyMorph.paintStone;
      const contains = (polygon, x, y) => {
        let sign = 0;
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i], b = polygon[(i + 1) % polygon.length];
          const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
          if (Math.abs(cross) < 1e-8) continue;
          const next = Math.sign(cross); if (sign && next !== sign) return false; sign = next;
        }
        return Boolean(sign);
      };
      const locate = (cell, amount) => {
        const uv = TopologyMorph.stoneUV(fixture.game.rules, cell);
        const point = TopologyBoardArt.mappedCompletionPoint(fixture.game, fixture.layout,
          TopologyBoardArt.cellCenter(fixture.game.rules, fixture.layout, cell), uv, qa.orientation(amount));
        return { point, radius: fixture.layout.cell * .3 * point.scale };
      };
      let chosen;
      for (const amount of [0, .4, .8, 1.2]) {
        const depth = qa.render(fixture, amount);
        for (let cell = 0; cell < 49; cell++) {
          const { point, radius } = locate(cell, amount), contours = TopologyMorph.stoneContours(depth, point, radius);
          if (!contours || !contours.length) continue;
          let clear = 0, hidden = 0;
          for (let sy = -8; sy <= 8; sy++) for (let sx = -8; sx <= 8; sx++) {
            if (sx * sx + sy * sy > 64) continue;
            const x = point.x + sx * radius / 10, y = point.y + sy * radius / 10;
            if (contours.some(polygon => contains(polygon, x, y))) clear++; else hidden++;
          }
          if (clear > 35 && hidden > 35) { chosen = { cell, amount }; break; }
        }
        if (chosen) break;
      }
      if (!chosen) return { type, found: false };
      const series = [], strip = document.createElement("canvas"); strip.width = 1000; strip.height = 200;
      const stripCtx = strip.getContext("2d");
      const frames = [0, 5, 10, 15, 20];
      for (let step = 0; step <= 20; step++) {
        const amount = chosen.amount + (step - 10) * .002, { point, radius } = locate(chosen.cell, amount);
        fixture.game.board[chosen.cell] = 0; qa.render(fixture, amount);
        const background = ctx.getImageData(0, 0, 600, 600).data;
        fixture.game.board[chosen.cell] = 1; qa.render(fixture, amount);
        const actual = ctx.getImageData(0, 0, 600, 600).data;
        if (frames.includes(step)) {
          const extent = radius * 2.5;
          stripCtx.drawImage(fixture.canvas, point.x - extent, point.y - extent, extent * 2, extent * 2,
            frames.indexOf(step) * 200, 0, 200, 200);
        }
        try {
          TopologyMorph.paintStone = (_ctx, _depth, _point, _radius, paint) => paint();
          qa.render(fixture, amount);
        } finally { TopologyMorph.paintStone = originalPaint; }
        const reference = ctx.getImageData(0, 0, 600, 600).data;
        let totalActual = 0, totalFull = 0, clear = 0, faint = 0, samples = 0;
        const ratios = new Float32Array(600 * 600);
        for (let y = Math.floor(point.y - radius); y <= Math.ceil(point.y + radius); y++) {
          for (let x = Math.floor(point.x - radius); x <= Math.ceil(point.x + radius); x++) {
            if (Math.hypot(x + .5 - point.x, y + .5 - point.y) > radius * .85) continue;
            const offset = (y * 600 + x) * 4;
            let full = 0, observed = 0;
            for (let channel = 0; channel < 3; channel++) {
              full += background[offset + channel] - reference[offset + channel];
              observed += background[offset + channel] - actual[offset + channel];
            }
            if (full < 100) continue;
            const ratio = observed / full;
            ratios[y * 600 + x] = ratio;
            if (ratio > .9) clear++; else if (ratio < .3) faint++;
            totalActual += observed; totalFull += full; samples++;
          }
        }
        let isolatedCrackPixels = 0;
        for (let y = Math.floor(point.y - radius); y <= Math.ceil(point.y + radius); y++) {
          for (let x = Math.floor(point.x - radius); x <= Math.ceil(point.x + radius); x++) {
            const i = y * 600 + x;
            if (ratios[i] > 0 && ratios[i] < .9 && [i - 1, i + 1, i - 600, i + 600].every(j => ratios[j] > .97)) isolatedCrackPixels++;
          }
        }
        series.push({ amount, strength: totalActual / totalFull, clearPixels: clear, faintPixels: faint, samplePixels: samples, isolatedCrackPixels });
      }
      const maxStrengthStep = Math.max(...series.slice(1).map((item, i) => Math.abs(item.strength - series[i].strength)));
      return { type, found: true, ...chosen, series, maxStrengthStep, data: strip.toDataURL() };
    }, type);
    assert.equal(evidence.found, true, `${type}: find a genuinely partly hidden stone`);
    assert.ok(evidence.series[10].clearPixels > 20 && evidence.series[10].faintPixels > 20,
      `${type}: the same rendered stone has clear and faint regions`);
    assert.ok(evidence.maxStrengthStep < .08, `${type}: small motion does not switch the whole stone at once`);
    assert.ok(evidence.series.every(frame => frame.isolatedCrackPixels === 0), `${type}: clear stone faces contain no isolated clipping cracks`);
    const file = await saveDataUrl(`after-${type}-partial-stone`, evidence.data);
    delete evidence.data;
    results.partialStones.push({ ...evidence, file });
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const revisions = args.includes("--before-only") ? ["before"] : args.includes("--after-only") ? ["after"] : ["before", "after"];
  const results = { baseline: BASE, viewport: { width: 1200, height: 1800, dpr: 1 }, canvas: [600, 600], moves: MOVES,
    evidence: [], silhouette: [], performance: [], partialStones: [], sources: {}, notes: ["Actual shared Canvas renderer; synthetic fixed game; desktop Chromium only.",
      "Contact sheets show four nearby orientations in left-to-right order; frame timing is measured separately, not inferred from screenshots."] };
  const browser = await chromium.launch({ headless: true });
  try {
    if (args.includes("--profile")) {
      const page = await createPage(browser, "after");
      const profile = await page.evaluate(types => {
        const rows = [], originalDepth = TopologyMorph.createDepthBuffer, originalPaint = TopologyMorph.paintStone;
        const originalFill = TopologyMorph.fillSurface;
        let measured;
        const record = (key, fn) => {
          const start = performance.now(); try { return fn(); } finally { measured[key] += performance.now() - start; }
        };
        TopologyMorph.createDepthBuffer = function () {
          const args = arguments, depth = record("depth", () => originalDepth.apply(this, args)), stroke = depth.strokePath;
          depth.strokePath = function () { const args = arguments; return record("grid", () => stroke.apply(this, args)); };
          return depth;
        };
        TopologyMorph.paintStone = function (ctx, depth, point, radius, paint) {
          return record("stones", () => originalPaint(ctx, depth, point, radius, () => record("stoneFaces", paint)));
        };
        TopologyMorph.fillSurface = function () { const args = arguments; return record("surface", () => originalFill.apply(this, args)); };
        for (const type of types) {
          const fixture = qa.make(type, 19, true), samples = [];
          for (let i = 0; i < 8; i++) {
            measured = { depth: 0, grid: 0, stones: 0, stoneFaces: 0, surface: 0 };
            const start = performance.now(); qa.render(fixture, i * .012); measured.total = performance.now() - start;
            if (i >= 3) samples.push(measured);
          }
          const mean = key => samples.reduce((sum, row) => sum + row[key], 0) / samples.length;
          rows.push({ type, ...Object.fromEntries(Object.keys(measured).map(key => [key, mean(key)])) });
        }
        return rows;
      }, TYPES);
      console.log(JSON.stringify(profile, null, 2));
      return;
    }
    for (const revision of revisions) {
      const page = await createPage(browser, revision), errors = [];
      results.sources[revision] = page.qaSources;
      page.on("pageerror", error => errors.push(error.message));
      await visualEvidence(page, revision, results);
      await silhouetteEvidence(page, revision, results);
      if (revision === "after") await partialStoneEvidence(page, results);
      await performanceEvidence(page, revision, results);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`Completed ${revision} visual and animation evidence`);
    }
  } finally { await browser.close(); }
  const destination = path.join(OUT, "results.json");
  if (revisions.length === 1 && fs.existsSync(destination)) {
    const prior = JSON.parse(fs.readFileSync(destination, "utf8"));
    results.sources = { ...prior.sources, ...results.sources };
    for (const key of ["evidence", "silhouette", "performance"]) results[key] = [...(prior[key] || []).filter(item => !revisions.includes(item.revision)), ...results[key]];
  }
  fs.writeFileSync(destination, JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify({ images: results.evidence.length, performanceCases: results.performance.length, results: "artifacts/board-occlusion/results.json" }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });

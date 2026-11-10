"use strict";

// Fixed-content shared Canvas evidence. No user game or running service is touched.
// Supply Playwright through NODE_PATH; --before-only / --after-only retain the other results.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const args = process.argv.slice(2);
const option = (name, fallback) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const ROOT = path.resolve(__dirname, "..");
const BASE = option("baseline", "81b7b0b71192f785c2b337042d722d8ace027ddc");
const OUTPUT = option("out", "artifacts/board-intersections").replace(/\\/g, "/");
assert.ok(OUTPUT.startsWith("artifacts/") && !OUTPUT.split("/").includes(".."), "evidence stays inside artifacts");
const OUT = path.join(ROOT, OUTPUT), SEAM_MOTION = args.includes("--seam-motion");
const TYPES = ["cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const TWO_PAIRS = ["torus", "klein", "projective", "sphere"];
const MOVES = [0, 6, 42, 48, 24, 25, 17, 31];
const SOURCES = ["topology.js", "topology-morph.js", "board-view-logic.js", "level-config.js", "board-art.js"];
const digest = data => crypto.createHash("sha256").update(data).digest("hex");

async function pageFor(browser, revision) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1800 }, deviceScaleFactor: 1 });
  const hashes = {};
  await page.setContent('<!doctype html><html><body style="margin:0;background:#f2efe7"><main style="display:grid;grid-template-columns:600px 600px"></main></body></html>');
  for (const name of SOURCES) {
    const file = "app/assets/" + name;
    const content = revision === "before" ? execFileSync("git", ["show", `${BASE}:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }) : fs.readFileSync(path.join(ROOT, file), "utf8");
    hashes[file] = digest(content); await page.addScriptTag({ content });
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
    qa.render = function (fixture, progress = 1, rotation = { x: 0, y: 0, z: 0 }, extra = {}) {
      const ctx = fixture.canvas.getContext("2d"), { width, height } = fixture.canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = TopologyBoardArt.TOKENS.paper; ctx.fillRect(0, 0, width, height);
      const options = { game: fixture.game, layout: fixture.layout, morph: progress, rotation, time: 20000, ...extra };
      return progress ? TopologyBoardArt.drawCompletion(ctx, options) : TopologyBoardArt.drawBoard(ctx, options);
    };
    qa.stats = values => { values.sort((a, b) => a - b); return { median: values[Math.floor(values.length / 2)], p95: values[Math.floor(values.length * .95)] }; };
    for (const type of types) {
      const fixture = qa.make(type); document.querySelector("main").append(fixture.canvas); qa.fixtures.push(fixture);
    }
  }, { types: TYPES, moves: MOVES });
  return { page, hashes };
}

function save(name, data) {
  const file = `${OUTPUT}/${name}.png`;
  fs.writeFileSync(path.join(ROOT, file), Buffer.from(data.split(",")[1], "base64")); return file;
}

async function screenshots(page, revision, results) {
  for (const rotated of [false, true]) {
    const states = await page.evaluate(rotated => qa.fixtures.map(fixture => {
      const depth = qa.render(fixture, 1, rotated ? { x: .6, y: .75, z: -.15 } : { x: 0, y: 0, z: 0 });
      const intersections = depth?.surfaceIntersections?.();
      return { type: fixture.game.level.topology, intersections: intersections?.length ?? null, image: fixture.canvas.toDataURL() };
    }), rotated);
    const file = `${OUTPUT}/${revision}-six-surfaces${rotated ? "-rotated" : ""}.png`;
    await page.screenshot({ path: path.join(ROOT, file) });
    results.evidence.push({ revision, kind: "six-surfaces", rotated, file });
    results.surfaces.push(...states.map(({ image, ...state }) => ({ revision, rotated, ...state, sha256: digest(image) })));
  }
  for (const type of SEAM_MOTION ? [...TWO_PAIRS, "mobius", "cylinder"] : TWO_PAIRS) {
    const sequence = await page.evaluate(({ type, seamMotion }) => {
      const fixture = qa.make(type), strip = document.createElement("canvas"); strip.width = 2400; strip.height = seamMotion ? 1200 : 600;
      const ctx = strip.getContext("2d"), progress = seamMotion ? [0, .12, .3, .5, .72, .9, 1] : [.25, .5, .75, 1], counts = [];
      ctx.fillStyle = TopologyBoardArt.TOKENS.paper; ctx.fillRect(0, 0, strip.width, strip.height);
      for (let i = 0; i < progress.length; i++) {
        const depth = qa.render(fixture, progress[i]); counts.push(depth?.surfaceIntersections?.().length ?? null);
        ctx.drawImage(fixture.canvas, i % 4 * 600, Math.floor(i / 4) * 600);
      }
      return { progress, counts, image: strip.toDataURL() };
    }, { type, seamMotion: SEAM_MOTION });
    const file = save(`${revision}-${type}-morph`, sequence.image); delete sequence.image;
    results.evidence.push({ revision, type, kind: "morph", ...sequence, file });
  }
  const flats = await page.evaluate(() => qa.fixtures.map(fixture => { qa.render(fixture, 0); return { type: fixture.game.level.topology, data: fixture.canvas.toDataURL() }; }));
  results.flat.push(...flats.map(({ type, data }) => ({ revision, type, sha256: digest(data) })));
}

async function stoneEvidence(page, revision, results) {
  const fixtures = [
    { type: "torus", rotation: { x: .6, y: .75, z: -.15 } },
    { type: "klein", rotation: { x: 0, y: 0, z: 0 } },
    { type: "projective", rotation: { x: 0, y: 0, z: 0 } }
  ];
  const output = await page.evaluate(fixtures => {
    const rows = [];
    for (const sample of fixtures) {
      const fixture = qa.make(sample.type), hits = [], paint = TopologyMorph.paintStone;
      // Retain all actual production stone calls; pick an occluded stone using the baseline geometry.
      TopologyMorph.paintStone = function (ctx, depth, point, radius, callback) {
        const contours = TopologyMorph.stoneContours(depth, point, radius);
        if (contours && contours.length) {
          const area = contours.reduce((total, polygon) => total + Math.abs(polygon.reduce((sum, a, i) => {
            const b = polygon[(i + 1) % polygon.length]; return sum + a.x * b.y - b.x * a.y;
          }, 0)) / 2, 0);
          const ratio = area / (4 * (radius + 1) ** 2);
          if (ratio > .12 && ratio < .88) hits.push({ point, radius, ratio });
        }
        return paint.apply(this, arguments);
      };
      try { qa.render(fixture, 1, sample.rotation); } finally { TopologyMorph.paintStone = paint; }
      const strip = document.createElement("canvas"); strip.width = 600; strip.height = 300;
      const ctx = strip.getContext("2d"); ctx.fillStyle = TopologyBoardArt.TOKENS.paper; ctx.fillRect(0, 0, 600, 300);
      hits.slice(0, 2).forEach(({ point, radius }, i) => {
        const extent = Math.max(50, radius * 2.7);
        ctx.drawImage(fixture.canvas, point.x - extent, point.y - extent, extent * 2, extent * 2, i * 300, 0, 300, 300);
      });
      rows.push({ ...sample, partialStones: hits.map(({ radius, ratio }) => ({ radius, ratio })), image: strip.toDataURL() });
    }
    return rows;
  }, fixtures);
  for (const { image, ...row } of output) {
    const file = save(`${revision}-${row.type}-stone-contact`, image);
    results.evidence.push({ revision, kind: "stone-contact", ...row, file });
  }
}

async function performanceEvidence(page, revision, results) {
  const measurements = await page.evaluate(async ({ types, seamMotion }) => {
    const rows = [];
    for (const type of types) for (const size of [7, 19]) {
      if (seamMotion && size === 19 && type !== "projective") continue;
      const fixture = qa.make(type, size, size === 19), draw = [], flushed = [], intervals = [];
      const ctx = fixture.canvas.getContext("2d");
      for (let i = 0; i < 14; i++) {
        const progress = seamMotion && size === 7 ? i / 13 : 1;
        const start = performance.now(); qa.render(fixture, progress, { x: .6, y: .75 + i * .012, z: -.15 });
        if (i >= 4) draw.push(performance.now() - start);
        ctx.getImageData(0, 0, 600, 600); if (i >= 4) flushed.push(performance.now() - start);
      }
      document.body.replaceChildren(fixture.canvas);
      let last;
      for (let i = 0; i < 30; i++) {
        const at = await new Promise(requestAnimationFrame); if (i >= 5) intervals.push(at - last); last = at;
        qa.render(fixture, seamMotion && size === 7 ? i / 29 : 1, { x: .6, y: .75 + i * .012, z: -.15 });
      }
      rows.push({ type, size, stones: size === 19 ? 361 : 8, motion: seamMotion && size === 7 ? "morph-sweep" : "rotation",
        drawMs: qa.stats(draw), drawAndReadbackMs: qa.stats(flushed), frameMs: qa.stats(intervals) });
    }
    return rows;
  }, { types: TWO_PAIRS, seamMotion: SEAM_MOTION });
  results.performance.push(...measurements.map(row => ({ revision, ...row })));
}

async function continuityEvidence(page, results) {
  const rows = await page.evaluate(types => {
    const rows = [];
    for (const type of types) {
      const fixture = qa.make(type);
      for (const progress of [.5, .75, 1]) for (let frame = 0; frame <= 20; frame++) {
        const depth = qa.render(fixture, progress, { x: frame * .002, y: frame * .003, z: 0 });
        const paths = depth.surfaceIntersections(), points = paths.flat();
        const lengths = paths.map(path => path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - path[i].x, point.y - path[i].y), 0));
        rows.push({ type, progress, frame, paths: paths.length, vertices: points.length,
          finite: points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.depth)),
          lengthPx: lengths.reduce((a, b) => a + b, 0), shortestPx: Math.min(...lengths) === Infinity ? null : Math.min(...lengths) });
      }
    }
    return rows;
  }, SEAM_MOTION ? TYPES : TWO_PAIRS);
  for (const row of rows) {
    assert.ok(row.finite, `${row.type}: finite intersection vertices throughout nearby rotations`);
    if (SEAM_MOTION && ["cylinder", "mobius", "torus", "sphere"].includes(row.type)) assert.equal(row.paths, 0,
      `${row.type}/${row.progress}: embedded surfaces do not cross during closure`);
    if (row.progress === 1 && ["torus", "sphere"].includes(row.type)) assert.equal(row.paths, 0, `${row.type}: closed surface has no false self-intersection`);
    if (row.progress === 1 && ["klein", "projective"].includes(row.type)) assert.ok(row.paths > 0, `${row.type}: inherent intersection persists throughout rotation`);
  }
  results.continuity = rows;
}

async function motionBounds(page, revision, results) {
  const rows = await page.evaluate(types => {
    const rows = [], createDepth = TopologyMorph.createDepthBuffer, paintStone = TopologyMorph.paintStone;
    let extent, stones;
    TopologyMorph.createDepthBuffer = function (width, height, patches) {
      const points = patches.flatMap(patch => patch.points);
      extent = { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
        top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
      return createDepth.apply(this, arguments);
    };
    TopologyMorph.paintStone = function (ctx, depth, point, radius) {
      stones.push({ x: point.x, y: point.y, depth: point.depth, radius });
      return paintStone.apply(this, arguments);
    };
    try {
      for (const type of types) for (const size of [300, 390, 600]) {
        const fixture = qa.make(type); fixture.canvas.width = fixture.canvas.height = size;
        fixture.layout = TopologyBoardArt.computeLayout(size, size, fixture.game.rules);
        const ctx = fixture.canvas.getContext("2d"), methods = {}, arrowPoints = [];
        let polygon = [], polygonOnly = true;
        for (const name of ["beginPath", "moveTo", "lineTo", "arc", "rect", "fill"]) methods[name] = ctx[name];
        ctx.beginPath = function () { polygon = []; polygonOnly = true; return methods.beginPath.apply(this, arguments); };
        for (const name of ["moveTo", "lineTo"]) ctx[name] = function (x, y) {
          const m = this.getTransform(); polygon.push({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
          return methods[name].apply(this, arguments);
        };
        for (const name of ["arc", "rect"]) ctx[name] = function () { polygonOnly = false; return methods[name].apply(this, arguments); };
        ctx.fill = function () {
          if (polygonOnly && polygon.length === 3) arrowPoints.push(...polygon);
          return methods.fill.apply(this, arguments);
        };
        for (const progress of [.01, .06, .12, .2, .3, .5, .72, .9, 1]) {
          stones = []; arrowPoints.length = 0; qa.render(fixture, progress);
          const surfaceMargin = Math.min(extent.left, extent.top, size - extent.right, size - extent.bottom);
          const stoneMargin = Math.min(...stones.flatMap(p => [p.x - p.radius, p.y - p.radius, size - p.x - p.radius, size - p.y - p.radius]));
          const arrowMargin = arrowPoints.length ? Math.min(...arrowPoints.flatMap(p => [p.x, p.y, size - p.x, size - p.y])) : null;
          rows.push({ type, canvas: size, progress, surfaceMargin, stoneMargin, arrowMargin, arrowTriangles: arrowPoints.length / 3,
            endpointStones: progress === 1 ? stones : undefined });
        }
      }
    } finally { TopologyMorph.createDepthBuffer = createDepth; TopologyMorph.paintStone = paintStone; }
    return rows;
  }, TYPES);
  if (revision === "after") for (const row of rows) {
    assert.ok(row.surfaceMargin >= 0, `${row.type}/${row.canvas}/${row.progress}: stretched surface fits canvas`);
    assert.ok(row.stoneMargin >= 0, `${row.type}/${row.canvas}/${row.progress}: stretched stone fits canvas`);
    if (row.arrowMargin !== null) assert.ok(row.arrowMargin >= 0, `${row.type}/${row.canvas}/${row.progress}: seam arrow fits canvas`);
  }
  results.bounds.push(...rows.map(row => ({ revision, ...row })));
}

async function sphereClosureEvidence(page, revision, results) {
  const rows = await page.evaluate(() => {
    const fixture = qa.make("sphere"), rows = [];
    fixture.game.board.fill(0);
    const rotations = [{ x: 0, y: 0, z: 0 }, { x: .6, y: .75, z: -.15 },
      { x: -1.1, y: 2, z: .7 }, { x: 2.2, y: -1.6, z: -.3 }, { x: 0, y: 0, z: 0 }, { x: 1.3, y: -1, z: .4 }];
    for (let pose = 0; pose < rotations.length; pose++) for (let step = 1; step <= 100; step++) {
      const extra = pose < 4 ? {} : { view: { x: .12, y: -.23, z: .07, shapeX: 1.08, shapeY: .94, shapeZ: 1.04 },
        presentation: { type: "sphere-path", boost: [.08, -.04, .02] }, wobbleX: .025, wobbleY: -.018 };
      const progress = step / 100, depth = qa.render(fixture, progress, rotations[pose], extra);
      const paths = depth.surfaceIntersections();
      const length = paths.reduce((total, path) => total + path.slice(1).reduce((sum, point, i) =>
        sum + Math.hypot(point.x - path[i].x, point.y - path[i].y), 0), 0);
      rows.push({ pose, rotation: rotations[pose], deformedPresentation: pose >= 4, progress, paths: paths.length, lengthPx: length });
    }
    return rows;
  });
  results.sphereClosure.push(...rows.map(row => ({ revision, ...row })));
  if (revision === "after") for (const row of rows) assert.equal(row.paths, 0,
    `sphere/${row.pose}/${row.progress}: no self-intersection throughout closure`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const revisions = args.includes("--before-only") ? ["before"] : args.includes("--after-only") ? ["after"] : ["before", "after"];
  const results = { baseline: BASE, viewport: { width: 1200, height: 1800, dpr: 1 }, canvas: [600, 600], moves: MOVES,
    evidence: [], surfaces: [], flat: [], performance: [], continuity: [], bounds: [], sphereClosure: [], endpointChanges: [], sources: {}, notes: ["Shared Canvas renderer; fixed synthetic game; desktop Chromium. Actual H5/Arena tested separately.",
      SEAM_MOTION ? "Morph contact sheets show 0, .12, .3, .5, .72, .9, 1 in reading order (four columns). Timings include glowing contours." : "Each morph contact sheet shows progress .25, .5, .75, 1 from left to right. Timings include the production contour code."] };
  if (SEAM_MOTION) results.notes.push("Sphere closure uses production visible-intersection queries across 100 progress samples and six poses (two also cover presentation, anisotropic scale and soft wobble). The completed sphere query skips known closed geometry; independent 3D triangle validation is separate.");
  const browser = await chromium.launch({ headless: true });
  try {
    if (args.includes("--sphere-probe")) {
      const { page, hashes } = await pageFor(browser, "after"); results.sources.after = hashes;
      const image = await page.evaluate(() => {
        const fixture = qa.make("sphere"), canvas = document.createElement("canvas"); canvas.width = 2400; canvas.height = 1200;
        const ctx = canvas.getContext("2d"); ctx.fillStyle = TopologyBoardArt.TOKENS.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
        [0, .12, .3, .5, .72, .9, 1].forEach((progress, i) => { qa.render(fixture, progress); ctx.drawImage(fixture.canvas, i % 4 * 600, Math.floor(i / 4) * 600); });
        return canvas.toDataURL();
      });
      await sphereClosureEvidence(page, "probe", results);
      const temporary = path.join(ROOT, ".tmp"); fs.mkdirSync(temporary, { recursive: true });
      fs.writeFileSync(path.join(temporary, "sphere-motion-probe.png"), Buffer.from(image.split(",")[1], "base64"));
      fs.writeFileSync(path.join(temporary, "sphere-motion-probe.json"), JSON.stringify(results, null, 2) + "\n");
      console.log(JSON.stringify({ samples: results.sphereClosure.length, intersections: results.sphereClosure.filter(row => row.paths).length,
        maxLengthPx: Math.max(...results.sphereClosure.map(row => row.lengthPx)), image: ".tmp/sphere-motion-probe.png" }));
      return;
    }
    for (const revision of revisions) {
      const { page, hashes } = await pageFor(browser, revision), errors = [];
      page.on("pageerror", error => errors.push(error.message)); results.sources[revision] = hashes;
      await screenshots(page, revision, results); await stoneEvidence(page, revision, results);
      if (revision === "after") await continuityEvidence(page, results);
      if (SEAM_MOTION) { await motionBounds(page, revision, results); await sphereClosureEvidence(page, revision, results); }
      await performanceEvidence(page, revision, results); assert.deepEqual(errors, []); await page.close();
      console.log(`Completed ${revision} shared Canvas evidence`);
    }
  } finally { await browser.close(); }
  const file = path.join(OUT, "results.json");
  if (revisions.length === 1 && fs.existsSync(file)) {
    const prior = JSON.parse(fs.readFileSync(file, "utf8")); results.sources = { ...prior.sources, ...results.sources };
    for (const key of ["evidence", "surfaces", "flat", "performance", "bounds", "sphereClosure"]) results[key] = [...(prior[key] || []).filter(row => !revisions.includes(row.revision)), ...results[key]];
    if (!revisions.includes("after")) results.continuity = prior.continuity || [];
  }
  for (const type of TYPES) {
    const pair = results.flat.filter(row => row.type === type);
    if (pair.length === 2) assert.equal(pair[0].sha256, pair[1].sha256, `${type}: identical 2D pixels`);
  }
  for (const after of results.bounds.filter(row => row.revision === "after" && row.progress === 1)) {
    const before = results.bounds.find(row => row.revision === "before" && row.progress === 1 && row.type === after.type && row.canvas === after.canvas);
    if (!before) continue;
    if (after.type === "sphere") {
      assert.equal(after.endpointStones.length, before.endpointStones.length, "sphere retains every stone");
      const deltas = after.endpointStones.map((point, i) => ({ screenPx: Math.hypot(point.x - before.endpointStones[i].x, point.y - before.endpointStones[i].y),
        depth: Math.abs(point.depth - before.endpointStones[i].depth), radiusPx: Math.abs(point.radius - before.endpointStones[i].radius) }));
      results.endpointChanges.push({ type: after.type, canvas: after.canvas, order: "production depth order",
        maxScreenPx: Math.max(...deltas.map(row => row.screenPx)), maxDepth: Math.max(...deltas.map(row => row.depth)), maxRadiusPx: Math.max(...deltas.map(row => row.radiusPx)) });
    } else assert.deepEqual(after.endpointStones, before.endpointStones, `${after.type}/${after.canvas}: 3D endpoint geometry unchanged`);
  }
  fs.writeFileSync(file, JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify({ images: results.evidence.length, performanceCases: results.performance.length, results: `${OUTPUT}/results.json` }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

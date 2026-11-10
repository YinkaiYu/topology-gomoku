"use strict";
// Fixed, paused synthetic games; never connects to an existing match service.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { execFileSync } = require("node:child_process"), { createHash } = require("node:crypto");
const { startServer } = require("../arena/server.cjs");
const args = process.argv.slice(2);
const ROOT = path.resolve(__dirname, "..");
const BASE = args.find(value => value.startsWith("--baseline="))?.slice(11) || "b308922";
const OUT = path.join(ROOT, args.find(value => value.startsWith("--out="))?.slice(6) || "artifacts/arena-intersections");
const TYPES = ["torus", "cylinder", "mobius", "klein", "projective", "sphere"];
const VIEWS = [{ width: 1280, height: 720 }, { width: 1024, height: 768 }];
const MOVES = [0, 6, 42, 48, 24, 25, 17, 31];
const serve = process.argv.includes("--serve");
const requestedPort = Number(process.argv.find(value => value.startsWith("--port="))?.slice(7)) || (serve ? 4321 : 0);

function instrument() {
  window.intersectionsQA = { latest: null, frames: [] };
  Object.defineProperty(window, "TopologyBoardArt", { configurable: true, set(api) {
    const draw = api.drawCompletion;
    api.drawCompletion = function (ctx, options) {
      const depth = draw.apply(this, arguments);
      const frame = { morph: options.morph, rotation: { ...options.rotation }, samples: [] };
      for (const [u, v] of [[0, 0], [0.25, 0.5], [0.5, 0.5], [0.75, 0.5], [1, 1]]) {
        const point = depth.mesh.point(u, v);
        frame.samples.push({ u, v, x: point.x, y: point.y, depth: point.depth });
      }
      const paths = depth.surfaceIntersections ? depth.surfaceIntersections() : [];
      frame.intersectionPaths = paths.length;
      frame.intersectionLength = paths.reduce((sum, points) => sum + points.slice(1).reduce((length, b, i) =>
        length + Math.hypot(b.x - points[i].x, b.y - points[i].y), 0), 0);
      intersectionsQA.latest = frame;
      intersectionsQA.frames.push(frame);
      if (intersectionsQA.frames.length > 180) intersectionsQA.frames.shift();
      return depth;
    };
    Object.defineProperty(window, "TopologyBoardArt", { configurable: true, writable: true, value: api });
  } });
}

async function settled(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function setView(page, value) {
  await page.locator("#view-range").evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event("input", { bubbles: true })); }, String(value));
  await settled(page);
}
async function hash(page) {
  return createHash("sha256").update(await page.locator("#board").evaluate(canvas => canvas.toDataURL())).digest("hex");
}
async function frame(page) { return page.evaluate(() => intersectionsQA.latest); }
function distance(a, b) {
  return Math.max(...a.samples.map((point, index) => Math.hypot(point.x - b.samples[index].x, point.y - b.samples[index].y)));
}
async function rotate(page, radians) {
  const rect = await page.locator("#board").boundingBox();
  const steps = Math.ceil(Math.abs(radians) / (Math.PI / 2)), distance = radians / steps / 0.009;
  const x = rect.x + rect.width * 0.42, y = rect.y + rect.height * 0.42;
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + distance, y, { steps: 5 }); await page.mouse.up();
  }
  await settled(page);
}
async function movementChecks(page, topology) {
  const reference = {};
  for (const progress of [25, 50, 75, 100]) { await setView(page, progress); reference[progress] = await frame(page); }
  await rotate(page, Math.PI * 2);
  await setView(page, 0);
  const fullTurn = [];
  for (const progress of [25, 50, 75, 100]) {
    await setView(page, progress);
    const deviation = distance(reference[progress], await frame(page));
    assert.ok(deviation < 0.01, `${topology}: full turn does not replay at ${progress}% (${deviation}px)`);
    fullTurn.push({ progress, deviation });
  }
  await setView(page, 0);
  await page.evaluate(() => { intersectionsQA.frames = []; intersectionsQA.latest = null; });
  await page.locator("#surface-view").click();
  await page.waitForFunction(() => intersectionsQA.latest?.morph > 0.12 && intersectionsQA.latest?.morph < 0.9);
  const interrupted = await frame(page);
  await page.locator("#flat-view").dispatchEvent("click");
  await page.waitForFunction(() => Number(document.getElementById("view-range").value) === 0);
  const sequence = await page.evaluate(() => intersectionsQA.frames.map(item => item.morph));
  assert.ok(sequence.every(value => value >= 0 && value <= 1));
  assert.ok(Math.max(...sequence.slice(1).map((value, i) => Math.abs(value - sequence[i]))) < 0.35, `${topology}: reversal does not jump`);
  return { fullTurn, interruptedAt: interrupted.morph, reversalFrames: sequence };
}

function seed(app) {
  const call = (name, args = {}) => app.arena.call(name, args, { hostAuthorized: true });
  const fixtures = {};
  for (const topology of TYPES) {
    const { gameId } = call("arena_create", { topology, mode: "duel", width: 7, height: 7, clock: null });
    const tokens = {};
    for (const role of ["black", "white"]) tokens[role] = call("arena_join", {
      ...call("arena_invite", { gameId, role }), name: role === "black" ? "OpenAI" : "DeepSeek"
    }).token;
    for (const role of ["black", "white"]) call("arena_ready", { gameId, token: tokens[role] });
    MOVES.forEach((cell, index) => call("arena_move", { gameId, token: tokens[index % 2 ? "white" : "black"],
      cell, expectedVersion: index, requestId: `intersections-${index}` }));
    call("arena_control", { gameId, action: "pause" });
    fixtures[topology] = `${app.url}/?game=${gameId}`;
  }
  return fixtures;
}

(async () => {
  const directory = serve ? path.join(ROOT, ".arena/intersections-preview") : fs.mkdtempSync(path.join(os.tmpdir(), "arena-intersections-"));
  const app = await startServer({ port: requestedPort, dataDir: directory, writeRuntime: false });
  const fixtureFile = path.join(directory, "preview-fixtures.json");
  const previous = serve && fs.existsSync(fixtureFile) ? JSON.parse(fs.readFileSync(fixtureFile, "utf8")) : null;
  const retained = previous && TYPES.every(type => previous[type] && app.arena.matches.has(new URL(previous[type]).searchParams.get("game")));
  const fixtures = retained ? Object.fromEntries(TYPES.map(type => [type, app.url + new URL(previous[type]).search])) : seed(app);
  if (serve) {
    fs.writeFileSync(fixtureFile, JSON.stringify(fixtures, null, 2) + "\n");
    console.log(JSON.stringify({ url: app.url, fixtures }, null, 2));
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await app.close(); process.exit(0); });
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const baseline = Object.fromEntries(["board-art", "topology-morph"].map(name => [
    `/assets/${name}.js`, execFileSync("git", ["show", `${BASE}:app/assets/${name}.js`], { cwd: ROOT })
  ]));
  const cases = [];
  try {
    for (const viewport of VIEWS) for (const topology of TYPES) {
      console.log(`Checking ${topology} ${viewport.width}x${viewport.height}`);
      const hashes = {}, errors = [], screenshots = [], frames = {};
      let movement;
      for (const revision of ["before", "after"]) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "no-preference" });
        await context.addInitScript(instrument);
        const page = await context.newPage(); page.setDefaultTimeout(20000);
        page.on("pageerror", error => errors.push(error.message));
        if (revision === "before") await page.route("**/*", route => {
          const body = baseline[new URL(route.request().url()).pathname];
          return body ? route.fulfill({ body, contentType: "text/javascript" }) : route.continue();
        });
        try {
          await page.goto(fixtures[topology]);
          await page.locator("#match").waitFor({ state: "visible" });
          await page.waitForFunction(() => document.getElementById("board").getAttribute("aria-label").includes("第 8 手"));
          await settled(page); await setView(page, 0); hashes[revision] = await hash(page);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
          frames[revision] = [];
          for (const progress of (topology === "sphere" ? [12, 30, 50, 72, 90, 100] : [25, 50, 75, 100])) {
            await setView(page, progress);
            const current = await frame(page);
            assert.ok(current.samples.every(point => [point.x, point.y, point.depth].every(Number.isFinite)));
            frames[revision].push(current);
            if ((["klein", "projective"].includes(topology) && progress === 100) || (topology === "torus" && progress === 50) || topology === "sphere") {
              const file = `${revision}-${topology}-${progress}-${viewport.width}x${viewport.height}.png`;
              await page.screenshot({ path: path.join(OUT, file), animations: "disabled" }); screenshots.push(file);
            }
          }
          if (revision === "after") {
            if (topology === "sphere") assert.ok(frames.after.every(item => item.intersectionLength === 0), "sphere: the closing surface never crosses itself");
            const last = frames.after.at(-1);
            if (["klein", "projective"].includes(topology)) assert.ok(last.intersectionLength > 20, topology + ": inherent crossings are drawn");
            else assert.equal(last.intersectionLength, 0, topology + ": ordinary embedded endpoints have no false cut");
          }
          await setView(page, 0);
          assert.equal(await hash(page), hashes[revision], "2D round trip retains every pixel");
          if (revision === "after" && viewport.width === 1280) movement = await movementChecks(page, topology);
        } finally { await context.close(); }
      }
      assert.equal(hashes.after, hashes.before, topology + ": 2D baseline is unchanged");
      assert.deepEqual(errors, []);
      cases.push({ viewport, topology, moves: MOVES, flatHash: hashes.after, flatCanvasIdentical: true, screenshots, frames, movement, errors });
      fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ baseline: BASE,
        fixture: "Isolated paused 7x7 duel with eight fixed moves; no real match data", cases }, null, 2) + "\n");
    }
    console.log(`Arena intersection QA passed: ${cases.length} viewport/topology pairs.`);
  } finally { await browser.close(); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

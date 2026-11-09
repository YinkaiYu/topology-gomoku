"use strict";
// Reproducible browser evidence on isolated synthetic matches; no live service is used.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process"), { createHash } = require("node:crypto");
const { chromium } = require("playwright"), { startServer } = require("../arena/server.cjs");
const ROOT = path.resolve(__dirname, ".."), BASE = "97b6a00", OUT = path.join(ROOT, "artifacts/arena-perspective");
const TYPES = ["torus", "cylinder", "mobius", "klein", "projective", "sphere"];
const selectedWidth = Number(process.argv.find(value => value.startsWith("--width="))?.slice(8));
const VIEWS = [{ width: 1280, height: 720 }, { width: 1024, height: 768 }].filter(view => !selectedWidth || view.width === selectedWidth);
const MOVES = [0, 6, 42, 48, 24, 25, 17, 31];

function instrument() {
  window.perspectiveQA = { latest: null, frames: [], collecting: null };
  const arc = CanvasRenderingContext2D.prototype.arc;
  CanvasRenderingContext2D.prototype.arc = function (x, y, radius, ...rest) {
    const current = perspectiveQA.collecting;
    if (current && this.canvas.id === "board" && radius > 5) {
      const matrix = this.getTransform();
      current.stones.push({ x: matrix.a * x + matrix.c * y + matrix.e,
        y: matrix.b * x + matrix.d * y + matrix.f, radius: radius * Math.hypot(matrix.a, matrix.b), alpha: this.globalAlpha });
    }
    return arc.call(this, x, y, radius, ...rest);
  };
  Object.defineProperty(window, "TopologyMorph", { configurable: true, set(api) {
    const project = api.project;
    api.project = function (...args) {
      const result = project.apply(this, args), current = perspectiveQA.collecting;
      if (current && current.count++ % 13 === 0) {
        if (!current.orientation) current.orientation = { ...args[5] };
        current.samples.push({ u: args[1], v: args[2], x: result.x, y: result.y, depth: result.depth });
      }
      return result;
    };
    Object.defineProperty(window, "TopologyMorph", { configurable: true, writable: true, value: api });
  } });
  Object.defineProperty(window, "TopologyBoardArt", { configurable: true, set(api) {
    const draw = api.drawCompletion;
    api.drawCompletion = function (ctx, options) {
      const frame = { morph: options.morph, rotation: { ...options.rotation }, samples: [], stones: [],
        canvas: { width: ctx.canvas.width, height: ctx.canvas.height }, count: 0 };
      perspectiveQA.collecting = frame;
      const result = draw.apply(this, arguments);
      perspectiveQA.collecting = null;
      perspectiveQA.latest = frame;
      perspectiveQA.frames.push(frame);
      if (perspectiveQA.frames.length > 180) perspectiveQA.frames.shift();
      return result;
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
async function frame(page) { return page.evaluate(() => perspectiveQA.latest); }
async function rotate(page, radians, axis = "y") {
  const rect = await page.locator("#board").boundingBox();
  const steps = Math.ceil(Math.abs(radians) / (Math.PI / 2)), distance = radians / steps / .009;
  const x = rect.x + rect.width * .42, y = rect.y + rect.height * .42;
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (axis === "y" ? distance : 0), y + (axis === "x" ? distance : 0), { steps: 5 });
    await page.mouse.up();
  }
  await settled(page);
}
function distance(a, b) {
  assert.equal(a.samples.length, b.samples.length);
  return Math.max(...a.samples.map((p, i) => Math.hypot(p.x - b.samples[i].x, p.y - b.samples[i].y)));
}
async function rotationChecks(page, topology, revision) {
  const reference = {};
  await setView(page, 0);
  for (const progress of [25, 50, 75, 100]) { await setView(page, progress); reference[progress] = await frame(page); }
  const reports = [];
  for (const turns of [1, 2]) {
    // The second case adds one more turn, for a cumulative 720 degrees.
    await rotate(page, Math.PI * 2);
    const dragged = await frame(page), endpointDistance = distance(reference[100], dragged);
    await setView(page, 0);
    const offsets = [];
    for (const progress of [25, 50, 75, 100]) {
      await setView(page, progress);
      const current = await frame(page), deviation = distance(reference[progress], current);
      offsets.push({ progress, deviation });
      // Chromium serializes native pointer positions with finite precision.
      if (revision === "after") assert.ok(deviation < 0.001, `${topology} ${turns} turns: no replay at ${progress}% (${deviation}px)`);
    }
    if (revision === "before") assert.ok(offsets.some(item => item.deviation > 25), "baseline reproduces the needless full-turn interpolation");
    reports.push({ turns, rotation: dragged.rotation, endpointDistance, offsets });
    // Baseline accumulates raw full turns; fixed code rebases at the endpoint.
    if (revision === "after" && turns === 1) {
      // Recreate the literal 720-degree drag rather than relying on old turns.
      await rotate(page, Math.PI * 2);
    }
  }
  if (revision === "before") return { reports };
  // Drag through +PI while partly unfolded: wrapping in the render path would snap.
  await setView(page, 50);
  const half = await frame(page), baseY = half.orientation.y / .5 - half.rotation.y;
  await rotate(page, Math.PI - .06 - baseY - half.rotation.y);
  const before = await frame(page);
  await rotate(page, .12);
  const after = await frame(page), crossingDistance = distance(before, after);
  assert.ok(after.rotation.y > before.rotation.y && crossingDistance < 35, `${topology}: no branch-cut jump while dragging at half morph`);
  // Reverse an actual button-driven animation before it reaches its destination.
  await setView(page, 0);
  await page.evaluate(() => { perspectiveQA.frames = []; perspectiveQA.latest = null; });
  await page.locator("#surface-view").click();
  await page.waitForFunction(() => perspectiveQA.latest?.morph > .12 && perspectiveQA.latest?.morph < .9);
  const interrupted = await frame(page);
  await page.locator("#flat-view").dispatchEvent("click");
  await page.waitForFunction(() => Number(document.getElementById("view-range").value) === 0);
  const sequence = await page.evaluate(() => perspectiveQA.frames.map(f => f.morph));
  assert.ok(sequence.every(value => value >= 0 && value <= 1));
  assert.ok(sequence.some(value => value > 0 && value < 1));
  assert.ok(Math.max(...sequence.slice(1).map((value, i) => Math.abs(value - sequence[i]))) < .35, `${topology}: reversal keeps the current morph`);
  return { reports, crossingDistance, interruptedAt: interrupted.morph, reversalFrames: sequence };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-perspective-"));
  const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
  const call = (name, args = {}) => app.arena.call(name, args, { hostAuthorized: true });
  const browser = await chromium.launch({ headless: true });
  const baseline = Object.fromEntries([
    ["/arena.js", "arena/public/arena.js"], ["/assets/board-art.js", "app/assets/board-art.js"],
    ["/assets/topology-morph.js", "app/assets/topology-morph.js"], ["/assets/board-view-logic.js", "app/assets/board-view-logic.js"]
  ].map(([url, file]) => [url, execFileSync("git", ["show", `${BASE}:${file}`], { cwd: ROOT })]));
  const cases = [];
  try {
    for (const viewport of VIEWS) for (const topology of TYPES) {
      console.log(`Checking ${topology} ${viewport.width}x${viewport.height}`);
      const { gameId } = call("arena_create", { topology, mode: "duel", width: 7, height: 7, clock: null });
      const tokens = {};
      for (const role of ["black", "white"]) tokens[role] = call("arena_join", { ...call("arena_invite", { gameId, role }), name: role === "black" ? "OpenAI" : "DeepSeek" }).token;
      for (const role of ["black", "white"]) call("arena_ready", { gameId, token: tokens[role] });
      for (const [index, cell] of MOVES.entries()) call("arena_move", { gameId, token: tokens[index % 2 ? "white" : "black"], cell, expectedVersion: index, requestId: `view-${index}` });
      call("arena_control", { gameId, action: "pause" });
      const images = {}, errors = [], screenshots = [], rotations = {}, margins = [];
      for (const revision of ["before", "after"]) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "no-preference" });
        await context.addInitScript(instrument);
        const page = await context.newPage(); page.setDefaultTimeout(15000);
        page.on("pageerror", error => errors.push(error.message));
        if (revision === "before") await page.route("**/*", route => {
          const body = baseline[new URL(route.request().url()).pathname];
          return body ? route.fulfill({ body, contentType: "text/javascript" }) : route.continue();
        });
        try {
          await page.goto(`${app.url}/?game=${gameId}`);
          await page.locator("#match").waitFor({ state: "visible" });
          await page.waitForFunction(() => document.getElementById("board").getAttribute("aria-label").includes("第 8 手"));
          await settled(page); await setView(page, 0); images[revision] = await hash(page);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
          for (const progress of [50, 100]) {
            await setView(page, progress);
            if (revision === "after") {
              const current = await frame(page);
              const minimum = Math.min(...current.stones.map(stone => Math.min(stone.x - stone.radius, stone.y - stone.radius,
                current.canvas.width - stone.x - stone.radius, current.canvas.height - stone.y - stone.radius)));
              assert.ok(minimum >= 0.5, `${topology} ${progress}% stones stay inside the canvas (${minimum}px)`);
              margins.push({ progress, minimum });
            }
            if (["torus", "mobius", "projective", "sphere"].includes(topology)) {
              const file = `${revision}-${topology}-${progress}-${viewport.width}x${viewport.height}.png`;
              await page.screenshot({ path: path.join(OUT, file), animations: "disabled" }); screenshots.push(file);
              console.log(file);
            }
          }
          await setView(page, 0); assert.equal(await hash(page), images[revision], "2D round trip preserves every pixel");
          if (viewport.width === 1280 && (revision === "after" || topology === "torus")) rotations[revision] = await rotationChecks(page, topology, revision);
        } catch (error) {
          error.message += ` (${revision} ${topology} ${viewport.width}x${viewport.height}, board=${await page.locator("#board").getAttribute("aria-label")}, errors=${JSON.stringify(errors)})`;
          throw error;
        } finally { await context.close(); }
      }
      assert.equal(images.after, images.before, `${topology}: 2D remains pixel-identical`);
      assert.deepEqual(errors, []);
      cases.push({ viewport, topology, moves: MOVES, flatHash: images.after, flatCanvasIdentical: true, screenshots, margins, rotations, errors });
      call("arena_control", { gameId, action: "stop" });
      fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ baseline: BASE, fixture: "Isolated paused 7x7 duel with eight fixed moves; no real match data", cases }, null, 2) + "\n");
    }
    console.log(`Arena perspective QA passed: ${cases.length} viewport/topology pairs.`);
  } finally { await browser.close(); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

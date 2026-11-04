"use strict";

// All matches in this script are isolated synthetic fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { startServer } = require("../arena/server.cjs");

const ROOT = path.resolve(__dirname, "..");
const BASE = "18caf06";
const MAIN = "3977ba0";
const EVIDENCE = path.join(ROOT, "artifacts/arena-clock-options");
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
  { width: 1440, height: 1080 }
];

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: path.join(EVIDENCE, name), animations: "disabled" });
}

async function assertFits(page, selector, viewport) {
  const rect = await page.locator(selector).boundingBox();
  assert.ok(rect && rect.x >= -1 && rect.y >= -1, `${selector} starts inside ${viewport.width}×${viewport.height}`);
  assert.ok(rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1,
    `${selector} fits ${viewport.width}×${viewport.height}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}

async function homeGeometry(page) {
  const geometry = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { content: [".setup-heading", "#mode-options", "#topology-options", ".size-row", "#clock-modes", ".setup-players", "#create-button"].map(box),
      labels: [...document.querySelectorAll("#clock-modes label")].map(node => node.getBoundingClientRect().toJSON()) };
  });
  for (const box of geometry.content) {
    assert.ok(Math.abs(box.x - geometry.content[0].x) < 1, "Creation controls share a left edge");
    assert.ok(Math.abs(box.width - geometry.content[0].width) < 1, "Creation controls share a right edge");
  }
  const step = geometry.labels[1].x - geometry.labels[0].x;
  for (let index = 0; index < geometry.labels.length; index++) {
    assert.ok(Math.abs(geometry.labels[index].width - geometry.labels[0].width) < 1);
    assert.ok(Math.abs(geometry.labels[index].x - geometry.labels[0].x - step * index) < 1);
  }
  return geometry;
}

async function matchGeometry(page, mainIcons) {
  const geometry = await page.evaluate(() => {
    const box = node => node.getBoundingClientRect().toJSON();
    const select = selector => box(document.querySelector(selector));
    return { rows: ["#return-live", "#view-controls", "#replay-controls"].map(select),
      ranges: [...document.querySelectorAll(".board-tools .liquid-range")].map(box),
      icons: ["#flat-view", "#surface-view", "#previous-move", "#next-move"].map(select),
      profiles: [...document.querySelectorAll(".settings-players>div")].map(box),
      settings: ["#new-button", "#rooms-button"].map(select) };
  });
  const center = box => box.y + box.height / 2;
  const xCenter = box => box.x + box.width / 2;
  assert.ok(Math.abs(center(geometry.rows[1]) - center(geometry.rows[0]) - center(geometry.rows[2]) + center(geometry.rows[1])) < 1);
  assert.ok(Math.abs(geometry.ranges[0].x - geometry.ranges[1].x) < 1);
  assert.ok(Math.abs(geometry.ranges[0].width - geometry.ranges[1].width) < 1);
  assert.ok(Math.abs(xCenter(geometry.icons[0]) - xCenter(geometry.icons[2])) < 1);
  assert.ok(Math.abs(xCenter(geometry.icons[1]) - xCenter(geometry.icons[3])) < 1);
  for (let index = 0; index < 2; index++) assert.ok(Math.abs(xCenter(geometry.profiles[index]) - xCenter(geometry.settings[index])) < 1);
  for (const [id, path] of Object.entries(mainIcons)) assert.equal(await page.locator(`#${id} svg path`).getAttribute("d"), path);
  return geometry;
}

async function openRecords(page) {
  await page.locator("#settings-button").click();
  await page.locator("#rooms-button").click();
  await page.locator("#rooms-dialog").waitFor({ state: "visible" });
}

async function chooseClock(page, value) {
  await page.locator(`label:has(input[name="clock-mode"][value="${value}"])`).click();
  assert.equal(await page.locator(`input[name="clock-mode"][value="${value}"]`).isChecked(), true);
}

async function installAxisProbe(context) {
  await context.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...rest) {
      if (this.canvas.id === "board" && /^[A-S]$|^\d{1,2}$/.test(String(value))) {
        const metrics = this.measureText(value);
        this.canvas.axisProbe ||= {};
        this.canvas.axisProbe[String(value)] = { x, y, ascent: metrics.actualBoundingBoxAscent, right: metrics.actualBoundingBoxRight };
      }
      return original.call(this, value, x, y, ...rest);
    };
  });
}

async function axisGeometry(page) {
  return page.locator("#board").evaluate(canvas => {
    const labels = canvas.axisProbe;
    const cell = labels.B.x - labels.A.x;
    return { cell, bottom: labels.A.y - labels["1"].y, left: labels.A.x - labels["1"].x,
      heading: document.querySelector(".chapter-heading").getBoundingClientRect().toJSON(),
      glyph: document.querySelector("#match-glyph").getBoundingClientRect().toJSON(),
      stoneBottomGap: labels.A.y - labels.A.ascent - labels["1"].y - cell * .37,
      stoneLeftGap: labels.A.x - cell * .37 - labels["1"].x - labels["1"].right };
  });
}

async function captureMainReference(browser, url) {
  const context = await browser.newContext({ viewport: VIEWPORTS[0], deviceScaleFactor: 1, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    const resources = new Map();
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
    await page.route("**/reference/**", async route => {
      const relative = new URL(route.request().url()).pathname.slice("/reference/".length) || "index.html";
      if (!resources.has(relative)) resources.set(relative, execFileSync("git", ["show", `${MAIN}:app/${relative}`], { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 }));
      await route.fulfill({ body: resources.get(relative), contentType: types[path.extname(relative)] || "application/octet-stream" });
    });
    await page.goto(`${url}/reference/`);
    await page.locator('[data-level="0"]').click();
    await page.locator("#gameSettingsButton").click();
    await page.locator("#settingsSheet").waitFor({ state: "visible" });
    await shot(page, "main-settings-reference-1280x720.png");
    const icons = {};
    for (const [arenaId, mainId] of [["flat-view", "viewFlatButton"], ["surface-view", "viewSpatialButton"], ["previous-move", "reviewPreviousButton"], ["next-move", "reviewNextButton"]]) {
      icons[arenaId] = await page.locator(`#${mainId} svg path`).getAttribute("d");
    }
    return icons;
  } finally { await context.close(); }
}

function createFinishedMatches(call) {
  const fixtures = [];
  for (const result of ["black", "white", "draw", "stopped"]) {
    const { gameId } = call("arena_create", { topology: "mobius", mode: "duel", clock: null });
    if (result === "stopped") {
      call("arena_control", { gameId, action: "stop" });
    } else {
      const tokens = {};
      for (const role of ["black", "white"]) {
        tokens[role] = call("arena_join", { ...call("arena_invite", { gameId, role }), name: role === "black" ? "黑方" : "白方" }).token;
        call("arena_ready", { gameId, token: tokens[role] });
      }
      if (result === "draw") {
        const offer = call("arena_draw", { gameId, token: tokens.black, action: "offer", expectedVersion: 0, requestId: "offer" });
        call("arena_draw", { gameId, token: tokens.white, action: "accept", offerId: offer.drawOffer.id, expectedVersion: 0, requestId: "accept" });
      } else {
        call("arena_resign", { gameId, token: tokens[result === "black" ? "white" : "black"], expectedVersion: 0, requestId: "resign" });
      }
    }
    fixtures.push({ gameId, result });
  }
  return fixtures;
}

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const baseline = Object.fromEntries(["index.html", "arena.css", "arena.js"].map(name => [name,
    execFileSync("git", ["show", `${BASE}:arena/public/${name}`], { cwd: ROOT })]));
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let mainIcons;
  try {
    for (const viewport of VIEWPORTS) {
      const size = `${viewport.width}x${viewport.height}`;
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-clock-options-"));
      const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
      const call = (name, args = {}) => app.arena.call(name, args, { hostAuthorized: true });
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const oldContext = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await installAxisProbe(context);
      await installAxisProbe(oldContext);
      try {
        const page = await context.newPage();
        const before = await oldContext.newPage();
        const errors = [];
        if (viewport.width === 1280) mainIcons = await captureMainReference(browser, app.url);
        page.on("pageerror", error => errors.push(error.message));
        await before.route("**/*", async route => {
          const pathname = new URL(route.request().url()).pathname;
          const name = pathname === "/" ? "index.html" : pathname.slice(1);
          if (baseline[name]) {
            await route.fulfill({ body: baseline[name], contentType: name.endsWith("css") ? "text/css" : name.endsWith("js") ? "text/javascript" : "text/html" });
          } else await route.continue();
        });
        await before.goto(app.url);
        await page.goto(app.url);
        await page.locator("#create-button").waitFor({ state: "visible" });
        await before.locator("#create-button").waitFor({ state: "visible" });
        await shot(before, `home-before-${size}.png`);
        await shot(page, `home-${size}.png`);
        await assertFits(page, ".setup-panel", viewport);
        const homeAlignment = await homeGeometry(page);
        assert.equal(await page.locator("[title]").count(), 0);
        assert.equal(await page.locator("select").count(), 0);
        assert.equal(await page.locator("#create-form").evaluate(form => form.noValidate), true);
        assert.equal(await page.locator("#board-width").evaluate(input => getComputedStyle(input).appearance), "textfield");

        const quick = page.locator('input[name="clock-mode"][value="quick"]');
        await quick.focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(await page.locator('input[name="clock-mode"][value="standard"]').isChecked(), true);
        const fixedPanel = await page.locator(".setup-panel").boundingBox();
        for (const mode of ["quick", "standard", "relaxed", "untimed"]) {
          await chooseClock(page, mode);
          assert.deepEqual(await page.locator(".setup-panel").boundingBox(), fixedPanel, "Clock choice keeps the panel layout fixed");
        }
        const countBeforeInvalid = call("arena_list").matches.length;
        for (const invalid of [{ id: "board-width", value: "4", restore: "7" }]) {
          await page.locator(`#${invalid.id}`).fill(invalid.value);
          await page.locator("#create-button").click();
          await page.locator("#error-banner").waitFor({ state: "visible" });
          assert.equal(call("arena_list").matches.length, countBeforeInvalid);
          assert.equal(await page.locator("#welcome").isVisible(), true);
          await page.locator(`#${invalid.id}`).fill(invalid.restore);
          await page.locator("#dismiss-error").click();
        }
        await page.locator('label:has(input[name="mode"][value="ai"])').click();
        await page.locator('label:has(input[name="difficulty"][value="hard"])').click();
        await assertFits(page, ".setup-panel", viewport);
        await homeGeometry(page);
        if (viewport.width <= 1280) await shot(page, `ai-${size}.png`);
        const aiPanel = await page.locator(".setup-panel").boundingBox();
        for (const mode of ["quick", "standard", "relaxed", "untimed"]) {
          await chooseClock(page, mode);
          assert.deepEqual(await page.locator(".setup-panel").boundingBox(), aiPanel);
        }
        await page.locator('label:has(input[name="mode"][value="duel"])').click();

        const clocks = [
          { mode: "quick", initialMs: 300000, incrementMs: 5000 },
          { mode: "standard", initialMs: 900000, incrementMs: 15000 },
          { mode: "relaxed", initialMs: 1800000, incrementMs: 30000 },
          { mode: "untimed", initialMs: null }
        ];
        let matchAlignment;
        for (const expected of clocks) {
          await chooseClock(page, expected.mode);
          const mode = expected.mode === "untimed" ? "ai" : "duel";
          await page.locator(`label:has(input[name="mode"][value="${mode}"])`).click();
          await page.locator("#create-button").click();
          await page.locator("#settings-dialog").waitFor({ state: "visible" });
          const gameId = new URL(page.url()).searchParams.get("game");
          assert.ok(gameId);
          const state = call("arena_state", { gameId });
          assert.equal(state.mode, mode);
          const joined = call("arena_join", { ...call("arena_invite", { gameId, role: "black" }), name: "黑方" });
          if (expected.initialMs === null) {
            assert.equal(state.clock, null);
            assert.equal(joined.rules.clock, null);
            assert.match(joined.rules.clockRule, /本局不限时/);
          } else {
            assert.equal(state.clock.initialMs, expected.initialMs);
            assert.equal(state.clock.incrementMs, expected.incrementMs);
            assert.equal(joined.rules.clock.initialMs, expected.initialMs);
            assert.equal(joined.rules.clock.incrementMs, expected.incrementMs);
            assert.ok(joined.rules.clockRule.includes(`${expected.initialMs / 60000} 分钟`));
            assert.ok(joined.rules.clockRule.includes(`${expected.incrementMs / 1000} 秒`));
          }
          assert.equal(state.clock?.active ?? null, null);
          assert.equal(await page.locator("[title]").count(), 0);
          if (expected.mode === "quick") {
            await page.waitForFunction(() => document.getElementById("ready-black").textContent === "准备中");
            await before.goto(`${app.url}/?game=${gameId}`);
            await before.locator("#settings-button").click();
            await before.locator("#settings-dialog").waitFor({ state: "visible" });
            await shot(before, `settings-before-${size}.png`);
            await shot(page, `settings-${size}.png`);
            await assertFits(page, "#settings-dialog", viewport);
            matchAlignment = await matchGeometry(page, mainIcons);
            await before.goto(app.url);
          }
          await page.locator("#new-button").click();
          await page.locator("#create-button").waitFor({ state: "visible" });
          call("arena_control", { gameId, action: "stop" });
          call("arena_delete", { gameId });
        }

        const axes = [];
        for (const topology of ["plane", "mobius", "torus"]) {
          const { gameId } = call("arena_create", { topology, mode: "duel", width: 7, height: 7, clock: null });
          const tokens = {};
          for (const role of ["black", "white"]) {
            tokens[role] = call("arena_join", { ...call("arena_invite", { gameId, role }), name: role }).token;
            call("arena_ready", { gameId, token: tokens[role] });
          }
          call("arena_move", { gameId, token: tokens.black, cell: "A1", expectedVersion: 0, requestId: "edge-black" });
          call("arena_move", { gameId, token: tokens.white, cell: "G1", expectedVersion: 1, requestId: "edge-white" });
          call("arena_control", { gameId, action: "pause" });
          await before.goto(`${app.url}/?game=${gameId}`);
          await page.goto(`${app.url}/?game=${gameId}`);
          await before.locator("#match").waitFor({ state: "visible" });
          await page.locator("#match").waitFor({ state: "visible" });
          await settle(before);
          await settle(page);
          await assertFits(page, ".chapter-heading", viewport);
          const previous = await axisGeometry(before);
          const current = await axisGeometry(page);
          assert.ok(current.stoneBottomGap >= 1 && current.stoneLeftGap >= 1, "Axis labels remain outside edge stones");
          if (topology === "plane") assert.ok(current.left < previous.left && current.bottom < previous.bottom);
          if (topology === "mobius") { assert.equal(current.left, previous.left); assert.ok(current.bottom < previous.bottom); }
          if (topology === "torus") { assert.equal(current.left, previous.left); assert.equal(current.bottom, previous.bottom); }
          if (viewport.width === 1280) {
            await shot(before, `axis-${topology}-before.png`);
            await shot(page, `axis-${topology}.png`);
          }
          axes.push({ topology, previous, current });
          call("arena_control", { gameId, action: "stop" });
          call("arena_delete", { gameId });
        }
        await before.goto(app.url);
        await page.goto(app.url);
        await page.locator("#create-button").waitFor({ state: "visible" });
        await before.locator("#create-button").waitFor({ state: "visible" });
        await chooseClock(page, "quick");
        const fixtures = createFinishedMatches(call);
        await openRecords(before);
        await openRecords(page);
        for (const fixture of fixtures) {
          const row = page.locator(`.room-row:has([data-game="${fixture.gameId}"])`);
          const result = await row.locator(".room-result").innerText();
          if (fixture.result === "black") assert.match(result, /黑方.*胜/);
          if (fixture.result === "white") assert.match(result, /白方.*胜/);
          if (fixture.result === "draw") assert.match(result, /和棋/);
          if (fixture.result === "stopped") assert.match(result, /结束/);
          assert.match(await row.innerText(), /\d{4}\/\d{2}\/\d{2}/);
        }
        await shot(before, `records-before-${size}.png`);
        await shot(page, `records-${size}.png`);
        await assertFits(page, "#rooms-dialog", viewport);
        assert.equal(await page.locator("[title]").count(), 0);
        assert.deepEqual(errors, []);
        results.push({ viewport, clockModes: clocks.map(clock => clock.mode), fixedClockLayout: true, preparationClockStopped: true,
          results: fixtures.map(fixture => fixture.result), axes, homeAlignment, matchAlignment, nativeTooltips: 0, nativeSelects: 0, numericAppearance: "textfield", errors });
      } finally {
        await context.close();
        await oldContext.close();
        await app.close();
        assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith("arena-clock-options-"));
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
    fs.writeFileSync(path.join(EVIDENCE, "results.json"), JSON.stringify({ baseline: BASE, mainReference: MAIN, fixture: "Fresh creation panel, identical preparation settings and four synthetic finished matches", results }, null, 2));
    console.log("Clock options browser QA passed at four desktop viewports.");
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

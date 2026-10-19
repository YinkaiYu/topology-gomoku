"use strict";

// Reproduce issue #2 browser evidence without adding a project dependency.
// Make Playwright available through NODE_PATH, then run:
//   node scripts/qa-offline-duel.cjs --serve --port 4174
//   node scripts/qa-offline-duel.cjs --url http://127.0.0.1:4174
// The server serves this worktree at / and immutable 45900d9 at /baseline/.
// Screenshots use desktop Chromium with emulated touch/viewport, not a real phone.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_REF = "45900d9";
const EVIDENCE = path.join(ROOT, "artifacts", "issue-2");
const TEMP = path.join(ROOT, ".tmp", "issue-2", "browser-qa");
const args = process.argv.slice(2);
function option(name, fallback) {
  const position = args.indexOf(name);
  return position < 0 ? fallback : args[position + 1];
}
function git(...values) {
  return execFileSync("git", values, { cwd: ROOT, maxBuffer: 24 * 1024 * 1024 });
}

function exportBaseline() {
  const commit = git("rev-parse", `${BASELINE_REF}^{commit}`).toString().trim();
  const output = path.join(TEMP, commit, "app");
  const files = git("ls-tree", "-r", "--name-only", commit, "app").toString().trim().split(/\r?\n/);
  for (const file of files) {
    const destination = path.join(TEMP, commit, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, git("show", `${commit}:${file}`));
  }
  return { commit, output };
}

function startServer(port) {
  const baseline = exportBaseline();
  const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
    ".woff2": "font/woff2", ".json": "application/json; charset=utf-8"
  };
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    const isBaseline = pathname.startsWith("/baseline/");
    const base = isBaseline ? baseline.output : path.join(ROOT, "app");
    const relative = isBaseline ? pathname.slice("/baseline/".length) : pathname.slice(1);
    const file = path.resolve(base, relative || "index.html");
    if (file !== base && !file.startsWith(base + path.sep)) { response.writeHead(403).end(); return; }
    if (request.method !== "GET" || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end(); return;
    }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      console.log(`Issue #2 preview: http://127.0.0.1:${server.address().port}`);
      console.log(`Baseline: ${baseline.commit}`);
      resolve(server);
    });
  });
}

async function ready(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForFunction(() => !document.getElementById("appShell").classList.contains("is-navigating"));
}

async function expectText(page, id, value) {
  await page.waitForFunction(({ id, value }) => document.getElementById(id).textContent === value, { id, value });
}

async function screenshot(page, name) {
  await ready(page);
  await page.screenshot({ path: path.join(EVIDENCE, name), animations: "disabled" });
}

async function assertVisibleInViewport(page, selector) {
  const bounds = await page.locator(selector).evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      text: element.textContent.trim(), visible: !element.hidden && style.visibility !== "hidden" && style.display !== "none",
      className: element.className, parentClassName: element.parentElement.className,
      hidden: element.hidden, visibility: style.visibility, display: style.display,
      x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight
    };
  }));
  for (const item of bounds) {
    assert.equal(item.visible, true, `Hidden control: ${JSON.stringify(item)}`);
    assert.ok(item.x >= -0.5 && item.y >= -0.5 && item.right <= item.viewportWidth + 0.5 && item.bottom <= item.viewportHeight + 0.5,
      `Outside viewport: ${JSON.stringify(item)}`);
  }
  return bounds;
}

async function observeGame(page) {
  await page.evaluate(() => {
    const engine = window.TopologyGomoku;
    window.__duelQA = { moves: [], aiCalls: 0 };
    const originalCheckWin = engine.checkWin;
    engine.checkWin = function recordMove(board, rules, cell, player) {
      const result = originalCheckWin.apply(this, arguments);
      window.__duelQA.moves.push({ cell, player, board: Array.from(board), topology: rules.type, won: Boolean(result) });
      return result;
    };
    const originalChooseMove = engine.chooseMove;
    engine.chooseMove = function countAi() {
      window.__duelQA.aiCalls += 1;
      return originalChooseMove.apply(this, arguments);
    };
  });
}

async function assertCardGeometry(page) {
  const cards = await page.locator(".level-card").evaluateAll((elements) => elements.map((card) => {
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, height: rect.height };
    };
    return {
      level: card.dataset.level, finale: card.classList.contains("level-card-finale"),
      card: bounds(card), type: bounds(card.querySelector(".level-type")), name: bounds(card.querySelector(".level-name")),
      art: Array.from(card.querySelectorAll(".level-glyph, .level-mystery")).map(bounds)
    };
  }));
  for (const item of cards) {
    for (const label of [item.type, item.name]) {
      assert.ok(label.x >= item.card.x - 0.5 && label.right <= item.card.right + 0.5
        && label.y >= item.card.y - 0.5 && label.bottom <= item.card.bottom + 0.5,
      `Card text overflow: ${JSON.stringify(item)}`);
    }
    if (!item.finale) {
      assert.ok(item.art.every((art) => art.bottom <= item.type.y + 0.5), `Artwork overlaps type label: ${JSON.stringify(item)}`);
    }
  }
  return cards;
}

async function tapCell(page, cell, width = 7, height = 7) {
  const point = await page.locator("#boardCanvas").evaluate((canvas, dimensions) => {
    const rect = canvas.getBoundingClientRect();
    const margin = Math.max(34, Math.min(rect.width, rect.height) * 0.115);
    const spacing = Math.min((rect.width - margin * 2) / (dimensions.width - 1), (rect.height - margin * 2) / (dimensions.height - 1));
    return {
      x: rect.x + (rect.width - spacing * (dimensions.width - 1)) / 2 + (dimensions.cell % dimensions.width) * spacing,
      y: rect.y + (rect.height - spacing * (dimensions.height - 1)) / 2 + Math.floor(dimensions.cell / dimensions.width) * spacing
    };
  }, { cell, width, height });
  await page.touchscreen.tap(point.x, point.y);
}

async function playSequence(page, cells, result) {
  const before = await page.evaluate(() => window.__duelQA.moves.length);
  for (let index = 0; index < cells.length; index += 1) {
    await tapCell(page, cells[index]);
    await page.waitForFunction((length) => window.__duelQA.moves.length === length, before + index + 1);
    await expectText(page, "turnStatus", index === cells.length - 1 ? result : (index % 2 === 0 ? "白方回合" : "黑方回合"));
  }
  const moves = await page.evaluate((before) => window.__duelQA.moves.slice(before), before);
  assert.deepEqual(moves.map((move) => move.player), cells.map((_cell, index) => index % 2 === 0 ? 1 : -1));
  assert.equal(moves.at(-1).won, result !== "和局");
}

async function runViewport(browser, url, viewport) {
  const size = `${viewport.width}x${viewport.height}`;
  const errors = [], consoleErrors = [], externalRequests = [], failedRequests = [], localRequests = [];
  const options = { viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" };
  const baseline = await browser.newContext(options);
  const baselinePage = await baseline.newPage();
  await baselinePage.goto(`${url}/baseline/`, { waitUntil: "networkidle" });
  await screenshot(baselinePage, `home-before-${size}.png`);
  await baseline.close();

  const context = await browser.newContext(options);
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (!requestUrl.startsWith(url + "/")) {
      externalRequests.push(requestUrl);
      await route.abort();
    } else { localRequests.push(requestUrl); await route.continue(); }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") { consoleErrors.push(message.text()); } });
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), failure: request.failure() }));
  try {
    await page.goto(`${url}/`, { waitUntil: "networkidle" });
    await ready(page);
    assert.equal(await page.locator("#developerButton").isVisible(), false);
    const homeBounds = await assertVisibleInViewport(page, ".level-card, #modeSelection");
    const cardGeometry = await assertCardGeometry(page);
    await screenshot(page, `home-after-${size}.png`);
    await observeGame(page);
    await context.setOffline(true);

    await page.locator('[data-mode="duel"]').tap();
    assert.equal(await page.locator('[data-mode="duel"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('.level-card.is-locked').count(), 0);
    assert.equal(await page.locator('.level-card.is-revealed').count(), 7);
    await screenshot(page, `home-duel-all-levels-${size}.png`);
    for (let index = 1; index < 7; index += 1) {
      await page.locator(`[data-level="${index}"]`).tap();
      await ready(page);
      await expectText(page, "turnStatus", "黑方回合");
      await page.locator("#backButton").tap();
      await ready(page);
      await page.locator("#homeScreen.is-active").waitFor();
    }
    await page.locator('[data-mode="ai"]').tap();
    assert.equal(await page.locator('.level-card.is-locked').count(), 6);
    await page.locator('[data-mode="duel"]').tap();
    await page.locator('[data-level="0"]').tap();
    await ready(page);
    await expectText(page, "turnStatus", "黑方回合");
    await expectText(page, "humanChipLabel", "黑方");
    await expectText(page, "difficultyLabel", "白方");
    await tapCell(page, 8);
    await expectText(page, "turnStatus", "白方回合");
    assert.equal(await page.locator("#thinkingIndicator").evaluate((element) => element.classList.contains("is-visible")), false);
    await screenshot(page, `duel-white-turn-${size}.png`);
    await tapCell(page, 8);
    assert.equal(await page.evaluate(() => window.__duelQA.moves.length), 1, "Occupied intersection accepted");
    await expectText(page, "turnStatus", "白方回合");
    await page.locator("#gameSettingsButton").tap();
    await page.locator("#settingsSheet.is-visible").waitFor();
    assert.equal(await page.locator("#difficultyControl").isVisible(), false);
    await expectText(page, "difficultyLabel", "白方");
    await screenshot(page, `duel-settings-${size}.png`);
    await page.locator("#settingsDoneButton").tap();
    await page.locator("#settingsSheet").waitFor({ state: "hidden" });
    await expectText(page, "turnStatus", "白方回合");
    await tapCell(page, 0);
    await expectText(page, "turnStatus", "黑方回合");
    assert.equal(await page.evaluate(() => window.__duelQA.moves.at(-1).player), -1);
    await page.locator("#undoButton").tap();
    await expectText(page, "turnStatus", "白方回合");
    await tapCell(page, 0);
    await expectText(page, "turnStatus", "黑方回合");
    assert.equal(await page.evaluate(() => window.__duelQA.moves.at(-1).board.filter(Boolean).length), 2);
    await page.locator("#restartButton").tap();
    await ready(page);
    await expectText(page, "turnStatus", "黑方回合");

    await playSequence(page, [8, 0, 9, 1, 10, 2, 11, 3, 12], "黑方胜");
    await page.waitForTimeout(1500); // Let the Canvas winning-line animation settle.
    await screenshot(page, `duel-black-win-${size}.png`);
    await assertVisibleInViewport(page, "#journeyButton, #settledReplayButton, #reviewToggleButton");
    await page.locator("#settledReplayButton").tap();
    await ready(page);
    await expectText(page, "turnStatus", "黑方回合");
    await playSequence(page, [0, 7, 2, 8, 4, 9, 14, 10, 16, 11], "白方胜");
    await page.waitForTimeout(1500);
    await screenshot(page, `duel-white-win-${size}.png`);
    await page.locator("#reviewToggleButton").tap();
    await page.locator("#reviewPreviousButton").tap();
    await expectText(page, "turnStatus", "第 9 手 · 9 / 10");
    await page.locator("#reviewToggleButton").tap();
    await expectText(page, "turnStatus", "白方胜");
    await page.locator("#settledReplayButton").tap();
    await ready(page);
    await expectText(page, "turnStatus", "黑方回合");
    const drawBoard = "bbbwwbwwbwbwwbbbwbbbwbwbwbwbwwbwwbbwwwbbbbwwwwbwb";
    const black = [], white = [];
    Array.from(drawBoard).forEach((value, cell) => (value === "b" ? black : white).push(cell));
    await playSequence(page, black.flatMap((cell, step) => step < white.length ? [cell, white[step]] : [cell]), "和局");
    await screenshot(page, `duel-draw-${size}.png`);
    await page.locator("#journeyButton").tap();
    await ready(page);
    await page.locator("#homeScreen.is-active").waitFor();
    const observed = await page.evaluate(() => ({ aiCalls: window.__duelQA.aiCalls, moveCount: window.__duelQA.moves.length }));
    assert.equal(observed.aiCalls, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(failedRequests, []);
    return { viewport, ...observed, errors, consoleErrors, externalRequests, failedRequests, localRequests, homeBounds, cardGeometry, offlineDuringMatch: true };
  } catch (error) {
    const state = await page.evaluate(() => ({
      status: document.getElementById("turnStatus")?.textContent,
      review: document.getElementById("endgameReviewTools")?.outerHTML,
      reviewVisibility: getComputedStyle(document.getElementById("endgameReviewTools")).visibility,
      observed: window.__duelQA
    })).catch(() => null);
    const failure = { error: error.stack, viewport, state, errors, consoleErrors, failedRequests, externalRequests };
    fs.writeFileSync(path.join(TEMP, `failure-${size}.json`), JSON.stringify(failure, null, 2) + "\n");
    await page.screenshot({ path: path.join(TEMP, `failure-${size}.png`) }).catch(() => {});
    console.error(JSON.stringify({ viewport, status: state?.status, review: state?.review, reviewVisibility: state?.reviewVisibility, errors, consoleErrors, failedRequests, externalRequests }));
    throw error;
  } finally { await context.close(); }
}

async function run() {
  if (args.includes("--serve")) {
    await startServer(Number(option("--port", 4174)));
    return;
  }
  let playwright;
  try { playwright = require("playwright"); }
  catch { throw new Error("Playwright must be supplied by your environment or NODE_PATH; no project dependency is installed."); }
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.mkdirSync(TEMP, { recursive: true });
  let server;
  const suppliedUrl = option("--url", null);
  if (suppliedUrl) {
    const parsedUrl = new URL(suppliedUrl);
    assert.ok(parsedUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsedUrl.hostname), "QA is limited to a local HTTP server");
  }
  if (!suppliedUrl) { server = await startServer(0); }
  const url = suppliedUrl || `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch({ headless: true });
  const result = {
    baseline: git("rev-parse", `${BASELINE_REF}^{commit}`).toString().trim(),
    candidateHead: git("rev-parse", "HEAD").toString().trim(),
    candidateHasUncommittedChanges: Boolean(git("status", "--porcelain").toString().trim()),
    browser: browser.version(), timestamp: new Date().toISOString(), realDevice: false, viewports: []
  };
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 770 }]) {
      result.viewports.push(await runViewport(browser, url.replace(/\/$/, ""), viewport));
      console.log(`Passed ${viewport.width}x${viewport.height}: offline duel, black/white wins, undo, restart, settings and replay`);
    }
    fs.writeFileSync(path.join(TEMP, "result.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(`Evidence: ${path.relative(ROOT, EVIDENCE).replaceAll(path.sep, "/")}`);
  } finally {
    await browser.close();
    if (server) { await new Promise((resolve) => server.close(resolve)); }
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });

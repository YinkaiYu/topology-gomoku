"use strict";

// Isolated messages verify visible motion and reading position.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { startServer } = require("../arena/server.cjs");

const EVIDENCE = path.resolve(__dirname, "../artifacts/arena-clock-options");
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function startProbe(page, targetSeq, selector = null) {
  await page.evaluate(({ seq, selector }) => {
    selector ||= `.chat-row[data-seq="${seq}"]`;
    const probe = { frames: [], running: true };
    window.motionProbe = probe;
    const sample = time => {
      if (!probe.running) return;
      const row = document.querySelector(selector);
      const board = document.querySelector("#board").getBoundingClientRect();
      const rows = [...document.querySelectorAll(".chat-row")];
      probe.frames.push({ time, y: row.getBoundingClientRect().y, count: rows.length,
        animations: rows.flatMap(node => node.getAnimations({ subtree: true })).filter(animation => animation.playState === "running").length,
        lastY: rows.at(-1).getBoundingClientRect().y,
        lastOpacity: getComputedStyle(rows.at(-1).firstElementChild).opacity,
        board: { x: board.x, y: board.y, width: board.width, height: board.height } });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, { seq: String(targetSeq), selector });
}

async function stopProbe(page) {
  return page.evaluate(() => { window.motionProbe.running = false; return window.motionProbe.frames; });
}

function checkMovement(frames, oldCount, finalCount, expectedBoard) {
  const start = frames.find(frame => frame.count === oldCount);
  const moving = frames.filter(frame => frame.count > oldCount);
  const end = moving.at(-1);
  assert.ok(start && end && end.count === finalCount);
  assert.ok(end.y < start.y - 20, "Existing bubble moves upward as new messages arrive");
  assert.ok(moving.some(frame => frame.animations > 0), "A visible motion interval exists");
  assert.ok(moving.some(frame => Number(frame.lastOpacity) > 0 && Number(frame.lastOpacity) < .99), "New bubble fades through intermediate opacity");
  assert.ok(moving.some(frame => frame.y < start.y - 3 && frame.y > end.y + 3), "Existing bubble passes through intermediate positions");
  const span = start.y - end.y;
  for (let index = 1; index < frames.length; index++) {
    assert.ok(Math.abs(frames[index].y - frames[index - 1].y) < span * .75,
      "A rendered frame does not jump across most of the displacement");
  }
  assert.equal(end.animations, 0, "Animations settle after the message burst");
  for (const frame of frames) assert.deepEqual(frame.board, expectedBoard, "Chat movement keeps board position fixed");
}

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-chat-motion-"));
  const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
  const browser = await chromium.launch({ headless: true });
  const call = (name, args = {}) => app.arena.call(name, args, { hostAuthorized: true });
  const { gameId } = call("arena_create", { topology: "mobius", mode: "duel", clock: null });
  const tokens = {};
  for (const role of ["black", "white"]) {
    tokens[role] = call("arena_join", { ...call("arena_invite", { gameId, role }), name: role === "black" ? "黑方" : "白方" }).token;
    call("arena_ready", { gameId, token: tokens[role] });
  }
  call("arena_control", { gameId, action: "pause" });
  let noteId = 0;
  const note = (role, text) => call("arena_note", { gameId, token: tokens[role], ply: 0, text, requestId: `motion-${noteId++}` });
  let last;
  for (let index = 0; index < 6; index++) last = note(index % 2 ? "white" : "black", "先看看这条线会通向哪里。");
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${app.url}/?game=${gameId}`);
    await page.locator(".chat-row").last().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await pause(500);
    const board = await page.locator("#board").boundingBox();
    const target = last.event.seq;
    await page.screenshot({ path: path.join(EVIDENCE, "chat-motion-before.png") });
    await startProbe(page, target);
    await pause(40);
    note("black", "咦，这里也能接到另一侧。");
    await page.waitForFunction(() => document.querySelectorAll(".chat-row").length === 7);
    await pause(70);
    await page.screenshot({ path: path.join(EVIDENCE, "chat-motion-middle.png") });
    await pause(550);
    const single = await stopProbe(page);
    checkMovement(single, 6, 7, board);
    await page.screenshot({ path: path.join(EVIDENCE, "chat-motion-after.png") });

    await startProbe(page, target);
    await pause(40);
    note("white", "这一侧的机会值得留意。");
    await page.waitForFunction(() => document.querySelectorAll(".chat-row").length === 8);
    await pause(70);
    note("black", "我也得照顾另一条线。");
    await page.waitForFunction(() => document.querySelectorAll(".chat-row").length === 9);
    await pause(650);
    const burst = await stopProbe(page);
    checkMovement(burst, 7, 9, board);
    assert.ok(burst.some(frame => frame.count === 8 && frame.animations > 0), "Second message arrives during the first transition");

    await page.locator("#conversation").evaluate(node => { node.scrollTop = 0; });
    await pause(50);
    const anchor = await page.locator(".chat-row").first().boundingBox();
    const scrollTop = await page.locator("#conversation").evaluate(node => node.scrollTop);
    note("white", "先把这个念头记下来。");
    await page.waitForFunction(() => document.querySelectorAll(".chat-row").length === 10);
    await pause(450);
    assert.equal((await page.locator(".chat-row").first().boundingBox()).y, anchor.y);
    assert.equal(await page.locator("#conversation").evaluate(node => node.scrollTop), scrollTop);
    assert.deepEqual(await page.locator("#board").boundingBox(), board);
    assert.deepEqual(errors, []);
    await context.close();

    const reduced = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    const reducedPage = await reduced.newPage();
    await reducedPage.goto(`${app.url}/?game=${gameId}`);
    await reducedPage.waitForFunction(() => document.querySelectorAll(".chat-row").length === 10);
    await startProbe(reducedPage, target);
    await pause(40);
    note("black", "还有一点值得重新确认。");
    await reducedPage.waitForFunction(() => document.querySelectorAll(".chat-row").length === 11);
    await pause(100);
    const reducedFrames = await stopProbe(reducedPage);
    assert.ok(reducedFrames.every(frame => frame.animations === 0), "Reduced-motion preference disables chat transitions");
    await reduced.close();

    call("arena_control", { gameId, action: "resume" });
    const activeContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "no-preference" });
    const activePage = await activeContext.newPage();
    await activePage.goto(`${app.url}/?game=${gameId}`);
    await activePage.locator('.turn-activity[data-role="black"]').waitFor();
    await pause(500);
    const activityY = (await activePage.locator(".turn-activity").boundingBox()).y;
    await startProbe(activePage, null, ".turn-activity");
    await pause(40);
    note("black", "先把这边的变化想清楚。");
    await activePage.waitForFunction(() => document.querySelectorAll(".chat-row").length === 12);
    await pause(550);
    const activityFrames = await stopProbe(activePage);
    assert.ok(activityFrames.every(frame => Math.abs(frame.y - activityY) < 1), "Retained loading bubble stays anchored while a player note arrives");

    const scrollBeforeWheel = await activePage.locator("#conversation").evaluate(node => node.scrollTop);
    note("white", "这个变化我还要再看看。");
    await activePage.waitForFunction(() => document.querySelectorAll(".chat-row").length === 13);
    const conversationBounds = await activePage.locator("#conversation").boundingBox();
    await activePage.mouse.move(conversationBounds.x + 70, conversationBounds.y + 160);
    assert.ok(await activePage.locator(".chat-row").evaluateAll(rows => rows.some(row =>
      row.getAnimations({ subtree: true }).some(animation => animation.playState === "running"))), "Wheel input is delivered during an active message transition");
    await activePage.mouse.wheel(0, -140);
    await pause(100);
    const wheelAnchor = await activePage.evaluate(() => {
      const viewport = document.querySelector("#conversation");
      const top = viewport.getBoundingClientRect().top;
      const rows = [...document.querySelectorAll(".chat-row")];
      const row = rows.find(node => node.getBoundingClientRect().bottom > top);
      return { seq: row.dataset.seq, y: row.getBoundingClientRect().y, scrollTop: viewport.scrollTop,
        animations: rows.flatMap(node => node.getAnimations({ subtree: true })).filter(animation => animation.playState === "running").length };
    });
    assert.ok(wheelAnchor.scrollTop < scrollBeforeWheel, "Wheel scroll moves into history during the transition");
    assert.equal(wheelAnchor.animations, 0, "Manual history scrolling ends layout animations");
    note("black", "也许可以从另一侧试试。");
    await activePage.waitForFunction(() => document.querySelectorAll(".chat-row").length === 14);
    await pause(450);
    assert.equal((await activePage.locator(`.chat-row[data-seq="${wheelAnchor.seq}"]`).boundingBox()).y, wheelAnchor.y);
    assert.equal(await activePage.locator("#conversation").evaluate(node => node.scrollTop), wheelAnchor.scrollTop);
    assert.deepEqual(await activePage.locator("#board").boundingBox(), board);
    await activeContext.close();
    fs.writeFileSync(path.join(EVIDENCE, "chat-motion-results.json"), JSON.stringify({ viewport: { width: 1280, height: 720 },
      checks: { intermediateMovement: true, burstContinuity: true, historyAnchor: true, reducedMotion: true, fixedBoard: true, loadingAnchor: true, wheelInterrupt: true },
      single, burst, reduced: reducedFrames, activity: activityFrames, errors }, null, 2));
    console.log("Chat motion QA passed: movement, burst continuity, history, reduced motion, fixed board, loading anchor and wheel interrupt.");
  } finally {
    await browser.close();
    await app.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("arena-chat-motion-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

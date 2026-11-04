"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { startServer } = require("../arena/server.cjs");
const EVIDENCE = path.resolve(__dirname, "../artifacts/arena-clock-options");
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function alignedSegment(page, id) {
  const boxes = await page.locator(id).evaluate(control => ({
    thumb: control.querySelector(".segmented-glass-thumb").getBoundingClientRect().toJSON(),
    label: control.querySelector("input:checked").closest("label").getBoundingClientRect().toJSON()
  }));
  assert.ok(Math.abs(boxes.thumb.x - boxes.label.x) < 1);
  assert.ok(Math.abs(boxes.thumb.width - boxes.label.width) < 1);
}

async function rangePosition(page, id) {
  return page.locator(id).evaluate(input => ({
    value: Number(input.value), maximum: Number(input.max), disabled: input.disabled,
    progress: Number(input.closest(".liquid-range").style.getPropertyValue("--view-progress"))
  }));
}

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-liquid-qa-"));
  const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
  const call = (name, args = {}) => app.arena.call(name, args, { hostAuthorized: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(app.url);
    await page.locator("#clock-modes .segmented-glass-thumb").waitFor();
    await alignedSegment(page, "#clock-modes");
    const start = await page.locator("#clock-modes .segmented-glass-thumb").boundingBox();
    await page.locator('label:has(input[name="clock-mode"][value="untimed"])').click();
    await pause(90);
    const moving = await page.locator("#clock-modes .segmented-glass-thumb").boundingBox();
    const target = await page.locator('label:has(input[name="clock-mode"][value="untimed"])').boundingBox();
    assert.ok(moving.x > start.x + 1 && moving.x < target.x - 1);
    await page.locator('label:has(input[name="clock-mode"][value="standard"])').click();
    await pause(850);
    await alignedSegment(page, "#clock-modes");
    await page.locator('input[name="clock-mode"]:checked').focus();
    await page.keyboard.press("ArrowRight");
    await pause(850);
    assert.equal(await page.locator('input[name="clock-mode"][value="relaxed"]').isChecked(), true);
    await alignedSegment(page, "#clock-modes");
    const thumb = await page.locator("#clock-modes .segmented-glass-thumb").boundingBox();
    const last = await page.locator('label:has(input[name="clock-mode"][value="untimed"])').boundingBox();
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await page.mouse.down();
    assert.equal(await page.locator("#clock-modes").evaluate(node => node.classList.contains("is-dragging")), true);
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 8 });
    assert.ok(await page.locator("#clock-modes .segmented-glass-thumb").evaluate(node => parseFloat(getComputedStyle(node).scale) > 1));
    await page.screenshot({ path: path.join(EVIDENCE, "liquid-thumb-dragging.png") });
    await page.mouse.up();
    await pause(950);
    assert.equal(await page.locator("#clock-modes .segmented-glass-thumb").evaluate(node => parseFloat(getComputedStyle(node).scale)), 1);
    assert.equal(await page.locator('input[name="clock-mode"][value="untimed"]').isChecked(), true);
    await alignedSegment(page, "#clock-modes");

    const { gameId } = call("arena_create", { topology: "mobius", mode: "duel", clock: null });
    await page.goto(`${app.url}/?game=${gameId}`);
    await page.locator("#match").waitFor({ state: "visible" });
    let replay = await rangePosition(page, "#replay-range");
    assert.equal(replay.disabled, true);
    await page.locator("#replay-range").evaluate(input => input.closest(".liquid-range").click());
    assert.equal((await rangePosition(page, "#replay-range")).value, 0);
    const tokens = {};
    for (const role of ["black", "white"]) {
      tokens[role] = call("arena_join", { ...call("arena_invite", { gameId, role }), name: role }).token;
      call("arena_ready", { gameId, token: tokens[role] });
    }
    for (const [index, cell] of ["D4", "E4", "D3", "E3"].entries()) {
      call("arena_move", { gameId, token: tokens[index % 2 ? "white" : "black"], cell, expectedVersion: index, requestId: `move-${index}` });
    }
    call("arena_control", { gameId, action: "pause" });
    await page.waitForFunction(() => document.getElementById("replay-range").max === "4");
    const viewBox = await page.locator("#view-range").evaluate(input => input.closest(".liquid-range").getBoundingClientRect().toJSON());
    await page.mouse.click(viewBox.x + viewBox.width * .8, viewBox.y + viewBox.height / 2);
    await pause(90);
    assert.ok((await rangePosition(page, "#view-range")).value > 0);
    assert.ok((await rangePosition(page, "#view-range")).value < 100);
    await page.locator("#view-range").focus();
    await page.keyboard.press("End");
    await pause(90);
    await page.keyboard.press("Home");
    await pause(850);
    assert.equal((await rangePosition(page, "#view-range")).value, 0);

    const replayBox = await page.locator("#replay-range").evaluate(input => input.closest(".liquid-range").getBoundingClientRect().toJSON());
    await page.mouse.click(replayBox.x + replayBox.width * .55, replayBox.y + replayBox.height / 2);
    await pause(850);
    replay = await rangePosition(page, "#replay-range");
    assert.equal(replay.value, 2);
    assert.ok(Math.abs(replay.progress - replay.value / replay.maximum) < .001);
    const replayThumb = await page.locator("#replay-range").evaluate(input => input.closest(".liquid-range").querySelector(".dimension-glass-thumb").getBoundingClientRect().toJSON());
    await page.mouse.move(replayThumb.x + replayThumb.width / 2, replayThumb.y + replayThumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(replayBox.x + replayBox.width * .34, replayBox.y + replayBox.height / 2, { steps: 5 });
    await page.evaluate(() => dispatchEvent(new Event("blur")));
    await page.mouse.up();
    replay = await rangePosition(page, "#replay-range");
    assert.ok(Math.abs(replay.progress - replay.value / replay.maximum) < .001, "Cancel snaps discrete replay thumb to the actual ply");

    await page.locator("#return-live").click();
    await page.mouse.click(viewBox.x + viewBox.width * .85, viewBox.y + viewBox.height / 2);
    await page.locator("#settings-button").click();
    await page.locator("#new-button").click();
    await pause(850);
    assert.equal(await page.locator("#welcome").isVisible(), true);
    const second = call("arena_create", { topology: "plane", mode: "duel", clock: null });
    await page.locator("#settings-button").click();
    await page.locator("#rooms-button").click();
    await page.locator(`.room-row:has([data-game="${second.gameId}"]) .room-open`).click();
    await pause(850);
    assert.equal((await rangePosition(page, "#view-range")).value, 0);
    assert.equal((await rangePosition(page, "#replay-range")).value, 0);

    await page.goto(`${app.url}/?game=${gameId}`);
    for (let index = 0; index < 28; index++) call("arena_note", { gameId, token: tokens[index % 2 ? "white" : "black"], ply: 4, text: "这条线路值得再看看。", requestId: `timeline-${index}` });
    await page.locator("#settings-button").click();
    await page.locator("#timeline-button").click();
    const shell = await page.locator("#timeline-dialog").boundingBox();
    const scrolling = page.locator("#timeline-dialog .dialog-content");
    await scrolling.evaluate(node => { node.scrollTop = node.scrollHeight; });
    assert.ok(await scrolling.evaluate(node => node.scrollTop > 0));
    assert.deepEqual(await page.locator("#timeline-dialog").boundingBox(), shell);
    assert.equal(await page.locator("#timeline-dialog").evaluate(node => getComputedStyle(node, "::before").position), "absolute");
    await page.screenshot({ path: path.join(EVIDENCE, "timeline-scrolled-glass.png"), animations: "disabled" });
    await context.close();

    const reduced = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    const reducedPage = await reduced.newPage();
    await reducedPage.goto(app.url);
    await reducedPage.locator('label:has(input[name="clock-mode"][value="relaxed"])').click();
    await alignedSegment(reducedPage, "#clock-modes");
    assert.equal(await reducedPage.locator("#clock-modes .segmented-glass-thumb").evaluate(node => node.getAnimations().length), 0);
    await reduced.close();
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(EVIDENCE, "liquid-controls-results.json"), JSON.stringify({ viewport: { width: 1280, height: 720 },
      checks: { clickGlide: true, rapidRetarget: true, keyboard: true, dragSnap: true, disabled: true, rangeKeyboard: true, replayCancelSnap: true, navigationCancel: true, reducedMotion: true, timelineShell: true }, errors }, null, 2));
    console.log("Liquid controls QA passed: pointer, keyboard, cancellation, navigation and scrolling panels.");
  } finally {
    await browser.close();
    await app.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("arena-liquid-qa-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

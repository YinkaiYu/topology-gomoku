"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { startServer } = require("../arena/server.cjs");
const EVIDENCE = path.resolve(__dirname, "../artifacts/arena-clock-options");
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const FOCUS_BASE = "60bc785";

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

async function tabTo(page, selector) {
  for (let count = 0; count < 40; count++) {
    await page.keyboard.press("Tab");
    if (await page.locator(selector).evaluate(node => node === document.activeElement)) return;
  }
  throw new Error(`Keyboard focus did not reach ${selector}`);
}

async function hasFocusRing(page, selector) {
  return page.locator(selector).evaluate(node => {
    const style = getComputedStyle(node);
    return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
  });
}

async function cancelPointer(page, selector) {
  const target = page.locator(selector);
  await target.evaluate(node => node.addEventListener("pointerdown", event => { node.qaPointerId = event.pointerId; }, { once: true }));
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, { steps: 3 });
  await target.evaluate(node => node.dispatchEvent(new PointerEvent("pointercancel", { pointerId: node.qaPointerId, bubbles: true })));
  await page.mouse.up();
}

async function verifyFocus(browser, url, gameId) {
  const baseline = Object.fromEntries(["index.html", "arena.js", "arena.css", "liquid-controls.js"].map(name => [name,
    execFileSync("git", ["show", `${FOCUS_BASE}:arena/public/${name}`], { cwd: path.resolve(__dirname, "..") })]));
  const results = [];
  for (const previous of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      if (previous) await page.route("**/*", async route => {
        const pathname = new URL(route.request().url()).pathname;
        const name = pathname === "/" ? "index.html" : pathname.slice(1);
        if (baseline[name]) await route.fulfill({ body: baseline[name], contentType: name.endsWith("css") ? "text/css" : name.endsWith("js") ? "text/javascript" : "text/html" });
        else await route.continue();
      });
      await page.goto(url);
      await page.locator("#create-button").waitFor();
      await tabTo(page, '#clock-modes input:checked');
      await page.keyboard.press("ArrowRight");
      const clockRing = '#clock-modes input:checked + span';
      if (!previous) assert.equal(await hasFocusRing(page, clockRing), false);
      await page.locator('label:has(input[name="clock-mode"][value="relaxed"])').click();
      const pointerRing = await hasFocusRing(page, clockRing);
      if (!previous) assert.equal(pointerRing, false, "Pointer input leaves no focus outline");
      assert.equal(await page.locator('#clock-modes input:checked').evaluate(node => node === document.activeElement), true);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(EVIDENCE, previous ? "focus-pointer-before.png" : "focus-pointer-after.png"), animations: "disabled" });
      if (!previous) {
        // Keep real focus after the pointer action so an arrow works immediately.
        await page.keyboard.press("ArrowLeft");
        assert.equal(await page.locator('input[name="clock-mode"][value="standard"]').isChecked(), true);
        assert.equal(await hasFocusRing(page, clockRing), false);
        const thumb = await page.locator("#clock-modes .segmented-glass-thumb").boundingBox();
        const last = await page.locator('label:has(input[name="clock-mode"][value="untimed"])').boundingBox();
        await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
        await page.mouse.down();
        assert.equal(await hasFocusRing(page, clockRing), false);
        await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 6 });
        await page.mouse.up();
        assert.equal(await hasFocusRing(page, clockRing), false);
        await page.keyboard.press("ArrowLeft");
        assert.equal(await hasFocusRing(page, clockRing), false);
        await cancelPointer(page, "#clock-modes");
        assert.equal(await hasFocusRing(page, clockRing), false);
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        assert.equal(await page.locator('#clock-modes input:checked').evaluate(node => node === document.activeElement), true);
        assert.equal(await hasFocusRing(page, clockRing), false);

        for (const [id, name, clickValue] of [["mode-options", "mode", "duel"], ["difficulty-options", "difficulty", "easy"]]) {
          if (name === "difficulty") await page.locator('label:has(input[name="mode"][value="ai"])').click();
          await tabTo(page, `#${id} input:checked`);
          await page.keyboard.press("ArrowRight");
          assert.equal(await hasFocusRing(page, `#${id} input:checked + span`), false);
          await page.locator(`label:has(input[name="${name}"][value="${clickValue}"])`).click();
          assert.equal(await hasFocusRing(page, `#${id} input:checked + span`), false);
          assert.equal(await page.locator(`#${id} input:checked`).evaluate(node => node === document.activeElement), true);
          await page.keyboard.press("ArrowRight");
          assert.equal(await hasFocusRing(page, `#${id} input:checked + span`), false);
        }
        await tabTo(page, "#board-width");
        assert.equal(await hasFocusRing(page, "#board-width"), false);
        await page.keyboard.press("Control+A");
        await page.keyboard.type("9");
        await page.keyboard.press("ArrowUp");
        assert.equal(await page.locator("#board-width").inputValue(), "10");
        assert.equal(await hasFocusRing(page, "#board-width"), false);
        await page.locator("#board-height").click();
        await page.keyboard.press("Control+A");
        await page.keyboard.type("8");
        assert.equal(await page.locator("#board-height").inputValue(), "8");
        assert.equal(await hasFocusRing(page, "#board-height"), false);
      }

      await page.goto(`${url}/?game=${gameId}`);
      await page.locator("#match").waitFor();
      const ranges = [];
      for (const id of ["view-range", "replay-range"]) {
        await tabTo(page, `#${id}`);
        await page.keyboard.press("End");
        const control = `.liquid-range:has(#${id})`;
        const ring = `${control} .dimension-glass-thumb`;
        if (!previous) assert.equal(await hasFocusRing(page, ring), false);
        const box = await page.locator(control).boundingBox();
        await page.mouse.click(box.x + box.width * .35, box.y + box.height / 2);
        const rangePointerRing = await hasFocusRing(page, ring);
        if (!previous) assert.equal(rangePointerRing, false);
        assert.equal(await page.locator(`#${id}`).evaluate(node => node === document.activeElement), true);
        if (!previous) {
          const value = Number(await page.locator(`#${id}`).inputValue());
          await page.keyboard.press("ArrowRight");
          assert.ok(Number(await page.locator(`#${id}`).inputValue()) > value);
          if (!previous) assert.equal(await hasFocusRing(page, ring), false);
          const thumb = await page.locator(ring).boundingBox();
          await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
          await page.mouse.down();
          assert.equal(await hasFocusRing(page, ring), false);
          await page.mouse.move(box.x + box.width * .65, box.y + box.height / 2, { steps: 5 });
          await page.mouse.up();
          assert.equal(await hasFocusRing(page, ring), false);
          await page.keyboard.press("ArrowLeft");
          if (!previous) assert.equal(await hasFocusRing(page, ring), false);
          await cancelPointer(page, control);
          assert.equal(await hasFocusRing(page, ring), false);
          await page.keyboard.press("Tab");
          await page.keyboard.press("Shift+Tab");
          assert.equal(await page.locator(`#${id}`).evaluate(node => node === document.activeElement), true);
          if (!previous) assert.equal(await hasFocusRing(page, ring), false);
        }
        ranges.push({ id, pointerRing: rangePointerRing });
      }
      results.push({ previous, pointerRing, ranges });
    } finally { await context.close(); }
  }
  fs.writeFileSync(path.join(EVIDENCE, "focus-results.json"), JSON.stringify({ baseline: FOCUS_BASE, viewport: { width: 1280, height: 720 },
    checks: { keyboardToPointer: true, pointerClick: true, pointerDrag: true, pointerCancel: true, realFocusRetained: true, arrowWithoutBlur: true, tabPreservesKeyboardAccess: true, keyboardOutlinesRemoved: true, numericEditing: true }, results }, null, 2));
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
    await verifyFocus(browser, app.url, gameId);
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

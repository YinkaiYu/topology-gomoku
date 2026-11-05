"use strict";

// Isolated synthetic matches only. No player credentials or transcripts are captured.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { startServer } = require("../arena/server.cjs");
const ROOT = path.resolve(__dirname, "..");
const BASE = "60f8de0";
const EVIDENCE = path.join(ROOT, "artifacts/arena-play-policy");
const VIEWPORTS = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 },
  { width: 1024, height: 768 }, { width: 1440, height: 1080 }];

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
async function choose(page, name, value) {
  await page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();
  assert.equal(await page.locator(`input[name="${name}"][value="${value}"]`).isChecked(), true);
}
async function geometry(page, viewport) {
  const result = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { panel: box(".setup-panel"), controls: [".setup-heading", "#mode-options", "#topology-options", ".size-row", "#play-policy-options", "#clock-modes", "#create-button"].map(box),
      labels: [...document.querySelectorAll("#play-policy-options label")].map(el => el.getBoundingClientRect().toJSON()),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      verticalOverflow: document.documentElement.scrollHeight > innerHeight,
      material: document.querySelector("#play-policy-options .segmented-glass-thumb") !== null,
      labelsFit: [...document.querySelectorAll("#play-policy-options label>span")].every(el => el.scrollWidth <= el.clientWidth) };
  });
  const { panel, controls, labels } = result;
  assert.ok(panel.x >= 0 && panel.y >= 0 && panel.right <= viewport.width + 1 && panel.bottom <= viewport.height + 1, `Setup panel fits ${viewport.width}x${viewport.height}: ${JSON.stringify(panel)}`);
  for (const rect of controls) {
    assert.ok(Math.abs(rect.x - controls[0].x) < 1 && Math.abs(rect.width - controls[0].width) < 1, "Controls share left and right edges");
    assert.ok(rect.y >= panel.y && rect.bottom <= panel.bottom, "Controls stay inside panel");
  }
  assert.ok(Math.abs(labels[0].width - labels[1].width) < 1, "Policy choices share equal width");
  assert.equal(result.horizontalOverflow, false);
  assert.equal(result.verticalOverflow, false);
  assert.equal(result.material, true);
  assert.equal(result.labelsFit, true, "Long policy labels fit their controls");
  return result;
}

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const baseline = Object.fromEntries(["index.html", "arena.css", "arena.js", "liquid-controls.js"].map(name => [name,
    execFileSync("git", ["show", `${BASE}:arena/public/${name}`], { cwd: ROOT, maxBuffer: 5 * 1024 * 1024 })]));
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of VIEWPORTS) {
      const size = `${viewport.width}x${viewport.height}`;
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-play-policy-"));
      const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
      let offset = 0;
      app.arena.now = () => Date.now() + offset;
      const call = (name, args = {}) => app.arena.call(name, args, { hostAuthorized: true });
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const oldContext = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      try {
        const page = await context.newPage(), before = await oldContext.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await before.route("**/*", async route => {
          const pathname = new URL(route.request().url()).pathname;
          const name = pathname === "/" ? "index.html" : pathname.slice(1);
          if (baseline[name]) await route.fulfill({ body: baseline[name], contentType: name.endsWith("css") ? "text/css" : name.endsWith("js") ? "text/javascript" : "text/html" });
          else await route.continue();
        });
        await before.goto(app.url);
        await page.goto(app.url);
        await page.locator("#create-button").waitFor({ state: "visible" });
        await before.locator("#create-button").waitFor({ state: "visible" });
        await shot(before, `home-before-${size}.png`);
        await shot(page, `home-${size}.png`);
        const home = await geometry(page, viewport);
        assert.equal(await page.locator('input[name="play-policy"][value="direct"]').isChecked(), true);
        const direct = page.locator('input[name="play-policy"][value="direct"]');
        await direct.focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(await page.locator('input[name="play-policy"][value="assisted"]').isChecked(), true);
        assert.equal(await direct.evaluate(el => getComputedStyle(el).outlineStyle), "none");
        await choose(page, "play-policy", "direct");
        assert.deepEqual((await geometry(page, viewport)).panel, home.panel, "Policy switch preserves panel geometry");
        assert.equal(await page.locator("[title]").count(), 0);
        const cases = [];
        for (const mode of ["duel", "ai"]) {
          await choose(page, "mode", mode);
          const panel = await geometry(page, viewport);
          if (mode === "ai") await shot(page, `ai-${size}.png`);
          for (const playPolicy of ["direct", "assisted"]) {
            const beforeChoice = (await geometry(page, viewport)).panel;
            await choose(page, "play-policy", playPolicy);
            assert.deepEqual((await geometry(page, viewport)).panel, beforeChoice);
            await page.locator("#create-button").click();
            await page.locator("#settings-dialog").waitFor({ state: "visible" });
            const gameId = new URL(page.url()).searchParams.get("game");
            const durationMs = playPolicy === "direct" ? 60000 : 300000;
            const initial = call("arena_state", { gameId });
            assert.equal(initial.playPolicy, playPolicy);
            assert.equal(initial.preparation.durationMs, durationMs);
            assert.equal(initial.preparation.deadline, null);
            const black = call("arena_join", { ...call("arena_invite", { gameId, role: "black" }), name: "示例黑方" });
            assert.equal(black.rules.playPolicy, playPolicy);
            assert.equal(black.rules.preparation.durationMs, durationMs);
            assert.ok(black.rules.playPolicyRule.length > 20);
            assert.ok(black.rules.preparationRule.length > 20);
            if (mode === "duel") {
              assert.equal(black.state.preparation.deadline, null);
              offset += 120000;
              const waiting = call("arena_state", { gameId });
              assert.equal(waiting.phase, "waiting");
              assert.equal(waiting.preparation.deadline, null, "A lone joined player cannot start preparation countdown");
              assert.equal(waiting.preparation.remainingMs, durationMs);
            }
            const white = mode === "duel" ? call("arena_join", { ...call("arena_invite", { gameId, role: "white" }), name: "示例白方" }) : null;
            let state = call("arena_state", { gameId });
            assert.equal(state.phase, "waiting");
            assert.equal(state.preparation.deadline - state.preparation.startedAt, durationMs);
            assert.equal(state.clock.active, null);
            await page.locator('#settings-dialog [data-close]').click();
            await page.waitForFunction(() => /准备.*\d+:\d{2}/.test(document.querySelector("#turn-label").textContent));
            const countdown = (await page.locator("#turn-label").innerText()).match(/(\d+):(\d{2})/);
            assert.ok(Number(countdown[1]) * 60 + Number(countdown[2]) <= durationMs / 1000, "Countdown follows server snapshot time");
            const board = await page.locator("#board-wrap").boundingBox();
            if (mode === "duel" && playPolicy === "direct") {
              await before.goto(`${app.url}/?game=${gameId}`);
              await before.locator("#match").waitFor({ state: "visible" });
              await shot(before, `preparation-before-${size}.png`);
              await shot(page, `preparation-${size}.png`);
              const label = await page.locator("#turn-label").innerText();
              await page.waitForFunction(previous => document.querySelector("#turn-label").innerText !== previous, label);
              assert.deepEqual(await page.locator("#board-wrap").boundingBox(), board, "Countdown preserves board geometry");
            }
            if (playPolicy === "direct") {
              const deadline = state.preparation.deadline;
              offset = deadline - Date.now() + 1200;
              app.arena.tick();
              state = call("arena_state", { gameId });
              assert.equal(state.phase, "playing");
              assert.equal(state.clock.active, "black");
              assert.ok(state.clock.remainingMs.black < state.clock.initialMs - 1000, "Clock charges elapsed time after preparation deadline");
            } else {
              call("arena_ready", { gameId, token: black.token });
              if (white) call("arena_ready", { gameId, token: white.token });
              state = call("arena_state", { gameId });
              assert.equal(state.phase, "playing");
              assert.ok(state.preparation.remainingMs > 0, "Both ready begins early");
            }
            await page.waitForFunction(() => !/准备/.test(document.querySelector("#turn-label").textContent));
            assert.deepEqual(await page.locator("#board-wrap").boundingBox(), board, "Automatic start preserves board geometry");
            const moved = call("arena_move", { gameId, token: black.token, cell: "D3", expectedVersion: state.version, requestId: `qa-${mode}-${playPolicy}` });
            assert.equal(moved.state?.ply ?? moved.ply, 1);
            call("arena_control", { gameId, action: "stop" });
            cases.push({ mode, playPolicy, durationMs, begins: playPolicy === "direct" ? "deadline" : "bothReady", firstMove: true });
            await page.goto(app.url);
            await page.locator("#create-button").waitFor({ state: "visible" });
            await choose(page, "mode", mode);
          }
        }
        const adjudications = [];
        for (const role of ["black", "white"]) {
          await choose(page, "mode", "duel");
          await choose(page, "play-policy", "direct");
          await choose(page, "clock-mode", "untimed");
          await page.locator("#create-button").click();
          await page.locator("#settings-dialog").waitFor({ state: "visible" });
          const gameId = new URL(page.url()).searchParams.get("game");
          const joined = call("arena_join", { ...call("arena_invite", { gameId, role }), name: role === "black" ? "示例黑方" : "示例白方" });
          if (role === "black") {
            call("arena_join", { ...call("arena_invite", { gameId, role: "white" }), name: "示例白方" });
            const waiting = call("arena_state", { gameId });
            assert.equal(waiting.clock, null);
            offset = waiting.preparation.deadline - Date.now() + 200;
            app.arena.tick();
            const running = call("arena_state", { gameId });
            assert.equal(running.phase, "playing", "Untimed game still has a preparation deadline");
            assert.equal(running.clock, null);
          }
          await page.locator("#adjudicate-button").click();
          await page.locator(`[data-disqualify="${role}"]`).click();
          await page.locator("#confirm-dialog").waitFor({ state: "visible" });
          const beforeCancel = call("arena_state", { gameId });
          await page.locator('#confirm-dialog [data-close]').last().click();
          const afterCancel = call("arena_state", { gameId });
          assert.equal(afterCancel.phase, beforeCancel.phase);
          assert.equal(afterCancel.eventSeq, beforeCancel.eventSeq);
          await page.locator("#adjudicate-button").click();
          await page.locator(`[data-disqualify="${role}"]`).click();
          if (viewport.width === 1280 && role === "black") await shot(page, "adjudication-confirm.png");
          await page.locator("#confirm-action").click();
          await page.locator("#confirm-dialog").waitFor({ state: "hidden" });
          await page.waitForFunction(() => document.querySelector("#turn-label").textContent.includes("违规判负"));
          const ended = call("arena_state", { gameId });
          assert.equal(ended.phase, "ended");
          assert.equal(ended.winner, role === "black" ? "white" : "black");
          assert.equal(ended.winReason, "rule_violation");
          await page.locator("#settings-button").click();
          assert.equal(await page.locator("#adjudicate-button").isVisible(), false);
          await page.locator("#rooms-button").click();
          const result = await page.locator(`.room-row:has([data-game="${gameId}"]) .room-result`).innerText();
          assert.match(result, role === "black" ? /黑方违规判负.*白方胜/s : /白方违规判负.*黑方胜/s);
          if (viewport.width === 1280 && role === "black") await shot(page, "adjudication-record.png");
          adjudications.push({ role, before: beforeCancel.phase, cancelledWithoutChange: true, winner: ended.winner, winReason: ended.winReason });
          await page.goto(app.url);
          await page.locator("#create-button").waitFor({ state: "visible" });
        }
        assert.deepEqual(errors, []);
        results.push({ viewport, home, keyboardSelection: true, noFocusOutline: true, noNativeTooltips: true, fixedPolicyLayout: true, countdownUpdates: true, stableBoardAtStart: true, untimedPreparationDeadline: true, cases, adjudications, errors });
      } finally {
        await context.close();
        await oldContext.close();
        await app.close();
        assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith("arena-play-policy-"));
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
    fs.writeFileSync(path.join(EVIDENCE, "results.json"), JSON.stringify({ baseline: BASE, fixture: "Default home and same synthetic empty board with both players preparing", results }, null, 2));
    console.log("Play policy browser QA passed at four desktop viewports.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

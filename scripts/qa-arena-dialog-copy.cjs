"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { startServer } = require("../arena/server.cjs");
const ROOT = path.resolve(__dirname, "..");
const BASE = "a85716a";
const EVIDENCE = path.join(ROOT, "artifacts/arena-clock-options");
const SAFE_INVITATION = [
  "请以黑方棋手参加这场示例对局。", "服务地址 http://127.0.0.1:4318", "",
  '{"gameId":"example-match","inviteToken":"example-invitation-token","name":"黑方"}', "",
  ...Array.from({ length: 14 }, () => "阅读本局规则，准备就绪后持续参与，并与看棋的用户分享随想。")
].join("\n");

async function focusStyle(page, selector) {
  return page.locator(selector).evaluate(node => {
    const style = getComputedStyle(node);
    return { outline: style.outlineStyle, outlineWidth: style.outlineWidth, shadow: style.boxShadow,
      borders: ["Top", "Right", "Bottom", "Left"].map(side => [style[`border${side}Width`], style[`border${side}Style`], style[`border${side}Color`]]) };
  });
}

async function verifyFocus(page, selector, clickOptions = {}) {
  const target = page.locator(selector);
  await target.evaluate(node => node.blur());
  const resting = await focusStyle(page, selector);
  await target.click(clickOptions);
  const pointer = await focusStyle(page, selector);
  assert.equal(pointer.outline, "none");
  assert.deepEqual(pointer, resting, `${selector} pointer focus keeps the existing material`);
  assert.equal(await target.evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await target.evaluate(node => node === document.activeElement), true);
  assert.deepEqual(await focusStyle(page, selector), resting, `${selector} keyboard focus keeps the existing material`);
  return { selector, pointerOutline: pointer.outline, keyboardOutline: resting.outline, stableBorderAndShadow: true };
}

async function assertCopied(page, expected) {
  // Native Windows clipboard transfers may use CRLF, while textarea.value uses LF.
  await page.waitForFunction(async invitation => {
    const copied = await navigator.clipboard.readText();
    return copied.replace(/\r\n/g, "\n") === invitation.replace(/\r\n/g, "\n");
  }, expected, { timeout: 3000 });
}

async function assertSpaced(page, selector) {
  const groups = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const bounds = [...node.children].map(child => child.getBoundingClientRect());
    return { separator: node.textContent.includes("·"), gap: parseFloat(getComputedStyle(node).columnGap),
      separated: bounds.every((rect, index) => index === 0 || rect.top > bounds[index - 1].top + 2 || rect.left > bounds[index - 1].right + 1) };
  }));
  assert.ok(groups.length > 0);
  for (const group of groups) {
    assert.equal(group.separator, false);
    assert.ok(group.gap > 0);
    assert.equal(group.separated, true);
  }
  return groups;
}

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-dialog-copy-"));
  const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
  const call = (name, args = {}) => app.arena.call(name, args, { hostAuthorized: true });
  const browser = await chromium.launch({ headless: true });
  const baseline = Object.fromEntries(["index.html", "arena.js", "arena.css"].map(name => [name,
    execFileSync("git", ["show", `${BASE}:arena/public/${name}`], { cwd: ROOT })]));
  const { gameId } = call("arena_create", { topology: "mobius", mode: "duel", clock: null });
  const results = [];
  try {
    for (const previous of [true, false]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
      const page = await context.newPage();
      let originalClipboard;
      try {
        if (previous) await page.route("**/*", async route => {
          const pathname = new URL(route.request().url()).pathname;
          const name = pathname === "/" ? "index.html" : pathname.slice(1);
          if (baseline[name]) await route.fulfill({ body: baseline[name], contentType: name.endsWith("css") ? "text/css" : name.endsWith("js") ? "text/javascript" : "text/html" });
          else await route.continue();
        });
        await page.goto(`${app.url}/?game=${gameId}`);
        await page.locator("#match").waitFor();
        const boardBefore = await page.locator("#board").boundingBox();
        originalClipboard = await page.evaluate(() => navigator.clipboard.readText());
        await page.locator("#settings-button").click();
        await page.locator('[data-invite="black"]').click();
        await page.locator("#invite-dialog").waitFor({ state: "visible" });
        const invitation = await page.locator("#invite-text").inputValue();
        const focus = [await verifyFocus(page, "#invite-text")];
        await page.keyboard.press("Control+A");
        const selectedAll = await page.locator("#invite-text").evaluate(node => node.selectionStart === 0 && node.selectionEnd === node.value.length);
        assert.equal(selectedAll, true);
        await page.keyboard.press("Control+C");
        await assertCopied(page, invitation);
        focus.push(await verifyFocus(page, "#copy-invite"));
        await assertCopied(page, invitation);
        assert.equal(await page.locator("#invite-dialog .muted").count(), previous ? 1 : 0);

        // Screenshots contain only a fixed example, never a live invitation or path.
        await page.locator("#invite-text").evaluate((node, text) => { node.value = text; node.scrollTop = 0; node.setSelectionRange(0, 0); }, SAFE_INVITATION);
        await page.locator("#invite-text").click();
        const scrollbar = await page.locator("#invite-text").evaluate(node => ({
          overflow: node.scrollHeight > node.clientHeight, width: getComputedStyle(node).scrollbarWidth,
          color: getComputedStyle(node).scrollbarColor
        }));
        assert.equal(scrollbar.overflow, true);
        if (!previous) {
          assert.equal(scrollbar.width, "thin");
          assert.ok(scrollbar.color.includes("rgba(0, 0, 0, 0)") || scrollbar.color.endsWith("transparent"));
        }
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(EVIDENCE, previous ? "invitation-before.png" : "invitation-after.png"), animations: "disabled" });
        await page.locator("#invite-text").evaluate(node => { node.scrollTop = node.scrollHeight; });
        assert.ok(await page.locator("#invite-text").evaluate(node => node.scrollTop > 0));
        await page.locator("#invite-dialog [data-close]").click();

        if (!previous) {
          await page.locator("#settings-dialog [data-close]").click();
          await assertSpaced(page, "#turn-label");
          focus.push(await verifyFocus(page, "#conversation", { position: { x: 60, y: 80 } }));
          await page.locator("#settings-button").click();
          await page.locator("#timeline-button").click();
          await assertSpaced(page, "#timeline .event-meta");
          await page.screenshot({ path: path.join(EVIDENCE, "timeline-spacing.png"), animations: "disabled" });
          focus.push(await verifyFocus(page, ".accessible-board summary"));
          assert.equal(await page.locator(".accessible-board").evaluate(node => node.open), true);
          await page.locator("#timeline-dialog [data-close]").click();
          await page.locator("#settings-dialog [data-close]").click();
          await page.locator("#black-identity").click();
          focus.push(await verifyFocus(page, "#profile-name"));
          await page.keyboard.press("Control+A");
          await page.keyboard.type("Player A");
          await page.locator('#profile-form [type="submit"]').click();
          assert.equal(call("arena_state", { gameId }).seats.black.displayName, "Player A");
          await page.locator("#settings-button").click();
          await page.locator("#stop-button").click();
          assert.equal(await page.locator("#stop-dialog .dialog-intro").count(), 0);
          await page.locator("#confirm-stop").click();
          await page.waitForFunction(() => document.getElementById("turn-label").textContent.includes("结束"));
          assert.equal(call("arena_state", { gameId }).phase, "ended");
          await assertSpaced(page, "#turn-label");
          assert.deepEqual(await page.locator("#board").boundingBox(), boardBefore);
          await page.locator("#new-button").click();
          focus.push(await verifyFocus(page, "#board-width"));
          await page.keyboard.press("Control+A");
          await page.keyboard.type("9");
          assert.equal(await page.locator("#board-width").inputValue(), "9");
          await page.locator("#settings-button").click();
          await page.locator("#rooms-button").click();
          await page.locator("#room-list .room-row").waitFor();
          await assertSpaced(page, "#room-list .room-open strong");
          await assertSpaced(page, "#room-list .room-result");
          await assertSpaced(page, "#room-list .room-meta");
          await page.screenshot({ path: path.join(EVIDENCE, "records-spacing.png"), animations: "disabled" });
          await page.locator(`#room-list button[data-game="${gameId}"]`).click();
          assert.ok((await page.locator("#confirm-description").innerText()).includes("删除"));
          await page.locator("#confirm-action").click();
          await page.waitForFunction(() => document.getElementById("room-list").textContent.includes("还没有棋局"));
          assert.equal(call("arena_list").matches.length, 0);
          await page.locator("#rooms-dialog [data-close]").click();
          const waiting = call("arena_create", { topology: "plane", mode: "duel", clock: null });
          await page.locator("#settings-button").click();
          await page.locator("#rooms-button").click();
          await page.locator(`#room-list button[data-game="${waiting.gameId}"]`).click();
          assert.equal(await page.locator("#confirm-description").isVisible(), false);
          await page.locator("#confirm-action").click();
          await page.waitForFunction(() => document.getElementById("room-list").textContent.includes("房主结束"));
          assert.equal(call("arena_state", { gameId: waiting.gameId }).phase, "ended");
        }
        results.push({ previous, focus, selectAll: true, keyboardCopy: true, copyButton: true, scrollbar, scrollable: true,
          spacing: previous ? null : { footer: true, timeline: true, records: true, fixedBoard: true } });
      } finally {
        if (originalClipboard !== undefined) await page.evaluate(value => navigator.clipboard.writeText(value), originalClipboard).catch(() => {});
        await context.close();
      }
    }
    fs.writeFileSync(path.join(EVIDENCE, "dialog-copy-results.json"), JSON.stringify({ baseline: BASE, viewport: { width: 1280, height: 720 },
      screenshotInvitation: "Fixed fake credentials and example text", results }, null, 2));
    console.log("Dialog QA passed: focus materials, invitation selection/copy, scrolling, profile/size editing and confirmations.");
  } finally {
    await browser.close();
    await app.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("arena-dialog-copy-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

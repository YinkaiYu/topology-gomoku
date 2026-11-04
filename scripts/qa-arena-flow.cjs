"use strict";
// Synthetic fixtures for layout and timing behavior, not a model performance record.
const { chromium } = require("playwright");
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const { startServer } = require("../arena/server.cjs");
const ROOT = path.resolve(__dirname, ".."), EVIDENCE = path.join(ROOT, "artifacts/arena-flow"), BASE = "38b9a8d";
async function shot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
  await page.screenshot({ path: path.join(EVIDENCE, name), animations: "disabled" });
}
(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-flow-"));
  const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
  const browser = await chromium.launch({ headless: true });
  const call = (name, args = {}) => app.arena.call(name, args, { hostAuthorized: true });
  const baseline = Object.fromEntries(["arena/public/index.html", "arena/public/arena.css", "arena/public/arena.js", "app/assets/board-art.js"].map(file => ["/" + file.replace(/^arena\/public\//, "").replace(/^app\//, ""), execFileSync("git", ["show", `${BASE}:${file}`], { cwd: ROOT })]));
  baseline["/"] = baseline["/index.html"];
  const create = (extra = {}) => {
    const { gameId } = call("arena_create", { topology: "mobius", mode: "duel", width: 7, height: 7, players: { black: { name: "黑方", avatar: "claude-color" }, white: { name: "白方", avatar: "deepseek-color" } }, ...extra });
    const tokens = {};
    for (const role of ["black", "white"]) tokens[role] = call("arena_join", { ...call("arena_invite", { gameId, role }), name: role }).token;
    call("arena_control", { gameId, action: "start" });
    return { gameId, tokens };
  };
  const results = [];
  try {
    for (const viewport of [{ width:1280, height:720 }, { width:1920, height:1080 }, { width:1024, height:768 }, { width:1440, height:1080 }]) {
      const size = `${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(app.url); await page.locator("#create-button").waitFor({ state: "visible" });
      await page.locator("#settings-button").click();
      assert.equal(await page.locator("#clock-enabled").isChecked(), true);
      assert.equal(await page.locator("#clock-minutes").inputValue(), "5");
      assert.equal(await page.locator("#clock-increment").inputValue(), "5");
      await shot(page, `settings-${size}.png`);
      await page.locator("#clock-minutes").fill("0");
      await page.locator("#settings-dialog [data-close]").click();
      const count = app.arena.matches.size;
      await page.locator("#create-button").click();
      await page.locator("#settings-dialog").waitFor({ state: "visible" });
      assert.equal(app.arena.matches.size, count);
      assert.equal(await page.locator("#clock-minutes").evaluate(input => input.validity.valid), false);
      await page.locator("#clock-minutes").fill("5");
      await page.locator("#settings-dialog [data-close]").click();
      const { gameId, tokens } = create();
      call("arena_move", { gameId, token: tokens.black, cell: "D4", expectedVersion: 0, requestId: "first" });
      call("arena_move", { gameId, token: tokens.white, cell: "E4", expectedVersion: 1, requestId: "second" });
      call("arena_control", { gameId, action: "pause" });
      const note = (role, text, id) => call("arena_note", { gameId, token: tokens[role], ply: 2, text, requestId: id });
      const sentences = ["D4 这一手把中间占住了。", "咦，左边和右边原来接在一起。", "我想先看看 A1 附近。", "那我也留意一下 G7。", "现在还不能确定这条线有没有机会。", "先保留这个念头。"];
      sentences.forEach((text, index) => note(index % 2 ? "white" : "black", text, `short-${index}`));
      await page.goto(`${app.url}/?game=${gameId}`); await page.locator(".chat-row").first().waitFor();
      await shot(page, `conversation-${size}.png`);
      assert.ok((await page.locator("#black-clock").boundingBox()).y < (await page.locator("#board").boundingBox()).y);
      assert.equal(await page.locator(".player-identity>.stone").count(), 0);
      assert.equal((await page.locator("#black-clock>.stone").boundingBox()).width, 18);
      assert.equal((await page.locator("#turn-label").boundingBox()).height, 1);
      assert.equal(await page.locator("#conversation").evaluate(node => getComputedStyle(node).maskImage), "none");
      const geometry = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".chat-row")];
        return { roles: rows.map(row => row.dataset.role), bounds: rows.map(row => row.getBoundingClientRect().toJSON()),
          outer: document.documentElement.scrollWidth, scroll: document.querySelector("#conversation").scrollTop,
          overflow: [...document.querySelectorAll(".voice-item p")].some(node => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1) };
      });
      assert.deepEqual(geometry.roles, ["black","white","black","white","black","white"]);
      assert.ok(geometry.bounds.slice(1).every((rect, index) => rect.top >= geometry.bounds[index].bottom));
      assert.equal(geometry.overflow, false); assert.ok(geometry.outer <= viewport.width);
      assert.match(await page.locator("#board").getAttribute("aria-label"), /E4/);
      // Both sides share the same displacement, including when scrolling over a bubble.
      await page.locator("#conversation").evaluate(node => { node.scrollTop = node.scrollHeight; });
      const before = await page.locator(".chat-row").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
      await page.locator("#conversation").evaluate(node => { node.scrollTop -= 80; });
      const after = await page.locator(".chat-row").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
      assert.ok(after.every((y, index) => Math.abs((y-before[index]) - (after[0]-before[0])) < 1));
      // A reader away from the bottom keeps their place as another note arrives.
      const long = "这是一段用于检查旧棋谱换行的测试文字，内容应完整展开，读者只滚动整个聊天时间轴。".repeat(8);
      note("black", long, "legacy-long");
      await page.waitForFunction(() => document.querySelectorAll(".chat-row").length === 7);
      await page.locator("#conversation").evaluate(node => { node.scrollTop = 0; });
      const anchor = await page.locator(".chat-row").first().boundingBox();
      note("white", "这里继续接上一句新的随想。", "new-while-reading");
      await page.waitForFunction(() => document.querySelectorAll(".chat-row").length === 8);
      assert.equal((await page.locator(".chat-row").first().boundingBox()).y, anchor.y);
      await page.locator("#conversation").evaluate(node => { node.scrollTop = node.scrollHeight; });
      await shot(page, `long-after-${size}.png`);
      // A message has one alpha at either edge; no gradient is applied inside it.
      for (const edge of ["top", "bottom"]) {
        const alpha = await page.evaluate(async edge => {
          const viewport = document.querySelector("#conversation"), rows = [...document.querySelectorAll(".chat-row")];
          const row = edge === "top" ? rows[0] : rows.at(-1), bounds = viewport.getBoundingClientRect();
          viewport.scrollTop = edge === "top" ? 0 : viewport.scrollHeight;
          const rect = row.getBoundingClientRect(), center = (rect.top+rect.bottom)/2;
          viewport.scrollTop += center - (edge === "top" ? bounds.top+30 : bounds.bottom-30);
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return { row: Number(getComputedStyle(row).opacity), paragraph: getComputedStyle(row.querySelector("p")).opacity, mask: getComputedStyle(row.querySelector("p")).maskImage };
        }, edge);
        assert.ok(alpha.row > 0 && alpha.row < .5, `${edge} edge should fade the whole message`);
        assert.equal(alpha.paragraph, "1"); assert.equal(alpha.mask, "none");
        await shot(page, `fade-${edge}-${size}.png`);
      }
      await page.locator("#conversation").evaluate(node => { node.scrollTop = node.scrollHeight; });
      const oldPage = await context.newPage();
      await oldPage.route("**/*", async route => { const name = new URL(route.request().url()).pathname; const body = baseline[name]; if (body) await route.fulfill({ body, contentType: name.endsWith("css") ? "text/css" : name.endsWith("js") ? "text/javascript" : "text/html" }); else await route.continue(); });
      await oldPage.goto(`${app.url}/?game=${gameId}`); await oldPage.locator("#match").waitFor({ state: "visible" });
      await shot(oldPage, `long-before-${size}.png`); await oldPage.close();
      assert.equal(await page.locator(".voice-item p").evaluateAll(nodes => nodes.some(node => node.scrollHeight > node.clientHeight+1 || node.scrollWidth > node.clientWidth+1)), false);
      // Settings, replay and returning live preserve the central board's geometry.
      const board = await page.locator("#board").boundingBox();
      await page.locator("#previous-move").click();
      assert.deepEqual(await page.locator("#board").boundingBox(), board);
      await page.locator("#return-live").click();
      assert.deepEqual(await page.locator("#board").boundingBox(), board);
      await page.locator("#settings-button").click(); await page.locator("#timeline-button").click();
      assert.ok((await page.locator("#timeline").innerText()).includes("D4"));
      assert.ok((await page.locator("#timeline").innerText()).includes("E4"));
      await page.locator("#timeline-dialog [data-close]").click();
      await page.locator("#settings-dialog [data-close]").click();
      // Repeated identities remain editable from their corresponding chat bubble.
      await page.locator("#conversation").evaluate(node => { node.scrollTop = node.scrollHeight; });
      await page.locator("#white-identity").click(); await page.locator("#profile-name").fill("白方测试");
      await page.locator('#profile-form [type="submit"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.chat-row[data-role="white"] h2')].every(node => node.textContent === "白方测试"));
      const timeout = create({ clock: { initialMs: 1000, incrementMs: 0 } });
      await page.goto(`${app.url}/?game=${timeout.gameId}`);
      await page.waitForFunction(() => document.querySelector("#turn-label").textContent.includes("超时"));
      assert.equal(await page.locator("#black-clock span:not(.stone)").textContent(), "0:00");
      await shot(page, `timeout-${size}.png`);
      await page.locator("#settings-button").click();
      assert.ok((await page.locator("#match-result").innerText()).includes("超时"));
      await shot(page, `result-${size}.png`);
      assert.deepEqual(errors, []); results.push({ viewport, checks: "clock settings and validation, chronology, shared scrolling, reader position, long notes, uniform opacity at both edges, coordinates, replay, profiles without duplicate color badges, timeout and result in settings", errors });
      await context.close();
    }
    fs.writeFileSync(path.join(EVIDENCE, "results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); await app.close(); fs.rmSync(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

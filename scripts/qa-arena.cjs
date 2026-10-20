"use strict";

// Browser acceptance against a real isolated Arena service. Playwright is
// supplied through NODE_PATH; no machine-specific dependency path is stored.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { startServer } = require("../arena/server.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "artifacts", "arena");
const sequence = [0, 7, 1, 8, 2, 9, 3, 10, 4];
const comments = [
  "先从边界落子，看看这盘棋会怎样绕回来。",
  "对手选择了边上，我也留住相邻的一条线。",
  "沿着这条线继续展开，同时观察另一侧。",
  "两侧其实相连，不能只看眼前这一小块。",
  "已经连起三颗，下一手的攻守开始重要了。",
  "这里需要留意黑方的连续线路。",
  "把压力继续放在同一条线上。",
  "这盘棋的关键已经落在上方。",
  "五颗相连，这条路径完成了。"
];

async function originalServer() {
  const base = path.join(ROOT, "app");
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(base, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function ready(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function screenshot(page, name) {
  await ready(page);
  await page.screenshot({ path: path.join(EVIDENCE, name), fullPage: true, animations: "disabled" });
}
async function originalCell(page, cell) {
  const position = await page.locator("#boardCanvas").evaluate((canvas, cell_) => {
    const rect = canvas.getBoundingClientRect();
    const layout = window.TopologyBoardArt.computeLayout(canvas.clientWidth, canvas.clientHeight, { width: 7, height: 6 });
    return { x: rect.x + layout.left + cell_ % 7 * layout.cell, y: rect.y + layout.top + Math.floor(cell_ / 7) * layout.cell };
  }, cell);
  await page.mouse.click(position.x, position.y);
}

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "arena-browser-"));
  const app = await startServer({ port: 0, dataDir: temp, writeRuntime: false });
  const original = await originalServer();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const size = `${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`${app.url}/#host=${app.hostToken}`);
      await page.locator("#create-button").waitFor({ state: "visible" });
      await screenshot(page, `home-${size}.png`);
      assert.equal(new URL(page.url()).hash, "", "host credential must leave address bar");
      await page.locator("#match-title").fill("曲面上的相遇");
      await page.locator("#create-button").click();
      await page.locator("#match").waitFor({ state: "visible" });
      await page.locator('[data-invite="black"]').click();
      await page.locator("#invite-dialog").waitFor({ state: "visible" });
      const invitation = await page.locator("#invite-text").inputValue();
      assert.ok(invitation.includes("arena_join"));
      assert.ok(!invitation.includes(app.hostToken), "role invitation must not contain host token");
      assert.ok(invitation.includes("SKILL.md"));
      await page.locator("#invite-dialog [data-close]").click();
      const gameId = app.arena.call("arena_list").matches[0].gameId;
      const tokens = {};
      for (const [role, name] of [["black", "墨白"], ["white", "听雨"], ["commentator", "场边客"]]) {
        const invite = app.arena.call("arena_invite", { gameId, role }, { hostAuthorized: true });
        tokens[role] = app.arena.call("arena_join", { gameId, inviteToken: invite.inviteToken, name }).token;
      }
      await page.waitForFunction(() => !document.getElementById("start-button").disabled);
      await page.locator("#start-button").click();
      await page.waitForFunction(() => document.getElementById("phase-label").textContent === "正在对弈");
      await screenshot(page, `empty-${size}.png`);
      for (let index = 0; index < sequence.length; index++) {
        const role = index % 2 === 0 ? "black" : "white";
        if (index === 0 || index === 3) app.arena.call("arena_speak", { gameId, token: tokens[role], kind: "thinking", ply: index, text: index === 0 ? "先试试从接缝附近展开。" : "这手把边界串起来了，我要留意另一侧。" });
        app.arena.call("arena_move", { gameId, token: tokens[role], cell: sequence[index], expectedVersion: index, requestId: `qa-${index}`, explanation: comments[index] });
        if (index === 3) {
          app.arena.call("arena_speak", { gameId, token: tokens.commentator, kind: "commentary", ply: 4, text: "双方都在边界附近展开。环面的另一侧并不遥远，接下来要留意跨边界的连线。" });
          await page.waitForFunction(() => document.getElementById("board").getAttribute("aria-label").includes("第 4 手"));
          await screenshot(page, `live-${size}.png`);
          await page.locator("#surface-view").click();
          await page.waitForFunction(() => document.getElementById("view-range").value === "100");
          await screenshot(page, `surface-${size}.png`);
          await page.locator("#flat-view").click();
          await page.locator("#pause-button").click();
          await page.locator("#resume-button").waitFor({ state: "visible" });
          await page.locator("#resume-button").click();
          await page.locator("#pause-button").waitFor({ state: "visible" });
        }
      }
      await page.waitForFunction(() => document.getElementById("phase-label").textContent === "本局已结束");
      await screenshot(page, `ended-${size}.png`);
      const replay = app.arena.call("arena_replay", { gameId });
      assert.equal(replay.winner, "black");
      assert.equal(replay.ply, 9);
      await page.locator("#replay-range").fill("4");
      await page.locator("#replay-range").dispatchEvent("input");
      await page.waitForFunction(() => document.getElementById("board").getAttribute("aria-label").includes("第 4 手"));
      await screenshot(page, `replay-${size}.png`);
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#export-button").click();
      const download = await downloadPromise;
      const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
      assert.ok(!JSON.stringify(exported).includes(tokens.black));
      await page.reload();
      await page.locator("#match").waitFor({ state: "visible" });
      await page.locator("#timeline-button").click();
      await page.locator("#timeline-dialog").waitFor({ state: "visible" });
      assert.ok(await page.locator("#timeline").innerText().then((value) => value.includes(comments[0])));
      await page.locator("#timeline-dialog [data-close]").click();
      const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(geometry.scrollWidth <= geometry.width + 1, `horizontal overflow ${size}`);
      assert.deepEqual(errors, [], `browser errors ${size}`);
      await context.close();

      // Comparable original product evidence: same viewport, torus, duel,
      // first four moves and 2D view. Arena has no pre-existing spectator page.
      const before = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const baseline = await before.newPage();
      await baseline.goto(original.url);
      await ready(baseline);
      await baseline.locator('[data-mode="duel"]').click();
      await screenshot(baseline, `original-home-${size}.png`);
      await baseline.locator('[data-level="2"]').click();
      await baseline.waitForFunction(() => document.getElementById("turnStatus").textContent === "黑方回合");
      await ready(baseline);
      await screenshot(baseline, `original-empty-${size}.png`);
      for (let index = 0; index < 4; index++) {
        await originalCell(baseline, sequence[index]);
        await baseline.waitForFunction((turn) => document.getElementById("turnStatus").textContent === turn, index % 2 === 0 ? "白方回合" : "黑方回合");
      }
      await screenshot(baseline, `original-live-${size}.png`);
      await before.close();
      results.push({ viewport, sequence, errors, geometry, result: "passed" });
    }
    fs.writeFileSync(path.join(EVIDENCE, "verification.json"), JSON.stringify({
      baseline: "76bef39", gameVersion: require("../package.json").version,
      serviceVersion: require("../arena/package.json").version,
      fixture: "Deterministic scripted players and commentary; not a model strength comparison.",
      checks: ["host URL fragment removed", "invitation excludes host token", "live SSE", "2D/3D", "pause/resume", "terminal result", "replay scrub", "credential-free export", "reload recovery", "no horizontal overflow", "no browser errors"],
      results
    }, null, 2) + "\n");
    console.log(`Arena browser QA passed: ${results.length} viewports. Evidence: artifacts/arena/`);
  } finally {
    await browser.close();
    await app.close();
    await new Promise((resolve) => original.server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

"use strict";

// Native Canvas calibration in Chromium; official simulator and phone checks are separate.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const version = require("../package.json").version;
const output = path.join(root, "artifacts/ui-parity");
const current = process.env.WECHAT_QA_URL || "http://127.0.0.1:4394";
const baseline = process.env.WECHAT_QA_BASELINE;

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [revision, url] of [["before", baseline], ["after", current]]) {
      if (!url) continue;
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(url + "/tools/wechat-native-preview/");
      await page.waitForFunction(() => document.documentElement.dataset.previewReady === "true");
      for (let level = 0; level < 7; level++) {
        await page.evaluate(level => {
          const { controller, renderer } = __wechatPreview;
          controller.startLevel(level, { mode: "duel", introMode: "none" }, Date.now() - 4000);
          renderer.transition = null;
        }, level);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.waitForFunction(() => __wechatPreview.renderer.hitRect("board"));
        const positions = await page.evaluate(() => {
          const { controller, renderer } = __wechatPreview;
          const rules = controller.game.rules;
          const cells = [0, rules.width - 1, rules.cellCount - rules.width, rules.cellCount - 1];
          return cells.map(cell => {
            const p = TopologyBoardArt.cellCenter(rules, renderer.boardLayout, cell);
            return { cell, x: renderer.boardRect.x + p.x, y: renderer.boardRect.y + p.y };
          });
        });
        for (const p of positions) await page.mouse.click(p.x, p.y);
        const moves = await page.evaluate(() => __wechatPreview.controller.game.moves);
        assert.deepEqual(moves.map(move => move.cell + 0), positions.map(p => p.cell));
        assert.deepEqual(moves.map(move => move.player), [1, -1, 1, -1]);
        const type = await page.evaluate(() => __wechatPreview.controller.game.level.topology);
        const screenshots = [];
        for (const progress of (level ? [0, 0.5, 1] : [0])) {
          await page.evaluate(progress => __wechatPreview.controller.setViewProgress(progress, false, Date.now()), progress);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const name = `wechat-${revision}-${type}-${progress}-390x844-v${version}.png`;
          await page.screenshot({ path: path.join(output, name) });
          screenshots.push(`artifacts/ui-parity/${name}`);
        }
        if (level) {
          const point = await page.evaluate(() => {
            const { controller, renderer } = __wechatPreview;
            const game = controller.game;
            const pose = renderer.completionPose(game, Date.now());
            for (let cell = 0; cell < game.rules.cellCount; cell++) {
              if (game.board[cell]) continue;
              const p = TopologyBoardArt.mappedCompletionPoint(game, renderer.boardLayout,
                TopologyBoardArt.cellCenter(game.rules, renderer.boardLayout, cell),
                TopologyMorph.stoneUV(game.rules, cell), { ...pose.orientation, morph: 1 });
              const x = p.x + renderer.boardRect.x, y = p.y + renderer.boardRect.y;
              if (renderer.boardCellAt(x, y) === cell) return { x, y, cell };
            }
            return null;
          });
          assert.ok(point, `${type}: projected target`);
          await page.mouse.click(point.x, point.y);
          const last = await page.evaluate(() => __wechatPreview.controller.game.moves.at(-1));
          assert.equal(last.cell, point.cell);
          await page.evaluate(() => __wechatPreview.controller.setViewProgress(0, false, Date.now()));
        }
        results.push({ revision, level, type, cornerMoves: moves, projectedClick: level > 0, screenshots });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    fs.writeFileSync(path.join(output, `wechat-browser-v${version}-results.json`), JSON.stringify({
      version, runtime: "Chromium native Canvas calibration; not WeChat simulator", viewport: { width: 390, height: 844 }, results,
    }, null, 2) + "\n");
    console.log(`Native Canvas calibration passed: ${results.length} topology runs.`);
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });

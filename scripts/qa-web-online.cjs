// Inspect an actual deployment against dist/web, without modifying server content.
// Supply Playwright via NODE_PATH, then run with <url> <version>.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const [url, version] = process.argv.slice(2);
assert.ok(url && /^\d+\.\d+\.\d+$/.test(version));
const out = path.join(root, 'artifacts', 'release-web-' + version);
fs.mkdirSync(out, { recursive: true });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
(async () => {
  const proxy = process.env.QA_WEB_PROXY;
  const browser = await chromium.launch({ headless: true, ...(proxy ? { proxy: { server: proxy } } : {}) });
  const results = [];
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true });
      await context.addInitScript(() => localStorage.setItem('topology-gomoku:v1', JSON.stringify({ unlocked: 6, learnedLevels: [0, 1, 2, 3, 4, 5, 6], sound: false, hints: false, mode: 'duel' })));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('html').getAttribute('data-host-platform'), 'web');
      const hashes = {};
      for (const name of ['board-art.js', 'topology-morph.js', 'board-view-motion.js', 'game.js']) {
        const bytes = await page.evaluate(async name => Array.from(new Uint8Array(await (await fetch('./assets/' + name, { cache: 'no-store' })).arrayBuffer())), name);
        hashes[name] = hash(Buffer.from(bytes));
        assert.equal(hashes[name], hash(fs.readFileSync(path.join(root, 'dist/web/assets', name))), name + ' deployment differs');
      }
      await page.locator('[data-mode="duel"]').click();
      const games = [];
      for (const [index, topology] of [[2, 'torus'], [3, 'mobius'], [5, 'projective'], [6, 'sphere']]) {
        await page.locator('[data-level="' + index + '"]').click();
        await page.waitForFunction(() => document.getElementById('turnStatus').textContent === '黑方回合' && !document.getElementById('appShell').classList.contains('is-navigating'));
        const geometry = await page.evaluate(topology => {
          const c = document.querySelector('#boardCanvas'), r = c.getBoundingClientRect();
          const level = TopologyGameContent.LEVELS.find(l => l.topology === topology);
          return { level, layout: TopologyBoardArt.computeLayout(c.clientWidth, c.clientHeight, level), x: r.x, y: r.y };
        }, topology);
        for (const [x, y, turn] of [[3, 2, '白方回合'], [4, 2, '黑方回合']]) {
          await page.touchscreen.tap(geometry.x + geometry.layout.left + x * geometry.layout.cell, geometry.y + geometry.layout.top + y * geometry.layout.cell);
          await page.locator('#turnStatus').filter({ hasText: turn }).waitFor();
        }
        for (const progress of [0.5, 1]) {
          await page.locator('#dimensionSlider').evaluate((el, p) => { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }, progress);
          await page.waitForTimeout(500);
        }
        await page.screenshot({ path: path.join(out, `online-${viewport.width}-${topology}-3d.png`) });
        const canvas = await page.locator('#boardCanvas').boundingBox();
        await page.mouse.move(canvas.x + canvas.width * 0.4, canvas.y + canvas.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(canvas.x + canvas.width * 0.65, canvas.y + canvas.height * 0.6, { steps: 16 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(out, `online-${viewport.width}-${topology}-rotated.png`) });
        for (const progress of [0, 1, 0]) {
          await page.locator('#dimensionSlider').evaluate((el, p) => { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }, progress);
          await page.waitForTimeout(400);
        }
        assert.equal(await page.locator('#turnStatus').innerText(), '黑方回合');
        games.push({ topology, moves: 2, rotation: true, morph: [0.5, 1, 0, 1, 0] });
        await page.locator('#backButton').click();
        await page.waitForTimeout(400);
      }
      assert.deepEqual(errors, []);
      results.push({ viewport, hashes, games, errors });
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'online-results.json'), JSON.stringify({ url, results }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, viewports: results.length, games: results.reduce((n, r) => n + r.games.length, 0) }));
})().catch(e => { console.error(e); process.exitCode = 1; });

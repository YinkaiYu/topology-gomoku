// Validate the uploaded Toy in its real cross-origin host, with no SDK interception.
// Usage: node scripts/qa-toy-release.cjs <preview-url> <version>
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const [url, version] = process.argv.slice(2);
assert.ok(url && /^\d+\.\d+\.\d+$/.test(version), 'preview URL and version required');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => localStorage.setItem('topology-gomoku:v1', JSON.stringify({ unlocked: 6, learnedLevels: [0, 1, 2, 3, 4, 5, 6], sound: false, hints: false, mode: 'duel' })));
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const frameElement = page.locator('iframe').first();
      await frameElement.waitFor();
      const frame = await (await frameElement.elementHandle()).contentFrame();
      await frame.locator('[data-level="6"]').waitFor();
      const hashes = {};
      for (const name of ['board-art.js', 'topology-morph.js', 'game.js', 'bilibili-adapter.js']) {
        const bytes = await frame.evaluate(async name => Array.from(new Uint8Array(await (await fetch('./assets/' + name)).arrayBuffer())), name);
        hashes[name] = hash(Buffer.from(bytes));
        assert.equal(hashes[name], hash(fs.readFileSync(path.join(root, 'app/assets', name))), name + ' uploaded source differs');
      }
      await frame.locator('[data-mode="duel"]').click();
      for (const [level, name] of [[2, 'torus'], [3, 'mobius'], [5, 'projective'], [6, 'sphere']]) {
        await frame.locator('[data-level="' + level + '"]').click();
        await page.waitForTimeout(900);
        await frame.locator('#boardCanvas').focus();
        await page.keyboard.press('Enter');
        await frame.locator('#turnStatus').filter({ hasText: '白方回合' }).waitFor();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        await frame.locator('#turnStatus').filter({ hasText: '黑方回合' }).waitFor();
        for (const progress of [0, 0.5, 1, 0]) {
          await frame.locator('#dimensionSlider').evaluate((el, p) => { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }, progress);
          await page.waitForTimeout(450);
          if (progress === 0.5 || progress === 1) await page.screenshot({ path: path.join(root, 'artifacts', `qa-toy-${version}-${name}-${progress}-${viewport.width}x${viewport.height}.png`) });
        }
        await frame.locator('#backButton').click();
        await page.waitForTimeout(500);
      }
      assert.deepEqual(errors, []);
      results.push({ viewport, frameUrl: frame.url(), hashes, topologies: ['torus', 'mobius', 'projective', 'sphere'], keyboardDuel: true, morph: [0, 0.5, 1, 0], errors });
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(root, 'artifacts', `qa-toy-${version}-preview-results.json`), JSON.stringify({ url, results }, null, 2) + '\n');
  console.log(JSON.stringify({ url, scenarios: results.length, passed: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const output = 'artifacts/klein-unfold';
const modules = ['topology', 'topology-morph', 'board-view-logic', 'level-config', 'board-art'];

async function gallery(page, revision, type, times, suffix, withMoves = false) {
  const width = 400, height = withMoves ? 400 : 370, columns = times.length === 3 ? 3 : 4;
  await page.setViewportSize({ width: width * columns, height: Math.ceil(times.length / columns) * (height + 30) });
  await page.evaluate(({ type, times, width, height, columns, withMoves }) => {
    document.body.replaceChildren();
    document.body.style.gridTemplateColumns = `repeat(${columns},${width}px)`;
    for (const t of times) {
      const cell = document.createElement('div'), canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height; cell.append(canvas);
      const label = document.createElement('div');
      label.textContent = Math.round(t * 100) + '%'; label.style.textAlign = 'center';
      cell.append(label); document.body.append(cell);
      const rules = TopologyGomoku.createRules({ type, width: 7, height: 7 });
      const level = TopologyGameContent.LEVELS.find(l => l.topology === type);
      const game = { level, rules, board: new Int8Array(49), lastMove: -1 };
      if (withMoves) {
        [23, 24, 17, 18, 9, 16, 25, 33, 8, 11, 15, 26, 1, 0, 7, 22, 10]
          .forEach((c, i) => game.board[c] = i % 2 ? -1 : 1);
        game.lastMove = 10; game.winAt = 0;
        game.winningMask = TopologyGomoku.checkWin(game.board, rules, 10, 1);
      }
      TopologyBoardArt.drawCompletion(canvas.getContext('2d'), {
        game, layout: TopologyBoardArt.computeLayout(width, height, rules),
        morph: t, time: 20000, rotation: { x: 0, y: 0, z: 0 }
      });
    }
  }, { type, times, width, height, columns, withMoves });
  await page.screenshot({ path: `${output}/${revision}${suffix}.png` });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const revision of ['before', 'after']) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
      await page.setContent('<body style="margin:0;background:#f2efe7;display:grid"></body>');
      for (const name of modules) {
        await page.addScriptTag({ content: revision === 'before'
          ? execFileSync('git', ['show', `f18967c:app/assets/${name}.js`], { encoding: 'utf8' })
          : fs.readFileSync(`app/assets/${name}.js`, 'utf8') });
      }
      const stages = [0, .2, .4, .48, .6, .75, .9, 1];
      await gallery(page, revision, 'klein', stages, '');
      await gallery(page, revision, 'projective', stages, '-projective');
      const closing = [.6, .7, .75, .8, .85, .9, .95, 1];
      await gallery(page, revision, 'klein', closing, '-klein-closing');
      await gallery(page, revision, 'projective', closing, '-projective-closing');
      await gallery(page, revision, 'sphere', [.6, .85, 1], '-sphere-win', true);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

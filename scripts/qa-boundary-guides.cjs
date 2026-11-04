"use strict";
const { chromium } = require("playwright");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, ".."), EVIDENCE = path.join(ROOT, "artifacts/boundary-guides");
const before = execFileSync("git", ["show", "76bef39:app/assets/board-art.js"], { cwd: ROOT });
(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, "http://localhost").pathname;
    if (name === "/before.js") { response.setHeader("Content-Type", "text/javascript"); response.end(before); return; }
    if (name === "/") { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><style>body{margin:0;background:#f2efe7}canvas{display:block}</style><canvas width="800" height="600"></canvas></html>'); return; }
    const filename = path.resolve(ROOT, "app", "." + name), allowed = path.join(ROOT, "app", "assets") + path.sep;
    if (!filename.startsWith(allowed) || !fs.existsSync(filename)) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", "text/javascript"); response.end(fs.readFileSync(filename));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true }), url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const topology of ["mobius", "torus", "sphere"]) for (const version of ["before", "after"]) {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(url);
      for (const name of ["topology.js", "topology-morph.js", "level-config.js"]) await page.addScriptTag({ url: `${url}/assets/${name}` });
      await page.addScriptTag({ url: version === "before" ? `${url}/before.js` : `${url}/assets/board-art.js` });
      await page.evaluate(topology => {
        const rules = TopologyGomoku.createRules({ type: topology, width: 7, height: 7 });
        const board = TopologyGomoku.createBoard(rules); board[24] = 1; board[25] = -1;
        const game = { level: TopologyGameContent.LEVELS.find(level => level.topology === topology), rules, board, lastMove: -1 };
        const layout = TopologyBoardArt.computeLayout(800, 600, rules);
        TopologyBoardArt.drawBoard(document.querySelector("canvas").getContext("2d"), { game, layout, extendGridToRails: true });
      }, topology);
      await page.screenshot({ path: path.join(EVIDENCE, `${topology}-${version}.png`) });
      assert.deepEqual(errors, []); await page.close();
    }
    console.log("Boundary guide browser QA passed: three topologies, same viewport and position.");
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

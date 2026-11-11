"use strict";

// Actual H5 renderer, fixed user-supplied positions. Playwright comes from NODE_PATH.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "artifacts/stone-self-intersection");
const BASE = "973a688";
const ARGS = process.argv.slice(2);
const value = (name, fallback) => (ARGS.find(arg => arg.startsWith(name + "=")) || (name + "=" + fallback)).split("=").slice(1).join("=");
const POSE = { x: 0.3059888279294755, y: 1.441001176914942, z: 0.013434785524945675 };
const FIXTURES = {
  full: { black: [5, 9, 15, 17, 22, 23, 25, 26, 39, 41], white: [1, 7, 12, 16, 18, 19, 24, 29, 31, 36], last: 12 },
  two: { black: [12], white: [30], last: 30 },
  single: { black: [17], white: [], last: 17 }
};
const HOOK = `window.stoneQA = {
  start: function(index, fixture) {
    prefs.sound = false; prefs.hints = false;
    startLevel(index, {mode: "duel", skipDemo: true});
    game.demo = null; game.lesson = null; game.completion = null; game.board.fill(0);
    var pieces = ${JSON.stringify(FIXTURES)}[fixture || "full"];
    pieces.black.forEach(function(c) { game.board[c] = HUMAN; });
    pieces.white.forEach(function(c) { game.board[c] = AI; });
    game.lastMove = pieces.last;
    renderState.lastMoveAt = 0; renderState.hoverCell = -1; renderState.pressedCell = -1;
    game.view = createInteractiveViewState(); resizeCanvas();
  },
  draw: function(morph, yaw) {
    game.view.progress = morph;
    game.view.rotation = Object.assign({}, ${JSON.stringify(POSE)}, yaw === undefined ? {} : {y: yaw});
    syncGameTools(); drawBoard(20000);
  },
  probe: function() {
    var ctx = renderState.context, canvas = dom.boardCanvas;
    var point = {x: renderState.width / 2, y: renderState.height / 2, depth: 0, scale: 1, depthScale: 150};
    var radius = 20, savedDepth = renderState.depthBuffer;
    function sheet(z, half) {
      var left = half ? point.x : point.x - 60;
      return {points: [[left, point.y - 60], [point.x + 60, point.y - 60],
        [point.x + 60, point.y + 60], [left, point.y + 60]].map(function(p) { return {x:p[0], y:p[1], depth:z}; })};
    }
    var rows = [];
    [["front", [sheet(-2)]], ["one", [sheet(2)]], ["two", [sheet(2), sheet(1)]],
      ["two-reversed", [sheet(1), sheet(2)]], ["partial", [sheet(2, true)]]].forEach(function(spec) {
      [HUMAN, AI].forEach(function(player) {
        ctx.clearRect(0, 0, renderState.width, renderState.height);
        var depth = Morph.createDepthBuffer(renderState.width, renderState.height, spec[1]);
        depth.translucency = .16; renderState.depthBuffer = depth;
        var contours = Morph.stoneContours(depth, point, radius);
        drawCompletionStone(ctx, {cell:-2, player:player, point:point}, radius, false, 1, 20000);
        var ratio = canvas.width / renderState.width;
        function pixel(dx) { return Array.from(ctx.getImageData(Math.floor((point.x + dx) * ratio), Math.floor(point.y * ratio), 1, 1).data); }
        rows.push({cover:spec[0], player:player, contours:contours === null ? null : contours.length,
          left:pixel(-8), center:pixel(0), right:pixel(8)});
      });
    });
    renderState.depthBuffer = savedDepth;
    drawBoard(20000);
    return {userAgent:navigator.userAgent, dpr:devicePixelRatio, rows:rows};
  }
};`;
const AUTO = `
(function() {
  var params = new URLSearchParams(location.search);
  if (!params.has("fixture")) return;
  var fixture = ["two", "single"].indexOf(params.get("fixture")) >= 0 ? params.get("fixture") : "full";
  var level = Number(params.get("level") || 4);
  if (level < 1 || level > 6) level = 4;
  stoneQA.start(level, fixture);
  setTimeout(function() {
    stoneQA.draw(1, fixture === "single" ? 0 : undefined);
    requestAnimationFrame(function() {
      var report = stoneQA.probe(); report.revision = location.pathname.indexOf("/before/") === 0 ? "before" : "after";
      fetch("/qa-results", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(report)});
    });
  }, 200);
})();`;
function packagePreview() {
  // Diagnostic-only copy, never shipped in app/: real H5 painting with an A/B
  // switch. No network requests or changes to the existing published app.
  const directory = path.join(ROOT, ".tmp/stone-phone/app");
  fs.mkdirSync(directory, {recursive:true});
  fs.cpSync(path.join(ROOT, "app"), directory, {recursive:true});
  const original = execFileSync("git", ["show", `${BASE}:app/assets/topology-morph.js`], {cwd:ROOT, encoding:"utf8"});
  fs.writeFileSync(path.join(directory, "assets/topology-morph-before.js"), original.replace("root.TopologyMorph = api", "root.TopologyMorphBefore = api"));
  const entry = path.join(directory, "index.html");
  fs.writeFileSync(entry, fs.readFileSync(entry, "utf8").replace('<script src="./assets/game.js">', '<script src="./assets/topology-morph-before.js"></script>\n  <script src="./assets/game.js">'));
  const setup = `
  var fixedPaint = Morph.paintStone, originalPaint = window.TopologyMorphBefore.paintStone;
  var bar = document.createElement("div");
  bar.style.cssText = "position:fixed;bottom:env(safe-area-inset-bottom,0px);left:0;right:0;z-index:999;display:flex;align-items:center;justify-content:center;gap:12px;height:44px;background:rgba(242,239,231,.95);font:12px Topo Serif,serif";
  document.body.appendChild(bar);
  function action(label, fn) { var button = document.createElement("button"); button.textContent = label;
    button.style.cssText = "font:inherit;border:0;background:transparent;padding:8px 2px;color:#21302c";
    button.addEventListener("click", fn); bar.appendChild(button); return button; }
  var active = "B", status = document.createElement("span");
  function mode(value) { active = value; Morph.paintStone = value === "A" ? originalPaint : fixedPaint;
    status.textContent = value; requestRender(); }
  action("A", function() { mode("A"); }); action("B", function() { mode("B"); });
  [[1,"回廊"],[2,"环游"],[4,"瓶界"],[5,"双生"]].forEach(function(spec) {
    action(spec[1], function() { stoneQA.start(spec[0], spec[0] === 1 ? "single" : "full");
      setTimeout(function() { stoneQA.draw(1, spec[0] === 1 ? 0 : undefined); mode(active); }, 200); });
  });
  bar.appendChild(status); mode("B");
  stoneQA.start(4, "full");
  setTimeout(function() {
    stoneQA.draw(1);
    Morph.paintStone = originalPaint; var a = stoneQA.probe().rows[2].center[3];
    Morph.paintStone = fixedPaint; var b = stoneQA.probe().rows[2].center[3];
    var reading = document.createElement("div"); reading.textContent = "A " + a + " / B " + b;
    reading.style.cssText = "position:fixed;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 44px);font:12px Topo Serif,serif;color:#21302c";
    document.body.appendChild(reading); mode("B");
  }, 200);`;
  const source = fs.readFileSync(path.join(ROOT, "app/assets/game.js"), "utf8");
  fs.writeFileSync(path.join(directory, "assets/game.js"), source.replace("  initialize();", HOOK + "\n  initialize();\n" + setup));
  fs.writeFileSync(path.join(directory, "mini_tool.json"), '{"is_high_consumption_scene":false}\n');
  console.log(directory);
}
const cache = new Map();
function resource(file, before) {
  if (ARGS.includes("--phone-preview")) return fs.readFileSync(path.join(ROOT, ".tmp/stone-phone/app", file));
  if (!before) return fs.readFileSync(path.join(ROOT, "app", file));
  if (!cache.has(file)) cache.set(file, execFileSync("git", ["show", `${BASE}:app/${file}`], {cwd:ROOT, maxBuffer:8e6}));
  return cache.get(file);
}
function serve() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/qa-results" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; if (body.length > 16384) req.destroy(); });
      req.on("end", () => {
        try {
          const report = JSON.parse(body);
          fs.mkdirSync(path.join(ROOT, ".tmp"), {recursive:true});
          fs.appendFileSync(path.join(ROOT, ".tmp/stone-phone-results.jsonl"), JSON.stringify(report) + "\n");
          console.log(JSON.stringify({revision:report.revision, userAgent:report.userAgent, rows:report.rows}));
          res.writeHead(204).end();
        } catch { res.writeHead(400).end(); }
      });
      return;
    }
    const before = url.pathname.startsWith("/before/");
    const file = decodeURIComponent(before ? url.pathname.slice(8) : url.pathname.slice(1)) || "index.html";
    if (file.includes("..") || file.includes("\\")) { res.writeHead(403).end(); return; }
    if (file === "favicon.ico") { res.writeHead(204).end(); return; }
    try {
      let body = resource(file, before);
      if (file === "assets/game.js" && !ARGS.includes("--phone-preview")) body = body.toString().replace("  initialize();", HOOK + "\n  initialize();\n" + AUTO);
      res.setHeader("Content-Type", ({".html":"text/html;charset=utf-8", ".js":"text/javascript", ".css":"text/css", ".woff2":"font/woff2", ".svg":"image/svg+xml"})[path.extname(file)] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
}
async function run() {
  const server = serve();
  await new Promise(resolve => server.listen(Number(value("--port", ARGS.includes("--serve") ? 4335 : 0)), value("--host", "127.0.0.1"), resolve));
  if (ARGS.includes("--serve")) { console.log(`Preview: http://127.0.0.1:${server.address().port}/?fixture=full`); return; }
  const engine = ARGS.includes("--webkit") ? "webkit" : "chromium";
  const browser = await require("playwright")[engine].launch({headless:true});
  fs.mkdirSync(OUT, {recursive:true});
  const results = [];
  try {
    for (const revision of ["before", "after"]) {
      const page = await browser.newPage({viewport:{width:390, height:844}, deviceScaleFactor:3, reducedMotion:"reduce"});
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(() => {
        window.requestAnimationFrame = () => 0;
        localStorage.setItem("topology-gomoku:v1", JSON.stringify({unlocked:6, learnedLevels:[0,1,2,3,4,5,6], sound:false, hints:false, mode:"duel"}));
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/${revision === "before" ? "before/" : ""}`);
      await page.evaluate(() => document.fonts.ready);
      for (const index of [1, 2, 4, 5]) {
        await page.evaluate(index => { stoneQA.start(index, index === 1 ? "single" : "full"); stoneQA.draw(1, index === 1 ? 0 : undefined); }, index);
        const probe = await page.evaluate(() => stoneQA.probe());
        for (const row of probe.rows) {
          if (row.cover === "front") assert.equal(row.center[3], 255);
          else if (row.cover === "partial") {
            assert.equal(row.left[3], 255);
            assert.ok(row.right[3] >= 39 && row.right[3] <= 43);
          } else assert.ok(row.center[3] >= 39 && row.center[3] <= (revision === "before" ? 52 : 43), `${engine}/${revision}/${row.cover}: ${row.center}`);
        }
        const png = await page.evaluate(() => {
          var source = document.getElementById("boardCanvas");
          var canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
          var ctx = canvas.getContext("2d"); ctx.fillStyle = "#f2efe7"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(source,0,0);
          return canvas.toDataURL();
        });
        const file = `${revision}-${engine}-${index}.png`;
        fs.writeFileSync(path.join(OUT, file), Buffer.from(png.split(",")[1], "base64"));
        results.push({revision, level:index, probe, screenshot:file});
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    const sources = Object.fromEntries(["game", "board-art", "topology-morph"].map(name => [name, createHash("sha256").update(fs.readFileSync(path.join(ROOT, "app/assets", name + ".js"))).digest("hex")]));
    fs.writeFileSync(path.join(OUT, `results-${engine}.json`), JSON.stringify({baseline:BASE, sources, viewport:{width:390,height:844,dpr:3}, pose:POSE, fixtures:FIXTURES, results}, null, 2) + "\n");
    console.log(JSON.stringify({engine, states:results.length, pixelProbes:results.length * 10}));
  } finally { await browser.close(); server.close(); }
}
if (ARGS.includes("--package-preview")) packagePreview();
else run().catch(error => {console.error(error); process.exitCode=1;});

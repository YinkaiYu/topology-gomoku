"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

test("Bilibili Toy SDK 通过独立 adapter 接入", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const adapter = fs.readFileSync(path.join(ROOT, "app", "assets", "bilibili-adapter.js"), "utf8");
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(html, /\/\/s1\.hdslb\.com\/bfs\/seed\/toy\/app\/sdk\/toy-sdk\.js/);
  assert.match(html, /\.\/assets\/bilibili-adapter\.js\?v=1\.35\.2/);
  assert.match(adapter, /isSupport\("onContainerChange"\)/);
  assert.match(adapter, /onContainerChange\(applyContainerState\)/);
  assert.match(adapter, /requestContainerMode\(false\)/);
  assert.match(adapter, /setContainerMode\(\{ orientation: "auto", immersive: enabled \}\)/);
  assert.doesNotMatch(adapter, /immersive: true/);
  assert.match(html, /id="immersiveSwitch"[\s\S]*aria-checked="false"/);
  assert.match(adapter, /setImmersive: function setImmersive\(enabled\)/);
  assert.match(game, /immersive:\s*false/);
  assert.match(game, /defaults\.immersive = stored\.immersive === true/);
  assert.match(game, /bindLiquidSwitch\(dom\.immersiveSwitch/);
  assert.match(adapter, /--safe-area-inset-left/);
  assert.match(adapter, /--toy-viewport-height/);
});

test("三档、动态视口、安全区和输入能力均有确定性适配", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(style, /height:\s*100dvh/);
  assert.match(style, /--safe-right:/);
  assert.match(style, /--safe-left:/);
  assert.match(style, /@media \(min-width: 700px\) and \(max-width: 1099px\)/);
  assert.match(style, /@media \(min-width: 1100px\)/);
  assert.match(style, /@media \(orientation: landscape\) and \(max-height: 560px\)/);
  assert.match(style, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(html, /id="boardCanvas"[\s\S]*tabindex="0"[\s\S]*role="application"/);
  assert.match(game, /function onBoardKeyDown\(/);
  assert.match(game, /event\.key !== "Enter"/);
  assert.match(game, /window\.addEventListener\("toycontainerchange", resizeCanvas\)/);
});

test("Toy 封面是可追溯的 1200x900 确定性导出", () => {
  const coverPath = path.join(ROOT, "promo", "exports", "topology-gomoku-toy-cover-4x3.png");
  const cover = fs.readFileSync(coverPath);
  assert.equal(cover.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(cover.readUInt32BE(16), 1200);
  assert.equal(cover.readUInt32BE(20), 900);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "promo", "toy-cover-manifest.json"), "utf8"));
  const provenance = JSON.parse(fs.readFileSync(path.join(ROOT, "promo", "toy-cover-provenance.json"), "utf8"));
  assert.equal(manifest.output, "exports/topology-gomoku-toy-cover-4x3.png");
  assert.equal(manifest.dimensions.ratio, "4:3");
  assert.equal(provenance.generatedBackground.tool, "built-in image generation");
});

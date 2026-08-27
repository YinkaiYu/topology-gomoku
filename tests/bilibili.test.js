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
  assert.match(html, /\.\/assets\/bilibili-adapter\.js\?v=1\.35\.2-bili\.1/);
  assert.match(adapter, /onContainerChange\(applyContainerState\)/);
  assert.match(adapter, /supports\("onContainerChange", "onContainerChange"\)/);
  assert.match(adapter, /supports\("getContainerState", "getContainerState"\)/);
  assert.match(adapter, /supports\("setContainerMode", "setContainerMode"\)/);
  assert.match(adapter, /setContainerMode\(\{ immersive: enabled \}\)/);
  assert.doesNotMatch(adapter, /orientation: "auto"/);
  assert.doesNotMatch(adapter, /immersive: true/);
  assert.match(html, /id="immersiveSwitch"[\s\S]*aria-checked="false"/);
  assert.match(adapter, /setImmersive: function setImmersive\(enabled\)/);
  assert.match(game, /immersive:\s*false/);
  assert.match(game, /defaults\.immersive = stored\.immersive === true/);
  assert.match(game, /bindLiquidSwitch\(dom\.immersiveSwitch/);
  assert.match(adapter, /--safe-area-inset-left/);
  assert.match(adapter, /--toy-viewport-height/);
});

test("沉浸模式及兼容性备注使用完整的本地字体子集", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  const font = fs.readFileSync(path.join(ROOT, "app", "assets", "fonts", "noto-serif-sc-immersive.woff2"));

  assert.match(html, /class="setting-label setting-label-immersive">[\s\S]*沉浸模式[\s\S]*class="setting-label-note">（仅新版B站APP支持）<\/small>/);
  assert.match(style, /font-family:\s*"Topo Serif Immersive"/);
  assert.match(style, /\.setting-label-note\s*\{[^}]*color:\s*var\(--muted\)[^}]*font-size:\s*9px/s);
  assert.match(style, /noto-serif-sc-immersive\.woff2\?v=1\.35\.2-bili\.2/);
  assert.equal(font.toString("ascii", 0, 4), "wOF2");
  assert.ok(font.length > 2000);
});

test("沉浸切换不依赖容器状态监听能力", async () => {
  const vm = require("node:vm");
  const adapter = fs.readFileSync(path.join(ROOT, "app", "assets", "bilibili-adapter.js"), "utf8");
  const requestedModes = [];
  const root = { dataset: {}, style: { setProperty() {} } };
  const windowStub = {
    innerHeight: 844,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    toy: {
      async isSupport(ability) {
        return ability === "setContainerMode";
      },
      async setContainerMode(mode) {
        requestedModes.push(mode);
      }
    }
  };

  vm.runInNewContext(adapter, {
    window: windowStub,
    document: { documentElement: root },
    CustomEvent: function CustomEvent() {}
  });

  const applied = await windowStub.BilibiliToyPlatform.setImmersive(true);
  assert.equal(applied, true);
  assert.equal(requestedModes.length, 1);
  assert.equal(requestedModes[0].immersive, true);
  assert.deepEqual(Object.keys(requestedModes[0]), ["immersive"]);
  assert.equal(root.dataset.toyImmersiveRequested, "true");
  assert.equal(root.dataset.toyContainer, "bilibili-app");
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
  assert.equal(manifest.safeArea, undefined);
  assert.equal(provenance.generatedBackground.tool, "built-in image generation");
});

test("Toy 封面仅以超大标题和超大主图标使用完整横版画布", () => {
  const script = fs.readFileSync(path.join(ROOT, "scripts", "compose_toy_cover.py"), "utf8");
  assert.match(script, /title = "拓扑五子棋"/);
  assert.match(script, /ImageFont\.truetype\(str\(TITLE_FONT\), 172\)/);
  assert.match(script, /title_y = 624/);
  assert.match(script, /brand\.thumbnail\(\(650, 650\)/);
  assert.match(script, /brand_y = -8/);
  assert.doesNotMatch(script, /SAFE_BOX|safe area|square crop/i);
  assert.doesNotMatch(script, /世界之外|也能连成一线|中国科学院物理研究所/);
});

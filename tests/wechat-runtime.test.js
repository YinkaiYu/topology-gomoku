"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const WECHAT_ROOT = path.join(ROOT, "wechat");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, ...relativePath.split("/")), "utf8");
}

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return javascriptFiles(target);
    }
    return entry.name.endsWith(".js") ? [target] : [];
  });
}

test("微信入口先建立 GameGlobal 兼容层，再按依赖顺序创建唯一上屏 Canvas", () => {
  const entry = read("wechat/game.js");
  const imports = [...entry.matchAll(/^import ['"]([^'"]+)['"];$/gm)].map((match) => match[1]);
  assert.deepEqual(imports.slice(0, 7), [
    "./js/platform/runtime-global",
    "./js/shared/topology",
    "./js/shared/topology-morph",
    "./js/shared/game-replay",
    "./js/shared/level-config",
    "./js/shared/game-controller",
    "./js/shared/board-art",
  ]);
  assert.equal((entry.match(/GameGlobal\.canvas = wx\.createCanvas\(\)/g) || []).length, 1);
  assert.match(entry, /GameGlobal\.canvas = wx\.createCanvas\(\)/);
  assert.match(read("wechat/js/platform/runtime-global.js"), /GameGlobal\.globalThis = GameGlobal/);
});

test("微信原生层不引入 DOM、Web Storage、WebView 或网络请求", () => {
  const combined = javascriptFiles(WECHAT_ROOT)
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(combined, /\bdocument\b|\blocalStorage\b|\bsessionStorage\b|web-view|\bfetch\s*\(|\bwx\.request\s*\(/i);
  const outsideBootstrap = javascriptFiles(WECHAT_ROOT)
    .filter((file) => !file.endsWith(path.join("platform", "runtime-global.js")))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(outsideBootstrap, /\bglobalThis\b/);
});

test("原生目录保留图鉴揭示、三等分设置与液态开关语义", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const main = read("wechat/js/main.js");
  assert.match(renderer, /const revealed = index === 0 \|\| completed/);
  assert.match(renderer, /drawTopologySilhouette/);
  assert.match(renderer, /Math\.floor\(local \* 3\)/);
  assert.match(renderer, /this\.register\('settings-sheet', this\.sheetRect, \{ action: 'none' \}\)/);
  assert.match(renderer, /contentBounds\(maxWidth = 520\)/);
  assert.match(renderer, /const boardSize = Math\.min\(520, content\.width, availableBoardHeight\)/);
  assert.match(renderer, /if \(game\.autoAdvancePending\) \{\s*return;/s);
  assert.match(renderer, /disabled: game\.status !== 'playing'[\s\S]*game\.demo && game\.demo\.active/);
  assert.match(main, /this\.interaction\.switchMoved\s*\?\s*this\.interaction\.previewSwitch\s*:\s*!this\.interaction\.switchStartValue/s);
  assert.match(main, /if \(this\.renderer\.transition \|\| this\.interaction\.touchId !== null\) \{/);
});

test("终局曲面使用正反形变、接缝胜线与 settled 输入锁", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const boardArt = read("app/assets/board-art.js");
  assert.match(renderer, /phase: 'presenting'/);
  assert.match(renderer, /phase: 'returning'/);
  assert.match(renderer, /morph: 1 - GameGlobal\.TopologyMorph\.smooth\(progress\)/);
  assert.match(renderer, /return Boolean\(pose && pose\.settled\)/);
  assert.match(boardArt, /Engine\.step\(game\.rules, cells\[index\], direction\)/);
  assert.match(boardArt, /Morph\.seamBridgeUV\(/);
});

test("帧循环在静止场景休眠，并嵌套冻结弹层与生命周期计时", () => {
  const main = read("wechat/js/main.js");
  const controller = read("app/assets/game-controller.js");
  assert.match(main, /const nextScheduledAt = this\.controller\.nextScheduledAt\(\)/);
  assert.match(main, /if \(this\.pauseReasons\.size\) \{\s*return null;/);
  assert.doesNotMatch(main, /state\.scene === ['"]home['"]\) \{\s*return true/);
  assert.match(main, /addPauseReason\('modal', now\)/);
  assert.match(main, /addPauseReason\('lifecycle', now\)/);
  assert.match(controller, /GameController\.prototype\.nextScheduledAt/);
});

test("触摸结束只消费当前 identifier，音频响应系统中断", () => {
  const main = read("wechat/js/main.js");
  const sound = read("wechat/js/platform/sound.js");
  assert.match(main, /changed\.find\(\(touch\) =>[\s\S]*=== this\.interaction\.touchId\)/);
  assert.match(main, /if \(!released\) \{\s*return;/);
  assert.match(sound, /wx\.onAudioInterruptionBegin/);
  assert.match(sound, /wx\.onAudioInterruptionEnd/);
});

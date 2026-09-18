"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("微信首页提供同源对弈模式选择并沿用关卡转场", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const main = read("wechat/js/main.js");
  assert.match(renderer, /const segmentLabels = \['单人对弈', '离线双人'\]/);
  assert.match(renderer, /this\.register\(`mode-\$\{index === 1 \? 'duel' : 'ai'\}`, segment/);
  assert.match(main, /const mode = this\.renderer\.homeMode === 'duel' \? 'duel' : 'ai'/);
  assert.match(main, /startLevel\(hit\.payload\.index, \{ mode \}, now\)/);
  assert.match(main, /action === 'mode'/);
  assert.match(main, /beginTransition\('enter', source, hit\.payload\.index, now\)/);
});

test("微信棋盘输入在 duel 模式交给共享 controller 决定当前玩家", () => {
  const main = read("wechat/js/main.js");
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const duelPlayer = /state\.game && state\.game\.mode === 'duel' \? undefined : GameGlobal\.TopologyGomoku\.HUMAN/;
  assert.match(main, duelPlayer);
  assert.match(renderer, /const duel = game\.mode === 'duel'/);
  assert.match(renderer, /duel \? '黑方' : '你'/);
  assert.match(renderer, /duel \? '白方' : difficultyLabel/);
});

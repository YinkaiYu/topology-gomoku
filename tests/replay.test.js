const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Replay = require("../app/assets/game-replay.js");

const ROOT = path.resolve(__dirname, "..");

test("复盘棋盘可按手数确定性重建且不改写原棋谱", () => {
  const moves = [
    { cell: 3, player: 1 },
    { cell: 4, player: -1 },
    { cell: 8, player: 1 },
    { cell: 9, player: -1 }
  ];

  assert.deepEqual(Array.from(Replay.boardAt(moves, 12, 0, 0)), new Array(12).fill(0));
  assert.deepEqual(Array.from(Replay.boardAt(moves, 12, 2, 0)), [0, 0, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(Array.from(Replay.boardAt(moves, 12, 99, 0)), [0, 0, 0, 1, -1, 0, 0, 0, 1, -1, 0, 0]);
  assert.deepEqual(moves, [
    { cell: 3, player: 1 },
    { cell: 4, player: -1 },
    { cell: 8, player: 1 },
    { cell: 9, player: -1 }
  ]);
});

test("复盘步数在棋谱边界内钳制并给出克制的结果文案", () => {
  assert.equal(Replay.clampStep(-3, 8), 0);
  assert.equal(Replay.clampStep(4.4, 8), 4);
  assert.equal(Replay.clampStep(20, 8), 8);
  assert.equal(Replay.progressTitle(0), "开局");
  assert.equal(Replay.progressTitle(7), "第 7 手");
  assert.equal(Replay.progressText(7, 18), "7 / 18 手");
  assert.equal(Replay.resultText("win", 23), "23 手通关");
  assert.equal(Replay.resultText("lose", 24), "24 手惜败");
});

test("复盘脚本在游戏脚本之前以本地经典脚本加载", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const replayIndex = html.indexOf('<script src="./assets/game-replay.js"></script>');
  const gameIndex = html.indexOf('<script src="./assets/game.js"></script>');
  assert.ok(replayIndex >= 0);
  assert.ok(gameIndex > replayIndex);
  assert.doesNotMatch(html, /game-replay[^>]+type="module"/);
});

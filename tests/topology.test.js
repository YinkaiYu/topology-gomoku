"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Game = require("../app/assets/topology.js");

const TYPES = ["plane", "cylinder", "torus", "mobius", "klein", "projective"];

function put(board, rules, points, player) {
  points.forEach(([x, y]) => {
    board[Game.toCell(rules, x, y)] = player;
  });
}

test("所有拓扑的有向步进都能沿反方向返回", () => {
  TYPES.forEach((type) => {
    const rules = Game.createRules({ type, width: 8, height: 6, target: 5 });
    for (let cell = 0; cell < rules.cellCount; cell += 1) {
      for (let direction = 0; direction < 8; direction += 1) {
        const next = Game.step(rules, cell, direction);
        if (!next) continue;
        const back = Game.step(rules, next.cell, (next.direction + 4) % 8);
        assert.ok(back, `${type}: ${cell}/${direction} 应可返回`);
        assert.equal(back.cell, cell, `${type}: ${cell}/${direction} 返回原格`);
        assert.equal(back.direction, (direction + 4) % 8, `${type}: ${cell}/${direction} 返回方向正确`);
      }
    }
  });
});

test("圆柱左右边相连并能跨缝形成五连", () => {
  const rules = Game.createRules({ type: "cylinder", width: 7, height: 6, target: 5 });
  const board = Game.createBoard(rules);
  put(board, rules, [[5, 2], [6, 2], [0, 2], [1, 2], [2, 2]], Game.HUMAN);
  const win = Game.checkWin(board, rules, Game.toCell(rules, 0, 2), Game.HUMAN);
  assert.ok(win);
  assert.ok(win.seam & Game.SEAM_X);
});

test("莫比乌斯带跨缝时位置与方向同时翻转", () => {
  const rules = Game.createRules({ type: "mobius", width: 6, height: 4, target: 5 });
  const east = Game.step(rules, Game.toCell(rules, 5, 0), 0);
  assert.deepEqual(Game.toPoint(rules, east.cell), { x: 0, y: 3 });
  assert.equal(east.direction, 0);
  const southeast = Game.step(rules, Game.toCell(rules, 5, 0), 1);
  assert.deepEqual(Game.toPoint(rules, southeast.cell), { x: 0, y: 2 });
  assert.equal(Game.DIRECTIONS[southeast.direction].name, "NE");
});

test("莫比乌斯带的镜像对角线可判为五连", () => {
  const rules = Game.createRules({ type: "mobius", width: 6, height: 6, target: 5 });
  const board = Game.createBoard(rules);
  const points = [[3, 0], [4, 1], [5, 2], [0, 2], [1, 1]];
  put(board, rules, points, Game.HUMAN);
  const win = Game.checkWin(board, rules, Game.toCell(rules, 0, 2), Game.HUMAN);
  assert.ok(win);
  assert.ok(win.seam & Game.SEAM_TWIST);
});

test("四格环面不会重复使用棋子伪造五连", () => {
  const rules = Game.createRules({ type: "torus", width: 4, height: 6, target: 5 });
  const board = Game.createBoard(rules);
  put(board, rules, [[0, 2], [1, 2], [2, 2], [3, 2]], Game.HUMAN);
  for (let x = 0; x < 4; x += 1) {
    assert.equal(Game.checkWin(board, rules, Game.toCell(rules, x, 2), Game.HUMAN), null);
  }
});

test("五格环面的一整圈可以获胜", () => {
  const rules = Game.createRules({ type: "torus", width: 5, height: 6, target: 5 });
  const board = Game.createBoard(rules);
  put(board, rules, [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], Game.HUMAN);
  assert.ok(Game.checkWin(board, rules, Game.toCell(rules, 4, 2), Game.HUMAN));
});

test("每个胜利掩码都由五个不同交点构成", () => {
  TYPES.forEach((type) => {
    const rules = Game.createRules({ type, width: 8, height: 6, target: 5 });
    rules.winMasks.forEach((mask) => {
      assert.equal(new Set(mask.cells).size, 5, type);
    });
  });
});

test("AI 优先取胜，其次阻挡玩家单杀", () => {
  const rules = Game.createRules({ type: "plane", width: 7, height: 7, target: 5 });
  const winningBoard = Game.createBoard(rules);
  put(winningBoard, rules, [[1, 3], [2, 3], [3, 3], [4, 3]], Game.AI);
  assert.ok([Game.toCell(rules, 0, 3), Game.toCell(rules, 5, 3)].includes(Game.chooseMove(winningBoard, rules, "hard", () => 0)));

  const blockingBoard = Game.createBoard(rules);
  put(blockingBoard, rules, [[1, 2], [2, 2], [3, 2], [4, 2]], Game.HUMAN);
  assert.ok([Game.toCell(rules, 0, 2), Game.toCell(rules, 5, 2)].includes(Game.chooseMove(blockingBoard, rules, "normal", () => 0)));
});

test("困难 AI 在复杂拓扑上按预算返回合法着法且不污染棋盘", () => {
  const rules = Game.createRules({ type: "projective", width: 8, height: 8, target: 5 });
  const board = Game.createBoard(rules);
  put(board, rules, [[3, 3], [4, 4], [1, 6]], Game.HUMAN);
  put(board, rules, [[4, 3], [2, 5], [6, 1]], Game.AI);
  const before = Array.from(board);
  const started = Date.now();
  const move = Game.chooseMove(board, rules, "hard", () => 0.42);
  const elapsed = Date.now() - started;
  assert.equal(board[move], Game.EMPTY);
  assert.deepEqual(Array.from(board), before);
  assert.ok(elapsed < 700, `AI 用时 ${elapsed}ms`);
});

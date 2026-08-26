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

test("六关边界演示都沿真实拓扑连续落下五颗不同棋子", () => {
  const cases = [
    { type: "plane", width: 7, height: 7, start: [1, 3], direction: 0, points: [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3]], seam: 0 },
    { type: "cylinder", width: 7, height: 6, start: [5, 2], direction: 0, points: [[5, 2], [6, 2], [0, 2], [1, 2], [2, 2]], seam: Game.SEAM_X },
    { type: "torus", width: 7, height: 6, start: [5, 4], direction: 1, points: [[5, 4], [6, 5], [0, 0], [1, 1], [2, 2]], seam: Game.SEAM_X | Game.SEAM_Y },
    { type: "mobius", width: 8, height: 6, start: [6, 1], direction: 0, points: [[6, 1], [7, 1], [0, 4], [1, 4], [2, 4]], seam: Game.SEAM_X | Game.SEAM_TWIST },
    { type: "klein", width: 7, height: 6, start: [5, 4], direction: 1, points: [[5, 4], [6, 5], [0, 5], [1, 4], [2, 3]], seam: Game.SEAM_X | Game.SEAM_Y | Game.SEAM_TWIST },
    { type: "projective", width: 8, height: 8, start: [1, 6], direction: 2, points: [[1, 6], [1, 7], [6, 0], [6, 1], [6, 2]], seam: Game.SEAM_Y | Game.SEAM_TWIST }
  ];

  cases.forEach((item) => {
    const rules = Game.createRules({ type: item.type, width: item.width, height: item.height, target: 5 });
    const startCell = Game.toCell(rules, item.start[0], item.start[1]);
    const path = Game.tracePath(rules, startCell, item.direction, 5);
    assert.ok(path, item.type);
    assert.deepEqual(path.cells.map((cell) => {
      const point = Game.toPoint(rules, cell);
      return [point.x, point.y];
    }), item.points, item.type);
    assert.equal(path.seams.reduce((all, seam) => all | seam, 0), item.seam, item.type);
    assert.equal(new Set(path.cells).size, 5, item.type);
  });
});

test("跨越圆柱边界的活三会提示映射后的两个端点", () => {
  const rules = Game.createRules({ type: "cylinder", width: 7, height: 6, target: 5 });
  const board = Game.createBoard(rules);
  put(board, rules, [[6, 2], [0, 2], [1, 2]], Game.HUMAN);

  const hints = Game.findLineHints(board, rules, Game.HUMAN);
  const rowHints = hints.filter((hint) => Game.toPoint(rules, hint.cell).y === 2);
  assert.deepEqual(rowHints.map((hint) => Game.toPoint(rules, hint.cell)), [{ x: 2, y: 2 }, { x: 5, y: 2 }]);
  assert.ok(rowHints.every((hint) => hint.kind === "three"));
});

test("莫比乌斯活三的提示端点遵循翻转后的真实位置", () => {
  const rules = Game.createRules({ type: "mobius", width: 8, height: 6, target: 5 });
  const board = Game.createBoard(rules);
  put(board, rules, [[7, 1], [0, 4], [1, 4]], Game.HUMAN);

  const hints = Game.findLineHints(board, rules, Game.HUMAN);
  const expected = new Set([Game.toCell(rules, 6, 1), Game.toCell(rules, 2, 4)]);
  const matching = hints.filter((hint) => expected.has(hint.cell));
  assert.equal(matching.length, 2);
  assert.ok(matching.every((hint) => hint.kind === "three"));
});

test("单边四子只提示尚未封死的第五点", () => {
  const rules = Game.createRules({ type: "cylinder", width: 7, height: 6, target: 5 });
  const board = Game.createBoard(rules);
  put(board, rules, [[5, 2], [6, 2], [0, 2], [1, 2]], Game.HUMAN);
  put(board, rules, [[4, 2]], Game.AI);

  const hints = Game.findLineHints(board, rules, Game.HUMAN);
  const winningCell = Game.toCell(rules, 2, 2);
  assert.deepEqual(hints.filter((hint) => hint.kind === "four"), [{ cell: winningCell, kind: "four" }]);
});

test("第一关教学提示从中心开始并沿玩家的连线继续延伸", () => {
  const rules = Game.createRules({ type: "plane", width: 7, height: 7, target: 5 });
  const board = Game.createBoard(rules);
  const center = Game.toCell(rules, 3, 3);

  assert.equal(Game.suggestTutorialMove(board, rules, -1), center);

  board[center] = Game.HUMAN;
  const second = Game.suggestTutorialMove(board, rules, center);
  const secondPoint = Game.toPoint(rules, second);
  assert.equal(secondPoint.y, 3);
  assert.equal(Math.abs(secondPoint.x - 3), 1);

  put(board, rules, [[1, 3], [2, 3], [4, 3]], Game.HUMAN);
  const fifth = Game.suggestTutorialMove(board, rules, Game.toCell(rules, 4, 3));
  assert.ok([
    Game.toCell(rules, 0, 3),
    Game.toCell(rules, 5, 3)
  ].includes(fifth));
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

test("悠闲 AI 会错过必胜点和玩家的单杀点", () => {
  const rules = Game.createRules({ type: "plane", width: 7, height: 7, target: 5 });
  const winningBoard = Game.createBoard(rules);
  put(winningBoard, rules, [[1, 3], [2, 3], [3, 3], [4, 3]], Game.AI);
  const winningCells = [Game.toCell(rules, 0, 3), Game.toCell(rules, 5, 3)];
  assert.equal(winningCells.includes(Game.chooseMove(winningBoard, rules, "easy", () => 0.99)), false);

  const blockingBoard = Game.createBoard(rules);
  put(blockingBoard, rules, [[1, 2], [2, 2], [3, 2], [4, 2]], Game.HUMAN);
  const blockingCells = [Game.toCell(rules, 0, 2), Game.toCell(rules, 5, 2)];
  assert.equal(blockingCells.includes(Game.chooseMove(blockingBoard, rules, "easy", () => 0.99)), false);
});

test("敏捷 AI 偶尔会漏掉玩家的单杀点", () => {
  const rules = Game.createRules({ type: "plane", width: 7, height: 7, target: 5 });
  const board = Game.createBoard(rules);
  put(board, rules, [[1, 2], [2, 2], [3, 2], [4, 2]], Game.HUMAN);
  const blockingCells = [Game.toCell(rules, 0, 2), Game.toCell(rules, 5, 2)];
  assert.equal(blockingCells.includes(Game.chooseMove(board, rules, "normal", () => 0.99)), false);
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

test("对手已不存在任何五连路径时，玩家无需连五也获胜", () => {
  const rules = Game.createRules({ type: "plane", width: 5, height: 5, target: 5 });
  const board = Game.createBoard(rules);
  const blockingPattern = [[0, 0], [1, 2], [2, 4], [3, 1], [4, 3]];
  put(board, rules, blockingPattern, Game.HUMAN);

  assert.equal(Game.hasLiveLine(board, rules, Game.AI), false);
  assert.equal(Game.playerWinsByBlockingAi(board, rules), true);
  assert.equal(Game.boardIsDraw(board, rules), false);
  blockingPattern.forEach(([x, y]) => {
    assert.equal(Game.checkWin(board, rules, Game.toCell(rules, x, y), Game.HUMAN), null);
  });
});

test("仍有至少一条未被玩家占据的五连路径时，不触发封锁胜利", () => {
  const rules = Game.createRules({ type: "plane", width: 7, height: 7, target: 5 });
  const board = Game.createBoard(rules);
  put(board, rules, [[3, 3], [1, 5]], Game.HUMAN);
  assert.equal(Game.hasLiveLine(board, rules, Game.AI), true);
  assert.equal(Game.playerWinsByBlockingAi(board, rules), false);
});

test("玩家自己已无五连路径时也立即通关", () => {
  const rules = Game.createRules({ type: "plane", width: 5, height: 5, target: 5 });
  const board = Game.createBoard(rules);
  const closingPattern = [[0, 0], [1, 2], [2, 4], [3, 1], [4, 3]];
  put(board, rules, closingPattern, Game.AI);

  assert.equal(Game.hasLiveLine(board, rules, Game.HUMAN), false);
  assert.equal(Game.playerHasNoWinningPath(board, rules), true);
  assert.equal(Game.playerWinsBySettledPosition(board, rules), true);
  closingPattern.forEach(([x, y]) => {
    assert.equal(Game.checkWin(board, rules, Game.toCell(rules, x, y), Game.AI), null);
  });
});

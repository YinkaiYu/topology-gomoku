"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Engine = require("../app/assets/topology.js");
const Content = require("../app/assets/level-config.js");
const { GameController, MODE_AI, MODE_DUEL } = require("../app/assets/game-controller.js");
const BoardArt = require("../app/assets/board-art.js");

function duel(index = 0, preferences = {}) {
  const controller = new GameController({ preferences, now: () => 0, random: () => 0.25 });
  controller.startLevel(index, { mode: MODE_DUEL }, 0);
  return controller;
}

// Full legal boards with balanced black/white counts and no five-in-a-row.
const DRAW_BOARDS = [
  "bbbwwbwwbwbwwbbbwbbbwbwbwbwbwwbwwbbwwwbbbbwwwwbwb",
  "wbbwbwbwbbwbwbwbbwbwbbwwbwwwbbwbwbwwwwbbbw",
  "wbwwbbwwbbbwwwbbwwwbwwwwbbbbbbbwbwwbwbwbwb",
  "wbbwwbwwwbwbbwbbbbbwwbbwbbwbbbwwbwwwwbwwwbwbbwbw",
  "bwbwwbwbwbbwbwwwwbwwwwbwbbbwbbwbwwbbwbwbbb",
  "bwwwbwbwwbbbbwwwbbwwbbwbwwwbwbwwwwbbwbbbbwbbbwwwwbbbbwwbbwwwbbwb",
  "bbbbwwbbbwbwbbwbwbwwwwwwbbwwbwbwbwwbbbwbbbbwwbwww"
];

function winningMoves(controller, winner) {
  const { rules, level } = controller.game;
  const definition = level.lessonPaths[0];
  const line = Engine.tracePath(rules, Engine.toCell(rules, ...definition.start), definition.direction, rules.target).cells;
  const board = Engine.createBoard(rules);
  const other = -winner;
  const fillers = [];
  const fillerCount = winner === Engine.HUMAN ? 4 : 5;
  for (let cell = 0; cell < board.length && fillers.length < fillerCount; cell += 1) {
    if (line.includes(cell)) { continue; }
    board[cell] = other;
    if (Engine.checkWin(board, rules, cell, other)) {
      board[cell] = Engine.EMPTY;
    } else {
      fillers.push(cell);
    }
  }
  assert.equal(fillers.length, fillerCount);
  const black = winner === Engine.HUMAN ? line : fillers;
  const white = winner === Engine.AI ? line : fillers;
  const moves = [];
  black.forEach((cell, index) => {
    moves.push({ cell, player: Engine.HUMAN });
    if (index < white.length) { moves.push({ cell: white[index], player: Engine.AI }); }
  });
  return moves;
}

test("双人模式在七种拓扑均从黑方开始，白方回合与延迟事件都不调用 AI", (t) => {
  const choose = t.mock.method(Engine, "chooseMove", () => { throw new Error("Unexpected AI move"); });
  Content.LEVELS.forEach((level, index) => {
    const controller = duel(index);
    assert.equal(controller.game.lesson, null, level.topology);
    assert.equal(controller.game.demo, null);
    assert.equal(controller.statusText(), "黑方回合");
    assert.equal(controller.performMove(0), true);
    assert.equal(controller.game.turn, Engine.AI);
    assert.equal(controller.statusText(), "白方回合");
    assert.equal(controller.canPlaceCell(1), true);
    assert.equal(controller._scheduleAi(1), false);
    assert.equal(controller.nextScheduledAt(), null);
    assert.equal(controller._runAi(1), false);
    controller._schedule("ai", 0, 1);
    controller.tick(10000);
    assert.equal(controller.game.moves.length, 1);
    assert.equal(controller.nextScheduledAt(), null);
    assert.equal(controller.performMove(1), true);
    assert.equal(controller.game.turn, Engine.HUMAN);
    assert.deepEqual(controller.game.moves.map((move) => move.player), [Engine.HUMAN, Engine.AI]);
  });
  assert.equal(choose.mock.callCount(), 0);
});

test("落子拒绝非整数交点、无效棋色、错方、占用点及无效回合，且不污染棋局", () => {
  for (const mode of [MODE_AI, MODE_DUEL]) {
    const controller = new GameController({ now: () => 0 });
    controller.startLevel(1, { mode, skipDemo: true }, 0);
    controller.drainEvents();
    const before = controller.snapshotMatch();
    for (const cell of [undefined, null, "0", 0.5, NaN, Infinity, -Infinity, -1, controller.game.board.length]) {
      assert.equal(controller.canPlaceCell(cell), false);
      assert.equal(controller.performMove(cell, Engine.HUMAN), false);
    }
    for (const player of [0, 2, -2, NaN, Infinity, null, "1", {}, Engine.AI]) {
      assert.equal(controller.performMove(0, player), false);
    }
    assert.deepEqual(controller.snapshotMatch(), before);
    assert.deepEqual(controller.drainEvents(), []);
    assert.equal(controller.performMove(0, Engine.HUMAN), true);
    assert.equal(controller.performMove(1, Engine.HUMAN), false);
    assert.equal(controller.performMove(0, Engine.AI), false);
    controller.game.turn = 0;
    assert.equal(controller.canPlaceCell(1), false);
    assert.equal(controller.performMove(1, 0), false);
    assert.equal(controller.performMove(1), false);
    assert.equal(controller.game.moves.length, 1);
  }
});

test("双人悔棋逐手恢复执棋方，重开与退出取消旧棋局和手势", () => {
  const controller = duel(1);
  [0, 1, 2].forEach((cell) => assert.equal(controller.performMove(cell), true));
  for (const [count, turn] of [[2, Engine.HUMAN], [1, Engine.AI], [0, Engine.HUMAN]]) {
    assert.equal(controller.undo(10), true);
    assert.equal(controller.game.moves.length, count);
    assert.equal(controller.game.turn, turn);
    assert.equal(Array.from(controller.game.board).filter(Boolean).length, count);
    assert.equal(controller.nextScheduledAt(), null);
  }
  assert.equal(controller.undo(11), false);
  controller.performMove(0);
  controller.setViewScrubbing(true);
  assert.equal(controller.canPlaceCell(1), false);
  assert.equal(controller.performMove(1), false);
  assert.equal(controller.restart(20), true);
  assert.equal(controller.game.mode, MODE_DUEL);
  assert.equal(controller.game.turn, Engine.HUMAN);
  assert.equal(controller.game.view.scrubbing, false);
  assert.equal(controller.game.moves.length, 0);
  assert.equal(controller.game.lesson, null);
  assert.equal(controller.game.demo, null);
  controller.pause(21);
  assert.equal(controller.canPlaceCell(0), false);
  assert.equal(controller.performMove(0), false);
  controller.resume(22);
  assert.equal(controller.performMove(0), true);
  assert.equal(controller.leaveGame(), true);
  assert.equal(controller.game, null);
  assert.equal(controller.scene, "home");
  controller.tick(100000);
  assert.equal(controller.nextScheduledAt(), null);
});

test("双人重温六种边界教学后完整恢复白方回合，教学中的悔棋仍由黑子继续", () => {
  for (let index = 1; index < Content.LEVELS.length; index += 1) {
    const controller = duel(index);
    controller.performMove(0);
    const before = controller.snapshotMatch();
    assert.equal(controller.replayBoundaryLesson(10), true);
    assert.equal(controller.game.mode, MODE_DUEL);
    assert.equal(controller.statusText(), controller.lessonPrompt());
    const firstCell = controller.game.lesson.cells[0];
    const secondCell = controller.game.lesson.cells[1];
    assert.equal(controller.performMove(firstCell), true);
    assert.equal(controller.performMove(secondCell), true);
    assert.equal(controller.undo(20), true);
    assert.equal(controller.game.turn, Engine.HUMAN);
    assert.equal(controller.game.lesson.step, 1);
    while (controller.game.lesson) {
      while (controller.game.lesson.active) {
        const cell = controller.game.lesson.cells[controller.game.lesson.step];
        assert.equal(controller.performMove(cell), true);
      }
      assert.equal(controller.tick(controller.nextScheduledAt()), true);
    }
    assert.deepEqual(controller.snapshotMatch(), before);
    assert.equal(controller.statusText(), "白方回合");
    assert.equal(controller.nextScheduledAt(), null);
    assert.equal(controller.performMove(1), true);
    assert.equal(controller.game.moves[1].player, Engine.AI);
  }
});

test("双人白方回合的自动演示可跳过或完整播放，恢复快照不会调度 AI", () => {
  for (const skip of [true, false]) {
    const controller = duel(2);
    controller.performMove(0);
    const before = controller.snapshotMatch();
    controller.startLevel(2, { introMode: "demo", resumeMatch: before }, 10);
    assert.equal(controller.game.mode, MODE_DUEL);
    assert.equal(controller.game.turn, Engine.AI);
    assert.equal(controller.canPlaceCell(1), false);
    assert.equal(controller.performMove(1), false);
    assert.equal(controller._scheduleAi(11), false);
    if (skip) {
      assert.equal(controller.skipDemo(), true);
    } else {
      while (controller.game.demo.active) {
        controller.tick(controller.nextScheduledAt());
      }
    }
    assert.deepEqual(controller.snapshotMatch(), before);
    assert.equal(controller.nextScheduledAt(), null);
    assert.equal(controller.performMove(1), true);
  }
});

test("七种拓扑均可由黑方或白方连五获胜，并解锁旅程而不改写 AI 成绩", () => {
  for (let index = 0; index < Content.LEVELS.length; index += 1) {
    for (const winner of [Engine.HUMAN, Engine.AI]) {
      const bestDifficulty = [1, 1, 1, 1, 1, 1, 1];
      const controller = duel(index, { bestDifficulty, difficulty: "hard" });
      const moves = winningMoves(controller, winner);
      moves.forEach((move, step) => {
        assert.equal(controller.game.status, "playing");
        assert.equal(controller.performMove(move.cell, move.player, null, step + 1), true);
      });
      assert.equal(controller.game.status, "ended");
      assert.equal(controller.game.outcome, "win");
      assert.equal(controller.game.winner, winner);
      assert.equal(controller.game.turn, 0);
      assert.equal(controller.statusText(), winner === Engine.HUMAN ? "黑方胜" : "白方胜");
      assert.equal(controller.game.winningMask.cells.length, 5);
      assert.equal(controller.game.autoAdvancePending, false);
      assert.equal(controller.preferences.completed[index], true);
      assert.deepEqual(controller.preferences.bestDifficulty, bestDifficulty);
      if (index < Content.LEVELS.length - 1) {
        assert.equal(controller.preferences.unlocked, index + 1);
      }
      assert.equal(controller.performMove(controller.game.board.findIndex((cell) => cell === 0)), false);
      controller.tick(10000);
      assert.equal(controller.game.levelIndex, index);
      assert.equal(controller.nextScheduledAt(), null);
      assert.equal(controller.beginReplay(), true);
      assert.equal(controller.stepReplay(-1, 10001), true);
      assert.equal(Array.from(controller.game.board).filter(Boolean).length, moves.length - 1);
      assert.equal(controller.endReplay(), true);
      assert.equal(Array.from(controller.game.board).filter(Boolean).length, moves.length);
      assert.equal(controller.restart(10002), true);
      assert.equal(controller.game.mode, MODE_DUEL);
      assert.equal(controller.game.winner, null);
      assert.equal(controller.game.turn, Engine.HUMAN);
      assert.equal(controller.game.moves.length, 0);
    }
  }
});

test("七种拓扑的无五连棋谱均到满盘才和局，不使用 AI 封锁通关特例", (t) => {
  const block = t.mock.method(Engine, "playerWinsByBlockingAi", () => { throw new Error("AI-only rule"); });
  const settle = t.mock.method(Engine, "playerHasNoWinningPath", () => { throw new Error("AI-only rule"); });
  DRAW_BOARDS.forEach((fixture, index) => {
    const controller = duel(index);
    assert.equal(fixture.length, controller.game.board.length);
    const black = [], white = [];
    Array.from(fixture).forEach((value, cell) => (value === "b" ? black : white).push(cell));
    assert.equal(black.length, Math.ceil(fixture.length / 2));
    const moves = black.flatMap((cell, step) => step < white.length ? [cell, white[step]] : [cell]);
    moves.forEach((cell, step) => {
      assert.equal(controller.game.status, "playing", `${Content.LEVELS[index].topology}, move ${step}`);
      assert.equal(controller.performMove(cell, undefined, null, step + 1), true);
    });
    assert.equal(controller.game.status, "ended");
    assert.equal(controller.game.outcome, "draw");
    assert.equal(controller.game.winner, null);
    assert.equal(controller.game.winningMask, null);
    assert.equal(controller.statusText(), "和局");
    assert.equal(controller.nextScheduledAt(), null);
    assert.deepEqual(controller.preferences.bestDifficulty, []);
  });
  assert.equal(block.mock.callCount(), 0);
  assert.equal(settle.mock.callCount(), 0);
});

function previewGradients(mode, turn, overrides = {}) {
  const controller = duel();
  const game = Object.assign(controller.game, { mode, turn }, overrides);
  const gradients = [];
  const context = new Proxy({
    globalAlpha: 1,
    createRadialGradient() {
      const colors = [];
      gradients.push(colors);
      return { addColorStop(_offset, color) { colors.push(color); } };
    }
  }, {
    get(target, key) { return key in target ? target[key] : () => {}; }
  });
  BoardArt.drawBoard(context, {
    game,
    layout: BoardArt.computeLayout(320, 320, game.rules),
    time: 200,
    preferences: { hints: false },
    interaction: { pressedCell: 0, pressedAt: 100 }
  });
  return gradients;
}

test("共享棋盘预览只在合法玩家回合绘制，并随双人黑白回合切换棋子颜色", () => {
  const black = previewGradients(MODE_DUEL, Engine.HUMAN);
  const white = previewGradients(MODE_DUEL, Engine.AI);
  assert.equal(black.length, 1);
  assert.equal(white.length, 1);
  assert.deepEqual(previewGradients(MODE_AI, Engine.HUMAN), black);
  assert.notDeepEqual(black, white);
  assert.ok(black[0].includes("#14201d"));
  assert.ok(white[0].includes("#d9d2c6"));
  assert.deepEqual(previewGradients(MODE_AI, Engine.AI), []);
  for (const turn of [0, 2, undefined, NaN]) {
    assert.deepEqual(previewGradients(MODE_DUEL, turn), []);
  }
  assert.deepEqual(previewGradients(MODE_DUEL, Engine.HUMAN, { status: "ended" }), []);
});

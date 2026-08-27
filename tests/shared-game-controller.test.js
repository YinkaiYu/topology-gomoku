"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const Engine = require("../app/assets/topology.js");
const Content = require("../app/assets/level-config.js");
const ControllerModule = require("../app/assets/game-controller.js");
const BoardArt = require("../app/assets/board-art.js");

function createController(preferences = {}) {
  return new ControllerModule.GameController({
    preferences,
    now: () => 0,
    random: () => 0.25
  });
}

function playLessonPath(controller, startTime = 0) {
  const cells = controller.game.lesson.cells.slice();
  cells.forEach((cell, index) => {
    assert.equal(controller.performMove(cell, Engine.HUMAN, null, startTime + index * 20), true);
  });
  return startTime + (cells.length - 1) * 20;
}

test("共享内容保留七关、三档难度与原教学节奏", () => {
  assert.deepEqual(Content.LEVELS.map((level) => level.topology), [
    "plane",
    "cylinder",
    "torus",
    "mobius",
    "klein",
    "projective",
    "sphere"
  ]);
  assert.deepEqual(Content.DIFFICULTY_ORDER, ["easy", "normal", "hard"]);
  assert.equal(Content.TUTORIAL_AUTO_ADVANCE_DELAY, 820);
  assert.equal(Content.LEVELS[0].width, 7);
  assert.equal(Content.LEVELS[5].width, 8);
});

test("H5 显式加载并优先使用共享关卡内容", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(html, /level-config\.js/);
  assert.match(game, /var Content = window\.TopologyGameContent/);
  assert.match(game, /LEVELS = Content\.LEVELS/);
  assert.ok(html.indexOf("level-config.js") < html.indexOf("game.js"));
});

test("首关仍要求亲手完成五连并在 820ms 后进入第二关", () => {
  const controller = createController();
  controller.startLevel(0, {}, 0);
  assert.equal(controller.game.lesson.active, true);
  const expected = controller.game.lesson.cells[0];
  const wrong = (expected + 1) % controller.game.board.length;
  if (wrong !== expected) {
    assert.equal(controller.performMove(wrong, Engine.HUMAN, null, 1), false);
  }
  const finishedAt = playLessonPath(controller, 10);
  assert.equal(controller.game.status, "ended");
  assert.equal(controller.game.outcome, "win");
  assert.equal(controller.preferences.unlocked, 1);
  assert.equal(controller.game.autoAdvancePending, true);
  assert.equal(controller.tick(finishedAt + 819), false);
  assert.equal(controller.game.levelIndex, 0);
  assert.equal(controller.tick(finishedAt + 820), true);
  assert.equal(controller.game.levelIndex, 1);
  assert.equal(controller.game.lesson.active, true);
});

test("新拓扑首次游玩保留两条逐子教学并回到真实棋局", () => {
  const controller = createController({ unlocked: 1 });
  controller.startLevel(1, {}, 0);
  assert.equal(controller.game.lesson.pathIndex, 0);
  const firstFinishedAt = playLessonPath(controller, 0);
  assert.equal(controller.game.status, "lesson-line-complete");
  controller.tick(firstFinishedAt + 920);
  assert.equal(controller.game.lesson.pathIndex, 1);
  assert.equal(controller.game.lesson.active, true);
  const secondFinishedAt = playLessonPath(controller, firstFinishedAt + 1000);
  assert.equal(controller.game.status, "lesson-complete");
  assert.ok(controller.preferences.learnedLevels.includes(1));
  controller.tick(secondFinishedAt + 1080);
  assert.equal(controller.game.levelIndex, 1);
  assert.equal(controller.game.lesson, null);
  assert.equal(controller.game.status, "playing");
  assert.equal(controller.game.moves.length, 0);
});

test("已学关卡自动演示全部线路，触摸跳过不改变棋局", () => {
  const controller = createController({ unlocked: 1, learnedLevels: [1] });
  controller.startLevel(1, {}, 0);
  assert.equal(controller.game.demo.active, true);
  const firstDuration = controller.game.demo.duration;
  controller.tick(firstDuration);
  assert.equal(controller.game.demo.pathIndex, 1);
  assert.equal(controller.game.demo.active, true);
  assert.equal(controller.skipDemo(), true);
  assert.equal(controller.game.demo.active, false);
  assert.equal(controller.game.moves.length, 0);
  assert.equal(controller.game.turn, Engine.HUMAN);
});

test("AI 等待期间悔棋取消待落子，AI 落子后悔棋撤销双方各一手", () => {
  const controller = createController({ unlocked: 1, learnedLevels: [1] });
  controller.startLevel(1, { skipDemo: true }, 0);
  const humanCell = Engine.toCell(controller.game.rules, 3, 3);
  assert.equal(controller.performMove(humanCell, Engine.HUMAN, null, 10), true);
  assert.equal(controller.game.turn, Engine.AI);
  assert.equal(controller.undo(20), true);
  assert.equal(controller.game.moves.length, 0);
  controller.tick(2000);
  assert.equal(controller.game.moves.length, 0);

  assert.equal(controller.performMove(humanCell, Engine.HUMAN, null, 2100), true);
  controller.tick(2100 + Content.DIFFICULTIES.normal.wait);
  assert.equal(controller.game.moves.length, 2);
  assert.equal(controller.game.turn, Engine.HUMAN);
  assert.equal(controller.undo(3000), true);
  assert.equal(controller.game.moves.length, 0);
  assert.equal(controller.game.turn, Engine.HUMAN);
});

test("前后台暂停会冻结 AI 截止时间而不是回前台立即落子", () => {
  const controller = createController({ unlocked: 1, learnedLevels: [1] });
  controller.startLevel(1, { skipDemo: true }, 0);
  const humanCell = Engine.toCell(controller.game.rules, 3, 3);
  controller.performMove(humanCell, Engine.HUMAN, null, 100);
  controller.pause(200);
  controller.resume(1200);
  controller.tick(1500);
  assert.equal(controller.game.moves.length, 1);
  controller.tick(1620);
  assert.equal(controller.game.moves.length, 2);
});

test("终局复盘仍按步重建棋盘", () => {
  const controller = createController();
  controller.startLevel(0, {}, 0);
  playLessonPath(controller, 0);
  assert.equal(controller.beginReplay(), true);
  const total = controller.game.review.total;
  assert.equal(controller.stepReplay(-1, 500), true);
  assert.equal(controller.game.review.step, total - 1);
  assert.equal(Array.from(controller.game.board).filter(Boolean).length, total - 1);
  assert.equal(controller.endReplay(), true);
  assert.equal(controller.game.review, null);
  assert.equal(Array.from(controller.game.board).filter(Boolean).length, total);
});

test("棋盘命中测试保留 0.53 cell 吸附与 0.58 cell 容错边界", () => {
  const rules = Engine.createRules({ type: "torus", width: 7, height: 6, target: 5 });
  const layout = BoardArt.computeLayout(320, 320, rules);
  const cell = Engine.toCell(rules, 3, 2);
  const center = BoardArt.cellCenter(rules, layout, cell);
  assert.equal(
    BoardArt.hitTestCell(rules, layout, center.x + layout.cell * 0.37, center.y + layout.cell * 0.37),
    cell
  );
  assert.equal(
    BoardArt.hitTestCell(rules, layout, center.x + layout.cell * 0.38, center.y + layout.cell * 0.38),
    -1
  );
  assert.equal(BoardArt.pointInsideBoard(layout, layout.left - layout.cell * 0.57, center.y), true);
  assert.equal(BoardArt.pointInsideBoard(layout, layout.left - layout.cell * 0.59, center.y), false);
});

test("共享控制与美术模块不依赖 DOM、Web Storage 或微信宿主", () => {
  ["level-config.js", "game-controller.js", "board-art.js"].forEach((name) => {
    const source = fs.readFileSync(path.join(ROOT, "app", "assets", name), "utf8");
    assert.doesNotMatch(source, /\bdocument\b|\blocalStorage\b|\bwx\.|getBoundingClientRect|PointerEvent/);
  });
});

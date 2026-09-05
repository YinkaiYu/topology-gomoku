"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { GameController } = require("../app/assets/game-controller.js");
const Motion = require("../app/assets/board-view-motion.js");
const Logic = require("../app/assets/board-view-logic.js");
const Morph = require("../app/assets/topology-morph.js");
const Art = require("../app/assets/board-art.js");
const Engine = require("../app/assets/topology.js");

function game(index = 1) {
  const c = new GameController({ now: () => 0, random: () => 0.25, preferences: { unlocked: 6 } });
  c.startLevel(index, { skipDemo: true }, 0);
  return c;
}

test("共享视角在教学时不可操作，离开和重开丢弃旧手势", () => {
  const c = game();
  c.startLevel(1, {}, 0);
  assert.equal(c.setViewProgress(0.5, false, 0), false);
  c.startLevel(1, { skipDemo: true }, 0);
  assert.equal(c.setViewScrubbing(true), true);
  assert.equal(c.canPlaceCell(0), false);
  c.leaveGame();
  c.startLevel(1, { skipDemo: true }, 0);
  assert.equal(c.game.view.scrubbing, false);
  assert.equal(c.canPlaceCell(0), true);
});

test("滑行可从实际中间位置重新抓取，取消后 AI 只恢复一手", () => {
  const c = game();
  c.performMove(20, Engine.HUMAN, null, 0);
  c.setViewProgress(1, true, 0, true);
  c.tick(520);
  assert.equal(c.game.moves.length, 1);
  assert.ok(c.game.view.progress > 0 && c.game.view.progress < 1);
  const actual = c.game.view.progress;
  c.setViewScrubbing(true);
  assert.equal(c.game.view.progress, actual);
  c.setViewProgress(0.4, false, 530);
  c.tick(4000);
  assert.equal(c.game.moves.length, 1);
  assert.equal(c.undo(4000), false);
  c.setViewScrubbing(false);
  c.tick(4060);
  c.tick(9000);
  assert.equal(c.game.moves.length, 2);
  assert.equal(c.game.turn, Engine.HUMAN);
});

test("后台暂停冻结视角滑行和自动终局时钟", () => {
  const c = game();
  c.setViewProgress(1, true, 0, true);
  c.tick(100);
  const before = c.game.view.progress;
  c.pause(100);
  c.tick(5100);
  assert.equal(c.game.view.progress, before);
  c.resume(5100);
  c.tick(5100);
  assert.equal(c.game.view.progress, before);
  c.tick(7000);
  c._finishGame("win", null, "blocked", 7000);
  c.tick(7200);
  const during = Motion.orientation(c.game.view, 7200);
  c.pause(7200);
  c.resume(17200);
  assert.deepEqual(Motion.orientation(c.game.view, 17200), during);
});

test("终局继承最后实际绘制的姿态，不用两帧之间的时钟重算晃动", () => {
  const c = game(6);
  c.setViewProgress(0.4, false, 100);
  c.game.view.displayedOrientation = Logic.interactiveOrientation(c.game.view, 3900);
  const displayed = c.game.view.displayedOrientation;
  c._finishGame("win", c.game.rules.winMasks[0], null, 4000);
  const first = Motion.orientation(c.game.view, 4000);
  for (const key of ["x", "y", "z", "wobbleX", "wobbleY"]) {
    assert.equal(first[key], displayed[key]);
  }
});

test("原生共享绘制在六曲面、五种进度终局首帧保持每个交点，失败也不跳回平面", () => {
  for (let index = 1; index <= 6; index++) {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const c = game(index);
      c.setViewProgress(progress, false, 100);
      Object.assign(c.game.view.rotation, { x: 0.37, y: -0.81, z: 0.12 });
      Object.assign(c.game.view.elastic, { x: 0.035, y: -0.023 });
      const before = Logic.interactiveOrientation(c.game.view, 4000);
      const mask = c.game.rules.winMasks[0];
      c._finishGame(progress ? "lose" : "win", mask, null, 4000);
      const after = Motion.orientation(c.game.view, 4000);
      assert.equal(c.game.view.progress, progress);
      assert.equal(c.canUseViewControl(), false);
      const layout = Art.computeLayout(390, 390, c.game.rules);
      for (let cell = 0; cell < c.game.rules.cellCount; cell++) {
        const uv = Morph.stoneUV(c.game.rules, cell);
        const flat = Art.cellCenter(c.game.rules, layout, cell);
        const a = Art.mappedCompletionPoint(c.game, layout, flat, uv, { ...before, morph: progress });
        const b = Art.mappedCompletionPoint(c.game, layout, flat, uv, { ...after, morph: progress });
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.depth - b.depth) < 1e-9);
      }
      c.tick(7000);
      assert.equal(c.game.view.progress, 1);
      assert.equal(c.canUseViewControl(), true);
      c.beginReplay();
      assert.equal(c.game.view.progress, 1);
    }
  }
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Engine = require("../app/assets/topology.js");
const Morph = require("../app/assets/topology-morph.js");
const ViewLogic = require("../app/assets/board-view-logic.js");
const LiquidRange = require("../app/assets/liquid-range.js");
const source = fs.readFileSync(require.resolve("../app/assets/game.js"), "utf8");

// Run the actual rendering/transition functions, not a duplicate interpolation.
function harness(globals, names) {
  const context = vm.createContext({ Morph, ViewLogic, LiquidRange, clamp01: Morph.clamp01, ...globals });
  for (const name of names) {
    const start = source.indexOf("  function " + name + "(");
    const next = source.indexOf("\n  function ", start + 1);
    assert.ok(start >= 0 && next > start, name);
    vm.runInContext(source.slice(start, next), context);
  }
  return context;
}

function scene(type, progress) {
  const rules = Engine.createRules({ type, width: 7, height: 7 });
  const cells = [11, 5, 42, 13, 19];
  const mask = type === "sphere"
    ? rules.winMasks.find(m => cells.every(c => Array.from(m.cells).includes(c)))
    : rules.winMasks[0];
  const game = {
    level: { topology: type }, rules, winningMask: mask,
    view: { progress, rotation: { x: 0.37, y: -0.81, z: 0.12 }, elastic: { x: 0.035, y: -0.023 } }
  };
  let frame;
  const noOp = () => {};
  const context = harness({
    game, performance: { now: () => 4000 }, renderState: { winAt: 4000 },
    canPresentCompletion: () => true,
    chooseCompletionView: () => ({ x: -0.2, y: 0.7, z: 0.1, shapeX: 0.9, shapeY: 1.1, shapeZ: 1.2 }),
    drawCompletionSurface: (ctx, morph, orientation) => { frame = { morph, orientation }; },
    drawCompletionGrid: noOp, drawCompletionSphereBoundary: noOp,
    drawCompletionBoundary: noOp, drawCompletionWinningLine: noOp, drawCompletionStones: noOp,
    syncGameTools: noOp, updateTurnUI: noOp
  }, ["createCompletionState", "drawCompletionMorph", "interactiveViewOrientation", "updateCompletionMotion"]);
  const initial = context.interactiveViewOrientation(4000);
  game.completion = context.createCompletionState({ progress, rotation: game.view.rotation, wobble: { x: initial.wobbleX, y: initial.wobbleY } });
  return { game, initial, tick(time) { context.updateCompletionMotion(time, 16.67); }, draw(time) { context.drawCompletionMorph({}, time); return frame; } };
}

test("六种曲面在任意展开进度、旋转与弹性状态下，终局第一帧保持所有交点的位置", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const current = scene(type, progress);
      const first = current.draw(4000);
      assert.equal(first.morph, progress);
      for (let cell = 0; cell < 49; cell += 1) {
        const uv = Morph.stoneUV(current.game.rules, cell);
        const a = Morph.project(type, uv.u, uv.v, 480, 480, current.initial);
        const b = Morph.project(type, uv.u, uv.v, 480, 480, first.orientation);
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.depth - b.depth) < 1e-9, `${type}/${progress}/${cell}`);
      }
    }
  }
});

test("球面终局的非零共形调整连续展开、保持接缝，最终到达选定映射", () => {
  const current = scene("sphere", 0.5);
  const target = current.game.completion.presentation;
  assert.ok(Math.hypot(...target.boost) > 0.01, "regression fixture must really reparameterize");
  let previous = current.draw(4000);
  for (let elapsed = 1; elapsed <= 3000; elapsed += 1) {
    const frame = current.draw(4000 + elapsed);
    for (const [u, v] of [[0.2, 0.4], [0.7, 0.3], [0.4, 0.8]]) {
      const a = Morph.project("sphere", u, v, 480, 480, previous.orientation);
      const b = Morph.project("sphere", u, v, 480, 480, frame.orientation);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1, "no discontinuous first-frame map switch");
    }
    const p = frame.orientation.presentation;
    const a = Morph.applyPresentation(Morph.surfacePoint("sphere", 0.37, 0), p);
    const b = Morph.applyPresentation(Morph.surfacePoint("sphere", 0, 0.37), p);
    assert.ok(Morph.close(a, b, 1e-9));
    assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-9);
    previous = frame;
  }
  assert.equal(previous.morph, 1);
  assert.deepEqual(Array.from(previous.orientation.presentation.boost), Array.from(target.boost));
  current.game.completion.settled = true;
  current.game.completion.manualProgress = 0.4;
  assert.deepEqual(Array.from(current.draw(7100).orientation.presentation.boost), Array.from(target.boost));
});

test("对局及终局的点击滑行与手动拖动共享实际进度，二维端点清除终局曲面", () => {
  for (const ended of [false, true]) {
    for (const reduced of [false, true]) {
      const game = { view: { progress: 0.4, target: 0.4, rotation: {}, elastic: { x: 0, y: 0 } }, completion: null };
      const context = harness({
        game, performance: { now: () => 0 }, canUseViewControl: () => true,
        isEndedView: () => ended, prefersReducedMotion: () => reduced,
        createCompletionState: () => ({ settled: true }),
        updateTurnUI() {}, syncGameTools() {}, requestRender() {}
      }, ["setInteractiveViewProgress", "updateInteractiveViewMotion"]);
      context.setInteractiveViewProgress(0.8, true, false);
      if (!reduced) {
        assert.equal(game.view.progress, 0.4);
        assert.equal(game.view.transitioning, true);
        context.updateInteractiveViewMotion(220);
        assert.ok(game.view.progress > 0.4 && game.view.progress < 0.8);
        context.updateInteractiveViewMotion(1000);
      }
      assert.equal(game.view.progress, 0.8);
      if (ended) { assert.equal(game.completion.manualProgress, 0.8); }
      context.setInteractiveViewProgress(0.3, false, true);
      assert.equal(game.view.progress, 0.3);
      context.setInteractiveViewProgress(0, true, false);
      if (!reduced) { context.updateInteractiveViewMotion(1000); }
      assert.equal(game.view.progress, 0);
      assert.equal(game.completion, null);
    }
  }
});

test("自动终局期间滑块的展示进度与每一帧曲面同步，不在动画结束时跳到端点", () => {
  const current = scene("sphere", 0.4);
  for (let elapsed = 0; elapsed <= 3000; elapsed += 16) {
    current.tick(4000 + elapsed);
    assert.equal(current.game.view.progress, current.draw(4000 + elapsed).morph);
  }
  current.tick(7000);
  assert.equal(current.game.view.progress, 1);
  assert.equal(current.game.completion.settled, true);
});

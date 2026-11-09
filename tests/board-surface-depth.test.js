"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Art = require("../app/assets/board-art.js");
const Content = require("../app/assets/level-config.js");
const Engine = require("../app/assets/topology.js");
const Morph = require("../app/assets/topology-morph.js");

function recordingContext() {
  const stones = [], stack = [];
  let state = { x: 0, y: 0, clip: null }, rectangles = [], circle = null;
  return {
    stones, globalAlpha: 1,
    save() { stack.push({ ...state, globalAlpha: this.globalAlpha }); },
    restore() { state = stack.pop(); this.globalAlpha = state.globalAlpha; },
    translate(x, y) { state.x += x; state.y += y; },
    beginPath() { rectangles = []; circle = null; },
    rect(x, y, width, height) { rectangles.push({ x, y, width, height }); },
    clip() { state.clip = rectangles.slice(); },
    arc(x, y, radius) { circle = { x: state.x + x, y: state.y + y, radius }; },
    fill() { if (circle) stones.push({ ...circle, clip: state.clip, alpha: this.globalAlpha }); },
    moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, strokeRect() {}, setLineDash() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; }
  };
}

test("共享棋盘的棋子随透视缩放，背面淡显而正面清晰", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    const level = Content.LEVELS.find(level => level.topology === type);
    const rules = Engine.createRules({ type, width: 7, height: 7 });
    const game = { level, rules, board: new Int8Array(49).fill(Engine.HUMAN), lastMove: -1 };
    const layout = Art.computeLayout(640, 560, rules);
    const orientation = { x: 0.42, y: -0.58, z: -0.08, morph: 1, perspective: 1 };
    const ctx = recordingContext();
    const depth = Art.drawCompletion(ctx, { game, layout, morph: 1, orientation });
    assert.equal(ctx.stones.length, 49, type + " draws each stone exactly once");
    assert.ok(ctx.stones.every(stone => stone.alpha >= 0.16 && stone.alpha <= 1));
    const projected = [...game.board].map((_, cell) => {
      const uv = Morph.stoneUV(rules, cell);
      return Art.mappedCompletionPoint(game, layout, Art.cellCenter(rules, layout, cell), uv, orientation);
    }).sort((a, b) => a.depth - b.depth);
    let hidden = 0, shown = 0;
    projected.forEach((point, index) => {
      const radius = layout.cell * 0.3 * point.scale;
      const stone = ctx.stones[index];
      assert.ok(Math.hypot(point.x - stone.x, point.y - stone.y) < 1e-8);
      assert.ok(Math.abs(stone.radius - radius) < 1e-8);
      assert.equal(stone.clip, null, type + " keeps a whole circular silhouette without raster clipping");
      if (point.depth + 0.2 < depth.depthAt(point.x, point.y)) {
        assert.equal(stone.alpha, 0.16, type + " deeply occluded stones remain faint");
        hidden++;
      } else if (depth.visible(point, 0)) {
        assert.equal(stone.alpha, 1, type + " foreground stones remain opaque and complete");
        shown++;
      }
    });
    assert.ok(shown > 0, type + " has visible stones");
    if (["cylinder", "torus", "sphere"].includes(type)) assert.ok(hidden > 0, type + " has occluded stones");
    assert.ok(ctx.stones.at(-1).radius > ctx.stones[0].radius, type + " near stones are larger");
  }
});

test("二维端点的棋子大小、位置和可见性保持原样", () => {
  const level = Content.LEVELS.find(level => level.topology === "torus");
  const rules = Engine.createRules({ type: "torus", width: 7, height: 7 });
  const game = { level, rules, board: new Int8Array(49).fill(Engine.AI), lastMove: -1 };
  const layout = Art.computeLayout(640, 560, rules), ctx = recordingContext();
  Art.drawCompletion(ctx, { game, layout, morph: 0 });
  assert.equal(ctx.stones.length, 49);
  ctx.stones.forEach((stone, cell) => {
    const point = Art.cellCenter(rules, layout, cell);
    assert.ok(Math.hypot(point.x - stone.x, point.y - stone.y) < 1e-8);
    assert.equal(stone.radius, layout.cell * 0.37);
    assert.equal(stone.clip, null);
    assert.equal(stone.alpha, 1);
  });
});

test("共享 renderer 的旋转归约保留最终朝向并去掉整圈", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    const zero = { x: 0, y: 0, z: 0 }, turns = { x: 2 * Math.PI, y: -4 * Math.PI, z: 6 * Math.PI };
    Art.prepareMorphRotation(type, zero, 1);
    Art.prepareMorphRotation(type, turns, 1);
    for (const axis of ["x", "y", "z"]) assert.ok(Math.abs(zero[axis] - turns[axis]) < 1e-12, type + " " + axis);
  }
});

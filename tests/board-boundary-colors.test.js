"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Art = require("../app/assets/board-art.js");
const Content = require("../app/assets/level-config.js");
const Engine = require("../app/assets/topology.js");
const Morph = require("../app/assets/topology-morph.js");

const TEAL = "rgba(63,140,135,0.78)";
const GOLD = "rgba(199,146,68,0.76)";
const SIDE_UV = {
  top: amount => [amount, 0],
  left: amount => [0, amount],
  bottom: amount => [amount, 1],
  right: amount => [1, amount]
};

function recordingContext() {
  const strokes = [];
  const stack = [];
  let points = [];
  const styleKeys = ["strokeStyle", "fillStyle", "globalAlpha", "lineWidth", "lineCap", "lineJoin", "shadowColor", "shadowBlur"];
  const ctx = {
    globalAlpha: 1,
    save() { stack.push(Object.fromEntries(styleKeys.map(key => [key, this[key]]))); },
    restore() { Object.assign(this, stack.pop()); },
    createLinearGradient() { return { addColorStop() {} }; },
    beginPath() { points = []; },
    moveTo(x, y) { points.push({ x, y }); },
    lineTo(x, y) { points.push({ x, y }); },
    closePath() {},
    fill() {},
    stroke() { strokes.push({ color: this.strokeStyle, alpha: this.globalAlpha, points: points.slice() }); },
    strokeRect() {},
    setLineDash() {}
  };
  return { ctx, strokes };
}

function draw(topology, morph) {
  const level = Content.LEVELS.find(item => item.topology === topology);
  const rules = Engine.createRules({ type: topology, width: level.width, height: level.height });
  const game = { level, rules, board: new Int8Array(rules.cellCount) };
  const layout = Art.computeLayout(520, 480, level);
  const orientation = { x: 0.42, y: -0.58, z: -0.08, scale: 1, morph };
  const { ctx, strokes } = recordingContext();
  Art.drawCompletion(ctx, { game, layout, morph, orientation });
  return { strokes, layout, orientation, rules };
}

function assertPoint(actual, expected, message) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-8 && Math.abs(actual.y - expected.y) < 1e-8,
    `${message}: (${actual.x}, ${actual.y}) != (${expected.x}, ${expected.y})`);
}

function assertSide(stroke, side, topology, drawing) {
  const { layout, orientation } = drawing;
  assert.ok(stroke.points.length > 2, `${topology} ${side} follows the curved surface`);
  stroke.points.forEach((point, index) => {
    const [u, v] = SIDE_UV[side](index / (stroke.points.length - 1));
    const flat = Art.flatPointFromUV(drawing.rules, layout, u, v);
    const projected = Morph.project(topology, u, v, layout.width, layout.height, orientation);
    assertPoint(point, {
      x: flat.x * (1 - orientation.morph) + projected.x * orientation.morph,
      y: flat.y * (1 - orientation.morph) + projected.y * orientation.morph
    }, `${topology} ${side} at morph ${orientation.morph}, sample ${index}`);
  });
}

test("归圆变形全过程：上边与左边同为绿色，下边与右边同为金色", () => {
  for (const morph of [0, 0.001, 0.25, 0.5, 0.7, 0.95, 1]) {
    const drawing = draw("sphere", morph);
    for (const [color, sides] of [[TEAL, ["top", "left"]], [GOLD, ["bottom", "right"]]]) {
      const boundaries = drawing.strokes.filter(stroke => stroke.color === color);
      assert.equal(boundaries.length, 2);
      sides.forEach((side, index) => assertSide(boundaries[index], side, "sphere", drawing));
      if (morph === 1) {
        boundaries[0].points.forEach((point, index) => {
          assertPoint(point, boundaries[1].points[index], `${color} paired edges meet on the completed sphere`);
        });
      }
    }
  }
});

test("归圆二维辅助线与变形边界使用相同的邻边配色", () => {
  const drawing = draw("sphere", 0);
  const { layout } = drawing;
  const offset = layout.cell * 0.5;
  const expected = new Map([
    [Art.TOKENS.teal, [
      [{ x: layout.left, y: layout.top - offset }, { x: layout.right, y: layout.top - offset }],
      [{ x: layout.left - offset, y: layout.top }, { x: layout.left - offset, y: layout.bottom }]
    ]],
    [Art.TOKENS.gold, [
      [{ x: layout.left, y: layout.bottom + offset }, { x: layout.right, y: layout.bottom + offset }],
      [{ x: layout.right + offset, y: layout.top }, { x: layout.right + offset, y: layout.bottom }]
    ]]
  ]);
  for (const [color, paths] of expected) {
    const rails = drawing.strokes.filter(stroke => stroke.color === color);
    assert.equal(rails.length, 2);
    rails.forEach((rail, index) => assert.deepEqual(rail.points, paths[index]));
  }
});

test("其他拓扑保持左右绿色、上下金色，未接合的边不绘制彩色边界", () => {
  for (const level of Content.LEVELS.filter(item => item.topology !== "sphere")) {
    for (const morph of [0, 0.25, 0.7, 1]) {
      const drawing = draw(level.topology, morph);
      for (const [color, sides] of [
        [TEAL, level.xConnection ? ["left", "right"] : []],
        [GOLD, level.yConnection ? ["top", "bottom"] : []]
      ]) {
        const boundaries = drawing.strokes.filter(stroke => stroke.color === color);
        assert.equal(boundaries.length, sides.length, `${level.topology} ${color}`);
        sides.forEach((side, index) => assertSide(boundaries[index], side, level.topology, drawing));
      }
    }
  }
});

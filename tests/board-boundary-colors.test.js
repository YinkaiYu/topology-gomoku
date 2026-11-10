"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Art = require("../app/assets/board-art.js");
const Content = require("../app/assets/level-config.js");
const Engine = require("../app/assets/topology.js");
const Morph = require("../app/assets/topology-morph.js");

const TEAL = "rgba(63,140,135,0.78)";
const GOLD = "rgba(199,146,68,0.76)";
function sameHue(actual, expected) {
  const rgb = value => /^#[0-9a-f]{6}$/i.test(value)
    ? [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16)).join(",")
    : String(value).match(/[\d.]+/g)?.slice(0, 3).join(",");
  return rgb(actual) === rgb(expected);
}
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
    moveTo(x, y) { points.push({ x, y, start: true }); },
    lineTo(x, y) { points.push({ x, y }); },
    closePath() {},
    fill() {},
    stroke() { strokes.push({ color: this.strokeStyle, alpha: this.globalAlpha, points: points.slice() }); },
    strokeRect() {},
    setLineDash() {}, fillRect() {}, arc() {}
  };
  return { ctx, strokes };
}

function draw(topology, morph) {
  const level = Content.LEVELS.find(item => item.topology === topology);
  const rules = Engine.createRules({ type: topology, width: level.width, height: level.height });
  const game = { level, rules, board: new Int8Array(rules.cellCount) };
  const layout = Art.computeLayout(520, 480, level);
  const orientation = { x: 0.42, y: -0.58, z: -0.08, scale: 1, morph, perspective: morph };
  const { ctx, strokes } = recordingContext();
  const depth = Art.drawCompletion(ctx, { game, layout, morph, orientation });
  return { strokes, layout, orientation, rules, depth };
}

function assertPoint(actual, expected, message) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-8 && Math.abs(actual.y - expected.y) < 1e-8,
    `${message}: (${actual.x}, ${actual.y}) != (${expected.x}, ${expected.y})`);
}

function frontBoundaries(drawing, color) {
  const strokes = drawing.strokes.filter(stroke => sameHue(stroke.color, color));
  if (!drawing.orientation.morph) { return strokes; }
  assert.equal(strokes.length % 2, 0, "each seam has a faint path followed by a depth-clipped path");
  for (let index = 0; index < strokes.length; index += 2) {
    assert.ok(strokes[index].alpha <= strokes[index + 1].alpha * 0.16 + 1e-10,
      "rear seam is quieter than its front counterpart");
  }
  return strokes.filter((_, index) => index % 2 === 1);
}

function assertSide(stroke, side, topology, drawing) {
  const { layout, orientation } = drawing;
  const from = SIDE_UV[side](0), to = SIDE_UV[side](1);
  const samples = drawing.depth.mesh.path({ u: from[0], v: from[1] }, { u: to[0], v: to[1] });
  if (orientation.morph === 0) {
    assertPoint(stroke.points[0], samples[0], `${topology} ${side} flat start`);
    assertPoint(stroke.points.at(-1), samples.at(-1), `${topology} ${side} flat end`);
  }
  // Depth clipping inserts extra samples and can remove a whole rear edge.
  // Every surviving point must still belong to this specific colored seam.
  const probes = stroke.points.map(point => ({ point, visible: false }));
  stroke.points.forEach((point, index) => {
    if (index && !point.start) {
      const previous = stroke.points[index - 1];
      for (const t of [0.1, 0.5, 0.9]) probes.push({ point: { x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t }, visible: true });
    }
  });
  // Endpoints lie exactly on a foreground contour; test the segment interiors.
  probes.forEach(({ point, visible }) => {
    let nearest = { distance: Infinity };
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const projected = { x: a.x + dx * t, y: a.y + dy * t, depth: a.depth + (b.depth - a.depth) * t };
      const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
      if (distance < nearest.distance) nearest = { distance, point: projected };
    }
    assert.ok(nearest.distance < 1e-7, `${topology} ${side} remains on its seam`);
    if (visible) assert.ok(drawing.depth.visible(nearest.point, 0.045001), `${topology} ${side} is not behind the sheet`);
  });
}

test("归圆变形全过程：上边与左边同为绿色，下边与右边同为金色", () => {
  for (const morph of [0, 0.001, 0.25, 0.5, 0.7, 0.95, 1]) {
    const drawing = draw("sphere", morph);
    for (const [color, sides] of [[TEAL, ["top", "left"]], [GOLD, ["bottom", "right"]]]) {
      const boundaries = frontBoundaries(drawing, color);
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
      [{ x: layout.left - offset, y: layout.top - offset }, { x: layout.right + offset, y: layout.top - offset }],
      [{ x: layout.left - offset, y: layout.top - offset }, { x: layout.left - offset, y: layout.bottom + offset }]
    ]],
    [Art.TOKENS.gold, [
      [{ x: layout.left - offset, y: layout.bottom + offset }, { x: layout.right + offset, y: layout.bottom + offset }],
      [{ x: layout.right + offset, y: layout.top - offset }, { x: layout.right + offset, y: layout.bottom + offset }]
    ]]
  ]);
  for (const [color, paths] of expected) {
    const rails = drawing.strokes.filter(stroke => stroke.color === color);
    assert.equal(rails.length, 2);
    rails.forEach((rail, index) => assert.deepEqual(rail.points.map(({ x, y }) => ({ x, y })), paths[index]));
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
        const boundaries = frontBoundaries(drawing, color);
        assert.equal(boundaries.length, sides.length, `${level.topology} ${color}`);
        sides.forEach((side, index) => assertSide(boundaries[index], side, level.topology, drawing));
      }
    }
  }
});

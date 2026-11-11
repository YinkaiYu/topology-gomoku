"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Morph = require("../app/assets/topology-morph.js");

const center = { x: 100, y: 100, depth: 0, depthScale: 100 };
const radius = 10;

function quad(left, top, right, bottom, depth) {
  const z = typeof depth === "function" ? depth : () => depth;
  return { points: [[left, top], [right, top], [right, bottom], [left, bottom]]
    .map(([x, y]) => ({ x, y, depth: z(x, y) })) };
}

function contours(patches, point = center) {
  return Morph.stoneContours(Morph.createDepthBuffer(200, 200, patches), point, radius);
}

function contains(polygon, x, y) {
  let winding = 0;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const side = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (a.y <= y && b.y > y && side > 0) winding++;
    if (a.y > y && b.y <= y && side < 0) winding--;
  }
  return winding !== 0;
}

function visibleAt(pieces, x, y) {
  return pieces === null || pieces.some(piece => contains(piece, x, y));
}

function diskVisibility(pieces) {
  let visible = 0, samples = 0;
  for (let row = 0; row < 60; row++) {
    for (let column = 0; column < 60; column++) {
      const x = (column + 0.37) / 60 * 2 - 1;
      const y = (row + 0.63) / 60 * 2 - 1;
      if (x * x + y * y > 1) continue;
      samples++;
      if (visibleAt(pieces, center.x + radius * x, center.y + radius * y)) visible++;
    }
  }
  return visible / samples;
}

test("stone contour contract distinguishes unobstructed, partially covered and fully covered stones", () => {
  assert.equal(contours([]), null);
  assert.equal(contours([quad(50, 50, 150, 150, -1)]), null);
  assert.deepEqual(contours([quad(50, 50, 150, 150, 2)]), []);
  const half = contours([quad(100, 50, 150, 150, 2)]);
  assert.ok(Array.isArray(half) && half.length > 0);
  assert.equal(visibleAt(half, 95, 100), true);
  assert.equal(visibleAt(half, 105, 100), false);
  assert.ok(Math.abs(diskVisibility(half) - 0.5) < 0.015, "a foreground half-plane masks half of the actual face");
});

test("overlapping foreground surfaces form a union without reopening already covered regions", () => {
  const cover = [quad(100, 50, 150, 150, 2), quad(50, 50, 150, 100, 3)];
  for (const patches of [cover, cover.slice().reverse(), cover.concat(cover)]) {
    const pieces = contours(patches);
    assert.equal(visibleAt(pieces, 95, 105), true);
    assert.equal(visibleAt(pieces, 105, 95), false, "doubly covered overlap remains hidden");
    assert.equal(visibleAt(pieces, 95, 95), false);
    assert.equal(visibleAt(pieces, 105, 105), false);
    assert.ok(Math.abs(diskVisibility(pieces) - 0.25) < 0.015);
  }
});

test("a moving foreground contour reveals the stone continuously instead of switching its whole face", () => {
  let previous = 0;
  let partial = 0;
  for (let step = 0; step <= 40; step++) {
    const edge = 90 + step * 0.5;
    const fraction = diskVisibility(contours([quad(edge, 50, 150, 150, 2)]));
    assert.ok(fraction + 0.001 >= previous);
    assert.ok(fraction - previous < 0.06, "a half-pixel cover motion cannot reveal a large jump");
    if (fraction > 0 && fraction < 1) partial++;
    previous = fraction;
  }
  assert.ok(partial > 30);
  assert.equal(previous, 1);
});

test("rounded stone depth preserves a raised center while an approaching surface covers the rim", () => {
  const fractions = [];
  for (let step = 0; step <= 80; step++) {
    const z = -0.03 + step * 0.0025;
    const pieces = contours([quad(50, 50, 150, 150, z)]);
    fractions.push(diskVisibility(pieces));
  }
  assert.equal(fractions[0], 1);
  assert.equal(fractions[fractions.length - 1], 0);
  assert.ok(fractions.some(value => value > 0.1 && value < 0.9));
  for (let index = 1; index < fractions.length; index++) {
    assert.ok(fractions[index] <= fractions[index - 1] + 0.001);
    assert.ok(fractions[index - 1] - fractions[index] < 0.12, "small depth changes cannot hide a substantial flat center at once");
  }
});

test("grazing local surfaces retain the raised stone center and move the cut continuously", () => {
  let previous = null;
  for (let step = 0; step <= 20; step++) {
    const slope = 0.005 + step * 0.001;
    const pieces = contours([quad(50, 50, 150, 150, x => (x - 100) * slope)]);
    assert.equal(visibleAt(pieces, 100, 100), true, "the stone does not disappear because its own support slopes");
    const fraction = diskVisibility(pieces);
    assert.ok(fraction > 0.5);
    if (previous !== null) assert.ok(Math.abs(fraction - previous) < 0.05);
    previous = fraction;
  }
});

test("paintStone preserves caller opacity and clips only the clear foreground pass", () => {
  const depth = Morph.createDepthBuffer(200, 200, [quad(100, 50, 150, 150, 2)]);
  depth.translucency = 0.16;
  const stack = [];
  const ctx = { globalAlpha: 0.8, clipping: false,
    save() { stack.push({ alpha: this.globalAlpha, clipping: this.clipping }); },
    restore() { const saved = stack.pop(); this.globalAlpha = saved.alpha; this.clipping = saved.clipping; },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, rect() {}, arc() {}, clip(rule) { this.clipping = rule || true; }
  };
  const passes = [];
  Morph.paintStone(ctx, depth, center, radius, () => passes.push({ alpha: ctx.globalAlpha, clipping: ctx.clipping }));
  assert.equal(passes[0].clipping, "evenodd", "cast shadow is clipped outside the circular face");
  assert.ok(passes[0].alpha > 0.8 * 0.16 && passes[0].alpha < 0.8, "shadow follows the visible area continuously");
  assert.deepEqual(passes.slice(1), [{ alpha: 0.8 * 0.16, clipping: false }, { alpha: 0.8, clipping: true }]);
  assert.equal(ctx.globalAlpha, 0.8);
  assert.equal(ctx.clipping, false);
  assert.equal(stack.length, 0);
});

test("unobstructed paint avoids clipping and a covered stone retains only its translucent pass", () => {
  const depth = Morph.createDepthBuffer(200, 200, [quad(50, 50, 150, 150, 2)]);
  depth.translucency = 0.16;
  const stack = [];
  const ctx = { globalAlpha: 1, save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); } };
  const calls = [];
  const paint = withShadow => calls.push({ alpha: ctx.globalAlpha, shadow: withShadow !== false });
  Morph.paintStone(ctx, null, center, radius, paint);
  Morph.paintStone(ctx, depth, center, radius, paint);
  assert.deepEqual(calls, [{ alpha: 1, shadow: true }, { alpha: 0.16, shadow: false }],
    "a fully covered face uses the same shadow-free translucent pass as a partially covered face");
  assert.equal(ctx.globalAlpha, 1);
});

test("one or several covering sheets cannot restore a covered face or its cast shadow", () => {
  const front = quad(50, 50, 150, 150, 2);
  const back = quad(50, 50, 150, 150, 0.5);
  for (const patches of [[front], [front, back], [back, front], [front, front, back]]) {
    const depth = Morph.createDepthBuffer(200, 200, patches);
    const stack = [], passes = [];
    const ctx = { globalAlpha: 0.6,
      save() { stack.push(this.globalAlpha); },
      restore() { this.globalAlpha = stack.pop(); }
    };
    depth.translucency = 0.16;
    Morph.paintStone(ctx, depth, center, radius, withShadow => passes.push([ctx.globalAlpha, withShadow]));
    assert.deepEqual(passes, [[0.6 * 0.16, false]]);
    assert.equal(ctx.globalAlpha, 0.6);
    passes.length = 0;
    depth.translucency = 0;
    Morph.paintStone(ctx, depth, center, radius, () => passes.push(true));
    assert.deepEqual(passes, [], "opaque sheets completely hide the stone");
  }
});

function rectangle(left, top, right, bottom) {
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
}

function signedArea(polygon) {
  return polygon.reduce((sum, a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    return sum + a.x * b.y - a.y * b.x;
  }, 0) / 2;
}

function outlineContains(outline, x, y) {
  return outline.reduce((winding, polygon) => winding + (contains(polygon, x, y) ? Math.sign(signedArea(polygon)) : 0), 0) !== 0;
}

test("stone outline removes diagonal and T-junction fragment seams before Canvas clipping", () => {
  const triangles = [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }],
    [{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]];
  const withT = [rectangle(0, 0, 10, 20), rectangle(10, 0, 20, 7), rectangle(10, 7, 20, 20)];
  for (const pieces of [triangles, withT]) {
    const outline = Morph.stoneOutline(pieces);
    assert.equal(outline.length, 1);
    assert.ok(Math.abs(signedArea(outline[0]) - 400) < 1e-7);
    for (let index = 0; index < outline[0].length; index++) {
      const a = outline[0][index], b = outline[0][(index + 1) % outline[0].length];
      assert.ok((a.x === 0 && b.x === 0) || (a.x === 20 && b.x === 20) ||
        (a.y === 0 && b.y === 0) || (a.y === 20 && b.y === 20), "only actual outer edges reach Canvas.clip");
    }
  }
});

test("stone outline preserves real holes and disconnected visible islands", () => {
  const ring = [rectangle(0, 0, 30, 10), rectangle(0, 20, 30, 30), rectangle(0, 10, 10, 20), rectangle(20, 10, 30, 20)];
  const outline = Morph.stoneOutline(ring);
  assert.equal(outline.length, 2);
  assert.deepEqual(outline.map(signedArea).sort((a, b) => a - b), [-100, 900]);
  assert.equal(outlineContains(outline, 15, 15), false);
  assert.equal(outlineContains(outline, 5, 15), true);
  assert.equal(outlineContains(outline, 35, 15), false);
  const islands = Morph.stoneOutline([rectangle(0, 0, 5, 5), rectangle(10, 0, 15, 5)]);
  assert.equal(islands.length, 2);
  assert.equal(outlineContains(islands, 7, 2), false);
});

test("stone outline welds harmless clipping roundoff without retaining a visible interior seam", () => {
  const outline = Morph.stoneOutline([rectangle(0, 0, 10, 20), rectangle(10 + 2e-7, 0, 20, 7), rectangle(10 - 2e-7, 7, 20, 20)]);
  assert.equal(outline.length, 1);
  assert.ok(Math.abs(signedArea(outline[0]) - 400) < 1e-4);
  assert.ok(outline[0].every(point => Math.abs(point.x) < 1e-6 || Math.abs(point.x - 20) < 1e-6 || Math.abs(point.y) < 1e-6 || Math.abs(point.y - 20) < 1e-6));
});

test("merging curved stone fragments changes no covered or uncovered area", () => {
  const pieces = contours([quad(80, 80, 120, 120, (x, y) => (x - 100) * 0.012 + (y - 100) * 0.006),
    quad(101, 80, 108, 108, 0.09)]);
  assert.ok(pieces && pieces.length > 1);
  const outline = Morph.stoneOutline(pieces);
  for (let row = 0; row < 41; row++) {
    for (let column = 0; column < 41; column++) {
      const x = 80 + column + 0.357, y = 80 + row + 0.713;
      assert.equal(outlineContains(outline, x, y), visibleAt(pieces, x, y), `coverage at ${x},${y}`);
    }
  }
});

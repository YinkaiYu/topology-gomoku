"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Morph = require("../app/assets/topology-morph.js");

function quad(left, top, right, bottom, z) {
  return { points: [[left, top], [right, top], [right, bottom], [left, bottom]]
    .map(([x, y]) => ({ x, y, depth: typeof z === "function" ? z(x, y) : z })) };
}

function lineLength(paths) {
  return paths.reduce((sum, points) => sum + points.slice(1).reduce((total, b, i) =>
    total + Math.hypot(b.x - points[i].x, b.y - points[i].y), 0), 0);
}

function mesh(type, rotation = {}, morph = 1) {
  const vertices = [], patches = [], count = 24;
  for (let y = 0; y <= count; y++) {
    const row = [];
    for (let x = 0; x <= count; x++) {
      const u = x / count, v = y / count;
      const p = Morph.project(type, u, v, 500, 500, { perspective: morph, ...rotation });
      row.push(Morph.morphPoint(type, { x: 60 + u * 380, y: 60 + v * 380 }, u, v, p, morph));
    }
    vertices.push(row);
  }
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      patches.push({ points: [vertices[y][x], vertices[y][x + 1], vertices[y + 1][x + 1], vertices[y + 1][x]] });
    }
  }
  const depth = Morph.createDepthBuffer(500, 500, patches);
  depth.topology = type; depth.morph = morph;
  return depth;
}

test("intersection contours find equality of two crossing sheets, not their projected overlap", () => {
  const depth = Morph.createDepthBuffer(200, 200, [quad(20, 20, 180, 180, 0), quad(50, 50, 150, 150, x => (x - 100) / 100)]);
  const paths = depth.surfaceIntersections();
  assert.ok(Math.abs(lineLength(paths) - 100) < 1e-7);
  for (const p of paths.flat()) {
    assert.ok(Math.abs(p.x - 100) < 1e-7);
    assert.ok(Math.abs(p.depth) < 1e-7);
    assert.ok(p.y >= 50 - 1e-7 && p.y <= 150 + 1e-7);
  }
  assert.equal(depth.surfaceIntersections(), paths, "a frame reuses its calculated contours");
  for (const z of [0, 0.5]) {
    assert.deepEqual(Morph.createDepthBuffer(200, 200, [quad(20, 20, 180, 180, 0), quad(50, 50, 150, 150, z)]).surfaceIntersections(), []);
  }
});

test("ordinary mesh diagonals, shared edges and point tangencies do not become cut lines", () => {
  const a = { x: 20, y: 20, depth: 0 }, b = { x: 180, y: 20, depth: 0 };
  const patches = [{ points: [a, b, { x: 100, y: 170, depth: 0.5 }] },
    { points: [a, b, { x: 100, y: 150, depth: -0.5 }] }];
  assert.deepEqual(Morph.createDepthBuffer(200, 200, patches).surfaceIntersections(), []);
  assert.deepEqual(Morph.createDepthBuffer(200, 200, [quad(20, 20, 100, 100, 0), quad(100, 100, 180, 180, x => x - 100)]).surfaceIntersections(), []);
});

test("two folded triangles sharing one chart vertex can still cross along a real segment", () => {
  const shared = { x: 50, y: 50, depth: 0, u: 0.5, v: 0.5 };
  const patches = [{ points: [shared, { x: 150, y: 50, depth: 0 }, { x: 50, y: 150, depth: 0 }] },
    { points: [shared, { x: 150, y: 140, depth: -1 }, { x: 140, y: 150, depth: 1 }] }];
  const paths = Morph.createDepthBuffer(200, 200, patches).surfaceIntersections();
  assert.ok(Math.abs(lineLength(paths) - Math.hypot(50, 50)) < 1e-7);
});

test("completed embedded boards have no cut lines and both immersed boards retain their crossings", () => {
  for (const rotation of [{}, { x: 0.6, y: 0.75, z: -0.15 }]) {
    for (const type of ["cylinder", "torus", "mobius", "sphere"]) {
      assert.deepEqual(mesh(type, rotation).surfaceIntersections(), [], type);
    }
    for (const type of ["klein", "projective"]) {
      const depth = mesh(type, rotation), paths = depth.surfaceIntersections();
      assert.ok(lineLength(paths) > 50, `${type} keeps its real intersection curves`);
      assert.ok(paths.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.depth)));
    }
  }
});

test("unfolding can create genuine intersections even for a completed embedded topology", () => {
  for (const type of ["torus", "sphere"]) {
    assert.ok([0.4, 0.6, 0.75, 0.9].some(amount => lineLength(mesh(type, {}, amount).surfaceIntersections()) > 5), type);
    assert.deepEqual(mesh(type, {}, 0).surfaceIntersections(), []);
  }
});

test("intersection geometry is continuous under a subpixel screen translation", () => {
  const patches = [quad(20, 20, 180, 180, 0), quad(50, 50, 150, 150, x => (x - 100) / 100)];
  const before = Morph.createDepthBuffer(200, 200, patches).surfaceIntersections();
  const moved = patches.map(patch => ({ points: patch.points.map(p => ({ ...p, x: p.x + 0.137, y: p.y - 0.291 })) }));
  const after = Morph.createDepthBuffer(200, 200, moved).surfaceIntersections();
  assert.ok(Math.abs(lineLength(before) - lineLength(after)) < 1e-7);
  for (const p of after.flat()) assert.ok(Math.abs(p.x - 100.137) < 1e-7);
});

test("surface strokes retain depth occlusion instead of drawing every cut on top", () => {
  const depth = Morph.createDepthBuffer(200, 200, [quad(20, 20, 180, 180, 0),
    quad(50, 50, 150, 150, x => (x - 100) / 100), quad(0, 100, 200, 200, 2)]);
  const strokes = [], stack = [];
  const ctx = { globalAlpha: 1, save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); },
    beginPath() { this.path = []; }, moveTo(x, y) { this.path.push([x, y]); }, lineTo(x, y) { this.path.push([x, y]); },
    stroke() { strokes.push({ alpha: this.globalAlpha, points: this.path.slice() }); } };
  depth.translucency = 0.16;
  Morph.drawSurfaceIntersections(ctx, depth);
  assert.ok(strokes.some(stroke => stroke.alpha === 0.16 && stroke.points.some(p => p[1] > 100)));
  assert.ok(strokes.filter(stroke => stroke.alpha === 1).every(stroke => stroke.points.every(p => p[1] <= 100 + 1e-6)));
  assert.equal(ctx.globalAlpha, 1);
});

test("stone cut contours follow the rounded cap, excluding foreground silhouettes and ordinary support", () => {
  const point = { x: 100, y: 100, depth: 0, depthScale: 100 }, radius = 10;
  const empty = Morph.createDepthBuffer(200, 200, []);
  assert.deepEqual(Morph.stoneIntersectionContours(empty, point, radius), []);
  for (const patches of [[quad(20, 20, 180, 180, 0)], [quad(100, 20, 180, 180, 2)], [quad(20, 20, 180, 180, 2)]]) {
    assert.deepEqual(Morph.stoneIntersectionContours(Morph.createDepthBuffer(200, 200, patches), point, radius), []);
  }
  const intersecting = Morph.createDepthBuffer(200, 200, [quad(20, 20, 180, 180, 0.08)]);
  const paths = Morph.stoneIntersectionContours(intersecting, point, radius);
  assert.ok(lineLength(paths) > 40);
  for (const p of paths.flat()) {
    assert.ok(Math.abs(p.depth - 0.08) < 1e-6, "the line belongs to both the cap and the sheet");
    assert.ok(Math.hypot(p.x - point.x, p.y - point.y) < radius + 1e-6);
  }
});

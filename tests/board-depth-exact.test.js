"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Morph = require("../app/assets/topology-morph.js");

function quad(left, top, right, bottom, depth) {
  return { points: [
    { x: left, y: top, depth }, { x: right, y: top, depth },
    { x: right, y: bottom, depth }, { x: left, y: bottom, depth }
  ] };
}

function drawnSegments(buffer, points) {
  const segments = [];
  let previous;
  buffer.strokePath({
    beginPath() { previous = null; },
    moveTo(x, y) { previous = { x, y }; },
    lineTo(x, y) { segments.push([previous, { x, y }]); previous = { x, y }; },
    stroke() {}
  }, points);
  return segments;
}

test("depth queries preserve moving subpixel silhouettes without averaging adjacent sheets", () => {
  for (let shift = 0; shift < 2; shift += 0.073) {
    const edge = 50.123 + shift;
    const buffer = Morph.createDepthBuffer(128, 128, [quad(0, 0, 128, 128, -2), quad(edge, 20, 90, 100, 1)]);
    assert.equal(buffer.depthAt(edge - 0.0001, 60), -2);
    assert.equal(buffer.depthAt(edge + 0.0001, 60), 1);
    assert.equal(buffer.visible({ x: edge - 0.0001, y: 60, depth: -2 }), true);
    assert.equal(buffer.visible({ x: edge + 0.0001, y: 60, depth: -2 }), false);
  }
});

test("depth query interpolates the containing triangle and preserves narrow holes", () => {
  const a = { x: 4.125, y: 8.75, depth: -0.7, u: 0, v: 0 };
  const b = { x: 120.25, y: 11.5, depth: 1.3, u: 1, v: 0 };
  const c = { x: 9.75, y: 117.125, depth: 0.2, u: 0, v: 1 };
  const buffer = Morph.createDepthBuffer(128, 128, [{ points: [a, b, c] }]);
  for (const weights of [[0.2, 0.3, 0.5], [0.99, 0.005, 0.005], [0.001, 0.489, 0.51]]) {
    const x = a.x * weights[0] + b.x * weights[1] + c.x * weights[2];
    const y = a.y * weights[0] + b.y * weights[1] + c.y * weights[2];
    const expected = a.depth * weights[0] + b.depth * weights[1] + c.depth * weights[2];
    assert.ok(Math.abs(buffer.depthAt(x, y) - expected) < 1e-12);
  }
  assert.equal(buffer.depthAt(120, 120), -Infinity);
  const hole = Morph.createDepthBuffer(128, 128, [quad(0, 0, 50.2, 128, 1), quad(50.4, 0, 128, 128, 1)]);
  assert.equal(hole.depthAt(50.3, 64), -Infinity, "a 0.2px gap is not filled by filtered neighboring depths");
});

test("triangle rectangle queries are deduplicated and expose continuous depth planes with vertex metadata", () => {
  const patch = quad(5, 5, 100, 100, 0.25);
  patch.points[0].u = 0.15;
  const buffer = Morph.createDepthBuffer(128, 128, [patch]);
  const facets = buffer.trianglesInRect(0, 0, 128, 128);
  assert.equal(facets.length, 2);
  assert.equal(new Set(facets).size, 2);
  for (const facet of facets) {
    assert.equal(facet.a, patch.points[0]);
    assert.equal(facet.a.u, 0.15);
    assert.equal(facet.dzdx * 50 + facet.dzdy * 50 + facet.offset, 0.25);
    assert.equal(facet.minX, 5);
    assert.equal(facet.maxY, 100);
  }
  assert.equal(buffer.trianglesInRect(101, 101, 127, 127).length, 0);
  assert.equal(buffer.trianglesInRect(-50, -50, -1, -1).length, 0);
  assert.equal(buffer.trianglesInRect(0, 0, 128, 128).length, 2, "subsequent queries return the same complete candidates");
});

test("stroke clips at continuously moving contours and cannot skip subpixel occluders", () => {
  for (const shift of [0, 0.037, 0.51, 1.09]) {
    const left = 40.123 + shift, right = left + 0.2;
    const buffer = Morph.createDepthBuffer(128, 128, [quad(left, 20, right, 100, 1)]);
    const segments = drawnSegments(buffer, [{ x: 10, y: 60, depth: 0 }, { x: 110, y: 60, depth: 0 }]);
    assert.equal(segments.length, 2);
    assert.ok(Math.abs(segments[0][1].x - left) < 1e-6);
    assert.ok(Math.abs(segments[1][0].x - right) < 1e-6);
    assert.ok(segments.every(([a, b]) => b.x <= left + 1e-6 || a.x >= right - 1e-6));
  }
});

test("stroke finds depth crossings inside triangles and merges overlapping foreground sheets", () => {
  const slope = { points: [
    { x: 0, y: 0, depth: 0 }, { x: 120, y: 0, depth: 1.2 },
    { x: 120, y: 120, depth: 1.2 }, { x: 0, y: 120, depth: 0 }
  ] };
  const points = [{ x: 10, y: 60, depth: 0.5 }, { x: 110, y: 60, depth: 0.5 }];
  const buffer = Morph.createDepthBuffer(128, 128, [slope]);
  const segments = drawnSegments(buffer, points);
  assert.equal(segments.length, 1);
  assert.ok(Math.abs(segments[0][1].x - 54.5) < 1e-6, "grid depth offset is resolved at the exact crossing");
  const overlapping = [quad(40, 20, 70, 100, 1), quad(55, 20, 80, 100, 2)];
  const first = drawnSegments(Morph.createDepthBuffer(128, 128, overlapping), points);
  const second = drawnSegments(Morph.createDepthBuffer(128, 128, overlapping.slice().reverse()), points);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.ok(Math.abs(first[0][1].x - 40) < 1e-6);
  assert.ok(Math.abs(first[1][0].x - 80) < 1e-6);
});

test("coplanar grid paths stay connected while a separate foreground fold still hides them", () => {
  const buffer = Morph.createDepthBuffer(128, 128, [quad(10, 20, 110, 100, 1)]);
  const points = Array.from({ length: 101 }, (_, index) => ({ x: index + 10, y: 60, depth: 1 }));
  const segments = drawnSegments(buffer, points);
  assert.deepEqual(segments, [[{ x: 10, y: 60 }, { x: 110, y: 60 }]], "collinear samples paint one uninterrupted segment");
  const near = drawnSegments(buffer, [{ x: 10, y: 60, depth: 0.97 }, { x: 110, y: 60, depth: 0.97 }]);
  assert.equal(near.length, 1, "small mesh offsets favor the visible grid");
});

test("dense straight mesh paths paint one segment without changing the mesh or skipping thin occluders", () => {
  const count = 20;
  const vertices = Array.from({ length: count + 1 }, (_, row) => Array.from({ length: count + 1 }, (_, column) => ({
    u: column / count, v: row / count, x: 10 + 100 * column / count, y: 10 + 100 * row / count, depth: column / count * 0.1
  })));
  const mesh = Morph.createSurfaceMesh(vertices), before = JSON.stringify(vertices);
  const points = Array.from({ length: 97 }, (_, index) => ({ u: index / 96, v: .41 }));
  const clear = Morph.createDepthBuffer(128, 128, []); clear.mesh = mesh;
  assert.deepEqual(drawnSegments(clear, points), [[{ x: 10, y: 51 }, { x: 110, y: 51 }]]);
  const blocker = Morph.createDepthBuffer(128, 128, [quad(50.123, 20, 50.323, 100, 1)]); blocker.mesh = mesh;
  const segments = drawnSegments(blocker, points);
  assert.equal(segments.length, 2, "a long simplified stroke still performs exact foreground clipping");
  assert.ok(Math.abs(segments[0][1].x - 50.123) < 1e-6);
  assert.ok(Math.abs(segments[1][0].x - 50.323) < 1e-6);
  assert.equal(JSON.stringify(vertices), before, "rendering simplification never mutates geometry");
});

test("stroke simplification preserves true screen bends, depth bends and direction reversals", () => {
  const clear = Morph.createDepthBuffer(128, 128, []);
  const a = { x: 10, y: 60, depth: 0 }, b = { x: 60, y: 60, depth: 0 }, c = { x: 110, y: 60, depth: 0 };
  assert.equal(drawnSegments(clear, [a, { ...b, y: 60 + 2e-8 }, c]).length, 2, "screen turns beyond 1e-8px remain");
  assert.equal(drawnSegments(clear, [a, { ...b, depth: 2e-10 }, c]).length, 2, "depth turns beyond 1e-10 remain");
  const reversal = [a, b, { ...b, x: 40 }, c];
  assert.equal(drawnSegments(clear, reversal).length, 3, "a collinear reversal is not a straight monotone path");
  const blocker = Morph.createDepthBuffer(128, 128, [quad(0, 0, 128, 128, .5)]);
  const bentDepth = drawnSegments(blocker, [{ ...a, depth: .8 }, { ...b, depth: .1 }, { ...c, depth: .8 }]);
  assert.equal(bentDepth.length, 2, "the hidden middle of a depth bend stays hidden");
  assert.ok(bentDepth[0][1].x < 40 && bentDepth[1][0].x > 80);
});

test("all folded boards preserve visibility under subpixel screen translations", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    const count = 36;
    const view = { x: 0.8, y: -0.65, perspective: 1 };
    const vertices = Array.from({ length: count + 1 }, (_, row) =>
      Array.from({ length: count + 1 }, (_, column) => Morph.project(type, column / count, row / count, 480, 480, view)));
    const patches = [];
    for (let row = 0; row < count; row++) {
      for (let column = 0; column < count; column++) {
        patches.push({ points: [vertices[row][column], vertices[row][column + 1],
          vertices[row + 1][column + 1], vertices[row + 1][column]] });
      }
    }
    const translated = patches.map(patch => ({ points: patch.points.map(point => ({
      x: point.x + 0.371, y: point.y + 0.193, depth: point.depth
    })) }));
    const original = Morph.createDepthBuffer(480, 480, patches);
    const shifted = Morph.createDepthBuffer(480, 480, translated);
    for (let row = 0; row < 13; row++) {
      for (let column = 0; column < 13; column++) {
        const point = Morph.project(type, (column + 0.5) / 13, (row + 0.5) / 13, 480, 480, view);
        const a = original.depthAt(point.x, point.y);
        const b = shifted.depthAt(point.x + 0.371, point.y + 0.193);
        assert.ok(a === b || Math.abs(a - b) < 1e-9, `${type}: screen translation cannot change surface depth`);
        assert.equal(original.visible(point), shifted.visible({ ...point, x: point.x + 0.371, y: point.y + 0.193 }));
      }
    }
  }
});

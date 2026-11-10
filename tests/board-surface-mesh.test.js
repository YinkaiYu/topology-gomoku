"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Morph = require("../app/assets/topology-morph.js");

function surface(type, view, columns = 46, rows = 36) {
  const vertices = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) => Morph.project(type, column / columns, row / rows, 300, 300, view)));
  const patches = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      patches.push({ points: [vertices[row][column], vertices[row][column + 1],
        vertices[row + 1][column + 1], vertices[row + 1][column]] });
    }
  }
  return { mesh: Morph.createSurfaceMesh(vertices), depth: Morph.createDepthBuffer(300, 300, patches) };
}

function assertOnTriangles(mesh, points) {
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index];
    for (const amount of [0.2, 0.5, 0.8]) {
      const actual = mesh.point(a.u + (b.u - a.u) * amount, a.v + (b.v - a.v) * amount);
      for (const field of ["x", "y", "depth"]) {
        const expected = a[field] + (b[field] - a[field]) * amount;
        assert.ok(Math.abs(actual[field] - expected) < 1e-8, `${field}: every path segment stays on one painted triangle`);
      }
    }
  }
}

test("surface mesh uses the painted diagonal and preserves UV, scale and depth scale", () => {
  const vertices = [[{ x: 0, y: 0, depth: 0, scale: 1, depthScale: 100 }, { x: 10, y: 0, depth: 0, scale: 1, depthScale: 100 }],
    [{ x: 0, y: 10, depth: 0, scale: 1, depthScale: 100 }, { x: 10, y: 10, depth: 1, scale: 2, depthScale: 200 }]];
  const mesh = Morph.createSurfaceMesh(vertices);
  const mapped = mesh.point(0.7, 0.2);
  for (const [key, value] of Object.entries({ x: 7, y: 2, depth: 0.2, scale: 1.2, depthScale: 120, u: 0.7, v: 0.2 })) {
    assert.ok(Math.abs(mapped[key] - value) < 1e-10);
  }
  assert.equal(mesh.point(0.2, 0.7).depth, 0.2);
  const points = mesh.path({ u: 0.1, v: 0.8 }, { u: 0.9, v: 0.2 });
  assert.equal(points.length, 3, "a path crossing only the internal diagonal still splits there");
  assert.ok(Math.abs(points[1].u - points[1].v) < 1e-10);
  assertOnTriangles(mesh, points);
  assert.equal(points[0].depthScale, 110);
  assert.equal(points[points.length - 1].depthScale, 120);
});

test("mesh paths split all row, column and diagonal crossings in either direction", () => {
  const { mesh } = surface("torus", { x: 0.72, y: -0.12, z: -0.24, perspective: 1 });
  for (const [from, to] of [
    [{ u: 0.043, v: 0.16 }, { u: 0.91, v: 0.87 }],
    [{ u: 0.73, v: 0 }, { u: 0.73, v: 1 }],
    [{ u: 0, v: 0.5 / 7 }, { u: 1, v: 0.5 / 7 }],
    [{ u: 0, v: 0 }, { u: 1, v: 1 }]
  ]) {
    const points = mesh.path(from, to), reversed = mesh.path(to, from);
    assertOnTriangles(mesh, points);
    assertOnTriangles(mesh, reversed);
    assert.equal(points.length, reversed.length);
    for (let index = 0; index < points.length; index++) {
      const opposite = reversed[reversed.length - index - 1];
      assert.ok(Math.hypot(points[index].x - opposite.x, points[index].y - opposite.y, points[index].depth - opposite.depth) < 1e-8);
    }
  }
});

test("mesh boundary paths preserve periodic and twisted seam agreement", () => {
  for (const type of ["torus", "mobius", "klein"]) {
    const { mesh } = surface(type, { x: 0.31, y: -0.52, perspective: 1 });
    const reverse = type !== "torus";
    const a = mesh.path({ u: 0, v: 0.1 }, { u: 0, v: 0.8 });
    const b = mesh.path({ u: 1, v: reverse ? 0.9 : 0.1 }, { u: 1, v: reverse ? 0.2 : 0.8 });
    assert.equal(a.length, b.length);
    for (let index = 0; index < a.length; index++) {
      assert.ok(Math.hypot(a[index].x - b[index].x, a[index].y - b[index].y, a[index].depth - b[index].depth) < 1e-8, `${type}: attached seam paths agree`);
    }
  }
});

test("small torus silhouette ring stays continuous while it rotates", () => {
  for (const angle of [0, 0.03, 0.1, 0.3]) {
    const { mesh, depth } = surface("torus", { x: 0.72 + angle, y: -0.12, z: -0.24, perspective: 1 });
    const lengths = [];
    let last = null, length = 0;
    depth.strokePath({
      beginPath() {},
      moveTo(x, y) { if (last) lengths.push(length); last = { x, y }; length = 0; },
      lineTo(x, y) { length += Math.hypot(x - last.x, y - last.y); last = { x, y }; },
      stroke() { if (last) lengths.push(length); }
    }, mesh.path({ u: 0, v: 0.5 / 7 }, { u: 1, v: 0.5 / 7 }));
    assert.ok(lengths.length <= 2, "a closed ring has only its genuine front interval and seam split");
    assert.ok(lengths.every(value => value > 5), "grazing grid cannot poke out as short dashed islands");
  }
});

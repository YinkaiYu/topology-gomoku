"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Morph = require("../app/assets/topology-morph.js");

function recordContours(patches) {
  const contours = [];
  let points = [], fills = 0, begins = 0;
  Morph.fillSurface({ beginPath() { begins += 1; }, moveTo(x, y) { points = [{ x, y }]; },
    lineTo(x, y) { points.push({ x, y }); }, closePath() { contours.push(points); },
    fill() { fills += 1; } }, patches);
  assert.equal(begins, 1);
  assert.equal(fills, 1, "the material still has one uniform translucent fill");
  return contours;
}

function cross(a, b, p) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function contourContains(contours, point) {
  let winding = 0;
  for (const points of contours) {
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index], b = points[(index + 1) % points.length];
      if (a.y <= point.y) {
        if (b.y > point.y && cross(a, b, point) > 0) { winding += 1; }
      } else if (b.y <= point.y && cross(a, b, point) < 0) { winding -= 1; }
    }
  }
  return winding !== 0;
}

function triangleUnion(patches) {
  const triangles = [];
  for (const patch of patches) {
    for (let index = 1; index < patch.points.length - 1; index += 1) {
      const points = [patch.points[0], patch.points[index], patch.points[index + 1]];
      if (Math.abs(cross(...points)) < 1e-10) { continue; }
      triangles.push({ points, minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
        minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) });
    }
  }
  return point => triangles.some(({ points: [a, b, c], minX, maxX, minY, maxY }) => {
    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) { return false; }
    const ab = cross(a, b, point), bc = cross(b, c, point), ca = cross(c, a, point);
    return (ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0);
  });
}

function mesh(columns, rows, pointAt, include = () => true) {
  const vertices = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) => pointAt(column / columns, row / rows)));
  const patches = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (!include(column, row)) { continue; }
      patches.push({ points: [vertices[row][column], vertices[row][column + 1],
        vertices[row + 1][column + 1], vertices[row + 1][column]] });
    }
  }
  return patches;
}

function compareCoverage(patches, contours, width, height, columns = 23, rows = 19, label = "mesh") {
  const expected = triangleUnion(patches);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = { x: (column + 0.371) / columns * width, y: (row + 0.623) / rows * height };
      assert.equal(contourContains(contours, point), expected(point), `${label} covers ${point.x},${point.y}`);
    }
  }
}

test("密集平面只提交真实外轮廓，保留完整几何与孔洞", () => {
  const size = 48;
  const patches = mesh(size, size, (u, v) => ({ x: u * 480, y: v * 480 }),
    (column, row) => !(column >= 16 && column < 32 && row >= 16 && row < 32));
  const contours = recordContours(patches);
  const segments = contours.reduce((total, contour) => total + contour.length - 1, 0);
  assert.equal(segments, size * 4 + 16 * 4, "interior triangle edges never reach Canvas tessellation");
  assert.equal(contourContains(contours, { x: 20, y: 20 }), true);
  assert.equal(contourContains(contours, { x: 240, y: 240 }), false);
  compareCoverage(patches, contours, 500, 500);
});

test("折叠、重复面片、独立接缝顶点和退化面片仍保持原三角覆盖", () => {
  const folded = mesh(20, 16, (u, v) => ({ x: 40 + Math.sin(u * Math.PI * 3) * 35 + v * 13,
    y: 40 + (v - 0.5) * 60 + Math.cos(u * Math.PI * 2) * 10 }));
  const duplicate = folded.slice(0, 12).map(patch => ({ points: [...patch.points].reverse().map(point => ({ ...point })) }));
  const degenerate = { points: [{ x: 3, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 4 }] };
  const patches = [...folded, ...duplicate, degenerate];
  const contours = recordContours(patches);
  compareCoverage(patches, contours, 100, 100, 47, 43, "folded and duplicated mesh");
  assert.ok(contours.flat().every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.equal(recordContours([degenerate]).length, 0);
});

test("六种拓扑的完整密集曲面轮廓与原三角网格覆盖逐点一致", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    for (const morph of [0, 0.37, 0.72, 1]) {
      for (const rotation of [0, 1.17]) {
        const orientation = { x: 0.42 + rotation, y: -0.58 - rotation, z: -0.08, perspective: morph };
        const patches = mesh(type === "sphere" ? 48 : 46, type === "sphere" ? 48 : 36, (u, v) => {
          const projected = Morph.project(type, u, v, 480, 480, orientation);
          return { x: (48 + u * 384) * (1 - morph) + projected.x * morph,
            y: (48 + v * 384) * (1 - morph) + projected.y * morph };
        });
        const contours = recordContours(patches);
        compareCoverage(patches, contours, 480, 480, 19, 17, `${type}/${morph}/${rotation}`);
        const lines = contours.reduce((total, contour) => total + contour.length - 1, 0);
        assert.ok(lines < patches.length * 2, `${type} removes most interior tessellation work`);
      }
    }
  }
});

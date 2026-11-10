"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Morph = require("../app/assets/topology-morph.js");

function fixture(axes) {
  const size = 6;
  const sample = (u, v) => ({ u, v, x: 600 * u, y: 600 * v,
    depth: Math.sin(u * Math.PI) * Math.cos(v * Math.PI), scale: 1 + u * v, depthScale: 100 + 20 * u * v });
  const vertices = Array.from({ length: size + 1 }, (_, row) =>
    Array.from({ length: size + 1 }, (_, column) => sample(axes ? axes.u[column] : column / size, axes ? axes.v[row] : row / size)));
  const patches = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
    patches.push({ points: [vertices[row][column], vertices[row][column + 1], vertices[row + 1][column + 1], vertices[row + 1][column]] });
  }
  const mesh = Morph.createSurfaceMesh(vertices, { topology: "sphere", pointAt: sample });
  const refined = mesh.refinePatches(patches);
  const faces = refined.flatMap(patch => patch.points.length === 3 ? [patch.points]
    : [[patch.points[0], patch.points[1], patch.points[2]], [patch.points[0], patch.points[2], patch.points[3]]]);
  return { mesh, faces, sample };
}

function weights([a, b, c], u, v) {
  const denominator = (b.v - c.v) * (a.u - c.u) + (c.u - b.u) * (a.v - c.v);
  const wa = ((b.v - c.v) * (u - c.u) + (c.u - b.u) * (v - c.v)) / denominator;
  const wb = ((c.v - a.v) * (u - c.u) + (a.u - c.u) * (v - c.v)) / denominator;
  return [wa, wb, 1 - wa - wb];
}

test("sphere corner samples and grid positions interpolate the exact painted fan facets", () => {
  const { mesh, faces, sample } = fixture();
  assert.equal(faces.length, 6 * 6 * 2 + 12, "only six corner faces gain two triangles each");
  for (const u of [0, .01, .03, .07, .11, .15, .33, .85, .89, .93, .97, .99, 1]) {
    for (const v of [0, .01, .03, .07, .11, .15, .33, .85, .89, .93, .97, .99, 1]) {
      const face = faces.find(face => weights(face, u, v).every(value => value >= -1e-10));
      assert.ok(face, "the UV chart remains completely covered");
      const w = weights(face, u, v), point = mesh.point(u, v);
      for (const key of ["x", "y", "depth", "scale", "depthScale"]) {
        assert.ok(Math.abs(point[key] - face.reduce((sum, vertex, index) => sum + vertex[key] * w[index], 0)) < 1e-9, key);
      }
    }
  }
  const center = { u: 2 / 18, v: 1 / 18 };
  assert.ok(Math.abs(mesh.point(center.u, center.v).depth - sample(center.u, center.v).depth) < 1e-10,
    "a corner interior is sampled on the curve instead of flattened onto its boundary");
});

test("grid paths split at sphere fan edges so no segment cuts through a refined face", () => {
  const { mesh } = fixture();
  for (const mirrorU of [false, true]) for (const mirrorV of [false, true]) {
    const uv = (u, v) => ({ u: mirrorU ? 1 - u : u, v: mirrorV ? 1 - v : v });
    for (const line of [[[.001, .025], [.16, .12]], [[.13, .002], [.02, .16]], [[0, 0], [.16, .16]]]) {
      const path = mesh.path(uv(...line[0]), uv(...line[1]));
      for (let index = 1; index < path.length; index++) {
        const a = path[index - 1], b = path[index], middle = mesh.point((a.u + b.u) / 2, (a.v + b.v) / 2);
        for (const key of ["x", "y", "depth"]) {
          assert.ok(Math.abs(middle[key] - (a[key] + b[key]) / 2) < 1e-9, "each grid segment stays on one actual face");
        }
      }
    }
  }
});

test("nonuniform chart axes keep sampled points and crossing paths on the exact painted fan triangles", () => {
  const axes = { u: [0, .04, .3, .46, .65, .91, 1], v: [0, .09, .24, .52, .68, .96, 1] };
  const { mesh, faces } = fixture(axes);
  assert.equal(faces.length, 84, "nonuniform sampling preserves the same six corner fans");
  const probes = Array.from({ length: 21 }, (_, i) => i / 20);
  for (const u of [...axes.u, ...probes]) for (const v of [...axes.v, ...probes]) {
    const face = faces.find(face => weights(face, u, v).every(value => value >= -1e-10));
    assert.ok(face, "nonuniform cells leave no uncovered chart area");
    const w = weights(face, u, v), point = mesh.point(u, v);
    for (const key of ["x", "y", "depth", "scale", "depthScale"]) {
      assert.ok(Math.abs(point[key] - face.reduce((sum, vertex, i) => sum + vertex[key] * w[i], 0)) < 1e-9, key);
    }
  }
  for (let index = 0; index < 30; index++) {
    const from = { u: (index * 7 % 31) / 31, v: (index * 13 % 31) / 31 };
    const to = { u: (index * 17 + 1) % 31 / 31, v: (index * 23 + 2) % 31 / 31 };
    const path = mesh.path(from, to);
    for (let segment = 1; segment < path.length; segment++) {
      const a = path[segment - 1], b = path[segment], middle = mesh.point((a.u + b.u) / 2, (a.v + b.v) / 2);
      for (const key of ["x", "y", "depth"]) {
        assert.ok(Math.abs(middle[key] - (a[key] + b[key]) / 2) < 1e-9,
          "the grid crosses every nonuniform cell diagonal and fan edge before entering another plane");
      }
    }
  }
});

test("sphere sampling includes its flat margin breaks and returns continuously to the regular final mesh", () => {
  for (const size of [5, 7, 19]) for (const axis of ["u", "v"]) {
    const rules = { type: "sphere", width: size, height: size, cellCount: size * size };
    const first = Morph.stoneUV(rules, 0)[axis], last = Morph.stoneUV(rules, rules.cellCount - 1)[axis];
    let previous;
    for (const morph of [0, .00001, .1, .2, .29999, .3, 1]) {
      const values = Array.from({ length: 49 }, (_, index) => Morph.surfaceGridCoordinate(rules, index, 48, axis, morph));
      assert.equal(values[0], 0); assert.equal(values.at(-1), 1);
      assert.ok(values.every((value, index) => !index || value > values[index - 1]), "sampling never folds or merges neighboring strips");
      if (morph === 0) { assert.ok(values.includes(first)); assert.ok(values.includes(last)); }
      if (morph === .00001 || morph === .3) {
        assert.ok(values.every((value, index) => Math.abs(value - previous[index]) < 1e-7), "no sampling jump at either transition endpoint");
      }
      if (morph >= .3) assert.deepEqual(values, Array.from({ length: 49 }, (_, index) => index / 48));
      previous = values;
    }
  }
});

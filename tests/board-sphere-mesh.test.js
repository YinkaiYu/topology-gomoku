"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Morph = require("../app/assets/topology-morph.js");

function fixture() {
  const size = 6;
  const sample = (u, v) => ({ u, v, x: 600 * u, y: 600 * v,
    depth: Math.sin(u * Math.PI) * Math.cos(v * Math.PI), scale: 1 + u * v, depthScale: 100 + 20 * u * v });
  const vertices = Array.from({ length: size + 1 }, (_, row) =>
    Array.from({ length: size + 1 }, (_, column) => sample(column / size, row / size)));
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

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Morph = require("../app/assets/topology-morph.js");
const Engine = require("../app/assets/topology.js");
const Art = require("../app/assets/board-art.js");

const paired = ["torus", "klein", "projective", "sphere"];
const view = { x: 0.36, y: -0.21, z: 0.14, perspective: 0.6 };
function flat(u, v) { return { x: 40 + u * 400, y: 40 + v * 400 }; }
function point(type, u, v, progress) {
  return Morph.morphPoint(type, flat(u, v), u, v, Morph.project(type, u, v, 480, 480, view), progress);
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.depth || 0) - (b.depth || 0)); }
function pairs(type, s) {
  if (type === "sphere") return { green: [[s, 0], [0, s]], gold: [[s, 1], [1, s]] };
  return {
    green: [[0, s], [1, type === "torus" ? s : 1 - s]],
    gold: [[s, 0], [type === "projective" ? 1 - s : s, 1]]
  };
}

test("yellow seams close ahead of green seams using their actual paired geometry", () => {
  for (const type of paired) {
    for (const s of [0.15, 0.35, 0.5, 0.65, 0.85]) {
      const seam = pairs(type, s);
      for (const t of [0.15, 0.35, 0.5, 0.65, 0.85]) {
        const remaining = {};
        for (const color of ["green", "gold"]) {
          const [a, b] = seam[color];
          const progressA = Morph.seamProgress(type, ...a, t);
          assert.ok(Math.abs(progressA - Morph.seamProgress(type, ...b, t)) < 1e-12, type + " joined ends use the same clock");
          const gap = distance(point(type, ...a, t), point(type, ...b, t));
          remaining[color] = gap / distance(flat(...a), flat(...b));
          assert.ok(Math.abs(remaining[color] - (1 - progressA)) < 1e-8, type + " seam gap follows its own progress");
        }
        assert.ok(remaining.gold < 1 - t && remaining.green > 1 - t, type + " yellow leads and green follows");
      }
    }
  }
});

test("seam clocks stay bounded, monotone, and continuous through corners and reversal", () => {
  for (const type of paired) {
    for (let row = 0; row <= 10; row++) {
      for (let column = 0; column <= 10; column++) {
        const u = column / 10, v = row / 10;
        let previous = -1;
        for (let frame = 0; frame <= 100; frame++) {
          const t = frame / 100, value = Morph.seamProgress(type, u, v, t);
          assert.ok(value >= 0 && value <= 1 && value > previous, type + " no local overshoot or reversal");
          if (frame) assert.ok(value - previous <= 0.01901, type + " bounded speed");
          previous = value;
        }
      }
    }
    for (const corner of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      for (const t of [0.2, 0.5, 0.8]) {
        const inward = corner.map(x => x ? 1 - 1e-6 : 1e-6);
        assert.ok(distance(point(type, ...corner, t), point(type, ...inward, t)) < 0.7, type + " no clock jump at a shared corner");
      }
    }
  }
});

test("pacing preserves both geometric endpoints and single-pair animations exactly", () => {
  for (const type of ["plane", "cylinder", "mobius", ...paired]) {
    for (const [u, v] of [[0, 0], [0, 0.5], [0.3, 0.7], [0.5, 0.5], [1, 1]]) {
      const f = flat(u, v), projected = Morph.project(type, u, v, 480, 480, view);
      for (const t of [0, 1]) {
        const actual = point(type, u, v, t);
        assert.equal(actual.x, f.x + (projected.x - f.x) * t);
        assert.equal(actual.y, f.y + (projected.y - f.y) * t);
        assert.equal(actual.depth, projected.depth * t);
        assert.equal(actual.scale, 1 + (projected.scale - 1) * t);
        assert.equal(actual.depthScale, projected.depthScale);
      }
      if (!paired.includes(type)) for (const t of [0.1, 0.5, 0.9]) assert.equal(Morph.seamProgress(type, u, v, t), t);
    }
  }
});

function mainHarness(type) {
  const rules = Engine.createRules({ type, width: 7, height: 7 });
  const layout = Art.computeLayout(480, 480, rules);
  const context = vm.createContext({ Morph, BoardArt: Art, clamp01: Morph.clamp01,
    game: { level: { topology: type }, rules }, renderState: { width: 480, height: 480, layout },
    cellCenter(cell) { return Art.cellCenter(rules, layout, cell); } });
  const source = fs.readFileSync(require.resolve("../app/assets/game.js"), "utf8");
  for (const name of ["completionMappedPoint", "completionPoint", "completionCellPoint", "catmullRomPoint", "normalizeSurfacePoint", "completionSphereWinningCurve"]) {
    const start = source.indexOf("  function " + name + "("), end = source.indexOf("\n  function ", start + 1);
    assert.ok(start >= 0 && end > start, name);
    vm.runInContext(source.slice(start, end), context);
  }
  return { context, rules, layout };
}

test("main-game stone positions and picking anchors use the same paced surface mapping", () => {
  for (const type of paired) {
    const { context, rules } = mainHarness(type);
    for (const t of [0.1, 0.4, 0.8]) {
      for (let cell = 0; cell < rules.cellCount; cell++) {
        const uv = Morph.stoneUV(rules, cell);
        assert.ok(distance(context.completionCellPoint(cell, t, view), context.completionPoint(uv.u, uv.v, t, view)) < 1e-8);
      }
    }
  }
});

test("sphere winning curve stays attached to stones throughout paced unfolding", () => {
  const { context, rules } = mainHarness("sphere");
  const cells = Array.from(rules.winMasks[0].cells);
  for (const t of [0, 0.3, 0.6, 0.9, 1]) {
    const curve = context.completionSphereWinningCurve(cells, t, view);
    cells.forEach((cell, index) => {
      assert.ok(distance(curve[index * 18], context.completionCellPoint(cell, t, view)) < 1e-8);
    });
  }
});

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
  return Morph.morphPoint(type, flat(u, v), u, v, Morph.project(type, u, v, 480, 480, view), progress, { width: 480, height: 480 });
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.depth || 0) - (b.depth || 0)); }
function pairs(type, s) {
  if (type === "sphere") return { green: [[s, 0], [0, s]], gold: [[s, 1], [1, s]] };
  return {
    green: [[0, s], [1, type === "torus" ? s : 1 - s]],
    gold: [[s, 0], [type === "projective" ? 1 - s : s, 1]]
  };
}

test("yellow seams nearly close while green seams remain extended, then close in a separate stage", () => {
  for (const type of paired) {
    for (const s of [0.15, 0.35, 0.5, 0.65, 0.85]) {
      const seam = pairs(type, s);
      for (const t of [0.12, 0.3, 0.5, 0.7, 0.9]) {
        for (const color of ["green", "gold"]) {
          const [a, b] = seam[color];
          const progressA = Morph.seamProgress(type, ...a, t);
          assert.ok(Math.abs(progressA - Morph.seamProgress(type, ...b, t)) < 1e-12, type + " joined ends use the same clock");
        }
      }
    }
    const seam = pairs(type, 0.5);
    const gap = (color, t) => {
      const [a, b] = seam[color];
      return distance(point(type, ...a, t), point(type, ...b, t)) / distance(flat(...a), flat(...b));
    };
    assert.ok(gap("gold", 0.5) < 0.2, type + " yellow is visibly nearly closed halfway");
    assert.ok(gap("green", 0.5) > gap("gold", 0.5) * 3, type + " green is still visibly open halfway");
    assert.ok(gap("gold", 0.7) < 1e-7, type + " yellow joins before the last stage");
    assert.ok(gap("green", 0.7) > 0.06, type + " green retains its own final closing stage");
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
          assert.ok(value >= 0 && value <= 1 && value >= previous, type + " no local overshoot or reversal");
          if (frame) assert.ok(value - previous <= 0.024, type + " bounded speed");
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

test("pacing preserves both geometric endpoints exactly and leaves the plane unchanged", () => {
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
      if (type === "plane") for (const t of [0.1, 0.5, 0.9]) assert.equal(Morph.seamProgress(type, u, v, t), t);
    }
  }
});

test("every joining surface stretches outward first and takes a curved route to its final shape", () => {
  for (const type of ["cylinder", "mobius", ...paired]) {
    const start = point(type, 0, 0.5, 0), finish = point(type, 0, 0.5, 1);
    const opening = point(type, 0, 0.5, 0.08);
    assert.ok(opening.x < start.x - 4, type + " first motion pulls the edge outward");
    const chord = distance(start, finish);
    let previous = start, length = 0, maximumOffset = 0;
    for (let frame = 1; frame <= 100; frame++) {
      const current = point(type, 0, 0.5, frame / 100);
      length += distance(previous, current); previous = current;
      maximumOffset = Math.max(maximumOffset, Math.abs((finish.x - start.x) * (current.y - start.y) -
        (finish.y - start.y) * (current.x - start.x)) / Math.hypot(finish.x - start.x, finish.y - start.y));
    }
    assert.ok(length > chord * 1.05, type + " actual route is longer than the straight interpolation");
    assert.ok(maximumOffset > 8, type + " trajectory has a visible lateral arc, not just overshoot");
  }
});

test("curved unfolding keeps all stones inside small, desktop and rectangular frames", () => {
  for (const type of ["cylinder", "mobius", ...paired]) {
    for (const size of [5, 7, 19]) {
      const rules = Engine.createRules({ type, width: size, height: size });
      for (const [width, height] of [[200, 200], [390, 390], [600, 480]]) {
        const layout = Art.computeLayout(width, height, rules);
        for (const t of [0, 0.04, 0.08, 0.12, 0.3, 0.5, 0.7, 0.9, 1]) {
          for (let cell = 0; cell < rules.cellCount; cell++) {
            const uv = Morph.stoneUV(rules, cell);
            const p = Art.mappedCompletionPoint({ level: { topology: type } }, layout,
              Art.cellCenter(rules, layout, cell), uv, { ...view, morph: t, perspective: t });
            const radius = layout.cell * (0.37 - t * 0.07) * p.scale;
            assert.ok(Math.min(p.x - radius, p.y - radius, width - p.x - radius, height - p.y - radius) > 0,
              `${type}/${size}/${width}x${height}/${t}/${cell}: complete stone remains inside the frame`);
          }
        }
      }
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

test("sphere charts retain endpoint continuity with presentation, deformation and custom curve points", () => {
  const orientation = { x: 0.9, y: -1.2, z: 0.4, scale: 1.02, perspective: 1,
    shapeX: 0.95, shapeY: 1.06, shapeZ: 1.02, wobbleX: 0.035, wobbleY: -0.025,
    presentation: { type: "sphere-path", boost: [0.08, -0.07, 0.04] } };
  for (const [u, v] of [[0, 0.5], [0.5, 0], [0.2, 0.7], [0.65, 0.35], [1, 1]]) {
    for (const custom of [false, true]) {
      const target = custom ? Morph.projectPoint("sphere", [0, 0, 1], 480, 480, orientation)
        : Morph.project("sphere", u, v, 480, 480, orientation);
      const mapped = t => Morph.morphPoint("sphere", flat(u, v), u, v, target, t, { width: 480, height: 480 });
      assert.ok(distance(mapped(0), mapped(0.000001)) < 0.01, "the opening starts at the displayed flat geometry");
      assert.ok(distance(mapped(0.999999), mapped(1)) < 0.01, "the closing reaches the projected source, including custom curves");
      assert.ok(distance(mapped(1), target) < 1e-8);
    }
  }
});

test("dragging a partly closed sphere through a rotation branch does not flip its camera", () => {
  for (const t of [0.2, 0.5, 0.8]) {
    for (const axis of ["x", "y", "z"]) {
      for (const boundary of [-Math.PI, Math.PI, 3 * Math.PI]) {
        const pointAt = angle => {
          const orientation = { ...view, [axis]: angle, perspective: t };
          return Morph.morphPoint("sphere", flat(0.2, 0.7), 0.2, 0.7,
            Morph.project("sphere", 0.2, 0.7, 480, 480, orientation), t, { width: 480, height: 480 });
        };
        assert.ok(distance(pointAt(boundary - 0.00001), pointAt(boundary + 0.00001)) < 0.01);
      }
    }
  }
});

test("the relaxed sphere atlas keeps its equator ordered and its corner interiors separated", () => {
  let previous = 0;
  for (let index = 1; index <= 512; index++) {
    const point = Morph.surfacePoint("sphere", index / 512, index / 512);
    const angle = Math.atan2(point[1], point[0]);
    assert.ok(angle < previous, "the shared equator never doubles back between lattice vertices");
    previous = angle;
  }
  for (const [u, v] of [[1 / 144, 2 / 144], [1 - 1 / 144, 1 - 2 / 144], [1 / 144, 1 - 1 / 144]]) {
    const front = Morph.surfacePoint("sphere", u, v);
    const back = Morph.surfacePoint("sphere", v, u);
    assert.ok(Math.abs(front[2]) > 1e-5, "a corner chart has area even when its three coarse vertices lie on the equator");
    assert.ok(front[2] * back[2] < 0, "the paired corner interiors occupy opposite hemispheres");
  }
  const point = (x, y) => Morph.surfacePoint("sphere", x / 96, y / 96);
  for (let row = 0; row < 96; row++) {
    for (let column = 0; column < 96; column++) {
      const a = point(column, row), b = point(column + 1, row);
      const c = point(column, row + 1), d = point(column + 1, row + 1);
      for (const [p, q, r] of [[a, b, d], [a, d, c]]) {
        const determinant = p[0] * (q[1] * r[2] - q[2] * r[1]) +
          p[1] * (q[2] * r[0] - q[0] * r[2]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
        assert.ok(determinant > -1e-10, `sphere chart orientation at ${column},${row}`);
      }
    }
  }
});

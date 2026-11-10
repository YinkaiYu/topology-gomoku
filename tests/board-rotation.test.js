"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Logic = require("../app/assets/board-view-logic.js");
const Motion = require("../app/assets/board-view-motion.js");
const Morph = require("../app/assets/topology-morph.js");

const axes = ["x", "y", "z"];
const types = ["cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const tau = Math.PI * 2;

function assertSameProjection(a, b) {
  for (const type of types) {
    for (const [u, v] of [[0, 0.2], [0.3, 0.6], [0.7, 1], [1, 0.3]]) {
      const first = Morph.project(type, u, v, 600, 480, a);
      const second = Morph.project(type, u, v, 600, 480, b);
      assert.ok(Math.hypot(first.x - second.x, first.y - second.y, first.depth - second.depth) < 1e-8,
        `${type} at ${u},${v}`);
    }
  }
}

test("切换前只丢弃整圈，保留三轴最终姿态及默认视角", () => {
  const base = { x: 0.52, y: -0.7, z: 0.12 };
  for (const progress of [0, 1]) {
    for (const turns of [-3, -2, -1, 0, 1, 2, 3]) {
      const rotation = { x: turns * tau + 0.21, y: -turns * tau - 0.43, z: turns * tau + 0.17 };
      const before = Object.fromEntries(axes.map(axis => [axis, base[axis] + rotation[axis]]));
      Logic.prepareMorphRotation(rotation, base, progress);
      const after = Object.fromEntries(axes.map(axis => [axis, base[axis] + rotation[axis]]));
      assertSameProjection(before, after);
      for (const axis of axes) { assert.ok(Math.abs(after[axis]) <= Math.PI); }
      assert.ok(Math.abs(rotation.x - 0.21) < 1e-12);
      assert.ok(Math.abs(rotation.y + 0.43) < 1e-12);
      assert.ok(Math.abs(rotation.z - 0.17) < 1e-12);
    }
  }
});

test("半展开时拖过半圈或中途反向切换，保持当前角度分支", () => {
  const view = Motion.create();
  view.progress = 0.6;
  view.rotation = { x: tau + 0.2, y: Math.PI - 0.001, z: -tau - 0.3 };
  const before = Motion.orientation(view, 100);
  Motion.setProgress(view, 0, 100, true, false);
  assert.deepEqual(Motion.orientation(view, 100), before);
  view.rotation.y += 0.002;
  const crossed = Motion.orientation(view, 100);
  assert.ok(Math.abs(crossed.y - before.y - 0.002) < 1e-12);
  Motion.setProgress(view, 1, 100, true, false);
  assert.deepEqual(Motion.orientation(view, 100), crossed);
  assert.equal(view.rotation.x, tau + 0.2);
  assert.equal(view.rotation.z, -tau - 0.3);
});

test("整圈拖动后的终局转换逐帧等价于零整圈，且首帧保留实际展示姿态", () => {
  for (const turns of [-2, -1, 1, 2]) {
    const canonical = Motion.create();
    canonical.progress = 0.45;
    canonical.rotation = { x: 0.35, y: -0.6, z: 0.12 };
    const wound = Motion.create();
    wound.progress = canonical.progress;
    wound.rotation = { x: canonical.rotation.x + turns * tau, y: canonical.rotation.y - turns * tau, z: canonical.rotation.z + turns * tau };
    const target = { x: -0.4, y: 0.7, z: -0.2 };
    const displayed = Motion.orientation(wound, 4000);
    Motion.finish(wound, 4000, null, target);
    Motion.finish(canonical, 4000, null, target);
    const first = Motion.orientation(wound, 4000);
    for (const axis of axes) { assert.equal(first[axis], displayed[axis]); }
    for (let elapsed = 0; elapsed <= 3000; elapsed += 25) {
      assertSameProjection(Motion.orientation(wound, 4000 + elapsed), Motion.orientation(canonical, 4000 + elapsed));
    }
    const last = Motion.orientation(wound, 7000);
    for (const axis of axes) { assert.ok(Math.abs(last[axis] - first[axis]) <= Math.PI); }
  }
});

test("终局越过正负半圈的目标采用短路径，完成时保持目标投影", () => {
  const view = Motion.create();
  view.progress = 1;
  view.rotation = { x: Math.PI - 0.1, y: -Math.PI + 0.2, z: 4 * tau };
  const target = { x: -Math.PI + 0.1, y: Math.PI - 0.2, z: 0 };
  Motion.finish(view, 4000, null, target);
  const first = Motion.orientation(view, 4000);
  const last = Motion.orientation(view, 7000);
  assert.ok(Math.abs(last.x - first.x - 0.2) < 1e-12);
  assert.ok(Math.abs(last.y - first.y + 0.4) < 1e-12);
  assert.equal(last.z, first.z);
  assertSameProjection(last, { ...last, ...target });
});

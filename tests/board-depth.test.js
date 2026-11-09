"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Morph = require("../app/assets/topology-morph.js");

const TOPOLOGIES = ["cylinder", "torus", "mobius", "klein", "projective", "sphere"];

function quad(left, top, right, bottom, depth) {
  return { points: [
    { x: left, y: top, depth }, { x: right, y: top, depth },
    { x: right, y: bottom, depth }, { x: left, y: bottom, depth }
  ] };
}

test("棋盘透视使近处位置与棋子同步放大，图案默认投影保持原样", () => {
  // Cancel the sphere's default camera rotation to compare equal x/y at two depths.
  const view = { x: -0.42, y: 0.58, z: 0.08 };
  const near = Morph.projectPoint("sphere", [0.4, 0.2, 0.8], 400, 400, { ...view, perspective: 1 });
  const far = Morph.projectPoint("sphere", [0.4, 0.2, -0.8], 400, 400, { ...view, perspective: 1 });
  const orthoNear = Morph.projectPoint("sphere", [0.4, 0.2, 0.8], 400, 400, view);
  const orthoFar = Morph.projectPoint("sphere", [0.4, 0.2, -0.8], 400, 400, view);
  assert.equal(orthoNear.x, orthoFar.x);
  assert.equal(orthoNear.y, orthoFar.y);
  assert.ok(near.x > orthoNear.x && far.x < orthoFar.x);
  assert.ok(near.scale > 1 && far.scale < 1);
  assert.ok(Math.abs((near.x - 200) / (far.x - 200) - near.scale / far.scale) < 1e-10);
  assert.equal(orthoNear.scale, 1);
});

test("透视在所有曲面与任意观察方向保持有限且连续", () => {
  for (const type of TOPOLOGIES) {
    for (const rotation of [0, Math.PI / 2, Math.PI, -Math.PI * 1.5]) {
      for (let u = 0; u <= 1; u += 0.125) {
        for (let v = 0; v <= 1; v += 0.125) {
          const points = [0, 0.25, 0.5, 0.75, 1].map(perspective =>
            Morph.project(type, u, v, 640, 480, { x: rotation, y: rotation * 0.7, perspective }));
          for (const point of points) {
            assert.ok([point.x, point.y, point.depth, point.scale].every(Number.isFinite), `${type}/${u}/${v}`);
            assert.ok(point.scale > 0, "perspective never reverses the image");
          }
          const a = Morph.project(type, u, v, 640, 480, { x: rotation, y: rotation * 0.7, perspective: 0.5 });
          const b = Morph.project(type, u, v, 640, 480, { x: rotation, y: rotation * 0.7, perspective: 0.500001 });
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.01, "no projection jump mid-morph");
        }
      }
    }
  }
});

test("透视与柔性形变仍使接缝两端严格重合", () => {
  for (const perspective of [0, 0.3, 0.8, 1]) {
    const view = { x: 0.9, y: -1.2, z: 0.3, wobbleX: 0.03, wobbleY: -0.04, perspective };
    for (const t of [0.13, 0.37, 0.81]) {
      const pairs = [
        ["cylinder", [0, t], [1, t]], ["torus", [t, 0], [t, 1]],
        ["mobius", [0, t], [1, 1 - t]], ["klein", [0, t], [1, 1 - t]],
        ["projective", [t, 0], [1 - t, 1]], ["sphere", [t, 0], [0, t]]
      ];
      for (const [type, uvA, uvB] of pairs) {
        const a = Morph.project(type, ...uvA, 500, 500, view);
        const b = Morph.project(type, ...uvB, 500, 500, view);
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.depth - b.depth) < 1e-6, `${type} seam`);
      }
    }
  }
});

test("曲面遮挡按所在像素最近深度判断，并保留孔洞内的后方图形", () => {
  const back = quad(0, 0, 120, 120, -0.5);
  // A frame, rather than a solid rectangle, leaves a hole at the center.
  const front = [quad(20, 20, 100, 40, 1), quad(20, 80, 100, 100, 1),
    quad(20, 40, 40, 80, 1), quad(80, 40, 100, 80, 1)];
  for (const patches of [[back, ...front], [...front].reverse().concat(back)]) {
    const buffer = Morph.createDepthBuffer(128, 128, patches);
    assert.equal(buffer.visible({ x: 30, y: 30, depth: -0.5 }), false, "rear board is hidden by the front");
    assert.equal(buffer.visible({ x: 30, y: 30, depth: 1 }), true, "the front surface does not hide itself");
    assert.equal(buffer.visible({ x: 60, y: 60, depth: -0.5 }), true, "rear board remains visible through the hole");
    assert.equal(buffer.visible({ x: 10, y: 60, depth: -0.5 }), true, "an open edge does not occlude its surroundings");
    assert.equal(buffer.visible({ x: 30, y: 30, depth: 1.2 }), true, "a nearer stone is visible");
  }
});

test("倾斜三角曲面的遮挡深度随屏幕位置变化", () => {
  const buffer = Morph.createDepthBuffer(128, 128, [{ points: [
    { x: 10, y: 10, depth: 0 }, { x: 110, y: 10, depth: 1 }, { x: 10, y: 110, depth: 0 }
  ] }]);
  assert.equal(buffer.visible({ x: 20, y: 20, depth: 0.3 }), true);
  assert.equal(buffer.visible({ x: 80, y: 20, depth: 0.3 }), false);
  assert.equal(buffer.visible({ x: 80, y: 20, depth: 0.9 }), true);
  assert.equal(buffer.visible({ x: 105, y: 105, depth: -1 }), true, "outside the actual triangle stays unobstructed");
});

test("跨遮挡路径分成可见片段，不会连接穿过前方曲面", () => {
  const buffer = Morph.createDepthBuffer(128, 128, [quad(40, 20, 80, 100, 1)]);
  const segments = [];
  let last = null;
  const ctx = { beginPath() { last = null; }, moveTo(x, y) { last = { x, y }; },
    lineTo(x, y) { segments.push([last, { x, y }]); last = { x, y }; }, stroke() {} };
  buffer.strokePath(ctx, [{ x: 10, y: 60, depth: 0 }, { x: 110, y: 60, depth: 0 }]);
  assert.ok(segments.some(([a, b]) => a.x < 30 && b.x < 40));
  assert.ok(segments.some(([a, b]) => a.x > 80 && b.x > 90));
  assert.ok(segments.every(([a, b]) => b.x < 42 || a.x > 78), "no drawn segment crosses the occluder");
});

test("棋子及阴影采用局部遮挡，越过轮廓时保留仍可见的部分", () => {
  const buffer = Morph.createDepthBuffer(128, 128, [quad(20, 20, 64, 110, 1)]);
  function clippedRects(point) {
    const rects = [];
    let clips = 0;
    buffer.clipDisk({ beginPath() {}, rect(x, y, width, height) { rects.push({ x, y, width, height }); },
      clip() { clips += 1; } }, point, 8);
    assert.equal(clips, 1);
    return rects;
  }
  assert.equal(clippedRects({ x: 40, y: 60, depth: 0 }).length, 0, "fully hidden stone and shadow are clipped away");
  const edge = clippedRects({ x: 64, y: 60, depth: 0 });
  assert.ok(edge.length > 0, "stone's exposed half remains visible");
  assert.ok(edge.every(rect => rect.x >= 62), "no clipping region reaches the deeply occluded half");
  assert.ok(clippedRects({ x: 40, y: 60, depth: 1 }).length > 0, "a stone on the front surface remains visible");
});

test("真实归圆网格遮住背面交点，朝向观众的交点保持可见", () => {
  const view = { x: -0.42, y: 0.58, z: 0.08, perspective: 1 };
  const count = 48;
  const points = Array.from({ length: count + 1 }, (_, row) =>
    Array.from({ length: count + 1 }, (_, column) =>
      Morph.project("sphere", column / count, row / count, 480, 480, view)));
  const patches = [];
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      patches.push({ points: [points[row][column], points[row][column + 1],
        points[row + 1][column + 1], points[row + 1][column]] });
    }
  }
  const buffer = Morph.createDepthBuffer(480, 480, patches);
  let frontCount = 0;
  let backCount = 0;
  for (let row = 0; row < 19; row += 1) {
    for (let column = 0; column < 19; column += 1) {
      const point = Morph.project("sphere", (column + 0.5) / 19, (row + 0.5) / 19, 480, 480, view);
      // Exclude the grazing silhouette, where mesh approximation intentionally has a small bias.
      if (point.depth > 0.4) {
        frontCount += 1;
        assert.equal(buffer.visible(point), true, `front intersection ${column},${row}`);
      } else if (point.depth < -0.2) {
        backCount += 1;
        assert.equal(buffer.visible(point), false, `rear intersection ${column},${row}`);
      }
    }
  }
  assert.ok(frontCount > 80 && backCount > 80, "exercise substantial portions of both hemispheres");
});

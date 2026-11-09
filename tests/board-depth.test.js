"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Morph = require("../app/assets/topology-morph.js");
const Art = require("../app/assets/board-art.js");
const Engine = require("../app/assets/topology.js");
const ViewLogic = require("../app/assets/board-view-logic.js");

const TOPOLOGIES = ["cylinder", "torus", "mobius", "klein", "projective", "sphere"];

function quad(left, top, right, bottom, depth) {
  return { points: [
    { x: left, y: top, depth }, { x: right, y: top, depth },
    { x: right, y: bottom, depth }, { x: left, y: bottom, depth }
  ] };
}

function h5HitHarness(game, layout) {
  const source = fs.readFileSync(require.resolve("../app/assets/game.js"), "utf8");
  const renderState = { layout, width: layout.width, height: layout.height, depthBuffer: null };
  const context = vm.createContext({ Engine, Morph, ViewLogic, BoardArt: Art, game, renderState,
    clamp01: Morph.clamp01, performance: { now: () => 0 },
    cellCenter: cell => Art.cellCenter(game.rules, layout, cell),
    dom: { boardCanvas: { getBoundingClientRect: () => ({ left: 17, top: 29 }) } } });
  for (const name of ["completionMappedPoint", "completionPoint", "completionCellPoint", "interactiveViewOrientation", "eventToCell"]) {
    const start = source.indexOf("  function " + name + "(");
    const end = source.indexOf("\n  function ", start + 1);
    assert.ok(start >= 0 && end > start, `${name} is exercised from production`);
    vm.runInContext(source.slice(start, end), context);
  }
  return context;
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

test("通透曲面的背面线条淡显，正面线条单独清晰绘制且命中仍受遮挡约束", () => {
  const buffer = Morph.createDepthBuffer(128, 128, [quad(40, 20, 80, 100, 1)]);
  buffer.translucency = 0.16;
  const strokes = [], stack = [];
  let points = [];
  const ctx = { globalAlpha: 0.8,
    save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); },
    beginPath() { points = []; }, moveTo(x, y) { points.push({ x, y, start: true }); },
    lineTo(x, y) { points.push({ x, y }); }, stroke() { strokes.push({ alpha: this.globalAlpha, points: points.slice() }); } };
  buffer.strokePath(ctx, [{ x: 10, y: 60, depth: 0 }, { x: 110, y: 60, depth: 0 }]);
  assert.equal(strokes.length, 2);
  assert.equal(strokes[0].alpha, 0.8 * 0.16);
  assert.deepEqual(strokes[0].points.map(point => point.x), [10, 110], "faint layer preserves the entire route");
  assert.equal(strokes[1].alpha, 0.8);
  assert.ok(strokes[1].points.every(point => point.x < 42 || point.x > 78), "sharp layer excludes the occluded interval");
  assert.equal(buffer.visible({ x: 60, y: 60, depth: 0 }), false, "faint visibility never makes a rear cell selectable");
  assert.equal(ctx.globalAlpha, 0.8, "drawing leaves the caller's opacity unchanged");
});

test("半透明曲面统一填充一次，反向面片不抵消且真实孔洞保持开放", () => {
  const ring = [quad(20, 20, 100, 40, 1), quad(20, 80, 100, 100, 1),
    quad(20, 40, 40, 80, 1), quad(80, 40, 100, 80, 1)];
  // Duplicate one patch with reversed winding, as overlapping folded sheets do.
  const patches = [...ring, { points: [...ring[0].points].reverse() }];
  let begins = 0, fills = 0;
  const contours = [];
  let points = [];
  const ctx = { globalAlpha: 0.84, beginPath() { begins += 1; },
    moveTo(x, y) { points = [{ x, y }]; }, lineTo(x, y) { points.push({ x, y }); },
    closePath() { contours.push(points); }, fill() { fills += 1; } };
  Morph.fillSurface(ctx, patches);
  assert.equal(begins, 1);
  assert.equal(fills, 1, "overlap does not repeatedly darken the translucent material");
  assert.equal(ctx.globalAlpha, 0.84);
  assert.ok(contours.length > 0, "the material has closed contours");
  function cross(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
  const filled = point => contours.reduce((winding, contour) => {
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length];
      if (a.y <= point.y && b.y > point.y && cross(a, b, point) > 0) winding++;
      if (a.y > point.y && b.y <= point.y && cross(a, b, point) < 0) winding--;
    }
    return winding;
  }, 0) !== 0;
  assert.equal(filled({ x: 30, y: 30 }), true, "reversed overlapping facets remain filled");
  assert.equal(filled({ x: 60, y: 60 }), false, "the topology's central hole is not filled");
  assert.equal(filled({ x: 10, y: 60 }), false, "outside the surface stays empty");
});

test("棋子可见度随遮挡深度连续变化，保留完整轮廓所需的统一透明度", () => {
  const buffer = Morph.createDepthBuffer(128, 128, [quad(20, 20, 110, 110, 1)]);
  assert.equal(buffer.stoneVisibility({ x: 64, y: 64, depth: 1 }), 1, "a stone on the front surface is fully visible");
  assert.equal(buffer.stoneVisibility({ x: 64, y: 64, depth: 0 }), 0, "a deeply hidden stone uses only the faint material layer");
  assert.equal(buffer.stoneVisibility({ x: 10, y: 10, depth: -100 }), 1, "open space does not hide a stone");
  const values = Array.from({ length: 501 }, (_, i) => buffer.stoneVisibility({ x: 64, y: 64, depth: 1.1 - i / 1000 }));
  assert.ok(values.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  assert.ok(values.some(value => value > 0 && value < 1), "the transition is gradual instead of a binary switch");
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] <= values[i - 1] + 1e-10, "increasing occlusion never brightens a stone");
    assert.ok(Math.abs(values[i] - values[i - 1]) < 0.03, "small depth changes do not pop the whole stone");
  }
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
        assert.equal(buffer.stoneVisibility(point), 1, `front stone ${column},${row} keeps its full face`);
      } else if (point.depth < -0.2) {
        backCount += 1;
        assert.equal(buffer.visible(point), false, `rear intersection ${column},${row}`);
        assert.equal(buffer.stoneVisibility(point), 0, `rear stone ${column},${row} stays in the faint layer`);
      }
    }
  }
  assert.ok(frontCount > 80 && backCount > 80, "exercise substantial portions of both hemispheres");
});

test("H5 实际落子命中跳过归圆背面交点，并命中可见的正面交点", () => {
  const rules = Engine.createRules({ type: "sphere", width: 19, height: 19 });
  const layout = Art.computeLayout(480, 480, rules);
  const game = { level: { topology: "sphere" }, rules,
    view: { progress: 1, rotation: { x: -0.42, y: 0.58, z: 0.08 }, elastic: { x: 0, y: 0 } } };
  const h5 = h5HitHarness(game, layout);
  const orientation = h5.interactiveViewOrientation(0);
  const count = 48;
  const vertices = Array.from({ length: count + 1 }, (_, row) =>
    Array.from({ length: count + 1 }, (_, column) => h5.completionPoint(column / count, row / count, 1, orientation)));
  const patches = [];
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      patches.push({ points: [vertices[row][column], vertices[row][column + 1],
        vertices[row + 1][column + 1], vertices[row + 1][column]] });
    }
  }
  h5.renderState.depthBuffer = Morph.createDepthBuffer(480, 480, patches);
  let visible = 0;
  let hidden = 0;
  for (let cell = 0; cell < rules.cellCount; cell += 1) {
    const point = h5.completionCellPoint(cell, 1, orientation);
    const hit = h5.eventToCell({ clientX: point.x + 17, clientY: point.y + 29 });
    if (point.depth > 0.4) {
      visible += 1;
      assert.equal(hit, cell, `visible cell ${cell} is selectable at its drawn center`);
    } else if (point.depth < -0.2) {
      hidden += 1;
      assert.notEqual(hit, cell, `hidden cell ${cell} never wins the hit test`);
      if (hit >= 0) {
        assert.equal(h5.renderState.depthBuffer.visible(h5.completionCellPoint(hit, 1, orientation)), true);
      }
    }
  }
  assert.ok(visible > 60 && hidden > 60);
});

test("H5 落子半径跟随透视比例，隐藏所有候选时不落子", () => {
  const rules = Engine.createRules({ type: "sphere", width: 5, height: 5 });
  const layout = Art.computeLayout(480, 480, rules);
  const game = { level: { topology: "sphere" }, rules: { ...rules, cellCount: 1 },
    view: { progress: 1, rotation: { x: 0, y: 0, z: 0 }, elastic: { x: 0, y: 0 } } };
  const h5 = h5HitHarness(game, layout);
  h5.completionCellPoint = () => ({ x: 180, y: 180, depth: 1, scale: 0.6 });
  h5.renderState.depthBuffer = { visible: () => true };
  const event = distance => ({ clientX: 180 + 17 + distance, clientY: 180 + 29 });
  assert.equal(h5.eventToCell(event(layout.cell * 0.3)), 0);
  assert.equal(h5.eventToCell(event(layout.cell * 0.4)), -1, "far grid point uses a smaller hit radius");
  h5.completionCellPoint = () => ({ x: 180, y: 180, depth: 1, scale: 1.4 });
  assert.equal(h5.eventToCell(event(layout.cell * 0.6)), 0, "near grid point uses a larger hit radius");
  h5.renderState.depthBuffer = { visible: () => false };
  assert.equal(h5.eventToCell(event(0)), -1);
});

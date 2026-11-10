"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Art = require("../app/assets/board-art.js");
const Engine = require("../app/assets/topology.js");
const Morph = require("../app/assets/topology-morph.js");
const Content = require("../app/assets/level-config.js");
const source = fs.readFileSync(require.resolve("../app/assets/game.js"), "utf8");
const GRID = "rgba(108, 103, 94, 0.5)";

function recorder() {
  const strokes = [], stack = [];
  let points = [];
  const keys = ["strokeStyle", "fillStyle", "globalAlpha", "lineWidth"];
  const ctx = {
    globalAlpha: 1,
    save() { stack.push(Object.fromEntries(keys.map(key => [key, this[key]]))); },
    restore() { Object.assign(this, stack.pop()); },
    beginPath() { points = []; }, moveTo(x, y) { points.push({ x, y, start: true }); }, lineTo(x, y) { points.push({ x, y }); },
    bezierCurveTo(a, b, c, d, x, y) { points.push({ x, y }); },
    stroke() { strokes.push({ color: this.strokeStyle, alpha: this.globalAlpha, points: points.slice() }); },
    fill() {}, fillRect() {}, arc() {}, clip() {}, closePath() {}, setLineDash() {}, strokeRect() {},
    createLinearGradient() { return { addColorStop() {} }; }
  };
  return { ctx, strokes };
}

function scene(type, size = 7, width = 520, height = 480) {
  const level = Content.LEVELS.find(item => item.topology === type);
  const rules = Engine.createRules({ type, width: size, height: size });
  return { game: { level, rules, board: new Int8Array(rules.cellCount) }, layout: Art.computeLayout(width, height, rules) };
}

function mainRenderer(game, layout) {
  const context = vm.createContext({ Engine, Morph, BoardArt: Art, game,
    renderState: { layout, width: layout.width, height: layout.height }, clamp01: Morph.clamp01,
    cellCenter: cell => Art.cellCenter(game.rules, layout, cell), seamPulseFor: () => 0 });
  for (const name of ["drawGrid", "drawTopologyRails", "drawSphereRails", "drawRailPair", "drawRailLine", "drawArrow",
    "completionMappedPoint", "completionPoint", "completionFlatPointFromUV", "completionGridEdgePoints", "appendCompletionSegment",
    "strokeSmoothCompletionPath", "completionSphereRailPoint",
    "drawCompletionSphereGrid", "drawCompletionGrid"]) {
    const start = source.indexOf("  function " + name + "(");
    const end = source.indexOf("\n  function ", start + 1);
    assert.ok(start >= 0 && end > start, name);
    vm.runInContext(source.slice(start, end), context);
  }
  return context;
}

function close(actual, expected, label = "point") {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-7, label + ": " + JSON.stringify({ actual, expected }));
}

test("两个真实绘制入口默认将拓扑边延伸半格，开放边和落子交点不变", () => {
  for (const level of Content.LEVELS) {
    for (const size of [5, 7, 19]) {
      const { game, layout } = scene(level.topology, size);
      const joinedX = level.topology !== "plane", joinedY = ["torus", "klein", "projective", "sphere"].includes(level.topology);
      for (const main of [false, true]) {
        const { ctx, strokes } = recorder();
        if (main) { const renderer = mainRenderer(game, layout); renderer.drawGrid(ctx, layout); renderer.drawTopologyRails(ctx, 0); }
        else Art.drawBoard(ctx, { game, layout });
        const grid = strokes.filter(stroke => stroke.color === GRID);
        assert.equal(grid.length, size * 2);
        for (let i = 0; i < size; i++) {
          close(grid[i].points[0], { x: layout.left + i * layout.cell, y: layout.top - (joinedY ? layout.cell / 2 : 0) });
          close(grid[i].points[1], { x: layout.left + i * layout.cell, y: layout.bottom + (joinedY ? layout.cell / 2 : 0) });
          close(grid[size + i].points[0], { x: layout.left - (joinedX ? layout.cell / 2 : 0), y: layout.top + i * layout.cell });
          close(grid[size + i].points[1], { x: layout.right + (joinedX ? layout.cell / 2 : 0), y: layout.top + i * layout.cell });
        }
        for (const rail of strokes.filter(stroke => stroke.points.length === 2 && stroke.color !== GRID)) {
          for (const point of rail.points) {
            const onRail = [layout.left - layout.cell / 2, layout.right + layout.cell / 2].some(x => Math.abs(point.x - x) < 1e-7)
              || [layout.top - layout.cell / 2, layout.bottom + layout.cell / 2].some(y => Math.abs(point.y - y) < 1e-7);
            assert.equal(onRail, true, "colored guide meets half-cell extensions");
          }
        }
      }
      for (let cell = 0; cell < game.rules.cellCount; cell++) {
        const point = Art.cellCenter(game.rules, layout, cell);
        assert.equal(Art.hitTestCell(game.rules, layout, point.x, point.y), cell);
      }
    }
  }
});

test("曲面UV的二维起点精确穿过每个棋子，边界落在半格辅助线上", () => {
  for (const level of Content.LEVELS) {
    for (const size of [5, 7, 19]) {
      const { game, layout } = scene(level.topology, size);
      for (let cell = 0; cell < game.rules.cellCount; cell++) {
        const uv = Morph.stoneUV(game.rules, cell);
        close(Art.flatPointFromUV(game.rules, layout, uv.u, uv.v), Art.cellCenter(game.rules, layout, cell));
      }
      const bounds = Art.boundaryGeometry(game.rules, layout);
      close(Art.flatPointFromUV(game.rules, layout, 0, 0), { x: bounds.left, y: bounds.top });
      close(Art.flatPointFromUV(game.rules, layout, 1, 1), { x: bounds.right, y: bounds.bottom });
    }
  }
});

test("主游戏跨缝网格在动画零点保留半格，两端与远距桥分别绘制", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    const { game, layout } = scene(type);
    const renderer = mainRenderer(game, layout);
    const frames = [];
    for (const morph of [0, 0.00001]) {
      const { ctx, strokes } = recorder();
      renderer.drawCompletionGrid(ctx, morph, { x: 0, y: 0, z: 0, morph });
      const visible = strokes.filter(stroke => stroke.alpha > 0);
      frames.push(visible.flatMap(stroke => stroke.points));
      for (const stroke of visible) {
        for (let i = 1; i < stroke.points.length; i++) {
          assert.ok(Math.hypot(stroke.points[i].x - stroke.points[i - 1].x, stroke.points[i].y - stroke.points[i - 1].y) < layout.cell, "no line across the flat board");
        }
      }
      if (morph === 0) {
        const bounds = Art.boundaryGeometry(game.rules, layout);
        for (const side of ["left", "right"]) assert.ok(frames[0].some(p => Math.abs(p.x - bounds[side]) < 1e-7), type + " " + side);
        for (const side of ["top", "bottom"]) assert.ok(frames[0].some(p => Math.abs(p.y - bounds[side]) < 1e-7), type + " " + side);
      }
    }
    assert.equal(frames[0].length, frames[1].length);
    frames[0].forEach((point, index) => assert.ok(Math.hypot(point.x - frames[1][index].x, point.y - frames[1][index].y) < 0.02));
  }
});

test("共享曲面网格从完整半格边界连续起步，透视终态强调可见曲面", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    const { game, layout } = scene(type);
    let previous;
    for (const morph of [0, 0.00001, 1]) {
      const { ctx, strokes } = recorder();
      const orientation = { x: 0.42, y: -0.58, z: -0.08, morph, perspective: morph };
      const depth = Art.drawCompletion(ctx, { game, layout, morph, orientation });
      const grid = strokes.filter(stroke => stroke.color === "rgba(92, 88, 80, 0.31)" && stroke.alpha > 0.5);
      assert.equal(grid.length, game.rules.width + game.rules.height);
      for (let i = 0; i < grid.length; i++) {
        const vertical = i < game.rules.width;
        const uv = Morph.stoneUV(game.rules, vertical ? i : (i - game.rules.width) * game.rules.width);
        const fullPath = depth.mesh.path(
          { u: vertical ? uv.u : 0, v: vertical ? 0 : uv.v },
          { u: vertical ? uv.u : 1, v: vertical ? 1 : uv.v });
        if (morph === 0) {
          close(grid[i].points[0], fullPath[0]);
          close(grid[i].points.at(-1), fullPath.at(-1));
        }
        if (morph === 0.00001) grid[i].points.forEach((point, sample) => {
          assert.ok(Math.hypot(point.x - previous[i].points[sample].x, point.y - previous[i].points[sample].y) < 0.02);
        });
        const probes = grid[i].points.map(point => ({ point, visible: false }));
        grid[i].points.forEach((point, index) => {
          if (index && !point.start) {
            const previous = grid[i].points[index - 1];
            for (const t of [0.1, 0.5, 0.9]) probes.push({ point: { x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t }, visible: true });
          }
        });
        probes.forEach(({ point, visible }) => {
          let nearest = { distance: Infinity };
          for (let j = 1; j < fullPath.length; j++) {
            const a = fullPath[j - 1], b = fullPath[j], dx = b.x - a.x, dy = b.y - a.y;
            const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
            const p = { x: a.x + dx * t, y: a.y + dy * t, depth: a.depth + (b.depth - a.depth) * t };
            const distance = Math.hypot(point.x - p.x, point.y - p.y);
            if (distance < nearest.distance) nearest = { distance, point: p };
          }
          assert.ok(nearest.distance < 1e-7, type + " grid follows the projected curve");
          if (visible) assert.ok(depth.visible(nearest.point, 0.045001), type + " rear grid is hidden");
        });
      }
      previous = grid;
    }
  }
});

test("主游戏缝桥逐渐接合，两侧半段持续可见，终态沿用原曲面投影", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    const { game, layout } = scene(type), renderer = mainRenderer(game, layout);
    const orientation = { x: 0.42, y: -0.58, z: -0.08, scale: 1 };
    for (let u = 0; u <= 1; u += 0.125) {
      for (let v = 0; v <= 1; v += 0.125) {
        close(renderer.completionPoint(u, v, 1, orientation), Morph.project(type, u, v, layout.width, layout.height, orientation));
      }
    }
    if (type === "sphere") continue;
    let previousAlpha = -1;
    for (const morph of [0, 0.16, 0.5, 0.82, 1]) {
      const { ctx, strokes } = recorder();
      renderer.drawCompletionGrid(ctx, morph, orientation);
      const bridges = strokes.filter(stroke => stroke.points.length === 2);
      assert.ok(bridges.length > 0);
      assert.ok(bridges.every(bridge => bridge.alpha >= previousAlpha));
      if (morph <= 0.16) assert.ok(bridges.every(bridge => bridge.alpha === 0));
      if (morph >= 0.82) assert.ok(bridges.every(bridge => Math.abs(bridge.alpha - 1) < 1e-7));
      for (let index = 0; index < strokes.length; index++) {
        if (strokes[index].points.length === 2) {
          assert.equal(strokes[index - 1].alpha, 1);
          assert.equal(strokes[index - 2].alpha, 1);
        }
      }
      previousAlpha = bridges[0].alpha;
    }
  }
});

test("小五路盘为半格边界与箭头预留空间，常规棋盘布局保持原位", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    for (const [width, height] of [[200, 200], [220, 220], [260, 220], [600, 520]]) {
      const { game, layout } = scene(type, 5, width, height), bounds = Art.boundaryGeometry(game.rules, layout);
      assert.ok(bounds.left >= 6 - 1e-8 && width - bounds.right >= 6 - 1e-8);
      assert.ok(bounds.top >= 6 - 1e-8 && height - bounds.bottom >= 6 - 1e-8);
    }
  }
  for (const level of Content.LEVELS) {
    for (const [width, height] of [[180, 120], [300, 180], [330, 200], [360, 360], [600, 520]]) {
      const short = Math.min(width, height);
      const margin = Math.min(Math.max(34, short * 0.115), 22 + Math.max(0, short - 220) * 0.14);
      const cell = Math.min((width - margin * 2) / (level.width - 1), (height - margin * 2) / (level.height - 1));
      const layout = Art.computeLayout(width, height, level);
      assert.equal(layout.cell, cell, level.topology + " " + width + "x" + height);
    }
  }
});

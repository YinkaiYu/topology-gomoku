"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Art = require("../app/assets/board-art.js");
const Morph = require("../app/assets/topology-morph.js");
const Engine = require("../app/assets/topology.js");
const Content = require("../app/assets/level-config.js");

const TYPES = ["cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const GRID_DOT = "rgba(72, 71, 65, 0.48)";
const EPSILON = 0.00001;

function recorder() {
  const drawings = [], stack = [];
  const keys = ["globalAlpha", "strokeStyle", "fillStyle", "lineWidth", "lineCap", "lineJoin",
    "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY", "dash", "transform"];
  let path = [];
  function paint(ctx, op, extra = {}) {
    drawings.push({ op, path: structuredClone(path), ...Object.fromEntries(keys.map(key => [key,
      typeof ctx[key] === "object" ? JSON.parse(JSON.stringify(ctx[key])) : ctx[key]])), ...extra });
  }
  function gradient(kind, args) { return { kind, args, stops: [], addColorStop(...stop) { this.stops.push(stop); } }; }
  const ctx = { globalAlpha: 1, strokeStyle: "#000000", fillStyle: "#000000", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
    shadowColor: "rgba(0,0,0,0)", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, dash: [], transform: [1, 1, 0, 0],
    save() { stack.push(Object.fromEntries(keys.map(key => [key, Array.isArray(this[key]) ? this[key].slice() : this[key]]))); },
    restore() { Object.assign(this, stack.pop()); },
    translate(x, y) { this.transform[2] += x; this.transform[3] += y; },
    scale(x, y) { this.transform[0] *= x; this.transform[1] *= y; },
    beginPath() { path = []; }, moveTo(x, y) { path.push({ op: "move", x, y }); }, lineTo(x, y) { path.push({ op: "line", x, y }); },
    bezierCurveTo(a, b, c, d, x, y) { path.push({ op: "curve", a, b, c, d, x, y }); },
    arc(x, y, radius, start, end) { path.push({ op: "arc", x, y, radius, start, end }); },
    ellipse(x, y, radiusX, radiusY, rotation, start, end) { path.push({ op: "ellipse", x, y, radiusX, radiusY, rotation, start, end }); },
    rect(x, y, width, height) { path.push({ op: "rect", x, y, width, height }); },
    closePath() { path.push({ op: "close" }); }, clip() {},
    fill() { paint(this, "fill"); }, stroke() { paint(this, "stroke"); },
    fillRect(x, y, width, height) { const before = path; path = []; paint(this, "fillRect", { x, y, width, height }); path = before; },
    strokeRect(x, y, width, height) { const before = path; path = []; paint(this, "strokeRect", { x, y, width, height }); path = before; },
    setLineDash(dash) { this.dash = Array.from(dash); },
    createLinearGradient(...args) { return gradient("linear", args); }, createRadialGradient(...args) { return gradient("radial", args); }
  };
  return { ctx, drawings };
}

function scene(type, size = 7) {
  const level = Content.LEVELS.find(level => level.topology === type);
  const rules = Engine.createRules({ type, width: size, height: size });
  return { game: { level, rules, board: new Int8Array(rules.cellCount), lastMove: -1 }, layout: Art.computeLayout(520, 480, rules) };
}

function rgba(color) {
  if (typeof color !== "string") return null;
  if (/^#[0-9a-f]{6}$/i.test(color)) return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)).concat(1);
  const values = color.match(/[\d.]+/g)?.map(Number);
  return values && values.length >= 3 ? values.slice(0, 3).concat(values[3] ?? 1) : null;
}
function opacity(draw, fill = false) { return draw.globalAlpha * (rgba(fill ? draw.fillStyle : draw.strokeStyle)?.[3] ?? 1); }
function grid(record) { return record.drawings.filter(d => d.op === "stroke" && opacity(d) > 0.1 &&
  rgba(d.strokeStyle)?.[0] >= 92 && rgba(d.strokeStyle)?.[0] <= 108); }
function rails(record) { return record.drawings.filter(d => d.op === "stroke" && opacity(d) > 0.1 &&
  ["63,140,135", "199,146,68"].includes(rgba(d.strokeStyle)?.slice(0, 3).join(","))); }
function dots(record) { return record.drawings.filter(d => d.op === "fill" && d.fillStyle === GRID_DOT); }
function arrows(record) { return record.drawings.filter(d => d.op === "fill" && d.path.length === 4 &&
  ["63,140,135", "199,146,68"].includes(rgba(d.fillStyle)?.slice(0, 3).join(","))); }
function near(actual, expected, tolerance, message) { assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} != ${expected}`); }

test("every flat completion frame paints exactly the existing board, including stones and seam pulses", () => {
  for (const type of TYPES) {
    const { game, layout } = scene(type);
    game.board[8] = Engine.HUMAN; game.board[17] = Engine.AI;
    game.lastMove = 17; game.lastMoveAt = 970; game.lastMoveFromPress = true;
    game.seamPulseBits = Engine.SEAM_X | Engine.SEAM_Y; game.seamPulseAt = 800;
    const flat = recorder(), completion = recorder(), settings = { game, layout, time: 1050 };
    Art.drawBoard(flat.ctx, settings);
    Art.drawCompletion(completion.ctx, { ...settings, morph: 0 });
    assert.deepEqual(completion.drawings, flat.drawings, type + " zero frame must not add a second surface, rail, dot or stone pass");
  }
});

test("the first curved frame retains flat grid ink, widths, dots and one copy of every seam arrow", () => {
  for (const type of TYPES) for (const size of [5, 7, 19]) {
    const { game, layout } = scene(type, size), flat = recorder(), next = recorder();
    Art.drawBoard(flat.ctx, { game, layout });
    Art.drawCompletion(next.ctx, { game, layout, morph: EPSILON });
    const beforeGrid = grid(flat), nextGrid = grid(next);
    assert.equal(nextGrid.length, size * 2, type + " one visible pass per grid line");
    nextGrid.forEach((line, index) => {
      const previous = beforeGrid[index], a = previous.path[0], b = previous.path.at(-1);
      rgba(line.strokeStyle).forEach((value, channel) => near(value, rgba(previous.strokeStyle)[channel], 0.00001, "flat grid ink"));
      near(line.lineWidth, previous.lineWidth, 0.00001, "flat grid width");
      assert.equal(line.lineCap, previous.lineCap);
      near(opacity(line), opacity(previous), 0.00001, "flat grid opacity");
      near(line.path[0].x, a.x, 0.02, type + " grid start x"); near(line.path[0].y, a.y, 0.02, type + " grid start y");
      near(line.path.at(-1).x, b.x, 0.02, type + " grid end x"); near(line.path.at(-1).y, b.y, 0.02, type + " grid end y");
    });
    const beforeDots = dots(flat), nextDots = dots(next);
    assert.equal(nextDots.length, size * size);
    nextDots.forEach((dot, cell) => {
      const previous = beforeDots[cell];
      for (const axis of ["x", "y", "radius"]) near(dot.path[0][axis], previous.path[0][axis], 0.02, type + " dot " + axis);
      near(opacity(dot, true), opacity(previous, true), 0.00001, "flat dot opacity");
    });
    const beforeRails = rails(flat), nextRails = rails(next), beforeArrows = arrows(flat), nextArrows = arrows(next);
    assert.equal(nextRails.length, beforeRails.length, "a second static rail must not overlay the moving rail");
    assert.equal(nextArrows.length, beforeArrows.length, "moving arrows replace flat arrows without a duplicate or fade-in");
    nextRails.forEach((rail, index) => {
      near(opacity(rail), opacity(beforeRails[index]), 0.00001, "initial seam opacity");
      near(rail.lineWidth, beforeRails[index].lineWidth, 0.00001, "initial seam width");
      assert.deepEqual(rail.dash, beforeRails[index].dash, "twisted dash styling survives the handoff");
    });
    nextArrows.forEach((arrow, index) => {
      const previous = beforeArrows[index];
      near(opacity(arrow, true), opacity(previous, true), 0.00001, "initial arrow opacity");
      arrow.path.slice(0, 3).forEach((point, vertex) => {
        const candidates = vertex ? previous.path.slice(1, 3) : previous.path.slice(0, 1);
        assert.ok(candidates.some(before => Math.hypot(point.x - before.x, point.y - before.y) < 0.02),
          type + " arrow keeps its tip and both base vertices (path winding may differ)");
      });
    });
  }
});

function h5GridRenderer(game, layout) {
  const source = fs.readFileSync(require.resolve("../app/assets/game.js"), "utf8");
  const context = vm.createContext({ Morph, Engine, BoardArt: Art, game, clamp01: Morph.clamp01,
    renderState: { layout, width: layout.width, height: layout.height },
    cellCenter: cell => Art.cellCenter(game.rules, layout, cell) });
  for (const name of ["drawGrid", "completionMappedPoint", "completionPoint", "completionCellPoint", "completionFlatPointFromUV",
    "completionGridEdgePoints", "appendCompletionSegment", "strokeSmoothCompletionPath", "completionSphereRailPoint",
    "drawCompletionSphereGrid", "drawCompletionGrid", "drawCompletionGridDots"]) {
    const start = source.indexOf("  function " + name + "("), end = source.indexOf("\n  function ", start + 1);
    assert.ok(start >= 0 && end > start, name);
    vm.runInContext(source.slice(start, end), context);
  }
  return context;
}

test("both renderers let grid points fade continuously while retaining their moving board locations", () => {
  for (const type of TYPES) for (const main of [false, true]) {
    const { game, layout } = scene(type), renderer = main ? h5GridRenderer(game, layout) : null;
    let previous = 1;
    for (const morph of [0, EPSILON, 0.03, 0.1, 0.2, 0.299, 0.3]) {
      const record = recorder(), orientation = { x: 0.1, y: -0.2, z: 0.05, morph, perspective: morph };
      let depth;
      if (main) {
        if (morph === 0) renderer.drawGrid(record.ctx, layout);
        else renderer.drawCompletionGrid(record.ctx, morph, orientation);
      } else depth = Art.drawCompletion(record.ctx, { game, layout, morph, orientation });
      const points = dots(record);
      assert.equal(points.length, morph < 0.3 ? game.rules.cellCount : 0);
      if (!points.length) continue;
      const strongest = Math.max(...points.map(point => opacity(point, true)));
      assert.ok(strongest <= previous + 1e-10, "grid dots do not flash brighter during the handoff");
      if (morph === EPSILON) near(strongest, 0.48, 0.00001, "first dots keep their 2D ink");
      if (morph === 0.299) assert.ok(strongest < 0.0001, "dots disappear smoothly before omission");
      points.forEach((dot, cell) => {
        const uv = Morph.stoneUV(game.rules, cell), flat = Art.cellCenter(game.rules, layout, cell);
        const expected = morph === 0 ? flat : main ? renderer.completionCellPoint(cell, morph, orientation) : depth.mesh.point(uv.u, uv.v);
        near(dot.path[0].x, expected.x, 1e-7, "point stays on its board intersection");
        near(dot.path[0].y, expected.y, 1e-7, "point stays on its board intersection");
      });
      previous = strongest;
    }
  }
});

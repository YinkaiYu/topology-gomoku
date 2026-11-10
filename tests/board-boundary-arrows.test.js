"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Art = require("../app/assets/board-art.js");
const Morph = require("../app/assets/topology-morph.js");
const Engine = require("../app/assets/topology.js");
const Content = require("../app/assets/level-config.js");

function recordingContext() {
  const fills = [], strokes = [], stack = [];
  let path = [];
  const keys = ["globalAlpha", "fillStyle", "strokeStyle", "shadowBlur", "lineWidth", "lineCap", "lineJoin", "shadowColor", "dash"];
  const ctx = { globalAlpha: 0.8, fillStyle: "teal", strokeStyle: "teal",
    dash: [],
    save() { stack.push(Object.fromEntries(keys.map(key => [key, this[key]]))); },
    restore() { Object.assign(this, stack.pop()); },
    beginPath() { path = []; }, moveTo(x, y) { path.push({ x, y }); }, lineTo(x, y) { path.push({ x, y }); }, closePath() {},
    fill() { fills.push({ points: path.slice(), color: this.fillStyle, alpha: this.globalAlpha }); },
    stroke() { strokes.push({ points: path.slice(), color: this.strokeStyle, alpha: this.globalAlpha, dash: this.dash.slice() }); },
    createLinearGradient() { return { addColorStop() {} }; }, setLineDash(dash) { this.dash = dash.slice(); }, strokeRect() {}
  };
  return { ctx, fills, strokes };
}

function pointAtSide(type, side, morph) {
  return amount => {
    const vertical = side === "left" || side === "right";
    const edge = side === "right" || side === "bottom" ? 1 : 0;
    const u = vertical ? edge : amount, v = vertical ? amount : edge;
    const projected = Morph.project(type, u, v, 600, 600, { x: 0.4, y: -0.5, z: 0.27, perspective: morph });
    return Morph.morphPoint(type, { x: 50 + u * 500, y: 50 + v * 500 }, u, v, projected, morph, { width: 600, height: 600 });
  };
}

function triangleCenter(points) {
  return { x: points[0].x / 2 + (points[1].x + points[2].x) / 4,
    y: points[0].y / 2 + (points[1].y + points[2].y) / 4 };
}

test("boundary arrows stay attached to their mapped seam and preserve every gluing direction", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    const sides = ["left", "right"].concat(Morph.isPeriodicY(type) ? ["top", "bottom"] : []);
    const rules = Engine.createRules({ type, width: 7, height: type === "sphere" ? 7 : 6 });
    for (const morph of [0.2, 0.4, 0.6]) {
      for (const side of sides) {
        const { ctx, fills } = recordingContext(), pointAt = pointAtSide(type, side, morph);
        Art.drawSurfaceBoundaryArrows(ctx, type, side, rules, pointAt, morph, { visible: () => true, translucency: 0.16 });
        const vertical = side === "left" || side === "right", count = vertical ? rules.height : rules.width;
        const periodic = vertical ? Morph.isPeriodicY(type) : Morph.isPeriodicX(type);
        const reverse = (side === "right" && ["mobius", "klein", "projective"].includes(type)) || (side === "bottom" && type === "projective");
        const amounts = [type === "sphere" ? 0.36 : 0.34, 0.7]
          .map(fraction => periodic ? (0.5 + (count - 1) * fraction) / count : fraction)
          .filter(amount => {
            const p = pointAt(amount);
            return Morph.smooth((Morph.seamProgress(type, p.u, p.v, morph) - 0.82) / 0.18) < 1;
          });
        assert.equal(fills.length, amounts.length, `${type} ${side} keeps both arrows until their own seam closes at ${morph}`);
        amounts.forEach((amount, index) => {
          const expected = pointAt(amount), actual = triangleCenter(fills[index].points);
          assert.ok(Math.hypot(expected.x - actual.x, expected.y - actual.y) < 1e-7, "arrow remains on the actual moving edge");
          const before = pointAt(amount - 0.002), after = pointAt(amount + 0.002);
          const tip = fills[index].points[0], direction = { x: tip.x - actual.x, y: tip.y - actual.y };
          const tangent = { x: after.x - before.x, y: after.y - before.y };
          const cosine = (direction.x * tangent.x + direction.y * tangent.y) / Math.hypot(direction.x, direction.y) / Math.hypot(tangent.x, tangent.y);
          assert.ok(Math.abs(cosine - (reverse ? -1 : 1)) < 1e-7, "twist direction follows the projected tangent");
        });
        assert.equal(ctx.globalAlpha, 0.8);
      }
    }
  }
});

test("arrow opacity follows the local seam closure and hidden arrows retain a faint rear pass", () => {
  const rules = Engine.createRules({ type: "torus", width: 7, height: 7 });
  function arrows(side, morph, visible) {
    const record = recordingContext();
    Art.drawSurfaceBoundaryArrows(record.ctx, "torus", side, rules, pointAtSide("torus", side, morph), morph,
      { visible: () => visible, translucency: 0.16 });
    return record.fills;
  }
  const front = arrows("left", 0.5, true), rear = arrows("left", 0.5, false);
  assert.equal(front.length, 2); assert.equal(rear.length, 2);
  front.forEach((fill, index) => assert.ok(Math.abs(rear[index].alpha - fill.alpha * 0.16) < 1e-10));
  const green = arrows("left", 0.8, true), yellow = arrows("top", 0.8, true);
  assert.ok(green.length > 0);
  assert.ok(yellow.length === 0 || yellow.every(fill => fill.alpha < green[0].alpha), "yellow finishes before green");
  assert.equal(arrows("left", 0, true).length, 0, "flat rails retain their own original arrows");
  assert.equal(arrows("left", 1, true).length, 0, "closed seams leave the final surface clean");
});

test("shared board renderer hands flat rails to moving arrows without retaining a detached ghost", () => {
  const level = Content.LEVELS.find(item => item.topology === "projective");
  const rules = Engine.createRules({ type: "projective", width: level.width, height: level.height });
  const game = { level, rules, board: new Int8Array(rules.cellCount) };
  const layout = Art.computeLayout(600, 600, level), record = recordingContext();
  Art.drawCompletion(record.ctx, { game, layout, morph: 0.4 });
  assert.equal(record.strokes.filter(stroke => stroke.color === Art.TOKENS.teal || stroke.color === Art.TOKENS.gold).length, 0,
    "flat rail colors are no longer painted over the moving surface");
  const arrows = record.fills.filter(fill => fill.points.length === 3 && ["rgba(63,140,135,0.78)", "rgba(199,146,68,0.76)"].includes(fill.color));
  assert.equal(arrows.length, 8);
});

test("curved boundaries retain the flat rail dash style only for twisted gluing pairs", () => {
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    const level = Content.LEVELS.find(item => item.topology === type);
    const rules = Engine.createRules({ type, width: level.width, height: level.height });
    const game = { level, rules, board: new Int8Array(rules.cellCount) };
    const record = recordingContext();
    Art.drawCompletion(record.ctx, { game, layout: Art.computeLayout(600, 600, level), morph: 0.4 });
    for (const [color, connection] of [["rgba(63,140,135,0.78)", level.xConnection], ["rgba(199,146,68,0.76)", level.yConnection]]) {
      const strokes = record.strokes.filter(stroke => stroke.color === color);
      if (!connection && type !== "sphere") { assert.equal(strokes.length, 0); continue; }
      assert.ok(strokes.length > 0);
      const expected = type !== "sphere" && connection === "twist" ? [5, 5] : [];
      strokes.forEach(stroke => assert.deepEqual(stroke.dash, expected, `${type} ${color}`));
    }
    record.strokes.filter(stroke => !["rgba(63,140,135,0.78)", "rgba(199,146,68,0.76)"].includes(stroke.color))
      .forEach(stroke => assert.deepEqual(stroke.dash, [], "dash does not leak to the grid or intersection curves"));
    assert.deepEqual(record.ctx.dash, []);
  }
});

test("H5 boundary drawing shares the moving arrows and preserves dashed twists without leaking styles", () => {
  const source = fs.readFileSync(require.resolve("../app/assets/game.js"), "utf8");
  for (const type of ["cylinder", "torus", "mobius", "klein", "projective", "sphere"]) {
    const level = Content.LEVELS.find(item => item.topology === type);
    const rules = Engine.createRules({ type, width: level.width, height: level.height });
    const layout = Art.computeLayout(600, 600, level), record = recordingContext();
    const depth = { visible: () => true, translucency: 0.16,
      strokePath(ctx, points) {
        ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
      } };
    const context = vm.createContext({ Morph, BoardArt: Art, game: { level, rules },
      renderState: { width: 600, height: 600, layout, depthBuffer: depth } });
    for (const name of ["completionMappedPoint", "completionPoint", "strokeSmoothCompletionPath", "drawCompletionBoundary", "drawCompletionSphereBoundary"]) {
      const start = source.indexOf("  function " + name + "("), end = source.indexOf("\n  function ", start + 1);
      assert.ok(start >= 0 && end > start);
      vm.runInContext(source.slice(start, end), context);
    }
    const morph = 0.4, orientation = { perspective: morph };
    if (type === "sphere") {
      context.drawCompletionSphereBoundary(record.ctx, "a", morph, orientation, "teal");
      context.drawCompletionSphereBoundary(record.ctx, "b", morph, orientation, "gold");
    } else {
      if (level.xConnection) context.drawCompletionBoundary(record.ctx, "x", morph, orientation, "teal");
      if (level.yConnection) context.drawCompletionBoundary(record.ctx, "y", morph, orientation, "gold");
    }
    for (const stroke of record.strokes) {
      const connection = stroke.color === "teal" ? level.xConnection : level.yConnection;
      assert.deepEqual(Array.from(stroke.dash), type !== "sphere" && connection === "twist" ? [5, 5] : [], type);
    }
    assert.equal(record.fills.length, type === "cylinder" || type === "mobius" ? 4 : 8);
    assert.deepEqual(record.ctx.dash, []);
    assert.equal(record.ctx.globalAlpha, 0.8);
  }
});

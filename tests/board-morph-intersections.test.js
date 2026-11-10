"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Morph = require("../app/assets/topology-morph.js");
const Art = require("../app/assets/board-art.js");
const Engine = require("../app/assets/topology.js");
const Content = require("../app/assets/level-config.js");

function subtract(a, b) { return a.map((value, axis) => value - b[axis]); }
function dot(a, b) { return a.reduce((sum, value, axis) => sum + value * b[axis], 0); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function length(a) { return Math.hypot(...a); }
const EPSILON = 1e-7;

function triangle(points) {
  const normal = cross(subtract(points[1], points[0]), subtract(points[2], points[0]));
  const norm = length(normal);
  return { points, normal: norm ? normal.map(value => value / norm) : [0, 0, 0], norm,
    min: [0, 1, 2].map(axis => Math.min(...points.map(p => p[axis]))),
    max: [0, 1, 2].map(axis => Math.max(...points.map(p => p[axis]))) };
}

function section(points, distances) {
  const result = [];
  for (let index = 0; index < 3; index++) {
    const next = (index + 1) % 3, a = points[index], b = points[next];
    if (Math.abs(distances[index]) <= EPSILON) result.push(a);
    if (distances[index] * distances[next] < -EPSILON * EPSILON) {
      const t = distances[index] / (distances[index] - distances[next]);
      result.push(a.map((value, axis) => value + (b[axis] - value) * t));
    }
  }
  return result;
}

// Independent 3D plane/edge test, deliberately separate from the renderer's
// screen-space depth comparison and its known-embedding endpoint shortcut.
function properIntersection(first, second) {
  if (first.norm < EPSILON || second.norm < EPSILON) return false;
  const direction = cross(first.normal, second.normal), magnitude = length(direction);
  if (magnitude < EPSILON) return false; // coplanar overlap is not transverse
  const aDistances = first.points.map(p => dot(subtract(p, second.points[0]), second.normal));
  const bDistances = second.points.map(p => dot(subtract(p, first.points[0]), first.normal));
  if ([aDistances, bDistances].some(values => Math.min(...values) > EPSILON || Math.max(...values) < -EPSILON)) return false;
  const crossesInterior = values => Math.min(...values) < -EPSILON && Math.max(...values) > EPSILON;
  if (!crossesInterior(aDistances) && !crossesInterior(bDistances)) return false;
  const a = section(first.points, aDistances).map(p => dot(p, direction) / magnitude);
  const b = section(second.points, bDistances).map(p => dot(p, direction) / magnitude);
  if (a.length < 2 || b.length < 2) return false;
  return Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b)) > EPSILON;
}

function coplanarOverlap(first, second) {
  if (first.norm < EPSILON || second.norm < EPSILON || length(cross(first.normal, second.normal)) > EPSILON) return false;
  if (second.points.some(p => Math.abs(dot(subtract(p, first.points[0]), first.normal)) > EPSILON)) return false;
  const normalAxis = first.normal.map(Math.abs).indexOf(Math.max(...first.normal.map(Math.abs)));
  const axes = [0, 1, 2].filter(axis => axis !== normalAxis);
  let clipped = first.points.map(p => axes.map(axis => p[axis]));
  const boundary = second.points.map(p => axes.map(axis => p[axis]));
  const orient = Math.sign((boundary[1][0] - boundary[0][0]) * (boundary[2][1] - boundary[0][1]) -
    (boundary[1][1] - boundary[0][1]) * (boundary[2][0] - boundary[0][0]));
  for (let edge = 0; edge < 3 && clipped.length; edge++) {
    const a = boundary[edge], b = boundary[(edge + 1) % 3], next = [];
    const distance = p => orient * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    let previous = clipped[clipped.length - 1], before = distance(previous);
    for (const current of clipped) {
      const after = distance(current);
      if ((before >= 0) !== (after >= 0)) {
        const t = before / (before - after);
        next.push(previous.map((value, axis) => value + (current[axis] - value) * t));
      }
      if (after >= 0) next.push(current);
      previous = current; before = after;
    }
    clipped = next;
  }
  const area = clipped.reduce((sum, p, index) => {
    const next = clipped[(index + 1) % clipped.length]; return sum + p[0] * next[1] - p[1] * next[0];
  }, 0) / 2;
  return Math.abs(area) > 1e-7;
}

function meshIntersections(faces) {
  const sorted = faces.map(triangle).sort((a, b) => a.min[0] - b.min[0]), hits = [];
  for (let first = 0; first < sorted.length; first++) {
    const a = sorted[first];
    for (let second = first + 1; second < sorted.length; second++) {
      const b = sorted[second];
      if (b.min[0] > a.max[0] + EPSILON) break;
      if (b.min[1] > a.max[1] + EPSILON || b.max[1] < a.min[1] - EPSILON ||
          b.min[2] > a.max[2] + EPSILON || b.max[2] < a.min[2] - EPSILON) continue;
      const sharedEdge = a.points.filter(point => b.points.includes(point)).length >= 2;
      if ((!sharedEdge && properIntersection(a, b)) || coplanarOverlap(a, b)) hits.push([a.points, b.points]);
    }
  }
  return hits;
}

test("independent 3D mesh checker separates transverse cuts from adjacency and seam contact", () => {
  const a = [[0, 0, 0], [2, 0, 0], [0, 2, 0]];
  const b = [[0.4, 0.4, -1], [1.4, 0.4, 1], [0.4, 1.4, 1]];
  assert.equal(meshIntersections([a, b]).length, 1);
  assert.equal(meshIntersections([a, [a[0], [2, 1.8, -1], [1.8, 2, 1]]]).length, 1,
    "a shared vertex does not hide a longer cut through the two faces");
  assert.equal(meshIntersections([a, [a[0], a[1], [1, 1, 1]]]).length, 0, "mesh adjacency");
  assert.equal(meshIntersections([a, [a[0], a[1], [1, 1, 0]]]).length, 1, "a face folded flat over its neighbor is not harmless adjacency");
  assert.equal(meshIntersections([a, a.map(p => p.slice())]).length, 1, "coplanar area overlap is also a sheet collision");
  assert.equal(meshIntersections([a, [[0, 0, 0], [2, 0, 0], [1, -1, 1]]]).length, 0, "identified boundary contact");
  assert.equal(meshIntersections([a, [[2, 0, 0], [3, 0, 1], [3, 1, 1]]]).length, 0, "point contact");
});

function renderedFaces(type, progress, options = {}) {
  const level = Content.LEVELS.find(level => level.topology === type);
  const rules = Engine.createRules({ type, width: 7, height: 7 });
  const layout = Art.computeLayout(500, 500, rules);
  const game = { level, rules, board: new Int8Array(rules.cellCount) };
  const context = new Proxy({ globalAlpha: 1, createLinearGradient() { return { addColorStop() {} }; } },
    { get(target, key) { return key in target ? target[key] : () => {}; } });
  const stop = {}, originalDepth = Morph.createDepthBuffer, originalFill = Morph.fillSurface;
  let patches;
  try {
    Morph.fillSurface = () => {};
    Morph.createDepthBuffer = (_width, _height, source) => { patches = source; throw stop; };
    Art.drawCompletion(context, { game, layout, morph: progress, ...options });
  } catch (error) { if (error !== stop) throw error; }
  finally { Morph.createDepthBuffer = originalDepth; Morph.fillSurface = originalFill; }
  assert.ok(patches && patches.length, "capture the actual painted mesh before the depth renderer classifies it");
  const vertices = new Map(), faces = [];
  const point = p => {
    // A fixed invertible scale keeps the 3D predicate well conditioned; no
    // perspective or endpoint assumptions enter the independent checker.
    if (!vertices.has(p)) {
      const mapped = [p.x, p.y, p.depth * 125]; mapped.uv = [p.u, p.v];
      vertices.set(p, mapped);
    }
    return vertices.get(p);
  };
  for (const patch of patches) {
    for (let index = 1; index + 1 < patch.points.length; index++) {
      faces.push([point(patch.points[0]), point(patch.points[index]), point(patch.points[index + 1])]);
    }
  }
  return faces;
}

test("the actual refined sphere mesh closes without crossings or overlapping corner faces", () => {
  const poses = [{}, { rotation: { x: 0.6, y: 0.75, z: -0.15 } },
    { rotation: { x: -1.1, y: 2, z: 0.7 } },
    { view: { x: 0.12, y: -0.23, z: 0.07, shapeX: 1.08, shapeY: 0.94, shapeZ: 1.04 },
      presentation: { type: "sphere-path", boost: [0.08, -0.04, 0.02] }, wobbleX: 0.025, wobbleY: -0.018 }];
  for (let pose = 0; pose < poses.length; pose++) {
    for (const progress of [0, 0.001, 0.04, 0.1, 0.2, 0.3, 0.4, 0.46, 0.47, 0.48, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99, 0.999, 1]) {
      assert.equal(meshIntersections(renderedFaces("sphere", progress, poses[pose])).length, 0,
        `sphere pose ${pose}, progress ${progress}: both charts and all corner fans remain embedded`);
    }
  }
});

test("analytic cylinder, torus and Mobius rolls remain embedded throughout their actual animation", () => {
  for (const type of ["cylinder", "torus", "mobius"]) {
    for (const pose of [{ rotation: { x: 0, y: 0, z: 0 } }, { rotation: { x: 0.6, y: 0.75, z: -0.15 } },
      { view: { x: 0.12, y: -0.23, z: 0.07, shapeX: 1.08, shapeY: 0.94, shapeZ: 1.04 }, wobbleX: 0.025, wobbleY: -0.018 }]) {
      for (const progress of [0, 0.001, 0.04, 0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 0.9, 0.99, 0.999, 1]) {
        assert.equal(meshIntersections(renderedFaces(type, progress, pose)).length, 0,
          `${type}, progress ${progress}: only identified edges may touch`);
      }
    }
  }
});

test("rolled surfaces meet their remembered endpoint and pass continuous rotation angles without a camera flip", () => {
  for (const type of ["cylinder", "torus", "mobius"]) {
    const rules = Engine.createRules({ type, width: 7, height: 7 }), layout = Art.computeLayout(500, 500, rules);
    const game = { level: { topology: type } }, uv = { u: 0.3, v: 0.7 }, flat = Art.flatPointFromUV(rules, layout, uv.u, uv.v);
    const project = (morph, y) => Art.mappedCompletionPoint(game, layout, flat, uv,
      { x: 0.2, y, z: -0.3, morph, perspective: morph, shapeX: 1.04, shapeY: 0.97, shapeZ: 1.02, wobbleX: 0.02, wobbleY: -0.01 });
    const a = project(1 - 1e-6, 2), b = project(1, 2);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.001, type + " exact endpoint continuity");
    for (const angle of [Math.PI, -Math.PI, Math.PI * 2]) {
      const before = project(0.55, angle - 1e-6), after = project(0.55, angle + 1e-6);
      assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 0.001, type + " continuous drag through a full-angle boundary");
    }
  }
});

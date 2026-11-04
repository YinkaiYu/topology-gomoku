"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Engine = require("../app/assets/topology.js");
const Coordinates = require("../arena/public/coordinates.js");
const { briefingFor } = require("../arena/rules-briefing.cjs");

const expected = {
  plane: { destinations: [null, null, null, null, null, null, null], directions: [null, null, null, null, null, null, null] },
  cylinder: { destinations: ["A6", "G6", null, null, "A7", null, null], directions: [0, 4, null, null, 7, null, null] },
  torus: { destinations: ["A6", "G6", "B1", "B7", "A7", "C1", "A1"], directions: [0, 4, 6, 2, 7, 7, 7] },
  mobius: { destinations: ["A2", "G2", null, null, "A1", null, null], directions: [0, 4, null, null, 1, null, null] },
  klein: { destinations: ["A2", "G2", "B1", "B7", "A1", "C1", "A7"], directions: [0, 4, 6, 2, 1, 7, 1] },
  projective: { destinations: ["A2", "G2", "F1", "F7", "A1", "E1", "G7"], directions: [0, 4, 6, 2, 1, 5, 3] },
  sphere: { destinations: ["B1", "B7", "A6", "G6", "A1", "A5", null], directions: [6, 2, 0, 4, 5, 1, null] }
};

test("preparation examples explain cardinal, diagonal and corner transitions for every topology", () => {
  for (const [type, values] of Object.entries(expected)) {
    const briefing = briefingFor(Engine.createRules({ type, width: 7, height: 7, target: 5 }));
    assert.deepEqual(briefing.examples.map(e => e.from), ["G6", "A6", "B7", "B1", "G6", "B7", "G7"]);
    assert.deepEqual(briefing.examples.map(e => e.to), values.destinations, type);
    assert.deepEqual(briefing.examples.map(e => e.nextDirection), values.directions, type);
  }
});

test("briefing paths match the judge at small, rectangular, even and maximum dimensions", () => {
  for (const type of Object.keys(expected)) {
    const sizes = type === "sphere" ? [[5, 5], [8, 8], [19, 19]] : [[5, 5], [5, 19], [19, 5], [8, 6], [9, 8], [19, 19]];
    for (const [width, height] of sizes) {
      const rules = Engine.createRules({ type, width, height, target: 5 });
      const briefing = briefingFor(rules);
      assert.ok(briefing.board.includes(`${width} 列 × ${height} 行`));
      assert.equal(JSON.stringify(briefing).includes("{{"), false);
      for (const example of briefing.examples) {
        const from = Coordinates.cell(example.from, width, height);
        assert.notEqual(from, null);
        const step = Engine.step(rules, from, example.direction);
        assert.equal(example.to, step ? Coordinates.label(step.cell, width, height) : null);
        assert.equal(example.nextDirection, step?.direction ?? null);
        assert.equal(example.continues === null, step === null);
      }
      const line = briefing.lineExample;
      assert.ok(line, `${type} ${width}×${height} needs a valid demonstration`);
      const cells = line.coordinates.map(label => Coordinates.cell(label, width, height));
      assert.equal(new Set(cells).size, rules.target);
      assert.equal(cells.includes(null), false);
      const traced = Engine.tracePath(rules, cells[0], line.directions[0], rules.target);
      assert.deepEqual(traced.cells, cells);
      assert.deepEqual(traced.directions, line.directions);
      assert.deepEqual(traced.seams, line.seams);
      const key = cells.slice().sort((a, b) => a - b).join(",");
      assert.ok(rules.winMasks.some(mask => [...mask.cells].sort((a, b) => a - b).join(",") === key));
      assert.equal(line.seams.some(Boolean), type !== "plane");
      if (["mobius", "klein", "projective", "sphere"].includes(type)) {
        assert.ok(line.directions.some(direction => direction !== line.directions[0]), `${type}: show the actual turn after crossing`);
      }
    }
  }
});

test("briefing is deterministic and leaves the shared geometry unchanged", () => {
  const rules = Engine.createRules({ type: "mobius", width: 7, height: 7, target: 5 });
  const original = JSON.stringify(rules);
  const first = briefingFor(rules);
  assert.deepEqual(briefingFor(rules), first);
  assert.equal(JSON.stringify(rules), original);
  assert.deepEqual(first.lineExample.coordinates, ["B7", "A6", "G3", "F4", "E5"]);
  assert.deepEqual(first.lineExample.directionNames, ["左下", "左下", "左上", "左上", "左上"]);
});

test("the sphere edge-coordinate explanation holds along every paired edge at every supported size", () => {
  for (let size = 5; size <= 19; size++) {
    const rules = Engine.createRules({ type: "sphere", width: size, height: size, target: 5 });
    for (let column = 1; column <= size; column++) {
      const top = column - 1, bottom = (size - 1) * size + column - 1;
      const left = Coordinates.cell(`A${size + 1 - column}`, size, size);
      const right = Coordinates.cell(`${String.fromCharCode(64 + size)}${size + 1 - column}`, size, size);
      assert.equal(Engine.step(rules, top, 6).cell, left);
      assert.equal(Engine.step(rules, bottom, 2).cell, right);
      assert.equal(Engine.step(rules, left, 4).cell, top);
      assert.equal(Engine.step(rules, right, 0).cell, bottom);
    }
  }
});

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

// Interpret the formulas actually sent to the agent, not a second hard-coded
// transition function. This deliberately supports only the documented grammar;
// no eval, Function, property access or arbitrary calls are available.
function expression(source) {
  const tokens = [], tokenizer = /\s*(\d+|[A-Za-z_]\w*|>=|<=|==|!=|&&|\|\||[+\-*%<>()!?:,])\s*/y;
  let offset = 0;
  while (offset < source.length) {
    tokenizer.lastIndex = offset;
    const match = tokenizer.exec(source);
    if (!match) throw new Error(`Unsupported formula at ${source.slice(offset)}`);
    tokens.push(match[1]); offset = tokenizer.lastIndex;
  }
  let cursor = 0;
  const take = token => { if (tokens[cursor] !== token) throw new Error(`Expected ${token} in ${source}`); cursor++; };
  const binary = {
    "||": [1, (a, b) => a || b], "&&": [2, (a, b) => a && b],
    "==": [3, (a, b) => a === b], "!=": [3, (a, b) => a !== b],
    "<": [4, (a, b) => a < b], "<=": [4, (a, b) => a <= b],
    ">": [4, (a, b) => a > b], ">=": [4, (a, b) => a >= b],
    "+": [5, (a, b) => a + b], "-": [5, (a, b) => a - b],
    "*": [6, (a, b) => a * b], "%": [6, (a, b) => a % b]
  };
  function primary() {
    const token = tokens[cursor++];
    if (["-", "+", "!"].includes(token)) {
      const operand = primary();
      return env => token === "-" ? -operand(env) : token === "+" ? +operand(env) : !operand(env);
    }
    if (token === "(") { const result = conditional(); take(")"); return result; }
    if (/^\d+$/.test(token)) return () => Number(token);
    if (token === "true" || token === "false") return () => token === "true";
    if (token === "mod") {
      take("("); const a = conditional(); take(","); const n = conditional(); take(")");
      return env => ((a(env) % n(env)) + n(env)) % n(env);
    }
    if (!/^[A-Za-z_]\w*$/.test(token || "")) throw new Error(`Invalid operand in ${source}`);
    return env => { if (!Object.hasOwn(env, token)) throw new Error(`Undefined ${token}`); return env[token]; };
  }
  function operation(minimum = 1) {
    let left = primary();
    while (binary[tokens[cursor]]?.[0] >= minimum) {
      const [precedence, apply] = binary[tokens[cursor++]], previous = left;
      const right = operation(precedence + 1);
      left = env => apply(previous(env), right(env));
    }
    return left;
  }
  function conditional() {
    const condition = operation();
    if (tokens[cursor] !== "?") return condition;
    cursor++; const yes = conditional(); take(":"); const no = conditional();
    return env => condition(env) ? yes(env) : no(env);
  }
  const result = conditional();
  if (cursor !== tokens.length) throw new Error(`Trailing formula tokens: ${source}`);
  return result;
}

function interpretDefinition(definition) {
  const stages = [...definition.initialStages, ...definition.stages].map(stage =>
    Object.entries(stage).map(([name, formula]) => [name, expression(formula)]));
  const cases = definition.cases.map(branch => ({ when: expression(branch.when), next: branch.next?.map(expression) ?? null }));
  return (cell, direction) => {
    const { W, H } = definition.parameters;
    const vector = definition.directionTable.find(row => row.index === direction);
    const env = { W, H, x: cell % W, y: Math.floor(cell / W), dx: vector.dx, dy: vector.dy };
    for (const stage of stages) {
      const updated = Object.fromEntries(stage.map(([name, formula]) => [name, formula(env)]));
      Object.assign(env, updated);
    }
    const branch = cases.find(branch => branch.when(env));
    assert.ok(branch, "Every valid input must reach a case");
    if (branch.next === null) return null;
    const [x, y, dx, dy] = branch.next.map(formula => formula(env));
    const nextDirection = definition.directionTable.find(row => row.dx === dx && row.dy === dy)?.index;
    assert.ok(Number.isInteger(nextDirection), "Mapped direction must belong to the public direction table");
    assert.ok(Number.isInteger(x) && x >= 0 && x < W && Number.isInteger(y) && y >= 0 && y < H);
    return { cell: y * W + x, direction: nextDirection };
  };
}

test("the actual published definitions match every judge step for all supported sizes and topologies", () => {
  let count = 0;
  for (const type of Object.keys(expected)) {
    for (let width = 5; width <= 19; width++) for (let height = 5; height <= 19; height++) {
      if (type === "sphere" && width !== height) continue;
      const rules = Engine.createRules({ type, width, height, target: 5 });
      const definition = briefingFor(rules).definition;
      assert.deepEqual(definition.parameters, { W: width, H: height });
      assert.deepEqual(definition.directionTable.map(({ index, dx, dy, name }) => ({ index, dx, dy, name })),
        Engine.DIRECTIONS.map((direction, index) => ({ index, ...direction })));
      const interpret = interpretDefinition(definition);
      for (let cell = 0; cell < width * height; cell++) for (let direction = 0; direction < 8; direction++) {
        const actual = interpret(cell, direction), expectedStep = Engine.step(rules, cell, direction);
        const correct = expectedStep === null ? actual === null
          : actual?.cell === expectedStep.cell && actual?.direction === expectedStep.direction;
        if (!correct) assert.fail(`${type} ${width}×${height}, cell ${cell}, direction ${direction}: definition ${JSON.stringify(actual)}, judge ${JSON.stringify(expectedStep)}`);
        count++;
      }
    }
  }
  assert.equal(count, 1574720);
});

test("formula verification detects a changed definition and rejects non-formula code", () => {
  const rules = Engine.createRules({ type: "mobius", width: 7, height: 7, target: 5 });
  const definition = briefingFor(rules).definition;
  definition.stages[0].DY = "dy";
  const changed = interpretDefinition(definition)(Coordinates.cell("G6", 7, 7), 7);
  assert.notEqual(changed.direction, Engine.step(rules, Coordinates.cell("G6", 7, 7), 7).direction);
  for (const source of ["process.exit()", "x; y", "f(x)", "x[0]", "unknown"]) {
    assert.throws(() => expression(source)({ x: 1, y: 2 }));
  }
});

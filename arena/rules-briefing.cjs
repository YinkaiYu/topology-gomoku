"use strict";

const Engine = require("../app/assets/topology.js");
const Coordinates = require("./public/coordinates.js");
const { readPrompt } = require("./prompts.cjs");

function fill(text, fields) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => fields[key]);
}

// Geometry comes exclusively from the rules used by the judge, including the
// changed direction after each seam. Human wording stays independently editable.
function briefingFor(rules) {
  const wording = JSON.parse(readPrompt("topology.json"));
  const { width, height, target, type } = rules;
  const label = cell => Coordinates.label(cell, width, height);
  const fields = { name: wording.names[type], width, height, target, rowMirror: height + 1 };
  const point = (x, y) => y * width + x;
  const samples = [
    [point(width - 1, 1), 0], [point(0, 1), 4],
    [point(1, 0), 6], [point(1, height - 1), 2],
    [point(width - 1, 1), 7], [point(1, 0), 7],
    [point(width - 1, 0), 7]
  ];
  const examples = samples.map(([from, direction]) => {
    const next = Engine.step(rules, from, direction);
    return {
      from: label(from), direction, toward: wording.directions[direction],
      to: next ? label(next.cell) : null,
      nextDirection: next?.direction ?? null,
      continues: next ? wording.directions[next.direction] : null
    };
  });

  // Choose a simple real winning window, preferring one changed-direction seam.
  // This is a geometric example, independent of the actual board occupancy.
  let chosen = null, best = -1;
  for (const mask of rules.winMasks) {
    const trace = Engine.tracePath(rules, mask.cells[0], mask.direction, target);
    if (!trace) continue;
    const crossings = trace.seams.filter(Boolean).length;
    const changed = trace.directions.some(d => d !== trace.directions[0]);
    const firstSeam = trace.seams.findIndex(Boolean);
    const score = (crossings === 1 ? 8 : crossings ? 2 : 0) + (changed ? 4 : 0) + (firstSeam === 1 ? 1 : 0);
    if (score > best) { chosen = trace; best = score; }
  }
  const lineExample = chosen ? {
    coordinates: chosen.cells.map(label),
    directions: chosen.directions,
    directionNames: chosen.directions.map(d => wording.directions[d]),
    seams: chosen.seams,
    text: fill(wording.line, { target, path: chosen.cells.map(label).join(" → ") })
  } : null;
  return {
    board: fill(wording.board, fields),
    orientation: wording.orientation,
    boundaryRules: wording.boundaries[type].map(text => fill(text, fields)),
    definition: {
      parameters: { W: width, H: height },
      notation: wording.definitionNotation,
      directionTable: Engine.DIRECTIONS.map((direction, index) => ({ index, ...direction, toward: wording.directions[index] })),
      initialStages: wording.initialStages,
      ...wording.definitions[type]
    },
    continuity: wording.continuity,
    openBoundary: wording.openBoundary,
    examples,
    lineExample
  };
}

module.exports = { briefingFor };

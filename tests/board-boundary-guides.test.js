"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Art = require("../app/assets/board-art.js"), Engine = require("../app/assets/topology.js"), Content = require("../app/assets/level-config.js");
function render(level, options) {
  const strokes = [], stack = []; let points = [];
  const ctx = new Proxy({
    globalAlpha: 1,
    save() { stack.push({ strokeStyle: this.strokeStyle, fillStyle: this.fillStyle, globalAlpha: this.globalAlpha }); },
    restore() { Object.assign(this, stack.pop()); },
    beginPath() { points = []; }, moveTo(x,y) { points.push([x,y]); }, lineTo(x,y) { points.push([x,y]); },
    stroke() { strokes.push({ color: this.strokeStyle, points: [...points] }); },
    createRadialGradient() { return { addColorStop() {} }; }
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const rules = Engine.createRules({ type: level.topology, width: 7, height: 7 });
  const layout = { width: 400, height: 400, left: 80, right: 320, top: 80, bottom: 320, cell: 40 };
  Art.drawBoard(ctx, { game: { level, rules, board: Engine.createBoard(rules), lastMove: -1 }, layout, ...options });
  return strokes;
}
test("optional half-cell guides extend only connected edges and meet the actual rail coordinates", () => {
  for (const level of Content.LEVELS) {
    const strokes = render(level, { extendGridToRails: true });
    const grid = strokes.filter(stroke => stroke.color === "rgba(108, 103, 94, 0.5)");
    assert.equal(grid.length, 14);
    const xExtension = level.xConnection || level.topology === "sphere" ? 20 : 0;
    const yExtension = level.yConnection || level.topology === "sphere" ? 20 : 0;
    for (let i = 0; i < 7; i++) {
      assert.deepEqual(grid[i].points, [[80 + i*40, 80-yExtension], [80+i*40,320+yExtension]], level.topology);
      assert.deepEqual(grid[i+7].points, [[80-xExtension,80+i*40], [320+xExtension,80+i*40]], level.topology);
    }
    for (const position of xExtension ? [60,340] : []) assert.ok(strokes.some(stroke => JSON.stringify(stroke.points) === JSON.stringify([[position,80],[position,320]])));
    for (const position of yExtension ? [60,340] : []) assert.ok(strokes.some(stroke => JSON.stringify(stroke.points) === JSON.stringify([[80,position],[320,position]])));
    assert.deepEqual(render(level), render(level, { extendGridToRails: false }), "Existing callers retain their original drawing");
    const originalGrid = render(level).filter(stroke => stroke.color === "rgba(108, 103, 94, 0.5)");
    assert.deepEqual(originalGrid[0].points, [[80,80],[80,320]]);
  }
});

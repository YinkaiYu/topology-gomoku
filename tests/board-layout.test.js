"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Art = require("../app/assets/board-art.js");
const Content = require("../app/assets/level-config.js");

test("矮面板放大网格，所有拓扑仍居中且边界箭头留在面板内", () => {
  for (const level of Content.LEVELS) {
    for (const [width, height] of [[330, 200], [300, 180], [352, 290], [350, 350]]) {
      const layout = Art.computeLayout(width, height, level);
      assert.ok(Math.abs(layout.left + layout.right - width) < 1e-8);
      assert.ok(Math.abs(layout.top + layout.bottom - height) < 1e-8);
      const railExtent = Math.min(15, layout.cell * 0.4) + 4.5;
      assert.ok(layout.left > railExtent && layout.top > railExtent);
      assert.ok(layout.right + railExtent < width && layout.bottom + railExtent < height);
      const last = Art.cellCenter({width:level.width}, layout, level.width * level.height - 1);
      assert.ok(Math.abs(last.x - layout.right) < 1e-8);
    }
  }
  const layout = Art.computeLayout(330, 200, {width:7, height:6});
  assert.ok((layout.bottom-layout.top) / (200-68) > 1.15);
});

test("充裕面板与显式边距维持原有比例", () => {
  for (const size of [360, 400, 520]) {
    const layout = Art.computeLayout(size, size, {width:7,height:7});
    assert.ok(Math.abs(layout.left - Math.max(34, size*0.115)) < 1e-8);
  }
  assert.equal(Art.computeLayout(200, 200, {width:7,height:7}, {minimumMargin:34}).left, 34);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TOPOLOGY_DIR = path.join(ROOT, "app", "assets", "topologies");
const NAMES = ["plane", "cylinder", "torus", "mobius", "klein", "projective"];

test("目录拓扑图全部来自带模型标记的本地 SVG", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  NAMES.forEach((name) => {
    const relativePath = `./assets/topologies/${name}.svg`;
    assert.ok(html.includes(relativePath), relativePath);
    const svg = fs.readFileSync(path.join(TOPOLOGY_DIR, `${name}.svg`), "utf8");
    assert.match(svg, /data-model="[^"]+"/);
    assert.match(svg, /<desc>[^<]+<\/desc>/);
    assert.doesNotMatch(svg, /<script|<image|<foreignObject|(?:href|src)\s*=\s*["']https?:\/\//i);
  });
  assert.doesNotMatch(html, /assets\/topologies\/[^"]+\.png/);
});

test("参数图包含足够的采样曲线且保留透明背景", () => {
  NAMES.forEach((name) => {
    const svg = fs.readFileSync(path.join(TOPOLOGY_DIR, `${name}.svg`), "utf8");
    const pathCount = (svg.match(/<path\b/g) || []).length;
    assert.ok(pathCount >= 6, `${name}: ${pathCount} paths`);
    assert.doesNotMatch(svg, /<rect[^>]+fill=/);
  });
});

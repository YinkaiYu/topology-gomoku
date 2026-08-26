"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TOPOLOGY_DIR = path.join(ROOT, "app", "assets", "topologies");
const NAMES = ["plane", "cylinder", "torus", "mobius", "klein", "projective"];
const SHADED_3D_MODELS = {
  mobius: "shaded-mobius-embedding",
  klein: "hand-drawn-classic-klein-bottle-schematic",
  projective: "shaded-roman-surface-rp2-immersion",
};

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

test("六关均使用不透明曲面与统一投影轮廓", () => {
  NAMES.forEach((name) => {
    const svg = fs.readFileSync(path.join(TOPOLOGY_DIR, `${name}.svg`), "utf8");
    const pathCount = (svg.match(/<path\b/g) || []).length;
    assert.ok(pathCount >= 1, `${name}: ${pathCount} paths`);
    assert.match(svg, /data-style="hand-drawn-cel-silhouette"/);
    assert.match(svg, /<filter id="handSurface"/);
    assert.match(svg, /<feTurbulence\b/);
    assert.match(svg, /fill="#[0-9a-f]{6}"/);
    assert.doesNotMatch(svg, /<rect[^>]+fill=/);
    assert.doesNotMatch(svg, /<text\b|<foreignObject\b/i);
    assert.doesNotMatch(svg, /stroke-opacity="0\.[0-7]/);
  });
});

test("高阶关卡使用明确的拓扑形态模型", () => {
  Object.entries(SHADED_3D_MODELS).forEach(([name, model]) => {
    const svg = fs.readFileSync(path.join(TOPOLOGY_DIR, `${name}.svg`), "utf8");
    assert.match(svg, new RegExp(`data-model="${model}"`));
  });

  ["mobius", "projective"].forEach((name) => {
    const svg = fs.readFileSync(path.join(TOPOLOGY_DIR, `${name}.svg`), "utf8");
    assert.ok((svg.match(/fill="#[0-9a-f]{6}"/g) || []).length >= 100, `${name}: missing shaded patches`);
  });

  const klein = fs.readFileSync(path.join(TOPOLOGY_DIR, "klein.svg"), "utf8");
  assert.ok((klein.match(/fill="#[0-9a-f]{6}"/g) || []).length >= 3, "klein: missing opaque bottle layers");
  assert.ok((klein.match(/fill="none"/g) || []).length >= 2, "klein: missing loop and penetration outlines");
});

test("莫比乌斯带具有一条连续的真实边界描线", () => {
  const svg = fs.readFileSync(path.join(TOPOLOGY_DIR, "mobius.svg"), "utf8");
  assert.match(svg, /data-model="shaded-mobius-embedding"/);
  assert.match(svg, /stroke-width="2\.80"/);
});

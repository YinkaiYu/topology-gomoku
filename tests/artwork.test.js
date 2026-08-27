"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TOPOLOGY_DIR = path.join(ROOT, "app", "assets", "topologies");
const SILHOUETTE_DIR = path.join(ROOT, "app", "assets", "silhouettes");
const NAMES = ["plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const SHADED_3D_MODELS = {
  mobius: "shaded-mobius-embedding",
  klein: "hand-drawn-classic-klein-bottle-schematic",
  projective: "shaded-roman-surface-rp2-immersion",
  sphere: "hand-drawn-spherical-quotient",
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

test("七关均使用不透明曲面与统一投影轮廓", () => {
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

test("目录中的高阶拓扑必须通关后才揭示图鉴", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.equal((html.match(/class="level-mystery"/g) || []).length, 6);
  assert.match(game, /var revealed = index === 0 \|\| complete;/);
  assert.match(game, /classList\.toggle\("is-revealed", revealed\)/);
  assert.match(style, /\.level-card:not\(\.is-revealed\) \.level-glyph/);
  assert.match(style, /\.level-card\.is-revealed \.level-mystery/);
  assert.equal((html.match(/class="level-silhouette"/g) || []).length, 6);
  assert.match(style, /\.level-card:not\(\.is-revealed\) \.level-glyph\s*\{[^}]*opacity:\s*0/s);
  assert.doesNotMatch(style, /\.level-mystery::before\s*\{[^}]*border-radius:/s);
});

test("未揭示图鉴使用真实模型外轮廓的无孔实心剪影", () => {
  ["cylinder", "torus", "mobius", "klein", "projective", "sphere"].forEach((name) => {
    const svg = fs.readFileSync(path.join(SILHOUETTE_DIR, `${name}.svg`), "utf8");
    assert.match(svg, new RegExp(`data-source-model="${name}"`));
    assert.match(svg, new RegExp(`data-source-href="../topologies/${name}\\.svg"`));
    assert.match(svg, /<path [^>]*fill="#25332f"/);
    assert.equal((svg.match(/<path /g) || []).length, 1);
    assert.doesNotMatch(svg, /<image|<filter|fill-rule="evenodd"/);
  });
});

test("首页采用 E 款品牌主视觉并移除二次进入按钮与英文副标题", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(html, /class="hero-brand" src="\.\/assets\/brand-icon\.png"/);
  assert.doesNotMatch(html, /class="brand-mark"/);
  assert.doesNotMatch(html, /TOPOLOGY\s*×\s*GOMOKU|id="startButton"|class="home-actions"/);
  assert.match(html, /<span class="level-name">双生<\/span>/);
  assert.doesNotMatch(html, /id="homeSettingsButton"/);
  assert.doesNotMatch(html, /class="level-number"/);
  assert.match(html, /<span class="level-type">实射影平面<\/span>\s*<span class="level-name">双生<\/span>/);
  assert.match(game, /name:\s*"双生"/);
  assert.match(html, /<span class="level-type">球面<\/span>\s*<span class="level-name">归圆<\/span>/);
  assert.match(game, /name:\s*"归圆"/);
});

test("目录锁定整屏并使用本地内嵌的典雅中文字体", () => {
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(style, /@font-face\s*\{[^}]*noto-serif-sc-400\.woff2/s);
  assert.match(style, /--display-font:\s*"Topo Serif"/);
  assert.match(style, /\.home-scroll\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(style, /grid-template-rows:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(style, /\.level-card\s*\{[^}]*text-align:\s*center/s);
  assert.match(style, /\.level-type\s*\{[^}]*grid-row:\s*2/s);
  assert.match(style, /\.level-name\s*\{[^}]*grid-row:\s*3/s);
  assert.doesNotMatch(style, /\.home-scroll\s*\{[^}]*overflow-y:\s*auto/s);
});

test("第七关以横向终章卡片收束双列目录且整页不可滚动", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(html, /class="level-card level-card-finale"[^>]+data-level="6"/);
  assert.match(style, /\.level-card-finale\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(style, /\.level-card-finale\s*\{[^}]*grid-template-columns:/s);
  assert.match(style, /\.home-scroll\s*\{[^}]*overflow:\s*hidden/s);
});

test("目录与棋局顶栏为宿主默认按钮预留额外安全空间", () => {
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(style, /--host-chrome-clearance:\s*clamp\(/);
  assert.match(style, /\.home-scroll\s*\{[^}]*var\(--host-chrome-clearance\)/s);
  assert.match(style, /\.game-screen\s*\{[^}]*var\(--host-chrome-clearance\)/s);
  assert.match(style, /\.developer-fab\s*\{[^}]*var\(--host-chrome-clearance\)/s);
  assert.doesNotMatch(style, /\.hero::after/);
});

test("关卡卡片与棋盘使用可逆共享元素弹性过渡", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /startLevel\(index, \{ transitionCard: card \}\)/);
  assert.match(game, /function animateCardIntoBoard\(/);
  assert.match(game, /function animateBoardBackToCard\(/);
  assert.match(game, /cloneNode\(true\)/);
  assert.match(game, /drawImage\(dom\.boardCanvas/);
  assert.match(game, /cardLayer\.classList\.add\("transition-card-content"\)/);
  assert.match(game, /duration:\s*440/);
  assert.match(game, /is-shared-return/);
  assert.match(game, /paintRealCardBelowTransition/);
  assert.match(game, /is-transition-ready/);
  assert.match(game, /settledBoardAnimation\s*=\s*animation/);
  assert.match(game, /function releaseSettledBoardAnimation\(/);
  assert.match(game, /backgroundColor:\s*"rgba\(251, 250, 246, 0\)"/);
  assert.match(game, /boxShadow:\s*"none"/);
  assert.match(game, /function transitionToLevel\(/);
  assert.match(game, /scale\(1\.026\)/);
});

test("第一关首次通关后自动以现有切关动效进入第二关", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(game, /firstTutorialCompletion\s*=\s*outcome === "win"/);
  assert.match(game, /!prefs\.completed\[game\.levelIndex\]/);
  assert.match(game, /TUTORIAL_AUTO_ADVANCE_DELAY\s*=\s*820/);
  assert.match(game, /transitionToLevel\(1, false\)/);
  assert.match(game, /game\.autoAdvancePending\s*=\s*firstTutorialCompletion/);
  assert.match(style, /\.game-tools\.is-auto-advancing\s*\{[^}]*visibility:\s*hidden/s);
});

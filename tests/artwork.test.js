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
    assert.match(svg, /shape-rendering="geometricPrecision"/);
    assert.doesNotMatch(svg, /<filter\b|<feTurbulence\b|<feDisplacementMap\b|<feMorphology\b/);
    assert.match(svg, /fill="#[0-9a-f]{6}"/);
    assert.doesNotMatch(svg, /<rect[^>]+fill=/);
    assert.doesNotMatch(svg, /<text\b|<foreignObject\b/i);
    assert.doesNotMatch(svg, /stroke-opacity="0\.[0-7]/);
  });
});

test("图鉴矢量在手机小尺寸下保持清晰", () => {
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(style, /\.level-glyph\s*\{[^}]*opacity:\s*1/s);
  assert.match(style, /100%\s*\{\s*opacity:\s*1;\s*transform:\s*scale\(1\) rotate\(0\);\s*\}/);
  const sphere = fs.readFileSync(path.join(TOPOLOGY_DIR, "sphere.svg"), "utf8");
  assert.match(sphere, /stroke="#282522" stroke-width="1\.76"[^>]*data-ink-layer="gesture"/);
  assert.match(sphere, /stroke="#282522"[^>]*stroke-width="2\.32"[^>]*stroke-dasharray="[0-9 ]+"[^>]*data-ink-layer="pressure"/);
  ["#f4f2ea", "#fbf9f2", "#d1cec4", "#d6d2c7"].forEach((color) => {
    assert.match(sphere, new RegExp(`fill="${color}"`));
  });
  ["#efede5", "#f8f6ef", "#d0cdc4", "#dedbd2"].forEach((color) => {
    assert.doesNotMatch(sphere, new RegExp(color));
  });
  assert.equal((sphere.match(/vector-effect="non-scaling-stroke"/g) || []).length, 10);
  assert.doesNotMatch(sphere, /filter="url\(#handLine\)"/);
  NAMES.forEach((name) => {
    const svg = fs.readFileSync(path.join(TOPOLOGY_DIR, `${name}.svg`), "utf8");
    assert.doesNotMatch(svg, /<filter\b|<fe[A-Z]/, `${name}: rasterized SVG effect`);
    assert.match(svg, /data-ink-layer="gesture"/, `${name}: missing continuous gesture line`);
    assert.match(svg, /data-ink-layer="pressure"/, `${name}: missing pressure variation`);
    assert.match(svg, /stroke-dasharray="[0-9. ]+"/, `${name}: missing pressure rhythm`);
    const inkWidths = [...svg.matchAll(/stroke="#282522"[^>]*stroke-width="([0-9.]+)"/g)]
      .map((match) => Number(match[1]));
    assert.ok(new Set(inkWidths).size >= 2, `${name}: uniform ink width`);
    assert.ok(Math.max(...inkWidths) <= 2.54, `${name}: ink is still too heavy`);
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
  assert.match(svg, /data-ink-layer="gesture"/);
  assert.match(svg, /data-ink-layer="pressure"/);
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
  assert.doesNotMatch(html, /class="level-state"/);
  assert.doesNotMatch(style, /\.level-state/);
  assert.doesNotMatch(style, /\.level-grid::before/);
  assert.doesNotMatch(style, /border-left:\s*1px dashed rgba\(63, 140, 135/);
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
  assert.match(html, /<span class="level-type">莫比乌斯环<\/span>/);
  assert.match(game, /name:\s*"归圆"/);
});

test("目录仅保留主视觉呼吸，图鉴与剪影保持静止以保证共享元素无闪烁", () => {
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(style, /@keyframes hero-brand-breathe/);
  assert.doesNotMatch(style, /@keyframes collectible-breathe/);
  assert.doesNotMatch(style, /--art-breathe-delay/);
  assert.match(style, /\.level-card:not\(\.is-revealed\) \.level-mystery\s*\{[^}]*animation:\s*none/s);
  assert.match(style, /@media \(prefers-reduced-motion: reduce\)/);
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

test("终章标题作为同一字体文本运行且样式与字体使用离线包真实路径", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(html, /href="\.\/assets\/style\.css"/);
  assert.doesNotMatch(html, /style\.css[?#]/);
  assert.match(html, /<span class="level-name">归圆<\/span>/);
  assert.doesNotMatch(html, /optical-title-rise/);
  assert.match(style, /\.level-name\s*\{[^}]*font-weight:\s*700/s);
  ["400", "600", "700"].forEach((weight) => {
    assert.match(style, new RegExp(`url\\(\\s*["']?\\.\\/fonts\\/noto-serif-sc-${weight}\\.woff2["']?\\s*\\)`));
    assert.doesNotMatch(style, new RegExp(`noto-serif-sc-${weight}\\.woff2[?#]`));
  });
});

test("第七关以横向终章卡片收束双列目录且整页不可滚动", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(html, /class="level-card level-card-finale"[^>]+data-level="6"/);
  assert.match(style, /\.level-card-finale\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(style, /\.level-card-finale\s*\{[^}]*grid-template-columns:/s);
  assert.match(style, /\.home-scroll\s*\{[^}]*overflow:\s*hidden/s);
});

test("顶部交互区在安全区缺失时仍避开宿主悬浮按钮", () => {
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(style, /--host-chrome-clearance:\s*clamp\(/);
  assert.match(style, /--host-top-inset:\s*max\(68px,\s*calc\(var\(--safe-top\)\s*\+\s*var\(--host-chrome-clearance\)\)\)/);
  assert.match(style, /\.home-scroll\s*\{[^}]*var\(--host-top-inset\)/s);
  assert.match(style, /\.game-screen\s*\{[^}]*var\(--host-top-inset\)/s);
  assert.match(style, /\.developer-fab\s*\{[^}]*var\(--host-top-inset\)/s);
  assert.match(style, /\.board-stage\s*\{[^}]*var\(--host-top-inset\)/s);
  assert.match(style, /html\[data-toy-container="bilibili-app"\]\[data-toy-immersive="true"\][\s\S]*--host-top-inset:\s*calc\(var\(--safe-top\) \+ var\(--host-chrome-clearance\)\)/);
  assert.doesNotMatch(style, /\.hero::after/);
});

test("关卡卡片展开时目录保持原位并以液态弹性共享元素进入棋盘", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(game, /startLevel\(index, \{ transitionCard: card \}\)/);
  assert.match(game, /function animateCardIntoBoard\(/);
  assert.match(game, /function animateBoardBackToCard\(/);
  assert.match(game, /drawImage\(dom\.boardCanvas/);
  assert.match(game, /REVERSIBLE_MOTION_DURATION\s*=\s*380/);
  assert.match(game, /REVERSIBLE_MOTION_EASING\s*=\s*"cubic-bezier\(0\.37, 0, 0\.63, 1\)"/);
  assert.match(game, /LIQUID_CARD_MOTION_DURATION\s*=\s*300/);
  assert.match(game, /LIQUID_CARD_RETURN_DURATION\s*=\s*240/);
  assert.match(game, /LIQUID_CARD_MOTION_EASING\s*=\s*"linear"/);
  assert.match(game, /LIQUID_CARD_TRAVEL_EASING\s*=\s*"cubic-bezier\(0\.16, 0\.84, 0\.24, 1\)"/);
  assert.match(game, /LIQUID_CARD_BOUNCE_EASING\s*=\s*"cubic-bezier\(0\.37, 0, 0\.63, 1\)"/);
  assert.ok((game.match(/duration:\s*LIQUID_CARD_MOTION_DURATION/g) || []).length >= 2);
  assert.ok((game.match(/duration:\s*LIQUID_CARD_RETURN_DURATION/g) || []).length >= 3);
  assert.ok((game.match(/easing:\s*LIQUID_CARD_MOTION_EASING/g) || []).length >= 3);
  assert.match(game, /offset:\s*0\.46/);
  assert.match(game, /offset:\s*0\.64/);
  assert.match(game, /offset:\s*0\.8/);
  assert.match(game, /offset:\s*0\.92/);
  assert.match(game, /offset:\s*0\.68/);
  assert.match(game, /offset:\s*0\.52/);
  assert.match(game, /offset:\s*0\.44/);
  assert.match(game, /offset:\s*0\.88/);
  assert.match(game, /expansionScale\s*=\s*1\.068/);
  assert.match(game, /recoilScale\s*=\s*0\.962/);
  assert.match(game, /secondaryBounceScale\s*=\s*1\.028/);
  assert.match(game, /tertiaryRecoilScale\s*=\s*0\.988/);
  assert.match(game, /translate\(0, 0\) scale\(" \+ expansionScale \+ "\)"/);
  assert.doesNotMatch(game, /stretchX|stretchY|inverseStretch/);
  assert.doesNotMatch(game, /borderRadius:\s*"(?:36px 23px|26px 32px|30px 28px)/);
  assert.match(game, /fixedRectStyles\(tile, boardRect\)/);
  assert.match(game, /targetCard\.classList\.add\("is-transition-target"\);[\s\S]*showScreen\("home"\)/s);
  assert.match(game, /scaleX\s*=\s*target\.width \/ boardRect\.width/);
  assert.match(game, /scaleY\s*=\s*target\.height \/ boardRect\.height/);
  assert.match(game, /uniformScale\s*=\s*Math\.min\(scaleX, scaleY\)/);
  assert.match(game, /translate\(" \+ translateX \+ "px, " \+ translateY \+ "px\) scale\(" \+ scaleX \+ ", " \+ scaleY/);
  assert.match(game, /transformedTargetRadius\s*=\s*targetRadius \/ scaleX \+ "px \/ " \+ targetRadius \/ scaleY/);
  assert.match(game, /tileCanvas\.animate\(/);
  assert.match(game, /canvasCounterScaleX\s*=\s*uniformScale \/ scaleX/);
  assert.match(game, /canvasCounterScaleY\s*=\s*uniformScale \/ scaleY/);
  assert.match(game, /tile\.animate\(\[\s*\{ opacity:\s*1 \},\s*\{ offset:\s*0\.68, opacity:\s*1 \},\s*\{ opacity:\s*0 \}/s);
  assert.match(game, /var cardAnimation\s*=\s*targetCard\.animate/);
  assert.match(game, /paintRealCardBelowTransition\(\) \{\s*cardAnimation\.cancel\(\);/s);
  assert.match(game, /transform:\s*"none"[\s\S]*filter:\s*"none"/);
  assert.match(style, /\.transition-board-canvas\s*\{[^}]*object-fit:\s*contain[^}]*transform-origin:\s*center/s);
  assert.doesNotMatch(style, /\.transition-board-canvas\s*\{[^}]*object-fit:\s*cover/s);
  assert.match(style, /\.level-transition-board\s*\{[^}]*background:\s*rgba\(251, 250, 246, 0\.22\)[^}]*backdrop-filter:\s*blur\(7px\) saturate\(1\.4\)/s);
  assert.match(style, /\.board-stage\s*\{[^}]*border:\s*1px solid rgba\(255, 255, 255, 0\.48\)[^}]*background:[^}]*rgba\(251, 250, 246, 0\.16\)/s);
  assert.match(style, /\.app-shell\.is-navigating \.home-screen\s*\{[^}]*transform:\s*none/s);
  assert.match(style, /\.game-screen\.is-shared-enter\s*\{[^}]*transform:\s*none[^}]*transition:\s*opacity 240ms var\(--soft-out\)/s);
  assert.doesNotMatch(style, /\.game-screen\.is-shared-enter \.board-stage\s*\{/);
  assert.match(game, /if \(transition\) \{\s*dom\.appShell\.classList\.add\("is-navigating"\);\s*\}\s*dom\.gameScreen\.classList\.toggle\("is-shared-enter"/s);
  assert.match(game, /settledBoardAnimation\s*=\s*animation;\s*done\(\);\s*requestAnimationFrame\(function paintFinalBoardBeforeHandoff\(\) \{\s*finishNavigationAnimation\(null\);\s*animation\.cancel\(\);\s*contentAnimation\.cancel\(\);\s*settledBoardAnimation\s*=\s*null;/s);
  assert.match(game, /is-shared-return/);
  assert.match(game, /paintRealCardBelowTransition/);
  assert.match(game, /is-transition-ready/);
  assert.match(game, /settledBoardAnimation\s*=\s*animation/);
  assert.match(game, /function releaseSettledBoardAnimation\(/);
  assert.match(game, /function transitionToLevel\(/);
  assert.doesNotMatch(game, /scale\(1\.026\)/);
});

test("棋盘回合状态胶囊使用通透且克制折射的液态玻璃", () => {
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(style, /\.turn-status\s*\{[^}]*backdrop-filter:\s*blur\(4px\) saturate\(1\.38\)/s);
  assert.match(style, /\.turn-status\s*\{[^}]*inset 1px 0 1px rgba\(202, 255, 242, 0\.25\)/s);
  assert.match(style, /\.turn-status::after\s*\{[^}]*border:\s*1px solid rgba\(255, 255, 255, 0\.24\)/s);
});

test("第一关每次通关后都自动以现有切关动效进入第二关", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(game, /firstLevelAutoAdvance\s*=\s*passed\s*&&\s*game\.levelIndex === 0/);
  assert.doesNotMatch(game, /firstTutorialCompletion|!prefs\.completed\[game\.levelIndex\]/);
  assert.match(game, /TUTORIAL_AUTO_ADVANCE_DELAY\s*=\s*820/);
  assert.match(game, /transitionToLevel\(1, \{\}\)/);
  assert.match(game, /game\.autoAdvancePending\s*=\s*firstLevelAutoAdvance/);
  assert.match(style, /\.game-tools\.is-auto-advancing\s*\{[^}]*visibility:\s*hidden/s);
});

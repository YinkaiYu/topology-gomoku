"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Morph = require("../app/assets/topology-morph.js");
const Engine = require("../app/assets/topology.js");

const ROOT = path.resolve(__dirname, "..");

function samePoint(actual, expected, message) {
  assert.equal(Morph.close(actual, expected, 1e-6), true, message);
}

test("二维转三维脚本在游戏脚本之前以本地经典脚本加载", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const morphIndex = html.indexOf('<script src="./assets/topology-morph.js"></script>');
  const gameIndex = html.indexOf('<script src="./assets/game.js"></script>');
  assert.ok(morphIndex >= 0);
  assert.ok(gameIndex > morphIndex);
  assert.doesNotMatch(html, /topology-morph[^>]+type="module"/);
});

test("第一关是无边界演示、无 AI 回合的连续落子教学", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /topology:\s*"plane",\s*\n\s*tutorial:\s*true/);
  assert.match(game, /if \(!skipDemo && !level\.tutorial\)/);
  assert.match(game, /else if \(game\.level\.tutorial\) \{\s*game\.turn = HUMAN;/);
  assert.match(game, /game\.level\.tutorial \? 1 : \(game\.turn === AI/);
  assert.match(game, /outcome === "win" && game\.levelIndex > 0 && Boolean\(Morph\)/);
  assert.match(game, /"传统的五子棋",\s*"就是把五颗子",\s*"连成一条线",\s*"好无趣",\s*"好无聊"/s);
  assert.match(game, /TUTORIAL_PROMPTS\[Math\.min\(count, TUTORIAL_PROMPTS\.length - 1\)\]/);
  assert.match(game, /Engine\.suggestTutorialMove/);
  assert.match(game, /var guideText = tutorialPromptText\(\);/);
  assert.match(game, /ctx\.font = "700 " \+ fontSize \+ "px 'Topo Serif'/);
  assert.match(game, /ctx\.fillText\(guideText, textX, textY\);/);
});

test("圆柱与环面的周期边界在三维中重合", () => {
  [0.13, 0.37, 0.81].forEach((v) => {
    samePoint(Morph.surfacePoint("cylinder", 0, v), Morph.surfacePoint("cylinder", 1, v), "cylinder x seam");
    samePoint(Morph.surfacePoint("torus", 0, v), Morph.surfacePoint("torus", 1, v), "torus x seam");
    samePoint(Morph.surfacePoint("torus", v, 0), Morph.surfacePoint("torus", v, 1), "torus y seam");
  });
});

test("莫比乌斯带和克莱因瓶的翻转边界在三维中重合", () => {
  [0.11, 0.32, 0.74].forEach((v) => {
    samePoint(Morph.surfacePoint("mobius", 0, v), Morph.surfacePoint("mobius", 1, 1 - v), "mobius twist");
    samePoint(Morph.surfacePoint("klein", 0, v), Morph.surfacePoint("klein", 1, 1 - v), "klein twist");
    samePoint(Morph.surfacePoint("klein", v, 0), Morph.surfacePoint("klein", v, 1), "klein loop");
  });
});

test("实射影平面的两组反向边界在 Roman 曲面中重合", () => {
  [0.09, 0.28, 0.67].forEach((v) => {
    samePoint(Morph.surfacePoint("projective", 0, v), Morph.surfacePoint("projective", 1, 1 - v), "projective x twist");
    samePoint(Morph.surfacePoint("projective", v, 0), Morph.surfacePoint("projective", 1 - v, 1), "projective y twist");
  });
});

test("球面的两组相邻边在两个半球图册中严格重合", () => {
  [0.09, 0.28, 0.67, 0.91].forEach((value) => {
    samePoint(Morph.surfacePoint("sphere", value, 0), Morph.surfacePoint("sphere", 0, value), "sphere north-west seam");
    samePoint(Morph.surfacePoint("sphere", value, 1), Morph.surfacePoint("sphere", 1, value), "sphere south-east seam");
  });
});

test("球面通关动画使用完整半球网格、圆形壳层与平滑参数曲线", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /game\.level\.topology === "sphere" \? 48 : 46/);
  assert.match(game, /\[\[0, 1, 2\], \[0, 2, 3\]\]/);
  assert.match(game, /function drawCompletionSphereBoundary/);
  assert.match(game, /function drawSphereRails/);
  assert.match(game, /function drawCompletionSphereGrid/);
  assert.match(game, /ctx\.quadraticCurveTo/);
  assert.match(game, /var sphereShellBlend/);
  assert.match(game, /ctx\.arc\(renderState\.width \* 0\.5, renderState\.height \* 0\.5, sphereRadius/);
});

test("球面参数化覆盖单位球且按实际五连选择无折叠的共形重参数化", () => {
  for (let u = 0; u <= 1; u += 0.05) {
    for (let v = 0; v <= 1; v += 0.05) {
      const point = Morph.surfacePoint("sphere", u, v);
      assert.ok(Math.abs(Math.hypot(...point) - 1) < 1e-7);
    }
  }
  const rules = Engine.createRules({ type: "sphere", width: 7, height: 7 });
  const cells = [[4, 1], [5, 0], [0, 6], [6, 1], [5, 2]].map(([x, y]) => y * 7 + x);
  const presentation = Morph.createPresentation("sphere", rules, cells);
  assert.equal(presentation.type, "sphere-path");
  assert.ok(Math.hypot(...presentation.boost) <= 0.400001);
  [0.12, 0.38, 0.79].forEach((value) => {
    const top = Morph.applyPresentation(Morph.surfacePoint("sphere", value, 0), presentation);
    const left = Morph.applyPresentation(Morph.surfacePoint("sphere", 0, value), presentation);
    samePoint(top, left, "adaptive sphere seam");
    assert.ok(Math.abs(Math.hypot(...top) - 1) < 1e-7);
  });
});

test("斜向跨缝使用真实边界交点且接缝两侧投影重合", () => {
  const cases = [
    {
      type: "cylinder",
      from: { u: 7.5 / 8, v: 1 / 5 },
      to: { u: 0.5 / 8, v: 2 / 5 },
      vector: { dx: 1, dy: 1 },
      x: true,
      y: false,
      expectedSource: { u: 1, v: 0.3 },
      expectedTarget: { u: 0, v: 0.3 }
    },
    {
      type: "torus",
      from: { u: 2.5 / 8, v: 5.5 / 6 },
      to: { u: 3.5 / 8, v: 0.5 / 6 },
      vector: { dx: 1, dy: 1 },
      x: false,
      y: true,
      expectedSource: { u: 3 / 8, v: 1 },
      expectedTarget: { u: 3 / 8, v: 0 }
    },
    {
      type: "mobius",
      from: { u: 7.5 / 8, v: 1 },
      to: { u: 0.5 / 8, v: 1 / 5 },
      vector: { dx: 1, dy: -1 },
      x: true,
      y: false,
      expectedSource: { u: 1, v: 0.9 },
      expectedTarget: { u: 0, v: 0.1 }
    },
    {
      type: "klein",
      from: { u: 6.5 / 7, v: 1.5 / 6 },
      to: { u: 0.5 / 7, v: 3.5 / 6 },
      vector: { dx: 1, dy: 1 },
      x: true,
      y: false,
      expectedSource: { u: 1, v: 1 / 3 },
      expectedTarget: { u: 0, v: 2 / 3 }
    },
    {
      type: "projective",
      from: { u: 1.5 / 8, v: 7.5 / 8 },
      to: { u: 5.5 / 8, v: 0.5 / 8 },
      vector: { dx: 1, dy: 1 },
      x: false,
      y: true,
      expectedSource: { u: 0.25, v: 1 },
      expectedTarget: { u: 0.75, v: 0 }
    },
    {
      type: "sphere",
      from: { u: 5.5 / 7, v: 0.5 / 7 },
      to: { u: 0.5 / 7, v: 6.5 / 7 },
      vector: { dx: 1, dy: -1 },
      x: true,
      y: false,
      expectedSource: { u: 6 / 7, v: 0 },
      expectedTarget: { u: 0, v: 6 / 7 }
    }
  ];

  cases.forEach((item) => {
    const bridge = Morph.seamBridgeUV(item.type, item.from, item.to, item.vector, item.x, item.y);
    assert.ok(Math.abs(bridge.source.u - item.expectedSource.u) < 1e-6, `${item.type} source u`);
    assert.ok(Math.abs(bridge.source.v - item.expectedSource.v) < 1e-6, `${item.type} source v`);
    assert.ok(Math.abs(bridge.target.u - item.expectedTarget.u) < 1e-6, `${item.type} target u`);
    assert.ok(Math.abs(bridge.target.v - item.expectedTarget.v) < 1e-6, `${item.type} target v`);
    samePoint(
      Morph.surfacePoint(item.type, bridge.source.u, bridge.source.v),
      Morph.surfacePoint(item.type, bridge.target.u, bridge.target.v),
      `${item.type} seam bridge`
    );
  });
});

test("所有关卡的三维投影均返回有限屏幕坐标", () => {
  ["cylinder", "torus", "mobius", "klein", "projective", "sphere"].forEach((type) => {
    for (let u = 0; u <= 1; u += 0.2) {
      for (let v = 0; v <= 1; v += 0.2) {
        const point = Morph.project(type, u, v, 360, 360, 0.12);
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.depth), `${type} ${u},${v}`);
      }
    }
  });
});

test("弹性形变首尾精确且中段具有轻微回弹", () => {
  assert.equal(Morph.spring(0), 0);
  assert.equal(Morph.spring(1), 1);
  assert.ok(Array.from({ length: 19 }, (_, index) => Morph.spring((index + 1) / 20)).some((value) => value > 1));
});

test("三维投影支持玩家控制的多轴观察角", () => {
  const base = Morph.project("mobius", 0.23, 0.68, 420, 420, 0);
  const moved = Morph.project("mobius", 0.23, 0.68, 420, 420, { x: 0.2, y: -0.35, z: 0.08, scale: 1.02 });
  assert.ok(Number.isFinite(moved.x) && Number.isFinite(moved.y) && Number.isFinite(moved.depth));
  assert.notDeepEqual(moved, base);
});

test("拖动时的柔性形变保持拓扑接缝重合", () => {
  const orientation = { x: 0.18, y: -0.24, wobbleX: 0.08, wobbleY: -0.09 };
  const left = Morph.project("mobius", 0, 0.23, 420, 420, orientation);
  const right = Morph.project("mobius", 1, 0.77, 420, 420, orientation);
  assert.ok(Math.hypot(left.x - right.x, left.y - right.y) < 1e-6);
});

test("通关视图的整体比例变形仍保持拓扑接缝重合", () => {
  const shape = { x: 0.2, y: -0.35, z: 0.12, shapeX: 0.92, shapeY: 1.06, shapeZ: 1.04 };
  [0.13, 0.37, 0.81].forEach((v) => {
    const cylinderLeft = Morph.project("cylinder", 0, v, 420, 420, shape);
    const cylinderRight = Morph.project("cylinder", 1, v, 420, 420, shape);
    assert.ok(Math.hypot(cylinderLeft.x - cylinderRight.x, cylinderLeft.y - cylinderRight.y) < 1e-6);
    const torusTop = Morph.project("torus", v, 0, 420, 420, shape);
    const torusBottom = Morph.project("torus", v, 1, 420, 420, shape);
    assert.ok(Math.hypot(torusTop.x - torusBottom.x, torusTop.y - torusBottom.y) < 1e-6);
  });
});

test("通关曲面使用高密度采样，棋盘线沿曲面分段插值", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /var columns = game\.level\.topology === "sphere" \? 48 : 46;/);
  assert.match(game, /var rows = game\.level\.topology === "sphere" \? columns : 36;/);
  assert.match(game, /var samples = game\.level\.topology === "sphere" \? 16 : 12;/);
  assert.match(game, /appendCompletionSegment/);
  assert.match(game, /Morph\.seamBridgeUV/);
  assert.match(game, /completionGridEdgePoints\(cells\[index\], step, direction/);
  assert.doesNotMatch(game, /var columns = 18;/);
  assert.doesNotMatch(game, /appendCompletionSegment\(points, sourceBoundary, targetBoundary/);
});

test("胜负结算常驻棋盘且支持重玩，胜利曲面可以持续柔性拖动", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  assert.match(game, /if \(game\.completion\) \{\s*animate = true;/);
  assert.match(game, /function canExploreCompletion\(\)/);
  assert.match(game, /completion\.rotation\.y \+= yawDelta;/);
  assert.match(game, /settledReplayButton\.addEventListener\("click", restartGame\)/);
  assert.doesNotMatch(game, /showResult\(/);
  assert.doesNotMatch(html, /id="resultSheet"/);
  assert.match(game, /chooseCompletionView\(winningMask, completionPresentation\)/);
  assert.match(game, /elastic:\s*\{ x: 0, y: 0, velocityX: 0, velocityY: 0 \}/);
  assert.match(game, /wobbleX: sphereCompletion \? game\.completion\.elastic\.x/);
  assert.match(game, /completion\.elastic\.velocityY \+= yawDelta/);
});

test("三维观赏的上下拖动与左右同样跟手且不受隐藏俯仰硬限位", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /var yawDelta = deltaX \* 0\.009;/);
  assert.match(game, /var pitchDelta = deltaY \* 0\.009;/);
  assert.match(game, /completion\.rotation\.x \+= pitchDelta;/);
  assert.doesNotMatch(game, /Math\.max\(-1\.12, Math\.min\(1\.12, totalPitch\)\)/);
});

test("棋盘同时提示玩家进攻点与对手封堵点并保持克制配色", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /Engine\.findLineHints\(game\.board, game\.rules, player\)/);
  assert.match(game, /\[HUMAN, AI\]\.forEach\(function collectPlayerHints/);
  assert.match(game, /defensive \? "#d95b4f"/);
  assert.match(game, /function tacticalHintPriority/);
});

test("后期大概率和局时在既有规则区域提示平局也算通关", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(game, /Engine\.isLikelyDraw\(game\.board, game\.rules\)/);
  assert.match(game, /drawLikely \? "和局亦胜"/);
  assert.match(game, /drawLikely \? "平局，也算通关"/);
  assert.match(style, /\.rule-caption\.is-draw-likely/);
  assert.match(style, /@keyframes draw-pass-arrive/);
});

test("设置页使用液态玻璃层次且三个控件均支持连续拖动", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(html, /id="difficultyThumb"/);
  assert.match(game, /function bindDifficultySlider\(\)/);
  assert.match(game, /function bindLiquidSwitch\(control, getValue, setValue\)/);
  assert.match(game, /setPointerCapture\(event\.pointerId\)/);
  assert.match(game, /drag\.progress = Math\.max\(0, Math\.min\(1, drag\.startProgress \+ totalDelta \/ drag\.travel\)\)/);
  assert.match(style, /\.settings-sheet\s*\{[\s\S]*backdrop-filter: blur\(24px\) saturate\(1\.32\)/);
  assert.match(style, /\.segmented\.is-dragging \.segmented-glass-thumb/);
  assert.match(style, /\.switch\.is-dragging i/);
  assert.match(style, /@keyframes liquid-control-glint/);
});

test("高阶曲面的五子展示会自动朝前且始终附着于曲面交点", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /var yaw = -Math\.PI \+ yawIndex \/ 40 \* Math\.PI \* 2/);
  assert.match(game, /minDepth \* 4\.8/);
  assert.match(game, /segmentVariation \* 2\.1/);
  assert.match(game, /extremeStretch - 2\.15/);
  assert.match(game, /shapeCost \* 0\.28/);
  assert.match(game, /shapeX: sphereCompletion \? 1 : 1 \+ \(\(Number\(game\.completion\.view\.shapeX\) \|\| 1\) - 1\) \* viewBlend/);
  assert.match(game, /var point = completionCellPoint\(cell, morph, spin\);/);
  assert.match(game, /var points = completionGridEdgePoints\(cells\[index\], step, direction, morph, spin\);/);
  assert.match(game, /Morph\.createPresentation\(game\.level\.topology, game\.rules/);
  assert.match(game, /function completionSphereWinningCurve/);
  assert.match(game, /lineDeviation \* 5\.6/);
  assert.doesNotMatch(game, /compactCompletionSegment/);
});

test("开发者玩家胜利沿本关演示路径逐颗跨界落子", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /player === HUMAN && game\.levelIndex > 0/);
  assert.match(game, /Engine\.tracePath\(game\.rules, boundaryStart, game\.level\.demoDirection/);
  assert.match(game, /boundaryPath \? boundaryPath\.cells/);
  assert.match(game, /index \* 220/);
  assert.match(game, /boundaryPath\.seams\[index - 1\]/);
});

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

test("第一关每次进入都逐子教学、隐藏边界演示且仍无 AI 回合", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(game, /topology:\s*"plane",\s*\n\s*tutorial:\s*true/);
  assert.match(game, /function introModeFor\(levelIndex, options\) \{\s*if \(levelIndex === 0\) \{\s*return "lesson";/);
  assert.match(game, /return hasLearnedLevel\(levelIndex\) \? "demo" : "lesson"/);
  assert.match(game, /if \(introMode === "lesson"\) \{\s*startBoundaryLesson/);
  assert.match(game, /dom\.boundaryDemoButton\.hidden = game\.levelIndex === 0/);
  assert.match(game, /dom\.gameTools\.classList\.toggle\("is-basic-tutorial", !ended && game\.levelIndex === 0\)/);
  assert.match(game, /if \(!game \|\| game\.levelIndex === 0 \|\| game\.status === "forcing"/);
  assert.match(game, /else if \(game\.level\.tutorial \|\| lesson\) \{\s*game\.turn = HUMAN;/);
  assert.match(game, /game\.level\.tutorial \|\| lessonActive \? 1 : \(game\.turn === AI/);
  assert.match(game, /var passed = outcome === "win" \|\| outcome === "draw";/);
  assert.match(game, /var shouldMorph = passed && game\.levelIndex > 0 && Boolean\(Morph\)/);
  assert.match(game, /reviewToolsHidden = !ended \|\| autoAdvancing \|\| firstLevel/);
  assert.match(game, /dom\.settledReplayButton\.hidden = !ended \|\| firstLevel/);
  assert.match(style, /\.endgame-review-tools \[hidden\]\s*\{\s*display:\s*none/);
  assert.match(game, /"传统的五子棋",\s*"就是把五颗子",\s*"连成一条线",\s*"好无趣",\s*"好无聊"/s);
  assert.match(game, /TUTORIAL_PROMPTS\[Math\.min\(count, TUTORIAL_PROMPTS\.length - 1\)\]/);
  assert.match(game, /Engine\.suggestTutorialMove/);
  assert.match(game, /var guideText = lessonPromptText\(\);/);
  assert.match(game, /ctx\.font = "700 " \+ fontSize \+ "px 'Topo Serif'/);
  assert.match(game, /ctx\.fillText\(guideText, textX, textY\);/);
});

test("除第一关外，每关只在首次游玩时逐子教学，重玩改为自动演示", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.equal((game.match(/lessonPaths:\s*\[/g) || []).length, 7);
  assert.match(game, /learnedLevels:\s*\[\]/);
  assert.match(game, /normalizeLearnedLevels\(stored\.learnedLevels, defaults\.completed\)/);
  assert.match(game, /function hasLearnedLevel\(index\)/);
  assert.match(game, /lesson\.cells\[lesson\.step\] !== cell/);
  assert.match(game, /rememberLevel\(game\.levelIndex\)/);
  assert.match(game, /transitionToLevel\(game\.levelIndex, \{ introMode: "none" \}\)/);
});

test("多线路教学逐条清盘继续，并以辅助动画解释跨界连接", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /game\.lesson\.pathIndex < game\.lesson\.paths\.length - 1/);
  assert.match(game, /game\.status = hasNextPath \? "lesson-line-complete" : "lesson-complete"/);
  assert.match(game, /game\.board\.fill\(Engine\.EMPTY\);[\s\S]*activateLessonPath\(game\.lesson, game\.lesson\.pathIndex \+ 1\)/);
  assert.match(game, /function drawLessonConnections\(/);
  assert.match(game, /function drawLessonSeamCue\(/);
  assert.match(game, /pendingSeam & bit/);
});

test("底部只保留无卡片的边界演示工具按钮", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(html, /class="tool-button boundary-demo-button" id="boundaryDemoButton"[^>]+aria-label="重新体验本关边界指引"/);
  assert.match(html, /<path d="M9 18h6M10 22h4M15\.1 14/);
  assert.match(html, /<span>边界演示<\/span>/);
  assert.doesNotMatch(html, /rule-caption|轻触教学|ruleCaption/);
  assert.match(game, /function replayBoundaryLesson\(\)[\s\S]*transitionToLevel\(levelIndex, \{\s*introMode: "lesson",\s*lessonReturn: lessonReturn\s*\}\)/);
  assert.match(game, /dom\.boundaryDemoButton\.addEventListener\("click", replayBoundaryLesson\)/);
  assert.doesNotMatch(style, /\.rule-caption/);
  assert.match(style, /\.boundary-demo-button,[\s\S]*\.boundary-demo-button\.is-active\s*\{\s*color:\s*var\(--spatial\)/);
  assert.match(style, /\.game-tools > #restartButton\s*\{\s*grid-column:\s*3/);
  assert.match(style, /\.game-tools\.is-basic-tutorial\s*\{\s*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
});

test("对局中重温边界指引后原样恢复棋盘、历史与当前回合", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /function snapshotMatchForLesson\(\)/);
  assert.match(game, /board:\s*Array\.prototype\.slice\.call\(game\.board\)/);
  assert.match(game, /moves:\s*game\.moves\.map\(function copyMove/);
  assert.match(game, /turn:\s*game\.turn,\s*\n\s*lastMove:\s*game\.lastMove/);
  assert.match(game, /lessonReturn:\s*options && options\.lessonReturn \? options\.lessonReturn : null/);
  assert.match(game, /transitionToLevel\(levelIndex, \{\s*introMode:\s*"lesson",\s*lessonReturn:\s*lessonReturn/);
  assert.match(game, /resumeMatch\.board\.forEach\(function restoreBoardCell/);
  assert.match(game, /game\.moves = resumeMatch\.moves\.map\(function restoreMove/);
  assert.match(game, /game\.turn = resumeMatch\.turn/);
  assert.match(game, /resumeMatch:\s*game\.lessonReturn/);
  assert.match(game, /else if \(resumeMatch && game\.turn === AI\) \{\s*scheduleAiMove\(\)/);
  assert.match(game, /lesson && \(game\.lessonReturn \|\| !game\.level\.tutorial\)/);
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

test("球面通关动画使用完整半球网格与平滑参数曲线", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /game\.level\.topology === "sphere" \? 48 : 46/);
  assert.match(game, /\[\[0, 1, 2\], \[0, 2, 3\]\]/);
  assert.match(game, /function drawCompletionSphereBoundary/);
  assert.match(game, /function drawSphereRails/);
  assert.match(game, /function drawCompletionSphereGrid/);
  assert.match(game, /ctx\.bezierCurveTo/);
  assert.doesNotMatch(game, /var sphereShellBlend/);
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
  assert.ok(Math.hypot(...presentation.boost) <= 0.120001);
  [0.12, 0.38, 0.79].forEach((value) => {
    const top = Morph.applyPresentation(Morph.surfacePoint("sphere", value, 0), presentation);
    const left = Morph.applyPresentation(Morph.surfacePoint("sphere", 0, value), presentation);
    samePoint(top, left, "adaptive sphere seam");
    assert.ok(Math.abs(Math.hypot(...top) - 1) < 1e-7);
  });
});

test("球面棋盘参数化兼顾面积分布、网格韧性与背面层次", () => {
  function localArea(u, v) {
    const delta = 1e-5;
    const left = Morph.surfacePoint("sphere", u - delta, v);
    const right = Morph.surfacePoint("sphere", u + delta, v);
    const top = Morph.surfacePoint("sphere", u, v - delta);
    const bottom = Morph.surfacePoint("sphere", u, v + delta);
    const du = right.map((value, axis) => (value - left[axis]) / (delta * 2));
    const dv = bottom.map((value, axis) => (value - top[axis]) / (delta * 2));
    return Math.hypot(
      du[1] * dv[2] - du[2] * dv[1],
      du[2] * dv[0] - du[0] * dv[2],
      du[0] * dv[1] - du[1] * dv[0]
    );
  }
  const samples = [[0.15, 0.08], [0.45, 0.12], [0.75, 0.18], [0.32, 0.24], [0.68, 0.47], [0.22, 0.37], [0.53, 0.74], [0.82, 0.91]];
  const areas = samples.map(([u, v]) => localArea(u, v));
  assert.ok(Math.min(...areas) > 1.5);
  assert.ok(Math.max(...areas) < 20);

  function maximumRailTurn(horizontal, fixed) {
    let maximum = 0;
    for (let index = 1; index < 72; index += 1) {
      const sample = (amount) => horizontal
        ? Morph.surfacePoint("sphere", amount, fixed)
        : Morph.surfacePoint("sphere", fixed, amount);
      const previous = sample((index - 1) / 72);
      const current = sample(index / 72);
      const next = sample((index + 1) / 72);
      const incoming = previous.map((value, axis) => value - current[axis]);
      const outgoing = next.map((value, axis) => value - current[axis]);
      const cosine = incoming.reduce((total, value, axis) => total + value * outgoing[axis], 0) /
        (Math.hypot(...incoming) * Math.hypot(...outgoing));
      maximum = Math.max(maximum, Math.PI - Math.acos(Math.max(-1, Math.min(1, cosine))));
    }
    return maximum;
  }
  for (let line = 0; line < 7; line += 1) {
    const fixed = (line + 0.5) / 7;
    assert.ok(maximumRailTurn(true, fixed) < 0.65);
    assert.ok(maximumRailTurn(false, fixed) < 0.65);
  }

  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /function strokeFrontFacingCompletionPath/);
  assert.match(game, /var frontBlend = Morph\.smooth/);
  assert.match(game, /var depthThreshold = -0\.012 \* morph/);
  assert.match(game, /sphereSingularityDepth \* 1\.15/);
  assert.match(game, /requestIdleCallback\(warmSphereParameterization/);
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

test("复盘与二维三维切换相互独立，曲面可以持续柔性拖动", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(game, /if \(game\.completion\) \{\s*animate = true;/);
  assert.match(game, /function canExploreCompletion\(\)/);
  assert.match(game, /completion\.rotation\.y \+= yawDelta;/);
  assert.match(game, /settledReplayButton\.addEventListener\("click", handleSettledAction\)/);
  assert.match(game, /function beginReplayReview\(\)/);
  assert.match(game, /game\.completion\.phase = "returning";/);
  assert.match(game, /function stepReplay\(direction\)/);
  assert.match(game, /Replay\.boardAt\(game\.moves, game\.rules\.cellCount, nextStep, Engine\.EMPTY\)/);
  assert.match(game, /function toggleEndgameDimension\(\)/);
  assert.match(game, /function endReplayReview\(\)/);
  assert.match(game, /reviewToggleButton\.addEventListener\("click", handleReviewToggle\)/);
  assert.match(game, /reviewPreviousButton\.addEventListener/);
  assert.match(game, /reviewNextButton\.addEventListener/);
  assert.match(game, /dimensionToggleButton\.addEventListener\("click", toggleEndgameDimension\)/);
  assert.match(game, /dom\.humanChip\.hidden = false;\s*dom\.aiChip\.hidden = false;/);
  assert.doesNotMatch(game, /humanChip\.hidden = reviewing|aiChip\.hidden = reviewing/);
  assert.match(game, /drawCompletionWinningLine[\s\S]*activeWinningMask\(\)/);
  assert.match(html, /id="endgameReviewTools"/);
  assert.match(html, /class="game-action-deck"[\s\S]*id="endgameReviewTools"[\s\S]*id="gameTools"/);
  assert.ok(html.indexOf('id="endgameReviewTools"') > html.indexOf('id="boardStage"'));
  assert.ok(html.indexOf('id="endgameReviewTools"') < html.indexOf('id="gameTools"'));
  assert.match(html, /M19 12H6m5-5-5 5 5 5/);
  assert.match(html, /M5 12h13m-5-5 5 5-5 5/);
  assert.match(html, /id="nextLevelButton"/);
  assert.match(html, /id="dimensionToggleIconPath"[^>]+M5 6c0-1\.7 3\.1-3 7-3/);
  assert.match(game, /M4 4h16v16H4zM9\.33 4v16M14\.67 4v16M4 9\.33h16M4 14\.67h16/);
  assert.match(style, /\.endgame-review-tools\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(style, /\.game-tools\.is-ended \.journey-button\s*\{[\s\S]*grid-column:\s*1/);
  assert.match(style, /\.game-tools\.is-ended \.settled-replay-button\s*\{\s*grid-column:\s*2/);
  assert.match(style, /\.game-tools\.is-ended \.next-level-button\s*\{[\s\S]*grid-column:\s*3/);
  assert.match(html, /id="journeyButton"[^>]+aria-label="返回旅程"/);
  assert.match(game, /dom\.journeyButton\.hidden = !ended;/);
  assert.match(game, /dom\.nextLevelButton\.hidden = !ended;/);
  assert.match(game, /dom\.nextLevelButton\.disabled = dimensionTransitioning \|\| !hasNextLevel;/);
  assert.match(game, /function handleJourney\(\) \{\s*if \(isEndedView\(\)\) \{\s*leaveGame\(\)/);
  assert.match(game, /journeyButton\.addEventListener\("click", handleJourney\)/);
  assert.doesNotMatch(game, /showResult\(/);
  assert.doesNotMatch(html, /id="resultSheet"/);
  assert.match(game, /chooseCompletionView\(winningMask, presentation\)/);
  assert.match(game, /elastic:\s*\{ x: 0, y: 0, velocityX: 0, velocityY: 0 \}/);
  assert.match(game, /wobbleX: sphereCompletion \? game\.completion\.elastic\.x/);
  assert.match(game, /completion\.elastic\.velocityY \+= yawDelta/);
});

test("标题、状态、棋盘与两层操作区使用统一垂直节奏", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(style, /\.game-screen\s*\{[\s\S]*--game-vertical-gap:\s*10px;[\s\S]*--game-control-row-size:\s*52px;[\s\S]*row-gap:\s*var\(--game-vertical-gap\)/);
  assert.match(style, /\.match-strip\s*\{[\s\S]*margin:\s*0 4px/);
  assert.match(style, /\.game-action-deck\s*\{[\s\S]*grid-template-rows:\s*repeat\(2, var\(--game-control-row-size\)\);[\s\S]*row-gap:\s*var\(--game-vertical-gap\)/);
  assert.match(style, /\.endgame-review-tools\s*\{[\s\S]*min-height:\s*0;[\s\S]*padding-top:\s*0/);
  assert.match(style, /\.endgame-review-tools\.is-reserved\s*\{[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none/);
  assert.match(style, /\.game-tools\s*\{[\s\S]*min-height:\s*0;[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*padding-top:\s*0/);
  assert.match(style, /@media \(max-height:\s*760px\)[\s\S]*--game-control-row-size:\s*44px/);
  assert.match(game, /dom\.endgameReviewTools\.hidden = false;[\s\S]*classList\.toggle\("is-reserved", reviewToolsHidden\)/);
});

test("终局操作以中性色为底并只保留两组克制强调色", () => {
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(style, /\.endgame-review-tools \.tool-button\s*\{[\s\S]*color:\s*var\(--muted\)/);
  assert.match(style, /\.game-tools\.is-ended \.tool-button\s*\{[\s\S]*color:\s*var\(--muted\)/);
  assert.match(style, /\.endgame-review-tools \.review-toggle-button\s*\{\s*color:\s*var\(--teal\)/);
  assert.match(style, /\.game-tools\.is-ended \.next-level-button\s*\{[\s\S]*color:\s*var\(--teal\)/);
  assert.match(style, /\.endgame-review-tools \.dimension-toggle-button\s*\{\s*color:\s*var\(--spatial\)/);
  assert.match(style, /\.boundary-demo-button,[\s\S]*\.boundary-demo-button\.is-active\s*\{\s*color:\s*var\(--spatial\)/);
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

test("对局底部不再堆叠规则说明且平局仍按通关处理", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.doesNotMatch(game, /drawLikely|ruleCaption/);
  assert.doesNotMatch(html, /和局亦胜|平局，也算通关|ruleCaption/);
  assert.doesNotMatch(style, /draw-pass-arrive|rule-caption/);
  assert.match(game, /var passed = outcome === "win" \|\| outcome === "draw";/);
  assert.match(game, /if \(passed\) \{\s*rememberLevel\(game\.levelIndex\);\s*prefs\.completed\[game\.levelIndex\] = true;/);
  assert.match(game, /var hasNextLevel = passed && game\.levelIndex < LEVELS\.length - 1;/);
  assert.match(game, /function developerForceDraw\(\)/);
  assert.match(html, /id="developerDraw">平局通关/);
});

test("设置页使用液态玻璃层次且三个控件均支持连续拖动", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(html, /id="difficultyThumb"/);
  assert.match(game, /function bindDifficultySlider\(\)/);
  assert.match(game, /function bindLiquidSwitch\(control, getValue, setValue\)/);
  assert.doesNotMatch(game, /showToast|toastTimer|dom\.toast/);
  assert.doesNotMatch(html, /class="toast"|id="toast"/);
  assert.doesNotMatch(style, /\.toast(?:\s|\.|\{)/);
  assert.match(game, /setPointerCapture\(event\.pointerId\)/);
  assert.match(game, /Math\.max\(-0\.24, drag\.rawProgress \* 0\.56\)/);
  assert.match(game, /Math\.min\(1\.22, 1 \+ \(rawProgress - 1\) \* 0\.58\)/);
  assert.match(game, /function detentProgress\(progress, maximum\)/);
  assert.match(game, /Math\.pow\(normalizedDistance, 2\.05\) \* 0\.5/);
  assert.match(game, /paint\(detentProgress\(visualProgress, 2\), frameDelta, drag\.pressedThumb\)/);
  assert.match(game, /paint\(detentProgress\(visualProgress, 1\), frameDelta, drag\.travel, drag\.pressedKnob\)/);
  assert.match(game, /var startIndex = difficultyIndex\(prefs\.difficulty\);/);
  assert.doesNotMatch(game, /targetButton \? difficultyIndex\(targetButton\.dataset\.difficulty\)/);
  assert.match(style, /\.settings-sheet\s*\{[\s\S]*overflow:\s*visible[\s\S]*background:\s*transparent[\s\S]*backdrop-filter:\s*none/);
  assert.match(style, /\.settings-sheet::before\s*\{[\s\S]*filter:\s*drop-shadow/);
  assert.match(style, /\.settings-sheet::after\s*\{[\s\S]*inset:\s*1\.5px[\s\S]*backdrop-filter:\s*blur\(5px\) saturate\(1\.45\)/);
  assert.match(style, /\.segmented\.is-dragging \.segmented-glass-thumb/);
  assert.match(style, /\.switch\.is-dragging i/);
  assert.match(style, /\.segmented\.is-dragging\s*\{\s*transform: none/);
  assert.match(style, /\.switch\.is-dragging\s*\{\s*transform: none/);
  assert.match(style, /--liquid-snap:\s*cubic-bezier\(0\.32, 0\.05, 0\.2, 1\.13\)/);
  assert.match(style, /translate var\(--liquid-glide-duration, 800ms\) var\(--liquid-snap\)/);
  assert.match(style, /\.segmented\.is-dragging \.segmented-glass-thumb\s*\{[\s\S]*transition:\s*scale 162ms var\(--liquid-drag\);[\s\S]*will-change:\s*translate, scale/);
  assert.doesNotMatch(style, /\.segmented\.is-dragging \.segmented-glass-thumb\s*\{[^}]*transition:[^;}]*translate/);
  assert.match(style, /\.switch\.is-dragging i\s*\{[\s\S]*transition:\s*translate 136ms var\(--liquid-drag\), scale 152ms var\(--liquid-drag\)/);
  assert.match(style, /\.segmented\s*\{[\s\S]*overflow:\s*visible/);
  assert.match(style, /\.switch\s*\{[\s\S]*overflow:\s*visible/);
  assert.match(style, /\.switch\s*\{[\s\S]*width:\s*66px/);
  assert.match(style, /\.switch\.is-on i\s*\{\s*translate:\s*34px 0/);
  assert.match(game, /var stretch = pressedThumb \? 1\.24 \+ energy \* 0\.12 : 1;[\s\S]*var lift = pressedThumb \? 1\.62 \+ energy \* 0\.08 : 1/);
  assert.match(game, /var stretch = pressedKnob \? 1\.72 \+ energy \* 0\.12 : 1;[\s\S]*var lift = pressedKnob \? 1\.5 \+ energy \* 0\.06 : 1/);
  assert.match(style, /\.segmented\.is-dragging \.segmented-glass-thumb\s*\{[\s\S]*border:\s*1px solid rgba\(255, 255, 255, 0\.18\)[\s\S]*backdrop-filter:\s*none/);
  assert.match(style, /\.switch\.is-dragging i\s*\{[\s\S]*border:\s*1px solid rgba\(255, 255, 255, 0\.18\)[\s\S]*backdrop-filter:\s*none/);
  assert.match(style, /@keyframes liquid-thumb-settle\s*\{[\s\S]*scale:\s*1\.34 1\.58/);
  assert.match(style, /@keyframes liquid-knob-settle\s*\{[\s\S]*scale:\s*1\.66 1\.48/);
  assert.match(style, /@keyframes liquid-thumb-settle/);
  assert.match(style, /@keyframes liquid-knob-settle/);
  assert.doesNotMatch(style, /@keyframes liquid-control-glint/);
  assert.equal((game.match(/style\.scale = stretch \+ " " \+ lift/g) || []).length, 2);
  assert.match(game, /pressedThumb: pointerHitsElement\(event, dom\.difficultyThumb\)/);
  assert.match(game, /pressedKnob: pointerHitsElement\(event, knob\)/);
  assert.match(game, /classList\.toggle\("is-dragging", drag\.pressedThumb\)/);
  assert.match(game, /classList\.toggle\("is-dragging", drag\.pressedKnob\)/);
  assert.match(game, /function finishLiquidGlide\(control, duration, pressedMovingElement\)/);
  assert.match(game, /if \(pressedMovingElement\) \{\s*settleLiquidControl\(control, duration\)/);
  assert.equal((game.match(/style\.removeProperty\("scale"\)/g) || []).length, 3);
  assert.equal((game.match(/style\.translate = /g) || []).length, 3);
  assert.equal((game.match(/style\.removeProperty\("translate"\)/g) || []).length, 1);
  assert.match(game, /function liquidGlideDuration\(control, travelDistance, directSelection, touchInput\)/);
  assert.match(game, /if \(touchInput\) \{\s*return Math\.round\(660 \+ distance \* 140\)/);
  assert.match(game, /return Math\.round\(540 \+ distance \* 100\)/);
  assert.match(game, /return touchInput \? 820 : 660/);
  assert.match(game, /return Math\.round\(680 \+ distance \* 120\)/);
  assert.match(game, /event\.pointerType === "touch" \|\| event\.pointerType === "pen"/);
  assert.match(game, /function animateLiquidSelection\(control, movingElement, travelDistance, directSelection, touchInput, pressedMovingElement, commitSelection\)/);
  assert.match(game, /--liquid-glide-duration/);
  assert.match(game, /requestAnimationFrame\(function releaseLiquidSelection/);
  assert.match(html, /class="segmented-lens-track"><b>随性<\/b><b>机敏<\/b><b>深思<\/b><\/span>/);
  assert.match(html, /class="switch-lens-track"/);
  assert.match(game, /function syncDifficultyLensGeometry\(index\)/);
  assert.match(game, /function syncSwitchLensGeometry\(control, enabled\)/);
  assert.match(game, /--lens-track-width/);
  assert.match(game, /--lens-track-offset/);
  assert.match(game, /--lens-origin-x/);
  assert.match(style, /\.segmented-lens-track\s*\{[\s\S]*left:\s*var\(--lens-track-offset[\s\S]*width:\s*var\(--lens-track-width[\s\S]*opacity:\s*0[\s\S]*scale\(0\.62, 0\.5\)/);
  assert.match(style, /\.switch-lens-track\s*\{[\s\S]*left:\s*var\(--lens-track-offset[\s\S]*width:\s*var\(--lens-track-width[\s\S]*opacity:\s*0[\s\S]*scale\(0\.43, 0\.42\)/);
  assert.doesNotMatch(style, /rgba\(45, 96, 79, 0\.26\) 45% 55%|rgba\(22, 146, 112, 0\.62\) 45% 55%/);
  assert.match(style, /\.segmented\.is-dragging \.segmented-glass-thumb::after\s*\{\s*opacity:\s*0\.9/);
  assert.match(style, /\.segmented\.is-dragging \.segmented-lens-track\s*\{\s*opacity:\s*0\.92/);
  assert.match(style, /\.switch\.is-dragging \.switch-lens-track\s*\{\s*opacity:\s*0\.9/);
  assert.match(style, /@media \(pointer: coarse\)\s*\{[\s\S]*\.segmented\.is-dragging \.segmented-glass-thumb\s*\{\s*transition:\s*scale 192ms var\(--liquid-drag\)[\s\S]*translate 160ms var\(--liquid-drag\), scale 178ms var\(--liquid-drag\)/);
});

test("测试控制台沿用设置页液态玻璃风格且双项落子控制对齐", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(html, /class="sheet settings-sheet developer-sheet"/);
  assert.match(html, /class="settings-softbody developer-softbody"/);
  assert.doesNotMatch(html, /DEVELOPER MODE/);
  assert.match(html, /id="developerPieceControl" data-index="0"/);
  assert.match(style, /\.developer-piece-control\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(style, /\.developer-piece-control \.segmented-glass-thumb\s*\{\s*width:\s*calc\(\(100% - 11px\) \/ 2\)/);
  assert.match(style, /\.developer-action-grid button,[\s\S]*backdrop-filter:\s*blur\(4px\) saturate\(1\.42\)/);
  assert.match(game, /developerPieceControl:\s*document\.getElementById\("developerPieceControl"\)/);
  assert.match(game, /dom\.developerPieceControl\.dataset\.index = developer\.placementPlayer === HUMAN \? "0" : "1"/);
});

test("棋子按下时沿棋盘法向压薄并在平面内均匀鼓大，松手后回弹", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /pressedAt:\s*0/);
  assert.match(game, /lastMoveFromPress:\s*false/);
  assert.match(game, /var planarScale = 0\.72 \+ \(1\.16 - 0\.72\) \* landing \+ softBounce/);
  assert.match(game, /ctx\.scale\(planarScale, planarScale\)/);
  assert.match(game, /shadowOffsetY = radius \* \(0\.18 - landing \* 0\.105\)/);
  assert.match(game, /scaleY = scaleX/);
  assert.match(game, /performMove\(cell, DEV_MODE \? developer\.placementPlayer : HUMAN, \{ fromPress: releasedFromPress \}\)/);
});

test("按住棋子拖动时保持连续可见并以阻尼弹簧吸附到最近空交点", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /pressedMotionReady:\s*false/);
  assert.match(game, /function targetPressedStone\(cell, immediate\)/);
  assert.match(game, /function updatePressedStoneMotion\(delta\)/);
  assert.match(game, /var follow = 1 - Math\.pow\(0\.46, frameScale\)/);
  assert.match(game, /pressedVelocityX = \(renderState\.pressedTargetX - renderState\.pressedX\) \* follow/);
  assert.match(game, /if \(canPlaceCell\(cell\) && cell !== renderState\.pressedCell\)/);
  assert.match(game, /if \(cell < 0 && pointerInsideBoard\(event\)\)\s*\{\s*cell = renderState\.pressedCell/);
  assert.doesNotMatch(game, /if \(cell !== renderState\.pressedCell\)\s*\{\s*renderState\.pressedAt = event\.timeStamp/);
});

test("目录卡片、棋盘与顶栏按钮共享通透液态玻璃语言", () => {
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(style, /\.level-card\s*\{[\s\S]*backdrop-filter: blur\(5px\) saturate\(1\.36\)/);
  assert.match(style, /\.board-stage\s*\{[\s\S]*backdrop-filter: blur\(7px\) saturate\(1\.4\)/);
  assert.match(style, /\.board-stage\s*\{[\s\S]*border: 1px solid rgba\(255, 255, 255, 0\.48\)/);
  assert.match(style, /\.board-stage::after/);
  assert.match(style, /\.icon-button\s*\{[\s\S]*backdrop-filter: blur\(4px\) saturate\(1\.48\)/);
  assert.match(style, /\.icon-button:active\s*\{[\s\S]*scaleX\(1\.12\) scaleY\(1\.1\)/);
});

test("所有可按压玻璃控件在手指按下时向外鼓起而非缩小", () => {
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(style, /\.level-card:active\s*\{[\s\S]*scaleX\(1\.035\) scaleY\(1\.025\)/);
  assert.match(style, /\.primary-button:active,[\s\S]*scaleX\(1\.035\) scaleY\(1\.07\)/);
  assert.match(style, /\.tool-button:active\s*\{[\s\S]*scale\(1\.12\)/);
  assert.match(style, /\.developer-fab:active\s*\{[\s\S]*scale\(1\.08\)/);
  assert.match(style, /\.settings-sheet \.close-button:active\s*\{[\s\S]*scaleX\(1\.14\) scaleY\(1\.12\)/);
  assert.match(style, /\.settings-sheet \.sheet-done:active\s*\{[\s\S]*scaleX\(1\.035\) scaleY\(1\.08\)/);
  assert.match(style, /\.developer-reset:active\s*\{[\s\S]*scaleX\(1\.035\) scaleY\(1\.075\)/);
});

test("设置面板以可逆梯形软体层展开且支持抓住顶部下拉收回", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(html, /class="settings-softbody"/);
  assert.match(style, /--reversible-motion:\s*cubic-bezier\(0\.37, 0, 0\.63, 1\)/);
  assert.match(style, /--reversible-duration:\s*380ms/);
  assert.doesNotMatch(style, /\.sheet\.settings-sheet\s*\{[^}]*clip-path/s);
  assert.match(style, /\.sheet\.settings-sheet\s*\{[\s\S]*transform var\(--reversible-duration\) var\(--reversible-motion\)/);
  assert.match(style, /\.sheet\.settings-sheet\.is-visible\s*\{[\s\S]*clip-path: polygon\(0 0, 100% 0, 100% 100%, 0 100%\)/);
  assert.match(style, /\.settings-softbody\s*\{[\s\S]*translateY\(22px\) scaleY\(0\.94\)[\s\S]*var\(--reversible-duration\) var\(--reversible-motion\)/);
  assert.doesNotMatch(style, /\.settings-softbody\s*\{[^}]*clip-path/s);
  assert.match(style, /\.settings-softbody > \.sheet-head\s*\{\s*transform:\s*scaleX\(0\.74\)/);
  assert.match(style, /\.settings-softbody > \.setting-row:nth-child\(5\)\s*\{\s*transform:\s*scaleX\(0\.48\)/);
  assert.match(style, /\.settings-softbody > \.sheet-done\s*\{\s*transform:\s*scaleX\(0\.4\)/);
  assert.match(style, /\.settings-sheet\.is-visible::before,[\s\S]*\.settings-sheet\.is-visible::after/);
  assert.match(style, /\.sheet\.settings-sheet\.is-visible \.sheet-head,[\s\S]*animation:\s*none/);
  assert.match(game, /function bindSettingsSheetDismiss\(\)/);
  assert.match(game, /drag\.distance > 82 \|\| drag\.velocity > 0\.72/);
  assert.doesNotMatch(game, /sheet\.style\.clipPath = "polygon\("/);
  assert.match(game, /function paintSheetCollapse\(progress, distance\)/);
  assert.match(game, /softLayers\.forEach\(function paintSoftLayer/);
  assert.match(game, /--sheet-edge-bottom/);
  assert.match(game, /REVERSIBLE_MOTION_DURATION \+ 30/);
  assert.match(game, /bindSettingsSheetDismiss\(\);/);
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
  assert.match(game, /boundaryPath = boundaryGuidePaths\(\)\[0\] \|\| null/);
  assert.match(game, /boundaryPath \? boundaryPath\.cells/);
  assert.match(game, /index \* 220/);
  assert.match(game, /boundaryPath\.seams\[index - 1\]/);
});

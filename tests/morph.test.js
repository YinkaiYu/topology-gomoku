"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Morph = require("../app/assets/topology-morph.js");

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
  assert.match(game, /继续落子/);
  assert.match(game, /Engine\.suggestTutorialMove/);
  assert.match(game, /var guideText = tutorialPromptText\(\);/);
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

test("所有关卡的三维投影均返回有限屏幕坐标", () => {
  ["cylinder", "torus", "mobius", "klein", "projective"].forEach((type) => {
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

test("通关曲面使用高密度采样，棋盘线沿曲面分段插值", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /var columns = 44;/);
  assert.match(game, /var rows = 34;/);
  assert.match(game, /var samples = 8;/);
  assert.match(game, /appendCompletionSegment/);
  assert.match(game, /completionGridEdgePoints\(cells\[index\], step, direction/);
  assert.doesNotMatch(game, /var columns = 18;/);
  assert.doesNotMatch(game, /appendCompletionSegment\(points, sourceBoundary, targetBoundary/);
});

test("胜利曲面常驻旋转且支持拖动，不再自动弹出结算卡片", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /if \(game\.completion\) \{\s*animate = true;/);
  assert.match(game, /function canExploreCompletion\(\)/);
  assert.match(game, /completion\.rotation\.y \+= yawDelta;/);
  assert.match(game, /if \(outcome !== "win"\)/);
  assert.match(game, /chooseCompletionView\(winningMask\)/);
  assert.match(game, /elastic:\s*\{ x: 0, y: 0, velocityX: 0, velocityY: 0 \}/);
  assert.match(game, /wobbleX: game\.completion\.elastic\.x/);
});

test("开发者玩家胜利沿本关演示路径逐颗跨界落子", () => {
  const game = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  assert.match(game, /player === HUMAN && game\.levelIndex > 0/);
  assert.match(game, /Engine\.tracePath\(game\.rules, boundaryStart, game\.level\.demoDirection/);
  assert.match(game, /boundaryPath \? boundaryPath\.cells/);
  assert.match(game, /index \* 220/);
  assert.match(game, /boundaryPath\.seams\[index - 1\]/);
});

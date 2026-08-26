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

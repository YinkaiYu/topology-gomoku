"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const Engine = require("../app/assets/topology.js");
const Content = require("../app/assets/level-config.js");
const ControllerModule = require("../app/assets/game-controller.js");
const BoardArt = require("../app/assets/board-art.js");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, ...relativePath.split("/")), "utf8");
}

function loadWechatUiParity() {
  const source = read("wechat/js/platform/wechat-ui-parity.js")
    .replace(/export function /g, "function ");
  const context = { module: { exports: {} }, exports: {}, Object };
  vm.runInNewContext(
    `${source}\nmodule.exports = { beginReplayPreservingView, gameForReviewFrame, chooseCompletionView };`,
    context,
  );
  return context.module.exports;
}

const WechatUiParity = loadWechatUiParity();

function loadSceneRenderer() {
  const source = read("wechat/js/ui/scene-renderer.js");
  const importMarker = "} from './primitives';";
  const importEnd = source.indexOf(importMarker);
  assert.notEqual(importEnd, -1, "scene renderer primitive import is missing");
  const executable = source
    .slice(importEnd + importMarker.length)
    .replace("export default class SceneRenderer", "class SceneRenderer");
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    wx: {},
    GameGlobal: {
      TopologyMorph: {
        smooth: (value) => value,
        spring: (value) => value,
      },
    },
    clamp01: (value) => Math.max(0, Math.min(1, value)),
    lerp: (from, to, amount) => from + (to - from) * amount,
    fillRoundedRect() {},
    glassPanel() {},
    pill() {},
    pointInRect() { return false; },
    roundedRectPath() {},
    softOut: (value) => value,
    springOut: (value) => value,
    text() {},
    drawIcon() {},
    drawIconAsset() { return true; },
    drawImageContain() { return true; },
  };
  vm.runInNewContext(`${executable}\nmodule.exports = SceneRenderer;`, context);
  return context.module.exports;
}

const SceneRenderer = loadSceneRenderer();

function endedGame(overrides = {}) {
  return {
    status: "ended",
    outcome: "win",
    levelIndex: 2,
    level: Content.LEVELS[2],
    moves: new Array(5).fill(null),
    winningMask: { cells: [0, 1, 2, 3, 4] },
    review: null,
    viewMode: "surface",
    completionAvailable: true,
    autoAdvancePending: false,
    winAt: 0,
    ...overrides,
  };
}

function rendererWithMotion(game, motion) {
  const renderer = Object.create(SceneRenderer.prototype);
  renderer.metrics = { height: 844 };
  renderer.gamePausedAt = null;
  renderer.surfaceVelocity = { x: 0, y: 0 };
  renderer.surfaceElastic = { x: 0, y: 0, velocityX: 0, velocityY: 0 };
  renderer.surfaceAutoResumeAt = 0;
  renderer.completionMotion = motion
    ? {
        key: renderer.completionKey(game),
        phase: "presenting",
        startedAt: motion.startedAt,
        duration: 3000,
        settled: motion.settled,
      }
    : null;
  return renderer;
}

function actionRows(renderer, game, time) {
  const rows = [];
  renderer.contentBounds = () => ({ x: 0, width: 390 });
  renderer.drawActionRow = (actions, x, y) => {
    rows.push({
      y,
      actions: Array.from(actions)
        .filter(Boolean)
        .map((action) => ({ key: String(action.key), disabled: Boolean(action.disabled) })),
    });
  };
  renderer.drawGameActions({ game, levels: Content.LEVELS }, time, 0, 52);
  return rows;
}

function recordingContext() {
  const stack = [];
  const records = { stoneAlphas: [], winningStrokes: 0 };
  const target = {
    globalAlpha: 1,
    fillStyle: null,
    strokeStyle: null,
    save() {
      stack.push({
        globalAlpha: this.globalAlpha,
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
      });
    },
    restore() {
      Object.assign(this, stack.pop() || { globalAlpha: 1, fillStyle: null, strokeStyle: null });
    },
    createLinearGradient() {
      return { kind: "linear-gradient", addColorStop() {} };
    },
    createRadialGradient() {
      return { kind: "stone-gradient", addColorStop() {} };
    },
    fill() {
      if (this.fillStyle && this.fillStyle.kind === "stone-gradient") {
        records.stoneAlphas.push(this.globalAlpha);
      }
    },
    stroke() {
      if (typeof this.strokeStyle === "string"
          && this.strokeStyle.startsWith("rgba(199, 146, 68")) {
        records.winningStrokes += 1;
      }
    },
  };
  const context = new Proxy(target, {
    get(object, key) {
      if (key in object) {
        return object[key];
      }
      const noop = () => {};
      object[key] = noop;
      return noop;
    },
  });
  return { context, records };
}

function partialReviewGame() {
  const level = Content.LEVELS[1];
  const rules = Engine.createRules({
    type: level.topology,
    width: level.width,
    height: level.height,
    target: 5,
  });
  const board = Engine.createBoard(rules);
  const winningCells = Array.from({ length: 5 }, (_, x) => Engine.toCell(rules, x, 0));
  winningCells.slice(0, 3).forEach((cell) => { board[cell] = Engine.HUMAN; });
  return {
    status: "ended",
    outcome: "win",
    levelIndex: 1,
    level,
    rules,
    board,
    moves: winningCells.slice(0, 3).map((cell) => ({ cell, player: Engine.HUMAN })),
    winningMask: { cells: winningCells, direction: { dx: 1, dy: 0 }, seam: 0 },
    review: { step: 3, total: 5 },
    viewMode: "surface",
    completionAvailable: true,
    autoAdvancePending: false,
    lastMove: winningCells[2],
    lastMoveAt: 0,
    lastMoveFromPress: false,
    winAt: 0,
    seamPulseAt: 0,
    seamPulseBits: 0,
    demo: null,
    lesson: null,
  };
}

test("复盘保持进入前的二维或三维视图，并允许在复盘中继续切换", () => {
  for (const initialView of ["surface", "board"]) {
    const controller = new ControllerModule.GameController({
      preferences: { unlocked: 1, learnedLevels: [1] },
      now: () => 0,
      random: () => 0.25,
    });
    controller.startLevel(1, { skipDemo: true }, 0);
    controller.game.status = "ended";
    controller.game.completionAvailable = true;
    controller.game.viewMode = initialView;
    assert.equal(WechatUiParity.beginReplayPreservingView(controller, controller.game), true);
    assert.equal(controller.game.viewMode, initialView);
    assert.equal(controller.toggleDimension(), true);
    const toggledView = initialView === "surface" ? "board" : "surface";
    assert.equal(controller.game.viewMode, toggledView);
    assert.equal(controller.endReplay(), true);
    assert.equal(controller.game.viewMode, toggledView);
  }
});

test("结算曲面沿用 H5 的胜线自适应取景并保留形变比例", () => {
  const level = Content.LEVELS[1];
  const rules = Engine.createRules({
    type: level.topology,
    width: level.width,
    height: level.height,
    target: 5,
  });
  const start = Engine.toCell(rules, 5, 2);
  const path = Engine.tracePath(rules, start, 0, rules.target);
  const game = {
    level,
    rules,
    winningMask: Engine.createRules({
      type: level.topology,
      width: level.width,
      height: level.height,
      target: 5,
    }).winMasks.find((mask) => (
      Array.from(mask.cells).slice().sort((a, b) => a - b).join(",")
        === Array.from(path.cells).slice().sort((a, b) => a - b).join(",")
    )),
  };
  const presentation = globalThis.TopologyMorph
    ? globalThis.TopologyMorph.createPresentation(level.topology, rules, Array.from(path.cells))
    : require("../app/assets/topology-morph.js").createPresentation(
      level.topology,
      rules,
      Array.from(path.cells),
    );
  const Morph = require("../app/assets/topology-morph.js");
  const view = WechatUiParity.chooseCompletionView(game, presentation, 356, 356, Morph);
  assert.deepEqual(
    Object.keys(view).sort(),
    ["shapeX", "shapeY", "shapeZ", "x", "y", "z"],
  );
  Object.values(view).forEach((value) => assert.equal(Number.isFinite(value), true));
  assert.ok([0.92, 0.96, 1, 1.07].includes(view.shapeX));
});

test("复盘中的稳定曲面仍可绘制并开放维度切换", () => {
  const game = endedGame({ review: { step: 3, total: 5 } });
  const renderer = rendererWithMotion(game, { startedAt: 0, settled: true });
  const pose = renderer.completionPose(game, 3200);
  assert.ok(pose && pose.draw && pose.settled);
  assert.equal(renderer.canToggleDimension(game, 3200), true);
  const rows = actionRows(renderer, game, 3200);
  const dimension = rows.flatMap((row) => row.actions).find((action) => action.key === "dimension");
  assert.deepEqual(dimension, { key: "dimension", disabled: false });
});

test("复盘未到终局步时，二维棋盘不画胜线且棋子保持正常明度", () => {
  const game = partialReviewGame();
  const { context, records } = recordingContext();
  const layout = BoardArt.computeLayout(320, 320, game.rules);
  BoardArt.drawBoard(context, {
    game: WechatUiParity.gameForReviewFrame(game),
    layout,
    time: 1200,
    preferences: { hints: false },
  });
  assert.deepEqual(records, {
    stoneAlphas: [1, 1, 1],
    winningStrokes: 0,
  });
});

test("复盘未到终局步时，三维曲面不画胜线且棋子保持正常明度", () => {
  const game = partialReviewGame();
  const { context, records } = recordingContext();
  const layout = BoardArt.computeLayout(320, 320, game.rules);
  BoardArt.drawCompletion(context, {
    game: WechatUiParity.gameForReviewFrame(game),
    layout,
    time: 1200,
    morph: 1,
    scale: 1,
    rotation: { x: 0, y: 0, z: 0 },
  });
  assert.deepEqual(records, {
    stoneAlphas: [1, 1, 1],
    winningStrokes: 0,
  });
});

test("第一关非自动跳转的终局只保留旅程与下一关特殊动作", () => {
  const game = endedGame({
    levelIndex: 0,
    level: Content.LEVELS[0],
    outcome: "lose",
    winningMask: null,
    viewMode: "board",
    completionAvailable: false,
  });
  const renderer = rendererWithMotion(game, null);
  const rows = actionRows(renderer, game, 0);
  const visibleActions = rows.flatMap((row) => row.actions).map((action) => action.key);
  assert.deepEqual(visibleActions, ["journey", "next-level"]);
  const terminalRow = rows.find((row) => row.actions.some((action) => action.key === "journey"));
  assert.equal(terminalRow.y, 62);
});

test("维度形变未落稳时，复盘与终局两层操作全部禁用", () => {
  const game = endedGame({ review: { step: 2, total: 5 } });
  const renderer = rendererWithMotion(game, { startedAt: 0, settled: false });
  const rows = actionRows(renderer, game, 400);
  const actions = rows.flatMap((row) => row.actions);
  assert.ok(actions.length > 0);
  assert.deepEqual(
    actions.filter((action) => !action.disabled).map((action) => action.key),
    [],
  );
});

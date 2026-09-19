"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.resolve(__dirname, "..");
const shared = process.env.TOPOLOGY_SHARED_ASSETS || path.join(ROOT, "app/assets");
const Engine = require(path.join(shared, "topology.js"));
const Content = require(path.join(shared, "level-config.js"));
const Controller = require(path.join(shared, "game-controller.js")).GameController;
const Motion = require(path.join(shared, "board-view-motion.js"));
const Logic = require(path.join(shared, "board-view-logic.js"));
const Morph = require(path.join(shared, "topology-morph.js"));
const noop = () => {};
let time = 100;

function loadClass(file, name) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8")
    .replace(/^import[^;]+;\s*$/gm, "").replace("export default class " + name, "class " + name);
  const box = {
    module: { exports: {} }, Date: { now: () => time }, Set, Math,
    GameGlobal: {
      TopologyGomoku: Engine, TopologyGameContent: Content,
      TopologyBoardViewMotion: Motion, TopologyBoardViewLogic: Logic,
      TopologyMorph: Morph, TopologyBoardArt: require(path.join(shared, "board-art.js")),
      TopologyLiquidRange: require(path.join(shared, "liquid-range.js")),
    },
    clamp01: Morph.clamp01, lerp: (a, b, t) => a + (b - a) * t,
    text: noop, pill: noop, glassPanel: noop, fillRoundedRect: noop, roundedRectPath: noop,
    setContextPixelRatio: noop, gameForReviewFrame: game => game,
    chooseCompletionView: () => ({ x: 0, y: 0, z: 0 }), effectPixels: (_, n) => n,
    softOut: Morph.smooth, springOut: Morph.spring,
    pointInRect: (r, x, y) => r && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height,
    drawIcon: noop, drawIconAsset: () => true, drawImageContain: () => true,
  };
  vm.runInNewContext(source + "\nmodule.exports = " + name, box);
  return box.module.exports;
}
const Main = loadClass("wechat/js/main.js", "Main");
const Renderer = loadClass("wechat/js/ui/scene-renderer.js", "SceneRenderer");
const event = (id = 7) => ({ changedTouches: [{ identifier: id, clientX: 40, clientY: 40 }] });

function inputSetup(spatial = false) {
  const game = { mode: "duel", turn: Engine.HUMAN, moves: [] };
  const calls = [];
  const controller = {
    getState: () => ({ game }), canPlaceCell: () => true,
    performMove(cell, player) {
      calls.push({ cell, player });
      game.moves.push({ cell, player });
      game.turn *= -1;
    },
  };
  const renderer = {
    hitTest: () => ({ key: "board", payload: { action: "board" } }),
    canDragSurface: () => spatial, boardCellAt: () => 12,
    boardCellCenter: () => ({ x: 40, y: 40 }),
    beginSurfaceDrag: noop, endSurfaceDrag: noop, setPressedKey: noop,
  };
  const main = Object.create(Main.prototype);
  Object.assign(main, { controller, renderer, interaction: { touchId: null },
    sound: { unlock: noop }, processControllerEvents: noop });
  return { main, game, calls };
}

test("原生二维和三维点击将按下时的黑白玩家传给共享 controller", () => {
  for (const spatial of [false, true]) {
    const { main, calls } = inputSetup(spatial);
    main.onTouchStart(event()); main.onTouchEnd(event());
    main.onTouchStart(event()); main.onTouchEnd(event());
    assert.deepEqual(calls, [{ cell: 12, player: Engine.HUMAN }, { cell: 12, player: Engine.AI }]);
  }
});

test("双人手势拒绝过期回合、其他手指释放与取消后的落子", () => {
  for (const spatial of [false, true]) {
    const { main, game, calls } = inputSetup(spatial);
    main.onTouchStart(event());
    main.onTouchEnd(event(8));
    assert.equal(calls.length, 0);
    game.turn = Engine.AI;
    main.onTouchEnd(event());
    assert.equal(calls.length, 0);
    main.onTouchStart(event());
    // Two intervening moves can restore the same color, but invalidate the gesture.
    game.moves.push({}, {});
    main.onTouchEnd(event());
    assert.equal(calls.length, 0);
    main.onTouchStart(event()); main.onTouchCancel(event()); main.onTouchEnd(event());
    assert.equal(calls.length, 0);
  }
});

test("原生首页把双人模式传给核心，锁定关卡不会启动", () => {
  const calls = [];
  const main = Object.create(Main.prototype);
  Object.assign(main, {
    controller: { getState: () => ({ game: null }), startLevel: (...args) => { calls.push(args); return true; } },
    renderer: { homeMode: "ai", hitRect: () => ({}), setPressedKey: noop, beginTransition: noop, shakeLevel: noop },
    sound: { play: noop }, host: { vibrate: noop },
  });
  main.performAction({ payload: { action: "mode", mode: "duel" } }, time);
  main.performAction({ key: "level:0", payload: { action: "level", index: 0, locked: false } }, time);
  main.performAction({ key: "level:1", payload: { action: "level", index: 1, locked: true } }, time);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 0);
  assert.equal(calls[0][1].mode, "duel");
});

function renderSetup(width, height) {
  const context = new Proxy({ globalAlpha: 1, measureText: value => ({ width: value.length * 12 }) }, {
    get(obj, key) {
      if (key in obj) { return obj[key]; }
      return String(key).startsWith("create") ? () => ({ addColorStop: noop }) : noop;
    },
  });
  const controller = new Controller({ now: () => time, preferences: { unlocked: 6 } });
  const renderer = new Renderer({ context, canvas: { getContext: () => context },
    metrics: { width, height, topInset: 104, bottomInset: 24, leftInset: 0, rightInset: 0, pixelRatio: 1 },
    fonts: {}, images: { icons: {}, topologies: {}, silhouettes: {} }, font: () => "12px serif",
  }, controller);
  renderer.drawCurrentCanvasBlur = noop;
  return { controller, renderer };
}

test("模式入口触摸区至少 44px，三种视口关卡仍处于安全区内", () => {
  for (const [width, height] of [[390, 844], [360, 770], [360, 740]]) {
    const { controller, renderer } = renderSetup(width, height);
    renderer.drawHome(controller.getState(), time);
    for (const key of ["mode-ai", "mode-duel"]) {
      assert.ok(renderer.hitRect(key).height >= 44);
    }
    for (const bounds of Object.values(renderer.homeRects)) {
      assert.ok(bounds.y + bounds.height <= height - 24 + 0.001);
    }
  }
});

test("首关双人终局保留再来，设置隐藏 AI 难度但保留提示与声音", () => {
  const { controller, renderer } = renderSetup(390, 844);
  controller.startLevel(0, { skipDemo: true }, time);
  // This fixture exercises platform presentation before the candidate core is integrated.
  Object.assign(controller.game, { mode: "duel", status: "ended", outcome: "win", lesson: null });
  renderer.drawGameActions(controller.getState(), time, 500, 44);
  assert.ok(renderer.hitRect("restart"));
  renderer.hits = [];
  renderer.settingsOpen = true;
  renderer.drawSettings(controller.getState(), time, {});
  assert.equal(renderer.difficultyRect, null);
  assert.equal(renderer.hits.some(hit => hit.payload.action === "difficulty"), false);
  assert.ok(renderer.hitRect("switch:hints"));
  assert.ok(renderer.hitRect("switch:sound"));
  controller.game.mode = "ai";
  renderer.hits = [];
  renderer.drawSettings(controller.getState(), time, {});
  assert.equal(renderer.hits.filter(hit => hit.payload.action === "difficulty").length, 3);
});

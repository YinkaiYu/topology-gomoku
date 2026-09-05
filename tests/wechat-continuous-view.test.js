"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const shared = process.env.TOPOLOGY_SHARED_ASSETS || path.join(root, "app/assets");
const Engine = require(path.join(shared, "topology.js"));
const Content = require(path.join(shared, "level-config.js"));
const Controller = require(path.join(shared, "game-controller.js")).GameController;
const Motion = require(path.join(shared, "board-view-motion.js"));
const Logic = require(path.join(shared, "board-view-logic.js"));
const Liquid = require(path.join(shared, "liquid-range.js"));
const Morph = require(path.join(shared, "topology-morph.js"));
const Art = require(path.join(shared, "board-art.js"));
const globals = { TopologyGomoku: Engine, TopologyGameContent: Content,
  TopologyBoardViewMotion: Motion, TopologyBoardViewLogic: Logic,
  TopologyLiquidRange: Liquid, TopologyMorph: Morph, TopologyBoardArt: Art };
let time = 100;
const noop = () => {};
const context = new Proxy({ globalAlpha: 1, measureText: text => ({ width: text.length * 12 }) }, { get(obj, key) {
  if (key in obj) { return obj[key]; }
  if (String(key).startsWith("create")) { return () => ({ addColorStop: noop }); }
  return noop;
}});
function loadClass(file, name) {
  const source = fs.readFileSync(path.join(root, file), "utf8")
    .replace(/^import[^;]+;\s*$/gm, "").replace("export default class " + name, "class " + name);
  const box = { GameGlobal: globals, module: { exports: {} }, wx: {}, console,
    Date: { now: () => time }, Set, Math,
    clamp01: Morph.clamp01, lerp: (a,b,t) => a+(b-a)*t,
    text: noop, pill: noop, glassPanel: noop, fillRoundedRect: noop, roundedRectPath: noop,
    setContextPixelRatio: noop, gameForReviewFrame: game => game,
    chooseCompletionView: () => ({ x:0, y:0, z:0 }),
    effectPixels: (_, n) => n, softOut: Morph.smooth, springOut: Morph.spring,
    pointInRect: (r,x,y) => r && x >= r.x && x <= r.x+r.width && y >= r.y && y <= r.y+r.height,
    drawIcon: noop, drawIconAsset: () => true, drawImageContain: () => true };
  vm.runInNewContext(source + "\nmodule.exports = " + name, box);
  return box.module.exports;
}
const Renderer = loadClass("wechat/js/ui/scene-renderer.js", "SceneRenderer");
const Main = loadClass("wechat/js/main.js", "Main");
function setup(width = 390, height = 844) {
  const controller = new Controller({ now: () => time, random: () => 0.3, preferences: { unlocked: 6 } });
  controller.startLevel(1, { skipDemo: true }, time);
  const renderer = new Renderer({
    canvas: { getContext: () => context }, context,
    metrics: { width, height, topInset: 104, bottomInset: 24, leftInset: 0, rightInset: 0, pixelRatio: 1 },
    fonts: {}, images: { icons: {}, topologies: {}, silhouettes: {} }, font: () => "12px serif",
  }, controller);
  renderer.drawAssetIcon = noop;
  renderer.drawMiniStone = noop;
  const main = Object.create(Main.prototype);
  Object.assign(main, { controller, renderer, interaction: { mode: null, touchId: null },
    pauseReasons: new Set(), sound: { unlock: noop, play: noop, setEnabled: noop }, host: { writeStorage: noop } });
  function draw() {
    renderer.hits = [];
    renderer.drawGame(controller.getState(), time, main.interaction);
    for (const value of Object.values(renderer.boardRect)) { assert.ok(Number.isFinite(value)); }
    for (const hit of renderer.hits) {
      for (const value of Object.values(hit.rect)) { assert.ok(Number.isFinite(value)); }
    }
  }
  draw();
  return { main, renderer, controller, draw };
}
const event = (x,y) => ({ changedTouches: [{ identifier: 7, clientX:x, clientY:y }] });

test("原生真实布局在教学、对局和终局保持棋盘尺寸和三列锚点", () => {
  for (const [width,height] of [[390,844],[360,770],[360,740]]) {
    const s = setup(width,height);
    const initial = { ...s.renderer.boardRect };
    const y = s.renderer.hitRect("view-flat").y;
    s.controller.game.demo = { active: true, cells: [], seams: [], paths: [], startedAt: 0, duration: 500 };
    s.draw();
    assert.equal(s.renderer.hitRect("view-flat"), null);
    assert.deepEqual({ ...s.renderer.boardRect }, initial);
    s.controller.game.demo = null;
    s.controller._finishGame("win", null, "blocked", time);
    time += 3100;
    s.controller.tick(time);
    s.draw();
    assert.deepEqual({ ...s.renderer.boardRect }, initial);
    for (const keys of [["view-flat","previous","journey"],["view-spatial","next-step","next-level"]]) {
      const rects = keys.map(key => s.renderer.hitRect(key));
      assert.equal(rects[0].y, y);
      assert.equal(rects[0].x+rects[0].width/2, rects[1].x+rects[1].width/2);
      assert.equal(rects[1].x+rects[1].width/2, rects[2].x+rects[2].width/2);
      assert.equal(rects[1].y-rects[0].y, rects[2].y-rects[1].y);
    }
  }
});

test("原生滑轨点击只滑行，玻璃拖动锁定棋局，取消释放共享锁", () => {
  const s = setup();
  const rail = s.renderer.viewRangeRect;
  const x = rail.x + rail.width * 0.7, y = rail.y + 22;
  s.main.onTouchStart(event(x,y));
  assert.equal(s.main.interaction.pressedMovable, false);
  assert.equal(s.controller.game.view.scrubbing, true);
  s.main.onTouchEnd(event(x,y));
  assert.equal(s.controller.game.view.transitioning, true);
  assert.equal(s.controller.game.view.scrubbing, false);
  time += 1100; s.controller.tick(time); s.draw();
  const thumb = s.renderer.viewThumbRect(s.controller.game.view.progress);
  s.main.onTouchStart(event(thumb.x+14,thumb.y+11));
  assert.equal(s.main.interaction.pressedMovable, true);
  s.main.onTouchMove(event(rail.x+30,y));
  assert.equal(s.controller.canPlaceCell(0), false);
  const actual = s.controller.game.view.progress;
  s.main.onTouchCancel({changedTouches:[]});
  assert.equal(s.controller.game.view.scrubbing, false);
  assert.equal(s.controller.game.view.progress, actual);
});

test("原生三维按下未获落子资格不能在 AI 解锁后松手落子，长按也不落子", () => {
  const s = setup();
  s.controller.setViewProgress(0.5, false, time);
  s.controller.game.turn = Engine.AI;
  s.draw();
  const p = { x: s.renderer.boardRect.x+120, y:s.renderer.boardRect.y+120 };
  s.renderer.boardCellAt = () => 20;
  s.main.onTouchStart(event(p.x,p.y));
  assert.equal(s.main.interaction.placeEligibleAtDown, false);
  s.controller.game.turn = Engine.HUMAN;
  s.main.onTouchEnd(event(p.x,p.y));
  assert.equal(s.controller.game.moves.length, 0);
  s.main.onTouchStart(event(p.x,p.y));
  time += 300;
  s.main.onTouchEnd(event(p.x,p.y));
  assert.equal(s.controller.game.moves.length, 0);
  s.main.onTouchStart(event(p.x,p.y));
  s.main.onTouchEnd(event(p.x,p.y));
  assert.equal(s.controller.game.moves.length, 1);
});

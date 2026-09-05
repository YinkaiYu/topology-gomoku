"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const WECHAT_ROOT = path.join(ROOT, "wechat");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, ...relativePath.split("/")), "utf8");
}

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return javascriptFiles(target);
    }
    return entry.name.endsWith(".js") ? [target] : [];
  });
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function objectArrayKeys(source, declaration) {
  const block = sourceBetween(source, `const ${declaration} = [`, "];\n");
  return [...block.matchAll(/\bkey:\s*'([^']+)'/g)].map((match) => match[1]);
}

function loadDefaultClass(relativePath, className, globals = {}) {
  const source = read(relativePath)
    .replace(/^import[^;]+;\s*$/gm, "")
    .replace(/^export function /gm, "function ")
    .replace(`export default class ${className}`, `class ${className}`);
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    Set,
    Date,
    Math,
    ...globals,
  };
  vm.runInNewContext(`${source}\nmodule.exports = ${className};`, context);
  return context.module.exports;
}

test("微信画布按 3x 高清栅格绘制并在胶囊下方保留固定视觉缓冲", () => {
  const transforms = [];
  const context = {
    setTransform(...values) { transforms.push(values); },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext() { return context; },
  };
  const wx = {
    getWindowInfo() {
      return {
        windowWidth: 390,
        windowHeight: 844,
        pixelRatio: 3.5,
        statusBarHeight: 47,
        safeArea: { left: 0, right: 390, top: 47, bottom: 844 },
      };
    },
    getMenuButtonBoundingClientRect() {
      return { top: 51, bottom: 82, left: 296, right: 383, width: 87, height: 31 };
    },
  };
  const WechatHost = loadDefaultClass("wechat/js/platform/wechat-host.js", "WechatHost", { wx });
  const host = new WechatHost(canvas);

  assert.equal(host.metrics.pixelRatio, 3);
  assert.equal(canvas.width, 1170);
  assert.equal(canvas.height, 2532);
  assert.deepEqual(transforms, [[3, 0, 0, 3, 0, 0]]);
  assert.equal(host.metrics.capsuleBottom, 82);
  assert.equal(host.metrics.topInset, 104);
  assert.equal(host.metrics.topInset - host.metrics.capsuleBottom, 22);
});

test("微信大视口按物理像素预算平滑降低 DPR，避免多张离屏画布放大内存", () => {
  const context = { setTransform() {} };
  const canvas = { width: 0, height: 0, getContext() { return context; } };
  const wx = {
    getWindowInfo() {
      return {
        windowWidth: 1024,
        windowHeight: 1366,
        pixelRatio: 3,
        safeArea: { left: 0, right: 1024, top: 24, bottom: 1366 },
      };
    },
  };
  const WechatHost = loadDefaultClass("wechat/js/platform/wechat-host.js", "WechatHost", { wx });
  const host = new WechatHost(canvas);

  const expectedRatio = Math.sqrt(3750000 / (1024 * 1366));
  assert.ok(Math.abs(host.metrics.pixelRatio - expectedRatio) < 1e-12);
  assert.equal(canvas.width, Math.round(1024 * expectedRatio));
  assert.equal(canvas.height, Math.round(1366 * expectedRatio));
});

test("微信胶囊信息缺失时仍保留 H5 同源的最小顶部护栏", () => {
  const context = { setTransform() {} };
  const canvas = { width: 0, height: 0, getContext() { return context; } };
  const wx = {
    getWindowInfo() {
      return {
        windowWidth: 375,
        windowHeight: 667,
        pixelRatio: 2,
        statusBarHeight: 0,
        safeArea: { left: 0, right: 375, top: 0, bottom: 667 },
      };
    },
  };
  const WechatHost = loadDefaultClass("wechat/js/platform/wechat-host.js", "WechatHost", { wx });
  const host = new WechatHost(canvas);

  assert.equal(host.metrics.capsuleBottom, 0);
  assert.equal(host.metrics.topInset, 68);
});

test("微信宿主拒绝零尺寸、倒置和越界胶囊数据", () => {
  const invalidMenus = [
    { top: 0, bottom: 0 },
    { top: 82, bottom: 51 },
    { top: 51, bottom: 900 },
  ];
  invalidMenus.forEach((menu) => {
    const context = { setTransform() {} };
    const canvas = { width: 0, height: 0, getContext() { return context; } };
    const wx = {
      getWindowInfo() {
        return {
          windowWidth: 390,
          windowHeight: 844,
          pixelRatio: 3,
          statusBarHeight: 47,
          safeArea: { left: 0, right: 390, top: 47, bottom: 844 },
        };
      },
      getMenuButtonBoundingClientRect() { return menu; },
    };
    const WechatHost = loadDefaultClass("wechat/js/platform/wechat-host.js", "WechatHost", { wx });
    const host = new WechatHost(canvas);
    assert.equal(host.metrics.menu, null);
    assert.equal(host.metrics.capsuleBottom, 0);
    assert.equal(host.metrics.hostChromeBottom, 47 + 30.384);
    assert.equal(host.metrics.topInset, 47 + 30.384 + 22);
  });
});

test("微信入口先建立 GameGlobal 兼容层，再按依赖顺序创建唯一上屏 Canvas", () => {
  const entry = read("wechat/game.js");
  const imports = [...entry.matchAll(/^import ['"]([^'"]+)['"];$/gm)].map((match) => match[1]);
  assert.deepEqual(imports.slice(0, 10), [
    "./js/platform/runtime-global",
    "./js/shared/topology",
    "./js/shared/topology-morph",
    "./js/shared/game-replay",
    "./js/shared/level-config",
    "./js/shared/board-view-logic",
    "./js/shared/liquid-range",
    "./js/shared/board-view-motion",
    "./js/shared/game-controller",
    "./js/shared/board-art",
  ]);
  assert.equal((entry.match(/GameGlobal\.canvas = wx\.createCanvas\(\)/g) || []).length, 1);
  assert.match(entry, /GameGlobal\.canvas = wx\.createCanvas\(\)/);
  assert.match(read("wechat/js/platform/runtime-global.js"), /GameGlobal\.globalThis = GameGlobal/);
});

test("热刷新复用唯一上屏 Canvas，并在创建新实例前销毁旧实例", () => {
  const events = [];
  let canvasCount = 0;
  const screenCanvas = { kind: "screen" };
  let instanceCount = 0;
  class FakeMain {
    constructor(canvas) {
      this.id = ++instanceCount;
      this.canvas = canvas;
      events.push(`construct#${this.id}`);
    }

    destroy() {
      events.push(`destroy#${this.id}`);
    }
  }
  const context = {
    GameGlobal: {},
    Main: FakeMain,
    wx: {
      createCanvas() {
        canvasCount += 1;
        return screenCanvas;
      },
    },
  };
  const executable = read("wechat/game.js").replace(/^import[^;]+;\s*$/gm, "");
  vm.runInNewContext(executable, context);
  const first = context.GameGlobal.topologyGomoku;
  vm.runInNewContext(executable, context);
  const second = context.GameGlobal.topologyGomoku;

  assert.equal(canvasCount, 1);
  assert.equal(first.canvas, screenCanvas);
  assert.equal(second.canvas, screenCanvas);
  assert.deepEqual(events, ["construct#1", "destroy#1", "construct#2"]);
});

test("销毁游戏实例会用原引用解绑输入与生命周期监听并取消调度", () => {
  const names = [
    "TouchStart",
    "TouchMove",
    "TouchEnd",
    "TouchCancel",
    "Hide",
    "Show",
    "WindowResize",
  ];
  const registries = Object.fromEntries(names.map((name) => [name, new Set()]));
  const wx = {};
  names.forEach((name) => {
    wx[`on${name}`] = (listener) => registries[name].add(listener);
    wx[`off${name}`] = (listener) => {
      assert.equal(registries[name].has(listener), true, `${name} must remove the registered reference`);
      registries[name].delete(listener);
    };
  });
  const WechatHost = loadDefaultClass("wechat/js/platform/wechat-host.js", "WechatHost", { wx });
  const cancelledFrames = [];
  const clearedTimers = [];
  const Main = loadDefaultClass("wechat/js/main.js", "Main", {
    GameGlobal: {},
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame(id) { cancelledFrames.push(id); },
    clearTimeout(id) { clearedTimers.push(id); },
    setTimeout() { return 0; },
  });
  const host = Object.create(WechatHost.prototype);
  const main = Object.create(Main.prototype);
  main.host = host;
  main.frameId = 17;
  main.timerId = 23;
  main.suspended = false;
  main.sound = { destroyed: 0, destroy() { this.destroyed += 1; } };
  main.onTouchStart = () => {};
  main.onTouchMove = () => {};
  main.onTouchEnd = () => {};
  main.onTouchCancel = () => {};
  main.onHide = () => {};
  main.onShow = () => {};
  main.onResize = () => {};
  host.keepScreenAwake = (enabled) => { host.screenAwake = enabled; };

  main.bindHostEvents();
  names.forEach((name) => assert.equal(registries[name].size, 1));
  main.destroy();

  names.forEach((name) => assert.equal(registries[name].size, 0));
  assert.deepEqual(cancelledFrames, [17]);
  assert.deepEqual(clearedTimers, [23]);
  assert.equal(main.frameId, 0);
  assert.equal(main.timerId, 0);
  assert.equal(main.suspended, true);
  assert.equal(host.screenAwake, false);
  assert.equal(main.sound.destroyed, 1);
});

test("音频中断监听在热刷新销毁时完整解绑", () => {
  const begins = new Set();
  const ends = new Set();
  const wx = {
    onAudioInterruptionBegin(listener) { begins.add(listener); },
    onAudioInterruptionEnd(listener) { ends.add(listener); },
    offAudioInterruptionBegin(listener) {
      assert.equal(begins.has(listener), true);
      begins.delete(listener);
    },
    offAudioInterruptionEnd(listener) {
      assert.equal(ends.has(listener), true);
      ends.delete(listener);
    },
  };
  const SoundEngine = loadDefaultClass("wechat/js/platform/sound.js", "SoundEngine", { wx });
  const sound = new SoundEngine(true);
  assert.equal(begins.size, 1);
  assert.equal(ends.size, 1);
  sound.destroy();
  assert.equal(begins.size, 0);
  assert.equal(ends.size, 0);
  assert.equal(sound.context, null);
});

test("微信原生层不引入 DOM、Web Storage、WebView 或网络请求", () => {
  const combined = javascriptFiles(WECHAT_ROOT)
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(combined, /\bdocument\b|\blocalStorage\b|\bsessionStorage\b|web-view|\bfetch\s*\(|\bwx\.request\s*\(/i);
  const outsideBootstrap = javascriptFiles(WECHAT_ROOT)
    .filter((file) => !file.endsWith(path.join("platform", "runtime-global.js")))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(outsideBootstrap, /\bglobalThis\b/);
});

test("原生文字按逐字测量结果手工应用 letterSpacing", () => {
  const source = read("wechat/js/ui/primitives.js")
    .replace(/^export function /gm, "function ");
  const context = { module: { exports: {} }, exports: {}, Math, Array };
  vm.runInNewContext(`${source}\nmodule.exports = { text };`, context);

  const calls = [];
  const stack = [];
  const canvas = {
    globalAlpha: 1,
    textAlign: "left",
    save() {
      stack.push({
        font: this.font,
        fillStyle: this.fillStyle,
        textAlign: this.textAlign,
        textBaseline: this.textBaseline,
        globalAlpha: this.globalAlpha,
      });
    },
    restore() { Object.assign(this, stack.pop()); },
    measureText(character) { return { width: character === "拓" ? 10 : 20 }; },
    fillText(character, x, y) { calls.push({ character, x, y }); },
  };

  context.module.exports.text(canvas, "拓扑", 100, 40, {
    font: "600 40px serif",
    color: "#21302c",
    align: "center",
    letterSpacing: -2,
  });

  assert.deepEqual(calls, [
    { character: "拓", x: 86, y: 40 },
    { character: "扑", x: 94, y: 40 },
  ]);
  assert.equal(canvas.textAlign, "left");
});

test("微信原生阴影与滤镜半径按物理像素密度补偿", () => {
  const primitives = read("wechat/js/ui/primitives.js");
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const boardArt = read("app/assets/board-art.js");
  assert.match(primitives, /const CONTEXT_PIXEL_RATIOS = new WeakMap\(\)/);
  assert.match(primitives, /function setContextPixelRatio\(ctx, pixelRatio\)/);
  assert.match(primitives, /function effectPixels\(ctx, logicalPixels\)/);
  assert.match(primitives, /ctx\.shadowBlur = effectPixels\(/);
  assert.match(primitives, /ctx\.shadowOffsetY = effectPixels\(/);
  const primitiveModule = { exports: {} };
  vm.runInNewContext(
    `${primitives.replace(/^export function /gm, "function ")}\nmodule.exports = { setContextPixelRatio, effectPixels };`,
    { module: primitiveModule, exports: primitiveModule.exports, Math, Number, WeakMap },
  );
  const sealedContext = Object.preventExtensions({});
  primitiveModule.exports.setContextPixelRatio(sealedContext, 3);
  assert.equal(primitiveModule.exports.effectPixels(sealedContext, 5), 15);
  assert.equal(Object.hasOwn(sealedContext, "__topologyPixelRatio"), false);
  assert.match(renderer, /ctx\.filter = `blur\(\$\{effectPixels\(ctx, blurRadius\)\}px\)/);
  assert.match(renderer, /setContextPixelRatio\(this\.context, pixelRatio\)/);
  assert.match(renderer, /TopologyBoardArt\.setContextPixelRatio\(this\.context, pixelRatio\)/);
  const rawRendererShadows = renderer.split(/\r?\n/)
    .filter((line) => /ctx\.shadow(?:Blur|OffsetY)\s*=/.test(line) && !/= effectPixels\(/.test(line));
  assert.deepEqual(rawRendererShadows, []);
  assert.match(boardArt, /var CONTEXT_PIXEL_RATIOS = typeof WeakMap === "function" \? new WeakMap\(\) : null/);
  assert.match(boardArt, /setContextPixelRatio: setContextPixelRatio/);
  const rawBoardShadows = boardArt.split(/\r?\n/)
    .filter((line) => /ctx\.shadow(?:Blur|OffsetY)\s*=/.test(line) && !/= effectPixels\(/.test(line));
  assert.deepEqual(rawBoardShadows, []);
});

test("关键中文层级沿用 H5 的字距因子", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const optionsFor = (call) => sourceBetween(renderer, call, "});");
  assert.match(optionsFor("text(ctx, '拓扑'"), /letterSpacing: -titleSize \* 0\.065/);
  assert.match(optionsFor("text(ctx, '五子棋'"), /letterSpacing: -titleSize \* 0\.065/);
  assert.match(optionsFor("text(ctx, '边界之外，也能连成一线。'"), /letterSpacing: \(compact \? 10 : 12\) \* 0\.055/);
  assert.match(optionsFor("text(ctx, '旅程'"), /letterSpacing: \(compact \? 10 : 12\) \* 0\.12/);
  assert.match(optionsFor("text(ctx, level.typeName"), /letterSpacing: \(compact \? 8 : 9\) \* 0\.16/);
  assert.match(optionsFor("text(ctx, level.name"), /letterSpacing: \(compact \? 14 : 16\) \* 0\.09/);
  assert.match(optionsFor("text(ctx, game.level.name"), /letterSpacing: 19 \* 0\.08/);
  assert.match(optionsFor("pill(ctx, statusRect"), /letterSpacing: 11 \* 0\.05/);
  assert.match(optionsFor("text(ctx, '设置'"), /letterSpacing: 21 \* 0\.07/);
  assert.match(optionsFor("text(ctx, '完成'"), /letterSpacing: 16 \* 0\.12/);
});

test("终局曲面边界在形变末段按 boundaryFade 淡出", () => {
  const boardArt = read("app/assets/board-art.js");
  const completion = sourceBetween(
    boardArt,
    "  function drawCompletion(ctx, options) {",
    "  function drawTopologyGlyph(ctx, topology, rect, options) {",
  );
  assert.match(completion, /var boundaryFade = 1 - Morph\.smooth\(\(morph - 0\.72\) \/ 0\.28\);/);
  assert.match(
    completion,
    /ctx\.save\(\);\s*ctx\.globalAlpha \*= \(0\.36 \+ morph \* 0\.5\) \* boundaryFade;[\s\S]*drawSurfaceBoundary[\s\S]*ctx\.restore\(\);\s*if \(morph < 0\.98\)/,
  );
});

test("边界演示沿用 main 的逐段辅助线与跨界双端脉冲", () => {
  const boardArt = read("app/assets/board-art.js");
  const demo = sourceBetween(
    boardArt,
    "  function drawDemo(ctx, game, layout, time) {",
    "  function drawBoard(ctx, options) {",
  );
  assert.match(demo, /ctx\.globalAlpha \*= alpha \* 0\.45/);
  assert.match(demo, /var lineProgress = clamp01\(\(elapsed - lineIndex \* demo\.dropInterval \+ 130\) \/ 210\)/);
  assert.match(demo, /if \(lineProgress <= 0 \|\| demo\.seams\[lineIndex - 1\]\)/);
  assert.match(demo, /lineFrom\.x \+ \(lineTo\.x - lineFrom\.x\) \* lineProgress/);
  assert.match(demo, /var pulseProgress = \(elapsed - crossingAt\) \/ 600/);
  assert.match(demo, /seam & Engine\.SEAM_TWIST \? TOKENS\.gold : TOKENS\.teal/);
  assert.match(demo, /\[from, to\]\.forEach\(function drawCrossingRing/);
});

test("交互式边界提示保留逐段虚线、跨界方向射线与目标浮动", () => {
  const boardArt = read("app/assets/board-art.js");
  const lesson = sourceBetween(
    boardArt,
    "  function drawLessonGuide(ctx, game, layout, time, fontFamily) {",
    "  function drawDemo(ctx, game, layout, time) {",
  );
  assert.match(lesson, /var breath = Math\.sin\(time \* 0\.006\)/);
  assert.match(lesson, /ctx\.globalAlpha \*= 0\.52 \+ pulse \* 0\.24/);
  assert.match(lesson, /ctx\.restore\(\);\s*ctx\.save\(\);\s*ctx\.globalAlpha \*= \(0\.52 \+ pulse \* 0\.24\) \* 0\.72/);
  assert.match(lesson, /ctx\.globalAlpha \*= 0\.74 \+ pulse \* 0\.22/);
  assert.match(lesson, /ctx\.arc\(center\.x, center\.y, 1\.7 \+ pulse \* 0\.65/);
  assert.match(lesson, /var floatY = -breath \* 1\.25/);
  assert.match(lesson, /function drawLessonConnections/);
  assert.match(lesson, /var pulse = Math\.sin\(time \* 0\.0055\) \* 0\.5 \+ 0\.5/);
  assert.match(lesson, /pending \? 0\.3 \+ pulse \* 0\.2 : 0\.34/);
  assert.match(lesson, /\[cell \* 0\.12, cell \* 0\.1\]/);
  assert.match(lesson, /lineDashOffset = -time \* 0\.018/);
  assert.match(lesson, /var ray = cell \* \(pending \? 0\.72 : 0\.58\)/);
  assert.match(lesson, /var radius = cell \* 0\.37 \+ pulse \* \(pending \? 4 : 2\)/);
  assert.match(lesson, /var travel = 0\.2 \+ pulse \* 0\.64/);
  assert.match(lesson, /seam & Engine\.SEAM_TWIST \? TOKENS\.gold : TOKENS\.teal/);
  const drawBoard = sourceBetween(
    boardArt,
    "  function drawBoard(ctx, options) {",
    "  function surfacePoint(",
  );
  assert.match(
    drawBoard,
    /drawGrid[\s\S]*drawLessonConnections[\s\S]*drawLessonGuide[\s\S]*drawDemo[\s\S]*drawWinningConnections/,
  );
});

test("原生目录保留图鉴揭示、连续设置控制与输入锁语义", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const main = read("wechat/js/main.js");
  assert.match(renderer, /const revealed = index === 0 \|\| completed/);
  assert.match(renderer, /drawImageContain\(ctx, this\.topologyImage\(level\.topology, compact\), glyphRect\)/);
  assert.match(renderer, /drawImageContain\(ctx, this\.silhouetteImage\(level\.topology, compact\), glyphRect\)/);
  assert.match(renderer, /Math\.round\(difficultyProgress\)/);
  assert.match(renderer, /this\.register\('settings-sheet', this\.sheetRect, \{ action: 'none' \}\)/);
  assert.match(renderer, /contentBounds\(maxWidth = 520, horizontalPadding = null\)/);
  assert.match(renderer, /const boardSize = Math\.min\(560, content\.width, availableBoardHeight\)/);
  assert.match(renderer, /if \(game\.autoAdvancePending\) \{\s*return;/s);
  assert.match(renderer, /disabled: game\.status !== 'playing'[\s\S]*game\.demo && game\.demo\.active/);
  assert.match(main, /const nextValue = this\.interaction\.switchMoved\s*\?\s*this\.interaction\.controlClampedProgress >= 0\.5\s*:\s*!this\.interaction\.switchStartValue/s);
  assert.match(main, /if \(this\.renderer\.transition \|\| this\.interaction\.touchId !== null\) \{/);
});

test("禁用的棋盘下方操作静默忽略，不触发模拟器或真机震动", () => {
  const main = read("wechat/js/main.js");
  const disabledBranch = sourceBetween(
    main,
    "    if (hit.disabled) {",
    "    if (action === 'board' && state.game) {",
  );
  assert.match(disabledBranch, /this\.resetInteraction\(\);\s*return;/);
  assert.doesNotMatch(disabledBranch, /vibrate\(/);
  assert.match(main, /if \(hit\.payload\.locked \|\| !this\.controller\.selectLevel[\s\S]*this\.host\.vibrate\(\)/);
});

test("原生首页保留 H5 的品牌主视觉与旅程层级", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const homeStart = renderer.indexOf("  drawHome(state, time) {");
  const homeEnd = renderer.indexOf("  drawLevelCard(", homeStart);
  const home = renderer.slice(homeStart, homeEnd);
  assert.match(home, /this\.metrics\.width \* 0\.43/);
  assert.match(home, /ctx\.rotate\(lerp\(-5, -3\.5, breath\) \* Math\.PI \/ 180\)/);
  assert.match(home, /text\(ctx, '拓扑'/);
  assert.match(home, /text\(ctx, '五子棋'/);
  assert.match(home, /text\(ctx, '旅程'/);
  assert.doesNotMatch(home, /register\('settings'/);
});

test("首页关卡卡片只显示权威图案或剪影，不恢复编号、完成或锁图标", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const card = sourceBetween(
    renderer,
    "  drawLevelCard(ctx, cardRect, level, index, state, time) {",
    "  drawGame(state, time, interaction) {",
  );
  assert.match(card, /drawImageContain\(ctx, this\.topologyImage\(level\.topology, compact\), glyphRect\)/);
  assert.match(card, /drawImageContain\(ctx, this\.silhouetteImage\(level\.topology, compact\), glyphRect\)/);
  assert.doesNotMatch(card, /draw(?:Asset)?Icon\([^\n]*'(?:check|lock)'/);
  assert.doesNotMatch(card, /level-number|levelNumber|numberLabel|String\(index \+ 1\)/);
  const textSubjects = [...card.matchAll(/text\(ctx,\s*([^,\r\n]+)/g)]
    .map((match) => match[1].trim());
  assert.deepEqual(textSubjects, ["'?'", "level.typeName", "level.name"]);
});

test("难度滑块与开关按连续位置拖动，越界阻尼后以液态 settle 收束", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const main = read("wechat/js/main.js");
  assert.match(renderer, /const raw = \(x - grabOffset - geometry\.firstCenter\) \/ geometry\.step/);
  assert.match(renderer, /this\.detentProgress\(this\.dampedControlProgress\(raw, 2, 0\.56, 0\.24\), 2\)/);
  assert.match(renderer, /const raw = \(x - grabOffset - \(bounds\.x \+ 3 \+ 13\)\) \/ 34/);
  assert.match(renderer, /this\.detentProgress\(this\.dampedControlProgress\(raw, 1, 0\.58, 0\.22\), 1\)/);
  assert.match(renderer, /if \(raw < 0\) \{\s*return Math\.max\(-overshoot, raw \* damping\);/s);
  assert.match(renderer, /if \(raw > maximum\) \{\s*return Math\.min\(maximum \+ overshoot, maximum \+ \(raw - maximum\) \* damping\);/s);
  assert.match(renderer, /Math\.round\(\(directSelection \? 660 : 720\) \+ distance \* 140\)/);
  assert.match(renderer, /directSelection \? 820 : Math\.round\(720 \+ Math\.min\(1, distance\) \* 120\)/);
  assert.match(renderer, /cubicBezierProgress\(progress, 0\.32, 0\.05, 0\.2, 1\.13\)/);
  assert.match(renderer, /hasControlMotion\(time\)/);

  assert.match(main, /const dragState = this\.renderer\.difficultyDragState\(/);
  assert.match(main, /previewDifficulty = Math\.max\([\s\S]*Math\.round\(this\.interaction\.previewDifficultyProgress\)/);
  assert.match(main, /const dragState = this\.renderer\.switchDragState\(/);
  assert.match(main, /previewSwitch = this\.interaction\.previewSwitchProgress >= 0\.5/);
  assert.match(main, /this\.renderer\.settleControl\(\s*'difficulty'[\s\S]*this\.interaction\.pressedMovable/s);
  assert.match(main, /this\.renderer\.settleControl\(\s*'switch'[\s\S]*this\.interaction\.pressedMovable/s);
});

test("结算操作区采用视角、复盘、旅程三行三列矩阵", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const actions = sourceBetween(
    renderer,
    "  drawGameActions(state, time, topY, rowHeight, interaction = {}) {",
    "  drawActionRow(actions, x, y, width, height, gap) {",
  );
  assert.deepEqual(objectArrayKeys(actions, "firstRow"), [
    "previous",
    "replay-toggle",
    "next-step",
  ]);
  assert.deepEqual(objectArrayKeys(actions, "secondRow"), [
    "journey",
    "restart",
    "next-level",
  ]);
  assert.match(actions, /this\.drawActionRow\(firstRow, content\.x, topY \+ rowHeight \+ rowGap, contentWidth, rowHeight, 8\)/);
  assert.match(actions, /this\.drawActionRow\(secondRow, content\.x, topY \+ 2 \* \(rowHeight \+ rowGap\), contentWidth, rowHeight, 8\)/);
  assert.match(actions, /\{ key: 'journey', label: '旅程', icon: 'journey'/);
});

test("设置面板沿用 H5 的下拉关闭距离与速度阈值", () => {
  const main = read("wechat/js/main.js");
  assert.match(main, /const dismiss = this\.interaction\.sheetOffset > 82 \|\| velocity > 0\.72/);
  assert.doesNotMatch(main, /sheetOffset > 92 \|\| velocity > 0\.75/);
});

test("共享对象转场保留源帧内容，端点无效时立即解锁", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const primitives = read("wechat/js/ui/primitives.js");
  assert.match(renderer, /function usableRect\(value\)/);
  assert.match(renderer, /function drawSnapshotWithoutRect\(/);
  assert.match(renderer, /snapshot = wx\.createCanvas\(\)/);
  assert.match(renderer, /snapshot\.getContext\('2d'\)\.drawImage\(this\.host\.canvas, 0, 0\)/);
  assert.match(renderer, /if \(!usableRect\(target\)\) \{\s*this\.transition = null;\s*return;/);
  assert.match(renderer, /this\.transition\.kind === 'exit'[\s\S]*const targetAlpha = sharedTarget[\s\S]*this\.drawLevelCard/);
  assert.match(renderer, /this\.transition && this\.transition\.kind === 'enter'/);
  assert.match(renderer, /drawSnapshotWithoutRect\([\s\S]*transition\.snapshot/);
  assert.match(renderer, /transitionTargetAlpha\(kind, time\)/);
  assert.match(renderer, /softOut\(clamp01\(\(progress - 0\.72\) \/ 0\.28\)\)/);
  assert.match(renderer, /ctx\.globalAlpha = 1 - this\.transitionTargetAlpha\(transition\.kind, time\)/);
  assert.match(renderer, /function aspectFitRect\(source, target\)/);
  assert.match(renderer, /const scale = Math\.min\(target\.width \/ source\.width, target\.height \/ source\.height\)/);
  assert.match(renderer, /const contentRect = aspectFitRect\(from, overlay\)/);
  assert.match(renderer, /from\.x \* dpr,[\s\S]*contentRect\.width,[\s\S]*contentRect\.height/);
  assert.doesNotMatch(renderer, /from\.x \* dpr,[\s\S]*overlay\.x,[\s\S]*overlay\.width,[\s\S]*overlay\.height/);
  assert.match(renderer, /const fromRadius = transition\.kind === 'enter' \? 21 : 29/);
  assert.match(primitives, /ctx\.globalAlpha \*= alpha/);
  assert.match(primitives, /ctx\.globalAlpha \*= options\.alpha/);
});

test("宿主安全区压缩图鉴时缩小图案槽，避免图案与关卡注释重叠", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  assert.match(renderer, /const denseArtwork = compact \|\| \(!final && cardRect\.height < 122\)/);
  assert.match(renderer, /denseArtwork \? 10 : Math\.min\(14,/);
  assert.match(renderer, /denseArtwork \? 82 : Math\.min\(88,/);
  assert.match(renderer, /\? \(revealed \? 66 : 60\)/);
  assert.match(renderer, /const glyphTop = cardRect\.y \+ \(denseArtwork && !compact \? \(revealed \? 3 : 4\) : padding\)/);
});

test("终局曲面使用正反形变、接缝胜线与 settled 输入锁", () => {
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const boardArt = read("app/assets/board-art.js");
  assert.match(renderer, /TopologyBoardViewMotion\.orientation/);
  assert.match(renderer, /TopologyBoardViewMotion\.busy/);
  assert.match(renderer, /morph: view\.progress/);
  assert.match(boardArt, /Engine\.step\(game\.rules, cells\[index\], direction\)/);
  assert.match(boardArt, /Morph\.seamBridgeUV\(/);
});

test("帧循环在静止场景休眠，并嵌套冻结弹层与生命周期计时", () => {
  const main = read("wechat/js/main.js");
  const renderer = read("wechat/js/ui/scene-renderer.js");
  const controller = read("app/assets/game-controller.js");
  assert.match(main, /const nextScheduledAt = this\.controller\.nextScheduledAt\(\)/);
  assert.match(main, /if \(this\.pauseReasons\.size\) \{\s*return null;/);
  assert.doesNotMatch(main, /state\.scene === ['"]home['"]\) \{\s*return true/);
  assert.match(main, /addPauseReason\('modal', now\)/);
  assert.match(main, /addPauseReason\('lifecycle', now\)/);
  assert.match(main, /this\.renderer\.pauseGameTime\(time\)/);
  assert.match(main, /this\.renderer\.resumeGameTime\(time\)/);
  assert.match(main, /state\.game\.status !== 'ended'/);
  assert.match(renderer, /surfaceAnimationDelay\(game, time\)/);
  assert.match(renderer, /return moving \? 33 : 66/);
  assert.match(controller, /GameController\.prototype\.nextScheduledAt/);
});

test("触摸结束只消费当前 identifier，音频响应系统中断", () => {
  const main = read("wechat/js/main.js");
  const sound = read("wechat/js/platform/sound.js");
  assert.match(main, /changed\.find\(\(touch\) =>[\s\S]*=== this\.interaction\.touchId\)/);
  assert.match(main, /if \(!released\) \{\s*return;/);
  assert.match(sound, /wx\.onAudioInterruptionBegin/);
  assert.match(sound, /wx\.onAudioInterruptionEnd/);
  assert.match(sound, /wx\.offAudioInterruptionBegin/);
  assert.match(sound, /wx\.offAudioInterruptionEnd/);
  assert.match(sound, /this\.pauseReasons = new Set\(\)/);
  assert.match(sound, /this\.pause\('interruption'\)/);
  assert.match(sound, /this\.resume\('interruption'\)/);
  assert.match(sound, /if \(!this\.enabled \|\| this\.pauseReasons\.size\) \{/);
  assert.match(main, /this\.sound\.pause\('lifecycle'\)/);
  assert.match(main, /this\.sound\.resume\('lifecycle'\)/);
  assert.match(main, /this\.sound\.destroy\(\)/);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Engine = require("../app/assets/topology.js");
const Content = require("../app/assets/level-config.js");
const Morph = require("../app/assets/topology-morph.js");
const ViewLogic = require("../app/assets/board-view-logic.js");
const source = fs.readFileSync(require.resolve("../app/assets/game.js"), "utf8");
const noop = () => {};

function element() {
  const classes = new Set();
  const children = new Map();
  return {
    hidden: false, disabled: false, textContent: "", dataset: {}, attributes: {},
    style: { setProperty: noop, removeProperty: noop },
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, enabled) {
        const active = enabled === undefined ? !classes.has(name) : enabled;
        if (active) { classes.add(name); } else { classes.delete(name); }
        return active;
      }
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector(selector) {
      if (!children.has(selector)) { children.set(selector, element()); }
      return children.get(selector);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    setPointerCapture: noop
  };
}

function viewState(spatial = false) {
  return {
    progress: spatial ? 1 : 0, target: spatial ? 1 : 0,
    transitioning: false, scrubbing: false, dragging: false, pointerId: null,
    rotation: { x: 0, y: 0, z: 0 }, elastic: { x: 0, y: 0 }
  };
}

function match(index = 0, mode = "duel") {
  const level = Content.LEVELS[index];
  const rules = Engine.createRules({ type: level.topology, width: level.width, height: level.height, target: 5 });
  return {
    levelIndex: index, level, rules, mode, board: Engine.createBoard(rules), moves: [],
    turn: Engine.HUMAN, status: "playing", introMode: "none", lastMove: -1,
    outcome: null, winner: null, winningMask: null, lesson: null, lessonReturn: null,
    demo: null, completion: null, review: null, autoAdvancePending: false, view: viewState()
  };
}

// Extract the actual H5 entry, interaction and presentation functions. Rendering,
// timers and DOM geometry are isolated so these tests exercise application behavior.
function harness(names, overrides = {}) {
  const nodes = {};
  const dom = new Proxy(nodes, {
    get(target, name) {
      if (!(name in target)) { target[name] = element(); }
      return target[name];
    }
  });
  dom.difficultyControl.parentElement = element();
  dom.difficultyButtons = Content.DIFFICULTY_ORDER.map((difficulty) => ({ ...element(), dataset: { difficulty } }));
  dom.levelCards = Content.LEVELS.map(element);
  const timers = [];
  const calls = { ai: 0, lessons: 0, demos: 0, transitions: [], cards: [], stones: [], saves: 0 };
  const context = vm.createContext({
    Engine, Content, Morph, ViewLogic, HUMAN: Engine.HUMAN, AI: Engine.AI,
    LEVELS: Content.LEVELS, DIFFICULTIES: Content.DIFFICULTIES,
    DIFFICULTY_ORDER: Content.DIFFICULTY_ORDER,
    TUTORIAL_AUTO_ADVANCE_DELAY: Content.TUTORIAL_AUTO_ADVANCE_DELAY,
    DEV_MODE: false, developer: { aiPaused: false, placementPlayer: Engine.HUMAN },
    game: match(), dom, activeSheet: null, selectedMode: "duel", selectedLevel: 0,
    dimensionRange: null, turnToken: 0,
    prefs: { unlocked: 6, completed: [], bestDifficulty: [], difficulty: "normal", hints: true, sound: true },
    renderState: {
      pointerId: null, pressedPlayer: null, pressedCell: -1, hoverCell: -1,
      pressedAt: 0, pressedMotionReady: false, lastFrameAt: 0,
      layout: { cell: 40, left: 0, right: 280, top: 0, bottom: 280 }
    },
    performance: { now: () => 1000 },
    window: { setTimeout: (fn) => timers.push(fn), getComputedStyle: () => ({ borderRadius: "20px" }) },
    requestAnimationFrame: (fn) => fn(), requestRender: noop,
    sound: { play: noop, unlock: noop },
    updateHome: noop, closeActiveSheet: noop, showScreen: noop, resizeCanvas: noop,
    createInteractiveViewState: viewState,
    animateCardIntoBoard: (transition, done) => { calls.cards.push(transition); done(); },
    animateBoardArrival: (_direction, done) => done(),
    startBoundaryLesson: () => { calls.lessons += 1; },
    startBoundaryDemo: () => { calls.demos += 1; },
    hasLearnedLevel: () => false,
    updateTurnUI: noop, syncGameTools: noop, rememberLevel: noop,
    lessonPromptText: () => "请落在标记处", resultMoveText: () => "已结束",
    scheduleAiMove: () => { calls.ai += 1; },
    transitionToLevel: (index, options) => calls.transitions.push({ index, options }),
    canUseInteractiveView: () => true, canUseViewControl: () => true,
    interactiveViewOrientation: () => ({ wobbleX: 0, wobbleY: 0 }),
    createCompletionState: () => ({ active: true, settled: false }),
    savePreferences: () => { calls.saves += 1; },
    syncSwitchUI: noop, syncDifficultyLensGeometry: noop,
    openSheet: noop, clamp01: Morph.clamp01,
    cellCenter: () => ({ x: 80, y: 80 }),
    completionCellPoint: () => ({ x: 80, y: 80 }),
    drawStoneFace: (_ctx, player) => calls.stones.push(player),
    eventToCell: (event) => event.cell, pointerInsideBoard: () => true,
    targetPressedStone: noop, canExploreCompletion: () => false,
    ...overrides
  });
  const helpers = ["isInteractiveLesson", "isEndedView", "isPassedView", "isReviewing", "clearPressedStoneMotion", "currentInputPlayer"];
  for (const name of new Set([...helpers, ...names])) {
    const start = source.indexOf("  function " + name + "(");
    const next = source.indexOf("\n  function ", start + 1);
    assert.ok(start >= 0 && next > start, name);
    vm.runInContext(source.slice(start, next), context);
  }
  return {
    context, calls, dom,
    flushTimers() {
      const ready = timers.splice(0);
      ready.forEach((fn) => fn());
    }
  };
}

test("H5 首页首关选择实际传递模式，显式模式优先于首页选择", () => {
  for (const mode of ["ai", "duel"]) {
    const { context, calls, dom, flushTimers } = harness(["selectLevel", "introModeFor", "startLevel"], { selectedMode: mode });
    const cardRect = { left: 20, top: 40, width: 180, height: 240 };
    dom.levelCards[0].getBoundingClientRect = () => cardRect;
    context.selectLevel(0, dom.levelCards[0]);
    flushTimers();
    assert.equal(calls.cards.length, 1);
    assert.equal(calls.cards[0].rect, cardRect);
    assert.equal(context.game.mode, mode);
    assert.equal(context.game.introMode, mode === "duel" ? "none" : "lesson");
    assert.equal(calls.lessons, mode === "duel" ? 0 : 1);
    assert.equal(calls.demos, 0);
    context.selectedMode = mode === "duel" ? "ai" : "duel";
    context.startLevel(0, { mode });
    assert.equal(context.game.mode, mode);
    assert.equal(context.game.introMode, mode === "duel" ? "none" : "lesson");
  }
});

test("H5 黑白回合和终局文案对应双方，白方不显示 AI 思考", () => {
  const { context, dom } = harness(["updateTurnUI"]);
  for (const player of [Engine.HUMAN, Engine.AI]) {
    context.game.turn = player;
    context.updateTurnUI();
    assert.equal(dom.turnStatus.textContent, player === Engine.HUMAN ? "黑方回合" : "白方回合");
    assert.equal(dom.thinkingIndicator.classList.contains("is-visible"), false);
    assert.equal(dom.aiChip.classList.contains("is-tutorial-hidden"), false);
    assert.equal(dom.humanChip.querySelector("#humanChipLabel").textContent, "黑方");
    assert.equal(dom.difficultyLabel.textContent, "白方");
    context.game.status = "ended";
    context.game.winner = player;
    context.game.outcome = "win";
    context.updateTurnUI();
    assert.equal(dom.turnStatus.textContent, player === Engine.HUMAN ? "黑方胜" : "白方胜");
    context.game.status = "playing";
  }
  context.game.status = "ended";
  context.game.outcome = "draw";
  context.updateTurnUI();
  assert.equal(dom.turnStatus.textContent, "和局");
});

test("H5 首关双人终局保留再来与复盘入口，并按双人模式重开", () => {
  const { context, calls, dom } = harness(["syncGameTools", "handleSettledAction", "restartGame"]);
  context.game.status = "ended";
  context.game.outcome = "win";
  context.syncGameTools();
  assert.equal(dom.settledReplayButton.hidden, false);
  assert.equal(dom.settledReplayButton.disabled, false);
  assert.equal(dom.endgameReviewTools.attributes["aria-hidden"], "false");
  context.handleSettledAction();
  assert.equal(calls.transitions[0].index, 0);
  assert.equal(calls.transitions[0].options.mode, "duel");
  assert.equal(calls.transitions[0].options.introMode, "none");
});

test("H5 双人设置隐藏 AI 难度且不覆盖白方标签，切回单人恢复难度", () => {
  const { context, dom } = harness(["openSettings", "syncSettingsUI", "difficultyIndex", "previewDifficulty"]);
  context.game.turn = Engine.AI;
  context.openSettings();
  assert.equal(dom.difficultyControl.parentElement.hidden, true);
  assert.equal(dom.difficultyLabel.textContent, "白方");
  assert.equal(context.game.turn, Engine.AI);
  context.game.mode = "ai";
  context.openSettings();
  assert.equal(dom.difficultyControl.parentElement.hidden, false);
  assert.equal(dom.difficultyLabel.textContent, Content.DIFFICULTIES.normal.label);
});

test("H5 手动边界教学可悔棋并继续黑子引导，完成后恢复原双人白方回合", () => {
  const { context, calls, flushTimers, dom } = harness([
    "snapshotMatchForLesson", "replayBoundaryLesson", "introModeFor", "startLevel",
    "undoMove", "performMove", "connectedSeamAtCell", "finishBoundaryLesson", "updateTurnUI"
  ], { game: match(1) });
  context.game.board[0] = Engine.HUMAN;
  context.game.moves.push({ cell: 0, player: Engine.HUMAN });
  context.game.turn = Engine.AI;
  context.game.lastMove = 0;
  context.replayBoundaryLesson();
  const replay = calls.transitions.shift();
  assert.equal(replay.options.mode, "duel");
  context.startLevel(replay.index, replay.options);
  assert.equal(context.game.introMode, "lesson");
  assert.equal(context.game.lessonReturn.turn, Engine.AI);
  context.game.lesson = { active: true, cells: [0, 1, 2, 3, 4], seams: [], step: 0, pathIndex: 0, paths: [{}] };
  context.updateTurnUI();
  assert.equal(dom.turnStatus.textContent, "请落在标记处");
  assert.equal(context.performMove(0, Engine.HUMAN), true);
  assert.equal(context.performMove(1, Engine.HUMAN), true);
  context.undoMove();
  assert.equal(context.game.turn, Engine.HUMAN);
  assert.equal(context.game.lesson.step, 1);
  assert.equal(context.performMove(1, Engine.HUMAN), true);
  context.finishBoundaryLesson({ cells: [0, 1, 2, 3, 4], seam: 0 });
  flushTimers();
  const resume = calls.transitions.shift();
  assert.equal(resume.options.mode, "duel");
  context.selectedMode = "ai";
  context.startLevel(resume.index, resume.options);
  flushTimers();
  assert.equal(context.game.mode, "duel");
  assert.equal(context.game.introMode, "none");
  assert.equal(context.game.turn, Engine.AI);
  assert.equal(context.game.moves.length, 1);
  assert.equal(context.game.board[0], Engine.HUMAN);
  assert.equal(context.game.board[1], Engine.EMPTY);
  assert.equal(calls.ai, 0);
});

test("H5 双人胜负结算只记录进度，不授予 AI 难度成绩或自动跳关", () => {
  for (const outcome of ["win", "draw"]) {
    const { context, calls, flushTimers } = harness(["finishGame"]);
    context.prefs.difficulty = Content.DIFFICULTY_ORDER.at(-1);
    context.prefs.unlocked = 0;
    context.finishGame(outcome, null, null, Engine.AI);
    flushTimers();
    assert.equal(context.game.status, "ended");
    assert.equal(context.game.autoAdvancePending, false);
    assert.equal(context.prefs.completed[0], true);
    assert.equal(context.prefs.unlocked, 1);
    assert.equal(context.prefs.bestDifficulty[0], undefined);
    assert.equal(calls.transitions.length, 0);
    assert.equal(calls.saves, 1);
  }
  const { context } = harness(["finishGame"], { game: match(1, "ai") });
  context.finishGame("win", null, null, Engine.HUMAN);
  assert.equal(context.prefs.bestDifficulty[1], Content.DIFFICULTIES.normal.rank);
});

test("H5 恢复快照以原对局模式为准，只有单人白方回合恢复 AI 调度", () => {
  for (const mode of ["ai", "duel"]) {
    const { context, calls, flushTimers } = harness(["snapshotMatchForLesson", "introModeFor", "startLevel"], { game: match(1, mode) });
    context.game.board[0] = Engine.HUMAN;
    context.game.moves.push({ cell: 0, player: Engine.HUMAN });
    context.game.turn = Engine.AI;
    context.game.lastMove = 0;
    const snapshot = context.snapshotMatchForLesson();
    context.selectedMode = mode === "ai" ? "duel" : "ai";
    context.startLevel(1, { introMode: "none", resumeMatch: snapshot });
    flushTimers();
    assert.equal(context.game.mode, mode);
    assert.equal(context.game.turn, Engine.AI);
    assert.equal(context.game.board[0], Engine.HUMAN);
    assert.equal(context.game.moves.length, 1);
    assert.equal(context.game.lastMove, 0);
    assert.equal(calls.ai, mode === "ai" ? 1 : 0);
    context.game.board[0] = Engine.EMPTY;
    context.game.moves[0].cell = 1;
    assert.equal(snapshot.board[0], Engine.HUMAN);
    assert.equal(snapshot.moves[0].cell, 0);
  }
});

test("H5 平面和曲面的按下预览按当前黑白棋色绘制", () => {
  const ctx = { save: noop, restore: noop, translate: noop, scale: noop, beginPath: noop, arc: noop, fill: noop, stroke: noop };
  for (const player of [Engine.HUMAN, Engine.AI]) {
    const { context, calls } = harness(["drawMovePreview", "drawInteractiveMovePreview"], { canPlaceCell: () => true });
    context.game.turn = player;
    context.renderState.pressedCell = 0;
    context.renderState.pressedAt = 100;
    context.drawMovePreview(ctx, 200);
    context.drawInteractiveMovePreview(ctx, 200, 1, {});
    assert.deepEqual(calls.stones, [player, player]);
    context.renderState.pressedCell = -1;
    context.renderState.hoverCell = 0;
    context.drawMovePreview(ctx, 200);
    assert.equal(ctx.fillStyle, player === Engine.HUMAN ? "#21302c" : "#f8f4e9");
    context.drawInteractiveMovePreview(ctx, 200, 1, {});
    assert.equal(ctx.fillStyle, player === Engine.HUMAN ? "#21302c" : "#f8f4e9");
  }
});

test("H5 双人提示始终优先当前执棋方的进攻四连", () => {
  const { context } = harness(["tacticalHintPriority"]);
  for (const player of [Engine.HUMAN, Engine.AI]) {
    context.game.turn = player;
    const attack = context.tacticalHintPriority({ player, kind: "four" });
    const defense = context.tacticalHintPriority({ player: -player, kind: "four" });
    assert.ok(attack > defense);
    assert.ok(defense > context.tacticalHintPriority({ player: -player, kind: "three" }));
  }
});

const POINTER_FUNCTIONS = [
  "rememberBoardPress", "isCurrentBoardPress",
  "canPlaceOnBoard", "canPlaceCell", "isInteractiveViewPointerMode", "clearInteractiveViewPointer",
  "beginInteractiveViewPointer", "onBoardPointerDown", "onBoardPointerUp", "onBoardPointerCancel",
  "performMove", "connectedSeamAtCell"
];

function pointer(pointerId, cell) {
  return { pointerId, cell, pointerType: "touch", clientX: cell * 10, clientY: 50, timeStamp: 100, preventDefault: noop };
}

test("H5 平面及曲面双指不会抢占首指，也不会一次手势连续落黑白两子", () => {
  for (const spatial of [false, true]) {
    const { context, calls } = harness(POINTER_FUNCTIONS);
    context.game.view = viewState(spatial);
    const first = pointer(1, 0);
    const second = pointer(2, 1);
    context.onBoardPointerDown(first);
    context.onBoardPointerDown(second);
    context.onBoardPointerUp(first);
    context.onBoardPointerUp(second);
    context.onBoardPointerUp(first);
    assert.equal(context.game.moves.length, 1, `spatial=${spatial}`);
    assert.equal(context.game.moves[0].cell, 0);
    assert.equal(context.game.moves[0].player, Engine.HUMAN);
    assert.equal(context.game.turn, Engine.AI);
    assert.equal(calls.ai, 0);
  }
});

test("H5 平面及曲面过期释放不能替换手后的棋手落子", () => {
  for (const spatial of [false, true]) {
    const { context } = harness(POINTER_FUNCTIONS);
    context.game.view = viewState(spatial);
    const press = pointer(1, 0);
    context.onBoardPointerDown(press);
    assert.equal(context.performMove(1, Engine.HUMAN), true);
    assert.equal(context.game.turn, Engine.AI);
    context.onBoardPointerUp(press);
    assert.equal(context.game.moves.length, 1, `spatial=${spatial}`);
    assert.equal(context.game.board[0], Engine.EMPTY);
    assert.equal(context.game.turn, Engine.AI);
  }
});

test("H5 平面及曲面从占用点按下或取消手势后释放，都不能产生落子", () => {
  for (const spatial of [false, true]) {
    const { context } = harness(POINTER_FUNCTIONS);
    context.game.view = viewState(spatial);
    assert.equal(context.performMove(0, Engine.HUMAN), true);
    const occupiedPress = pointer(1, 0);
    context.onBoardPointerDown(occupiedPress);
    context.onBoardPointerUp(pointer(1, 1));
    assert.equal(context.game.moves.length, 1, `occupied/spatial=${spatial}`);
    const cancelledPress = pointer(2, 1);
    context.onBoardPointerDown(cancelledPress);
    context.onBoardPointerCancel(cancelledPress);
    context.onBoardPointerUp(cancelledPress);
    assert.equal(context.game.moves.length, 1, `cancelled/spatial=${spatial}`);
    assert.equal(context.game.turn, Engine.AI);
  }
});

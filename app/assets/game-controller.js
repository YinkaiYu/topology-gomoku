(function attachTopologyGameController(root, factory) {
  "use strict";

  var Engine = root && root.TopologyGomoku;
  var Content = root && root.TopologyGameContent;
  var Replay = root && root.TopologyReplay;
  var Motion = root && root.TopologyBoardViewMotion;
  var Morph = root && root.TopologyMorph;
  if (typeof module === "object" && module.exports) {
    Engine = require("./topology.js");
    Content = require("./level-config.js");
    Replay = require("./game-replay.js");
    Motion = require("./board-view-motion.js");
    Morph = require("./topology-morph.js");
  }
  var api = factory(Engine, Content, Replay, Motion, Morph);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TopologyGameController = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function topologyGameControllerFactory(Engine, Content, Replay, Motion, Morph) {
  "use strict";

  if (!Engine || !Content || !Replay) {
    throw new Error("TopologyGameController requires topology, content and replay modules");
  }

  var STORAGE_KEY = "topology-gomoku:v1";
  var HUMAN = Engine.HUMAN;
  var AI = Engine.AI;
  var LEVELS = Content.LEVELS;
  var DIFFICULTIES = Content.DIFFICULTIES;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function copyMoves(moves) {
    return (moves || []).map(function copyMove(move) {
      return { cell: move.cell, player: move.player };
    });
  }

  function defaultPreferences() {
    return {
      unlocked: 0,
      completed: [],
      bestDifficulty: [],
      difficulty: "normal",
      hints: true,
      sound: true,
      learnedLevels: []
    };
  }

  function normalizePreferences(value) {
    var source = value && typeof value === "object" ? value : {};
    var prefs = defaultPreferences();
    prefs.unlocked = clamp(Math.round(Number(source.unlocked) || 0), 0, LEVELS.length - 1);
    prefs.completed = Array.isArray(source.completed) ? source.completed.slice(0, LEVELS.length) : [];
    prefs.bestDifficulty = Array.isArray(source.bestDifficulty)
      ? source.bestDifficulty.slice(0, LEVELS.length)
      : [];
    prefs.difficulty = DIFFICULTIES[source.difficulty] ? source.difficulty : "normal";
    prefs.hints = source.hints !== false;
    prefs.sound = source.sound !== false;
    var learned = Array.isArray(source.learnedLevels) ? source.learnedLevels : [];
    for (var index = 0; index < LEVELS.length; index += 1) {
      if ((learned.indexOf(index) >= 0 || prefs.completed[index]) && prefs.learnedLevels.indexOf(index) < 0) {
        prefs.learnedLevels.push(index);
      }
    }
    return prefs;
  }

  function clonePreferences(prefs) {
    return {
      unlocked: prefs.unlocked,
      completed: prefs.completed.slice(),
      bestDifficulty: prefs.bestDifficulty.slice(),
      difficulty: prefs.difficulty,
      hints: prefs.hints,
      sound: prefs.sound,
      learnedLevels: prefs.learnedLevels.slice()
    };
  }

  function GameController(options) {
    var settings = options || {};
    this.preferences = normalizePreferences(settings.preferences);
    this.random = typeof settings.random === "function" ? settings.random : Math.random;
    this.now = typeof settings.now === "function" ? settings.now : Date.now;
    this.scene = "home";
    this.selectedLevel = clamp(this.preferences.unlocked, 0, LEVELS.length - 1);
    this.game = null;
    this.events = [];
    this.scheduled = [];
    this.token = 0;
    this.pausedAt = null;
  }

  GameController.prototype._time = function time(value) {
    return Number.isFinite(value) ? value : this.now();
  };

  GameController.prototype._emit = function emit(type, detail) {
    this.events.push({ type: type, detail: detail || null });
  };

  GameController.prototype._changed = function changed() {
    this._emit("state");
  };

  GameController.prototype._persist = function persist() {
    this._emit("persist", clonePreferences(this.preferences));
  };

  GameController.prototype._sound = function sound(name) {
    this._emit("sound", { name: name });
  };

  GameController.prototype._invalidate = function invalidate() {
    this.token += 1;
    this.scheduled = [];
    return this.token;
  };

  GameController.prototype._schedule = function schedule(kind, delay, time, detail) {
    this.scheduled.push({
      kind: kind,
      due: this._time(time) + Math.max(0, delay || 0),
      token: this.token,
      detail: detail || null
    });
  };

  GameController.prototype.drainEvents = function drainEvents() {
    var pending = this.events.slice();
    this.events.length = 0;
    return pending;
  };

  GameController.prototype.nextScheduledAt = function nextScheduledAt() {
    if (this.pausedAt !== null) {
      return null;
    }
    var next = Infinity;
    for (var index = 0; index < this.scheduled.length; index += 1) {
      var item = this.scheduled[index];
      if (item.token === this.token && item.due < next) {
        next = item.due;
      }
    }
    return Number.isFinite(next) ? next : null;
  };

  GameController.prototype.getPreferences = function getPreferences() {
    return clonePreferences(this.preferences);
  };

  GameController.prototype.getState = function getState() {
    return {
      scene: this.scene,
      selectedLevel: this.selectedLevel,
      levels: LEVELS,
      difficulties: DIFFICULTIES,
      preferences: this.preferences,
      game: this.game
    };
  };

  GameController.prototype.hasLearnedLevel = function hasLearnedLevel(index) {
    return this.preferences.learnedLevels.indexOf(index) >= 0;
  };

  GameController.prototype._rememberLevel = function rememberLevel(index) {
    if (index < 0 || index >= LEVELS.length || this.hasLearnedLevel(index)) {
      return;
    }
    this.preferences.learnedLevels.push(index);
    this._persist();
  };

  GameController.prototype.setDifficulty = function setDifficulty(difficulty) {
    if (!DIFFICULTIES[difficulty] || this.preferences.difficulty === difficulty) {
      return false;
    }
    this.preferences.difficulty = difficulty;
    this._persist();
    this._sound("ui");
    this._changed();
    return true;
  };

  GameController.prototype.setHints = function setHints(enabled) {
    var next = Boolean(enabled);
    if (this.preferences.hints === next) {
      return false;
    }
    this.preferences.hints = next;
    this._persist();
    this._sound("ui");
    this._changed();
    return true;
  };

  GameController.prototype.setSound = function setSound(enabled) {
    var next = Boolean(enabled);
    if (this.preferences.sound === next) {
      return false;
    }
    this.preferences.sound = next;
    this._persist();
    this._emit("sound-enabled", { enabled: next });
    if (next) {
      this._sound("ui");
    }
    this._changed();
    return true;
  };

  GameController.prototype.selectLevel = function selectLevel(index, time) {
    var levelIndex = Math.round(Number(index));
    if (levelIndex < 0 || levelIndex >= LEVELS.length || levelIndex > this.preferences.unlocked) {
      this._sound("locked");
      return false;
    }
    this.selectedLevel = levelIndex;
    this._sound("ui");
    return this.startLevel(levelIndex, {}, time);
  };

  GameController.prototype._introModeFor = function introModeFor(levelIndex, options) {
    if (levelIndex === 0) {
      return "lesson";
    }
    if (options && options.introMode) {
      return options.introMode;
    }
    if (options && options.skipDemo) {
      return "none";
    }
    return this.hasLearnedLevel(levelIndex) ? "demo" : "lesson";
  };

  GameController.prototype.startLevel = function startLevel(index, options, time) {
    var levelIndex = clamp(Math.round(Number(index) || 0), 0, LEVELS.length - 1);
    var level = LEVELS[levelIndex];
    var settings = options || {};
    var introMode = this._introModeFor(levelIndex, settings);
    var resumeMatch = settings.resumeMatch && settings.resumeMatch.levelIndex === levelIndex
      ? settings.resumeMatch
      : null;
    var now = this._time(time);
    this._invalidate();
    this.scene = "game";
    this.selectedLevel = levelIndex;
    this.game = {
      levelIndex: levelIndex,
      level: level,
      rules: Engine.createRules({
        type: level.topology,
        width: level.width,
        height: level.height,
        target: 5
      }),
      board: null,
      moves: [],
      turn: HUMAN,
      status: "playing",
      outcome: null,
      winningMask: null,
      winReason: null,
      autoAdvancePending: false,
      lastMove: -1,
      lastMoveAt: 0,
      lastMoveFromPress: false,
      seamPulseAt: 0,
      seamPulseBits: 0,
      winAt: 0,
      demo: null,
      lesson: null,
      lessonReturn: settings.lessonReturn || null,
      review: null,
      viewMode: "board",
      view: Motion.create(),
      completionAvailable: false
    };
    this.game.board = Engine.createBoard(this.game.rules);
    if (resumeMatch && resumeMatch.board && resumeMatch.board.length === this.game.board.length) {
      for (var cell = 0; cell < this.game.board.length; cell += 1) {
        this.game.board[cell] = resumeMatch.board[cell];
      }
      this.game.moves = copyMoves(resumeMatch.moves);
      this.game.turn = resumeMatch.turn;
      this.game.lastMove = resumeMatch.lastMove;
    }
    if (introMode === "lesson") {
      this._startBoundaryLesson(now);
    } else if (introMode === "demo") {
      this._startBoundaryDemo(now);
    } else if (resumeMatch && this.game.turn === AI) {
      this._scheduleAi(now);
    }
    this._emit("navigate", { scene: "game", levelIndex: levelIndex });
    this._changed();
    return true;
  };

  GameController.prototype.leaveGame = function leaveGame() {
    if (!this.game) {
      return false;
    }
    this._invalidate();
    this.scene = "home";
    this.game = null;
    this._sound("ui");
    this._emit("navigate", { scene: "home" });
    this._changed();
    return true;
  };

  GameController.prototype.restart = function restart(time) {
    if (!this.game) {
      return false;
    }
    var levelIndex = this.game.levelIndex;
    this._sound("ui");
    return this.startLevel(levelIndex, { introMode: "demo" }, time);
  };

  GameController.prototype.nextLevel = function nextLevel(time) {
    if (!this.game || this.game.status !== "ended") {
      return false;
    }
    var passed = this.game.outcome === "win" || this.game.outcome === "draw";
    if (!passed || this.game.levelIndex >= LEVELS.length - 1) {
      return false;
    }
    this._sound("ui");
    return this.startLevel(this.game.levelIndex + 1, {}, time);
  };

  GameController.prototype._traceDefinition = function traceDefinition(definition) {
    if (!this.game || !definition) {
      return null;
    }
    var startCell = Engine.toCell(this.game.rules, definition.start[0], definition.start[1]);
    var path = Engine.tracePath(this.game.rules, startCell, definition.direction, this.game.rules.target);
    if (!path) {
      return null;
    }
    path.prompts = definition.prompts || Content.TUTORIAL_PROMPTS;
    path.direction = definition.direction;
    return path;
  };

  GameController.prototype._guidePaths = function guidePaths() {
    var controller = this;
    if (!this.game) {
      return [];
    }
    return (this.game.level.lessonPaths || []).map(function trace(definition) {
      return controller._traceDefinition(definition);
    }).filter(Boolean);
  };

  GameController.prototype._lessonPaths = function lessonPaths() {
    if (!this.game || !this.game.level.tutorial) {
      return this._guidePaths();
    }
    var board = Engine.createBoard(this.game.rules);
    var cells = [];
    var lastCell = -1;
    for (var index = 0; index < this.game.rules.target; index += 1) {
      var cell = Engine.suggestTutorialMove(board, this.game.rules, lastCell);
      if (cell < 0) {
        return [];
      }
      cells.push(cell);
      board[cell] = HUMAN;
      lastCell = cell;
    }
    return [{
      cells: cells,
      seams: [0, 0, 0, 0],
      directions: [0, 0, 0, 0, 0],
      prompts: Content.TUTORIAL_PROMPTS,
      direction: 0
    }];
  };

  GameController.prototype._activateLessonPath = function activateLessonPath(pathIndex, time) {
    var lesson = this.game.lesson;
    var path = lesson.paths[pathIndex];
    lesson.pathIndex = pathIndex;
    lesson.cells = path.cells;
    lesson.seams = path.seams;
    lesson.directions = path.directions;
    lesson.prompts = path.prompts;
    lesson.step = 0;
    lesson.startedAt = this._time(time);
  };

  GameController.prototype._startBoundaryLesson = function startBoundaryLesson(time) {
    var paths = this._lessonPaths();
    if (!paths.length) {
      return false;
    }
    this.game.lesson = {
      active: true,
      completed: false,
      paths: paths,
      pathIndex: 0
    };
    this._activateLessonPath(0, time);
    this.game.turn = HUMAN;
    return true;
  };

  GameController.prototype._activateDemoPath = function activateDemoPath(pathIndex, time) {
    var demo = this.game.demo;
    var path = demo.paths[pathIndex];
    demo.pathIndex = pathIndex;
    demo.startedAt = this._time(time);
    demo.cells = path.cells;
    demo.seams = path.seams;
    demo.directions = path.directions;
    demo.duration = (path.cells.length - 1) * demo.dropInterval + demo.hold + demo.fade;
    this._schedule("demo-path", demo.duration, time);
  };

  GameController.prototype._startBoundaryDemo = function startBoundaryDemo(time) {
    var paths = this._guidePaths();
    if (!paths.length) {
      return false;
    }
    this.game.demo = {
      active: true,
      paths: paths,
      pathIndex: 0,
      dropInterval: 245,
      hold: 390,
      fade: 330
    };
    this._activateDemoPath(0, time);
    return true;
  };

  GameController.prototype.skipDemo = function skipDemo() {
    if (!this.game || !this.game.demo || !this.game.demo.active) {
      return false;
    }
    this.scheduled = this.scheduled.filter(function keepNonDemo(item) {
      return item.kind !== "demo-path";
    });
    this.game.demo.active = false;
    this._changed();
    return true;
  };

  GameController.prototype._advanceDemo = function advanceDemo(time) {
    if (!this.game || !this.game.demo || !this.game.demo.active) {
      return false;
    }
    var demo = this.game.demo;
    if (demo.pathIndex < demo.paths.length - 1) {
      this._activateDemoPath(demo.pathIndex + 1, time);
    } else {
      demo.active = false;
    }
    this._changed();
    return true;
  };

  GameController.prototype.snapshotMatch = function snapshotMatch() {
    if (!this.game || this.game.status !== "playing" || (this.game.lesson && this.game.lesson.active)) {
      return null;
    }
    return {
      levelIndex: this.game.levelIndex,
      board: Array.prototype.slice.call(this.game.board),
      moves: copyMoves(this.game.moves),
      turn: this.game.turn,
      lastMove: this.game.lastMove
    };
  };

  GameController.prototype.replayBoundaryLesson = function replayBoundaryLesson(time) {
    if (!this.game || this.game.levelIndex === 0 || this.game.status !== "playing") {
      return false;
    }
    var levelIndex = this.game.levelIndex;
    var lessonReturn = this.game.lessonReturn || this.snapshotMatch();
    if (!lessonReturn) {
      return false;
    }
    this._sound("ui");
    return this.startLevel(levelIndex, {
      introMode: "lesson",
      lessonReturn: lessonReturn
    }, time);
  };

  GameController.prototype.isInteractiveLesson = function isInteractiveLesson() {
    return Boolean(this.game && this.game.lesson && this.game.lesson.active);
  };

  GameController.prototype.lessonPrompt = function lessonPrompt() {
    if (!this.game) {
      return "";
    }
    if (!this.game.lesson) {
      return this.game.level.ruleText;
    }
    var step = this.game.lesson.step;
    var prompts = this.game.lesson.prompts || Content.TUTORIAL_PROMPTS;
    return prompts[Math.min(step, prompts.length - 1)];
  };

  GameController.prototype.canPlaceCell = function canPlaceCell(cell) {
    if (this.pausedAt !== null || (this.game && Motion.busy(this.game.view))) { return false; }
    if (!this.game || this.game.status !== "playing" || this.game.turn !== HUMAN) {
      return false;
    }
    if (this.game.demo && this.game.demo.active) {
      return false;
    }
    if (cell < 0 || cell >= this.game.board.length || this.game.board[cell] !== Engine.EMPTY) {
      return false;
    }
    if (this.isInteractiveLesson()) {
      return this.game.lesson.cells[this.game.lesson.step] === cell;
    }
    return true;
  };

  GameController.prototype._connectedSeamAtCell = function connectedSeamAtCell(cell) {
    var point = Engine.toPoint(this.game.rules, cell);
    var bits = 0;
    if (this.game.level.topology === "sphere") {
      if (point.x === 0 || point.y === 0) {
        bits |= Engine.SEAM_X;
      }
      if (point.x === this.game.rules.width - 1 || point.y === this.game.rules.height - 1) {
        bits |= Engine.SEAM_Y;
      }
      return bits;
    }
    if (this.game.level.xConnection && (point.x === 0 || point.x === this.game.rules.width - 1)) {
      bits |= Engine.SEAM_X;
    }
    if (this.game.level.yConnection && (point.y === 0 || point.y === this.game.rules.height - 1)) {
      bits |= Engine.SEAM_Y;
    }
    return bits;
  };

  GameController.prototype.performMove = function performMove(cell, player, options, time) {
    if (this.pausedAt !== null || (this.game && Motion.busy(this.game.view))) { return false; }
    var activePlayer = typeof player === "number" ? player : HUMAN;
    if (!this.game || this.game.status !== "playing" || this.game.board[cell] !== Engine.EMPTY) {
      return false;
    }
    var lesson = this.isInteractiveLesson() ? this.game.lesson : null;
    if (lesson && (activePlayer !== HUMAN || lesson.cells[lesson.step] !== cell)) {
      return false;
    }
    if (!lesson && activePlayer === HUMAN && !this.canPlaceCell(cell)) {
      return false;
    }
    var now = this._time(time);
    this.game.board[cell] = activePlayer;
    this.game.moves.push({ cell: cell, player: activePlayer });
    this.game.lastMove = cell;
    this.game.lastMoveAt = now;
    this.game.lastMoveFromPress = Boolean(options && options.fromPress);

    var lessonSeam = lesson && lesson.step > 0 ? lesson.seams[lesson.step - 1] : 0;
    var seamBits = lessonSeam || this._connectedSeamAtCell(cell);
    if (seamBits) {
      this.game.seamPulseAt = now;
      this.game.seamPulseBits = seamBits;
      this._sound("seam");
    }
    this._sound(activePlayer === HUMAN ? "move-human" : "move-ai");
    if (lesson) {
      lesson.step += 1;
    }

    var winningMask = Engine.checkWin(this.game.board, this.game.rules, cell, activePlayer);
    if (winningMask) {
      if (lesson && (this.game.lessonReturn || !this.game.level.tutorial)) {
        this._finishBoundaryLesson(winningMask, now);
      } else {
        this._finishGame(activePlayer === HUMAN ? "win" : "lose", winningMask, null, now);
      }
    } else if (this.game.level.tutorial || lesson) {
      this.game.turn = HUMAN;
    } else if (Engine.playerWinsByBlockingAi(this.game.board, this.game.rules)) {
      this._finishGame("win", null, "blocked", now);
    } else if (Engine.playerHasNoWinningPath(this.game.board, this.game.rules)) {
      this._finishGame("win", null, "settled", now);
    } else if (Engine.boardIsFull(this.game.board)) {
      this._finishGame("draw", null, null, now);
    } else if (activePlayer === HUMAN) {
      this.game.turn = AI;
      this._scheduleAi(now);
    } else {
      this.game.turn = HUMAN;
    }
    this._changed();
    return true;
  };

  GameController.prototype._finishBoundaryLesson = function finishBoundaryLesson(winningMask, time) {
    var lesson = this.game.lesson;
    var hasNextPath = lesson.pathIndex < lesson.paths.length - 1;
    this.scheduled = [];
    lesson.active = false;
    lesson.completed = true;
    this.game.status = hasNextPath ? "lesson-line-complete" : "lesson-complete";
    this.game.turn = 0;
    this.game.winningMask = winningMask;
    this.game.winAt = this._time(time);
    if (!hasNextPath) {
      this._rememberLevel(this.game.levelIndex);
    }
    this._sound("win");
    this._schedule("lesson-continuation", hasNextPath ? 920 : 1080, time, {
      hasNextPath: hasNextPath
    });
  };

  GameController.prototype._continueLesson = function continueLesson(detail, time) {
    if (!this.game || !this.game.lesson) {
      return false;
    }
    if (detail && detail.hasNextPath) {
      this.game.board.fill(Engine.EMPTY);
      this.game.moves = [];
      this.game.lastMove = -1;
      this.game.winningMask = null;
      this.game.status = "playing";
      this.game.turn = HUMAN;
      this.game.lesson.active = true;
      this.game.lesson.completed = false;
      this._activateLessonPath(this.game.lesson.pathIndex + 1, time);
      this.game.lastMoveAt = 0;
      this.game.seamPulseAt = 0;
      this.game.winAt = 0;
      this._changed();
      return true;
    }
    var levelIndex = this.game.levelIndex;
    var resumeMatch = this.game.lessonReturn;
    return this.startLevel(levelIndex, {
      introMode: "none",
      resumeMatch: resumeMatch || null
    }, time);
  };

  GameController.prototype._scheduleAi = function scheduleAi(time) {
    this.scheduled = this.scheduled.filter(function keepNonAi(item) {
      return item.kind !== "ai";
    });
    this._schedule("ai", DIFFICULTIES[this.preferences.difficulty].wait, time);
  };

  GameController.prototype._runAi = function runAi(time) {
    if (!this.game || this.game.status !== "playing" || this.game.turn !== AI) {
      return false;
    }
    if (Motion.busy(this.game.view)) {
      this._schedule("ai", 60, time);
      return false;
    }
    var cell = Engine.chooseMove(this.game.board, this.game.rules, this.preferences.difficulty, this.random);
    if (cell < 0) {
      return false;
    }
    return this.performMove(cell, AI, null, time);
  };

  GameController.prototype._finishGame = function finishGame(outcome, winningMask, reason, time) {
    var now = this._time(time);
    var passed = outcome === "win" || outcome === "draw";
    var firstLevelAutoAdvance = passed && this.game.levelIndex === 0 && LEVELS.length > 1;
    this._invalidate();
    this.game.status = "ended";
    this.game.outcome = outcome;
    this.game.turn = 0;
    this.game.winningMask = winningMask;
    this.game.winReason = reason || null;
    this.game.review = null;
    this.game.autoAdvancePending = firstLevelAutoAdvance;
    this.game.winAt = now;
    this.game.completionAvailable = this.game.levelIndex > 0;
    var shouldMorph = this.game.completionAvailable && (passed || this.game.view.progress > 0.001);
    this.game.viewMode = shouldMorph ? "surface" : "board";
    if (shouldMorph) {
      Motion.finish(this.game.view, now, winningMask
        ? Morph.createPresentation(this.game.level.topology, this.game.rules, Array.prototype.slice.call(winningMask.cells))
        : null);
    }
    if (winningMask && winningMask.seam) {
      this.game.seamPulseAt = now;
      this.game.seamPulseBits = winningMask.seam;
    }
    if (passed) {
      this._rememberLevel(this.game.levelIndex);
      this.preferences.completed[this.game.levelIndex] = true;
      this.preferences.bestDifficulty[this.game.levelIndex] = Math.max(
        Number(this.preferences.bestDifficulty[this.game.levelIndex]) || 0,
        DIFFICULTIES[this.preferences.difficulty].rank
      );
      if (this.game.levelIndex < LEVELS.length - 1) {
        this.preferences.unlocked = Math.max(this.preferences.unlocked, this.game.levelIndex + 1);
      }
      this._persist();
      this._sound(outcome === "win" ? "win" : "draw");
      if (this.game.completionAvailable) {
        this._sound("morph");
      }
      if (firstLevelAutoAdvance) {
        this._schedule("auto-advance", Content.TUTORIAL_AUTO_ADVANCE_DELAY, now);
      }
    } else if (outcome === "lose") {
      this._sound("lose");
    }
  };

  GameController.prototype.undo = function undo(time) {
    if (this.game && Motion.busy(this.game.view)) { return false; }
    if (!this.game || this.game.status !== "playing" || !this.game.moves.length) {
      return false;
    }
    this._invalidate();
    var lessonActive = this.isInteractiveLesson();
    var removeCount = this.game.level.tutorial || lessonActive
      ? 1
      : (this.game.turn === AI ? 1 : Math.min(2, this.game.moves.length));
    while (removeCount > 0 && this.game.moves.length) {
      var move = this.game.moves.pop();
      this.game.board[move.cell] = Engine.EMPTY;
      removeCount -= 1;
    }
    this.game.lastMove = this.game.moves.length
      ? this.game.moves[this.game.moves.length - 1].cell
      : -1;
    if (lessonActive) {
      this.game.lesson.step = this.game.moves.length;
    }
    this.game.turn = HUMAN;
    this.game.lastMoveAt = this._time(time);
    this.game.seamPulseAt = 0;
    this._sound("ui");
    this._changed();
    return true;
  };

  GameController.prototype.canUseViewControl = function canUseViewControl() {
    var game = this.game;
    return Boolean(game && this.pausedAt === null && !game.level.tutorial
      && !this.isInteractiveLesson() && !(game.demo && game.demo.active)
      && (game.status === "playing" || (game.status === "ended" && !game.autoAdvancePending))
      && !(game.view.completion && !game.view.completion.settled));
  };

  GameController.prototype.setViewProgress = function setViewProgress(value, animate, time, touch) {
    if (!this.canUseViewControl()) { return false; }
    if (this.game.status === "ended" && !this.game.view.completion && Number(value) > 0.001) {
      Motion.finish(this.game.view, this._time(time), this.game.winningMask
        ? Morph.createPresentation(this.game.level.topology, this.game.rules, Array.prototype.slice.call(this.game.winningMask.cells))
        : null);
      this.game.view.completion.settled = true;
    }
    Motion.setProgress(this.game.view, value, this._time(time), animate, touch);
    this.game.viewMode = this.game.view.progress > 0.001 ? "surface" : "board";
    this._changed();
    return true;
  };

  GameController.prototype.setViewScrubbing = function setViewScrubbing(value) {
    if (!this.game || (value && !this.canUseViewControl())) { return false; }
    this.game.view.scrubbing = Boolean(value);
    if (value) { this.game.view.transitioning = false; }
    this._changed();
    return true;
  };

  GameController.prototype.toggleDimension = function toggleDimension() {
    if (!this.setViewProgress(this.game && this.game.view.progress < 0.5 ? 1 : 0, true)) { return false; }
    this._sound("ui");
    this._changed();
    return true;
  };

  GameController.prototype.beginReplay = function beginReplay() {
    if (this.game && Motion.busy(this.game.view)) { return false; }
    if (!this.game || this.game.status !== "ended" || this.game.review) {
      return false;
    }
    this.game.review = { step: this.game.moves.length, total: this.game.moves.length };
    this.game.board = Replay.boardAt(
      this.game.moves,
      this.game.rules.cellCount,
      this.game.review.step,
      Engine.EMPTY
    );
    this._sound("ui");
    this._changed();
    return true;
  };

  GameController.prototype.stepReplay = function stepReplay(direction, time) {
    if (this.game && Motion.busy(this.game.view)) { return false; }
    if (!this.game || !this.game.review) {
      return false;
    }
    var next = Replay.clampStep(this.game.review.step + direction, this.game.review.total);
    if (next === this.game.review.step) {
      return false;
    }
    this.game.review.step = next;
    this.game.board = Replay.boardAt(this.game.moves, this.game.rules.cellCount, next, Engine.EMPTY);
    this.game.lastMove = next > 0 ? this.game.moves[next - 1].cell : -1;
    this.game.lastMoveAt = direction > 0 ? this._time(time) : 0;
    this._sound("ui");
    this._changed();
    return true;
  };

  GameController.prototype.endReplay = function endReplay() {
    if (!this.game || !this.game.review) {
      return false;
    }
    this.game.board = Replay.boardAt(
      this.game.moves,
      this.game.rules.cellCount,
      this.game.review.total,
      Engine.EMPTY
    );
    this.game.lastMove = this.game.moves.length ? this.game.moves[this.game.moves.length - 1].cell : -1;
    this.game.review = null;
    this._sound("ui");
    this._changed();
    return true;
  };

  GameController.prototype.statusText = function statusText() {
    if (!this.game) {
      return "";
    }
    var game = this.game;
    if (game.review) {
      return Replay.progressTitle(game.review.step) + " · " + game.review.step + " / " + game.review.total;
    }
    if (game.demo && game.demo.active) {
      return "边界演示";
    }
    if (game.status === "lesson-line-complete") {
      return "再看一条连线";
    }
    if (game.status === "lesson-complete") {
      return "边界已懂";
    }
    if (game.status === "ended") {
      return game.autoAdvancePending
        ? "下一关"
        : Replay.resultText(game.outcome, game.moves.length);
    }
    if (game.turn === AI) {
      return "思考中";
    }
    if (this.isInteractiveLesson()) {
      return this.lessonPrompt();
    }
    if (game.level.tutorial) {
      return "自由落子";
    }
    return "你的回合";
  };

  GameController.prototype.tick = function tick(time) {
    if (this.pausedAt !== null) {
      return false;
    }
    var now = this._time(time);
    var viewChanged = this.game ? Motion.tick(this.game.view, now) : false;
    if (this.game) { this.game.viewMode = this.game.view.progress > 0.001 ? "surface" : "board"; }
    var due = [];
    var future = [];
    for (var index = 0; index < this.scheduled.length; index += 1) {
      var item = this.scheduled[index];
      if (item.token !== this.token) {
        continue;
      }
      if (item.due <= now) {
        due.push(item);
      } else {
        future.push(item);
      }
    }
    this.scheduled = future;
    var changed = viewChanged;
    for (var dueIndex = 0; dueIndex < due.length; dueIndex += 1) {
      var action = due[dueIndex];
      if (action.token !== this.token) {
        continue;
      }
      if (action.kind === "ai") {
        changed = this._runAi(now) || changed;
      } else if (action.kind === "demo-path") {
        changed = this._advanceDemo(now) || changed;
      } else if (action.kind === "lesson-continuation") {
        changed = this._continueLesson(action.detail, now) || changed;
      } else if (action.kind === "auto-advance" && this.game && this.game.autoAdvancePending) {
        this.game.autoAdvancePending = false;
        changed = this.startLevel(1, {}, now) || changed;
      }
    }
    return changed;
  };

  GameController.prototype.pause = function pause(time) {
    if (this.pausedAt !== null) {
      return;
    }
    this.pausedAt = this._time(time);
  };

  GameController.prototype.resume = function resume(time) {
    if (this.pausedAt === null) {
      return;
    }
    var now = this._time(time);
    var shift = Math.max(0, now - this.pausedAt);
    this.scheduled.forEach(function shiftScheduled(item) {
      item.due += shift;
    });
    if (this.game && shift > 0) {
      this.game.view.startedAt += shift;
      if (this.game.view.completion) { this.game.view.completion.startedAt += shift; }
      ["lastMoveAt", "seamPulseAt", "winAt"].forEach(function shiftTimestamp(key) {
        if (this.game[key]) {
          this.game[key] += shift;
        }
      }, this);
      if (this.game.demo && this.game.demo.startedAt) {
        this.game.demo.startedAt += shift;
      }
      if (this.game.lesson && this.game.lesson.startedAt) {
        this.game.lesson.startedAt += shift;
      }
    }
    this.pausedAt = null;
    this._changed();
  };

  return {
    STORAGE_KEY: STORAGE_KEY,
    defaultPreferences: defaultPreferences,
    normalizePreferences: normalizePreferences,
    GameController: GameController
  };
});

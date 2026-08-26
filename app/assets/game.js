(function topologyGomokuApp() {
  "use strict";

  var Engine = window.TopologyGomoku;
  var STORAGE_KEY = "topology-gomoku:v1";
  var HUMAN = Engine.HUMAN;
  var AI = Engine.AI;
  var DEV_MODE = isDeveloperLaunch();

  var LEVELS = [
    {
      name: "方庭",
      typeName: "平面",
      topology: "plane",
      width: 7,
      height: 7,
      edgeText: "有边界",
      xConnection: null,
      yConnection: null,
      ruleTitle: "四边有界",
      ruleText: "横、竖、斜，连成五子",
      demoStart: [1, 3],
      demoDirection: 0
    },
    {
      name: "回廊",
      typeName: "圆柱",
      topology: "cylinder",
      width: 7,
      height: 6,
      edgeText: "左右相接",
      xConnection: "same",
      yConnection: null,
      ruleTitle: "左右相接",
      ruleText: "越过一边，从另一边继续",
      demoStart: [5, 2],
      demoDirection: 0
    },
    {
      name: "环游",
      typeName: "环面",
      topology: "torus",
      width: 7,
      height: 6,
      edgeText: "四边相接",
      xConnection: "same",
      yConnection: "same",
      ruleTitle: "四边相接",
      ruleText: "上下左右，都没有尽头",
      demoStart: [5, 4],
      demoDirection: 1
    },
    {
      name: "扭带",
      typeName: "莫比乌斯",
      topology: "mobius",
      width: 8,
      height: 6,
      edgeText: "左右翻转",
      xConnection: "twist",
      yConnection: null,
      ruleTitle: "左右翻转",
      ruleText: "越过边界，上下镜像",
      demoStart: [6, 1],
      demoDirection: 0
    },
    {
      name: "瓶界",
      typeName: "克莱因瓶",
      topology: "klein",
      width: 7,
      height: 6,
      edgeText: "一扭一环",
      xConnection: "twist",
      yConnection: "same",
      ruleTitle: "一扭一环",
      ruleText: "一组翻转，一组相接",
      demoStart: [5, 4],
      demoDirection: 1
    },
    {
      name: "双生面",
      typeName: "射影平面",
      topology: "projective",
      width: 8,
      height: 8,
      edgeText: "双向翻转",
      xConnection: "twist",
      yConnection: "twist",
      ruleTitle: "双向翻转",
      ruleText: "每条边，都通向镜面",
      demoStart: [1, 6],
      demoDirection: 2
    }
  ];

  var DIFFICULTIES = {
    easy: { label: "悠闲", wait: 390, rank: 1 },
    normal: { label: "敏捷", wait: 520, rank: 2 },
    hard: { label: "深思", wait: 680, rank: 3 }
  };

  var dom = {
    appShell: document.getElementById("appShell"),
    homeScreen: document.getElementById("homeScreen"),
    gameScreen: document.getElementById("gameScreen"),
    levelGrid: document.getElementById("levelGrid"),
    levelCards: Array.prototype.slice.call(document.querySelectorAll(".level-card")),
    progressCount: document.getElementById("progressCount"),
    startButton: document.getElementById("startButton"),
    startButtonText: document.getElementById("startButtonText"),
    homeSettingsButton: document.getElementById("homeSettingsButton"),
    gameSettingsButton: document.getElementById("gameSettingsButton"),
    backButton: document.getElementById("backButton"),
    gameLevelNumber: document.getElementById("gameLevelNumber"),
    gameLevelName: document.getElementById("gameLevelName"),
    difficultyLabel: document.getElementById("difficultyLabel"),
    humanChip: document.getElementById("humanChip"),
    aiChip: document.getElementById("aiChip"),
    turnStatus: document.getElementById("turnStatus"),
    boardStage: document.getElementById("boardStage"),
    boardCanvas: document.getElementById("boardCanvas"),
    thinkingIndicator: document.getElementById("thinkingIndicator"),
    ruleCaption: document.getElementById("ruleCaption"),
    ruleCaptionTitle: document.getElementById("ruleCaptionTitle"),
    ruleCaptionText: document.getElementById("ruleCaptionText"),
    undoButton: document.getElementById("undoButton"),
    restartButton: document.getElementById("restartButton"),
    scrim: document.getElementById("scrim"),
    settingsSheet: document.getElementById("settingsSheet"),
    closeSettingsButton: document.getElementById("closeSettingsButton"),
    settingsDoneButton: document.getElementById("settingsDoneButton"),
    difficultyButtons: Array.prototype.slice.call(document.querySelectorAll("[data-difficulty]")),
    hintSwitch: document.getElementById("hintSwitch"),
    soundSwitch: document.getElementById("soundSwitch"),
    resultSheet: document.getElementById("resultSheet"),
    resultKicker: document.getElementById("resultKicker"),
    resultTitle: document.getElementById("resultTitle"),
    resultText: document.getElementById("resultText"),
    resultRetryButton: document.getElementById("resultRetryButton"),
    resultNextButton: document.getElementById("resultNextButton"),
    developerButton: document.getElementById("developerButton"),
    developerSheet: document.getElementById("developerSheet"),
    closeDeveloperButton: document.getElementById("closeDeveloperButton"),
    developerDoneButton: document.getElementById("developerDoneButton"),
    developerGameControls: document.getElementById("developerGameControls"),
    developerGameStatus: document.getElementById("developerGameStatus"),
    developerPauseSwitch: document.getElementById("developerPauseSwitch"),
    developerPlayerButtons: Array.prototype.slice.call(document.querySelectorAll("[data-developer-player]")),
    developerUnlockButtons: Array.prototype.slice.call(document.querySelectorAll("[data-developer-unlock]")),
    developerPlayerWin: document.getElementById("developerPlayerWin"),
    developerAiWin: document.getElementById("developerAiWin"),
    developerClearBoard: document.getElementById("developerClearBoard"),
    developerHintThree: document.getElementById("developerHintThree"),
    developerHintFour: document.getElementById("developerHintFour"),
    developerResetProgress: document.getElementById("developerResetProgress"),
    toast: document.getElementById("toast")
  };

  var prefs = loadPreferences();
  var selectedLevel = Math.min(prefs.unlocked, LEVELS.length - 1);
  var game = null;
  var turnToken = 0;
  var activeSheet = null;
  var toastTimer = 0;
  var resultSecondaryAction = null;
  var resultPrimaryAction = null;
  var developer = {
    aiPaused: false,
    placementPlayer: HUMAN
  };

  var renderState = {
    context: dom.boardCanvas.getContext("2d"),
    width: 0,
    height: 0,
    dpr: 1,
    layout: null,
    frame: 0,
    hoverCell: -1,
    pressedCell: -1,
    pointerId: null,
    lastMoveAt: 0,
    seamPulseAt: 0,
    seamPulseBits: 0,
    winAt: 0
  };

  function isDeveloperLaunch() {
    var search = window.location.search || "";
    var hash = window.location.hash || "";
    return /(?:^|[?&])dev=1(?:&|$)/.test(search) || hash === "#dev";
  }

  function defaultPreferences() {
    return {
      unlocked: 0,
      completed: [],
      bestDifficulty: [],
      difficulty: "normal",
      hints: true,
      sound: true
    };
  }

  function loadPreferences() {
    var defaults = defaultPreferences();
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!stored || typeof stored !== "object") {
        return defaults;
      }
      defaults.unlocked = Math.max(0, Math.min(LEVELS.length - 1, Number(stored.unlocked) || 0));
      defaults.completed = Array.isArray(stored.completed) ? stored.completed.slice(0, LEVELS.length) : [];
      defaults.bestDifficulty = Array.isArray(stored.bestDifficulty) ? stored.bestDifficulty.slice(0, LEVELS.length) : [];
      defaults.difficulty = DIFFICULTIES[stored.difficulty] ? stored.difficulty : "normal";
      defaults.hints = stored.hints !== false;
      defaults.sound = stored.sound !== false;
      return defaults;
    } catch (error) {
      return defaults;
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (error) {
      /* The game still works when storage is temporarily unavailable. */
    }
  }

  function SoundEngine() {
    this.context = null;
    this.enabled = prefs.sound;
  }

  SoundEngine.prototype.unlock = function unlock() {
    if (!this.enabled) {
      return;
    }
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    if (!this.context) {
      this.context = new AudioContextClass();
    }
    if (this.context.state === "suspended") {
      this.context.resume();
    }
  };

  SoundEngine.prototype.setEnabled = function setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.unlock();
    }
  };

  SoundEngine.prototype.tone = function tone(frequency, duration, delay, type, volume, endFrequency) {
    if (!this.enabled || !this.context) {
      return;
    }
    var now = this.context.currentTime + (delay || 0);
    var oscillator = this.context.createOscillator();
    var gain = this.context.createGain();
    oscillator.type = type || "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume || 0.04, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  };

  SoundEngine.prototype.play = function play(name) {
    if (!this.enabled) {
      return;
    }
    this.unlock();
    if (!this.context) {
      return;
    }
    if (name === "move-human") {
      this.tone(186, 0.09, 0, "triangle", 0.035, 132);
      this.tone(372, 0.045, 0.008, "sine", 0.012, 310);
    } else if (name === "move-ai") {
      this.tone(248, 0.075, 0, "triangle", 0.028, 194);
      this.tone(512, 0.04, 0.012, "sine", 0.01, 430);
    } else if (name === "seam") {
      this.tone(480, 0.12, 0, "sine", 0.018, 620);
      this.tone(720, 0.15, 0.085, "sine", 0.014, 860);
    } else if (name === "win") {
      this.tone(392, 0.28, 0, "sine", 0.025, 440);
      this.tone(523, 0.31, 0.13, "sine", 0.025, 587);
      this.tone(659, 0.4, 0.27, "sine", 0.028, 784);
    } else if (name === "lose") {
      this.tone(220, 0.42, 0, "triangle", 0.026, 146);
    } else if (name === "draw") {
      this.tone(294, 0.18, 0, "sine", 0.018, 294);
      this.tone(262, 0.2, 0.12, "sine", 0.015, 262);
    } else {
      this.tone(520, 0.045, 0, "sine", 0.012, 440);
    }
  };

  var sound = new SoundEngine();

  function padLevelNumber(index) {
    return String(index + 1).padStart(2, "0");
  }

  function updateHome() {
    var completeCount = 0;
    dom.levelCards.forEach(function updateCard(card, index) {
      var locked = index > prefs.unlocked;
      var complete = Boolean(prefs.completed[index]);
      card.classList.toggle("is-locked", locked);
      card.classList.toggle("is-complete", complete);
      card.classList.toggle("is-selected", index === selectedLevel && !locked);
      card.setAttribute("aria-disabled", locked ? "true" : "false");
      if (complete) {
        completeCount += 1;
      }
    });
    dom.progressCount.textContent = completeCount + " / " + LEVELS.length;
    dom.startButtonText.textContent = "进入" + LEVELS[selectedLevel].name;
  }

  function selectLevel(index) {
    if (index > prefs.unlocked) {
      var card = dom.levelCards[index];
      card.classList.remove("is-shaking");
      void card.offsetWidth;
      card.classList.add("is-shaking");
      showToast("先通过上一关");
      sound.play("ui");
      return;
    }
    selectedLevel = index;
    updateHome();
    sound.play("ui");
  }

  function showScreen(screen) {
    dom.appShell.scrollTop = 0;
    dom.appShell.scrollLeft = 0;
    dom.homeScreen.classList.toggle("is-active", screen === "home");
    dom.gameScreen.classList.toggle("is-active", screen === "game");
    requestAnimationFrame(function keepRootAnchored() {
      dom.appShell.scrollTop = 0;
      dom.appShell.scrollLeft = 0;
    });
  }

  function startLevel(index, options) {
    var level = LEVELS[index];
    var skipDemo = options && options.skipDemo;
    turnToken += 1;
    selectedLevel = index;
    closeActiveSheet(true);
    game = {
      levelIndex: index,
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
      winningMask: null,
      winReason: null,
      lastMove: -1,
      demo: null
    };
    game.board = Engine.createBoard(game.rules);
    renderState.hoverCell = -1;
    renderState.pressedCell = -1;
    renderState.lastMoveAt = 0;
    renderState.seamPulseAt = 0;
    renderState.winAt = 0;
    dom.gameLevelNumber.textContent = padLevelNumber(index);
    dom.gameLevelName.textContent = level.name;
    dom.ruleCaptionTitle.textContent = level.ruleTitle;
    dom.ruleCaptionText.textContent = level.ruleText;
    dom.ruleCaption.classList.remove("is-demonstrating");
    dom.boardStage.classList.remove("is-settled");
    showScreen("game");
    updateTurnUI();
    window.setTimeout(function afterScreenTransition() {
      resizeCanvas();
      requestRender();
      if (!skipDemo) {
        startBoundaryDemo();
      }
    }, 90);
  }

  function leaveGame() {
    turnToken += 1;
    closeActiveSheet(true);
    dom.thinkingIndicator.classList.remove("is-visible");
    game = null;
    updateHome();
    showScreen("home");
    sound.play("ui");
  }

  function restartGame() {
    if (!game) {
      return;
    }
    var levelIndex = game.levelIndex;
    sound.play("ui");
    startLevel(levelIndex, { skipDemo: true });
  }

  function startBoundaryDemo() {
    if (!game) {
      return;
    }
    var startCell = Engine.toCell(game.rules, game.level.demoStart[0], game.level.demoStart[1]);
    var path = Engine.tracePath(game.rules, startCell, game.level.demoDirection, game.rules.target);
    if (!path) {
      return;
    }
    game.demo = {
      active: true,
      startedAt: performance.now(),
      cells: path.cells,
      seams: path.seams,
      directions: path.directions,
      dropInterval: 245,
      hold: 390,
      fade: 330,
      duration: (path.cells.length - 1) * 245 + 390 + 330
    };
    dom.ruleCaption.classList.add("is-demonstrating");
    updateTurnUI();
    requestRender();
    path.cells.forEach(function scheduleDemoSound(cell, index) {
      window.setTimeout(function playDemoStone() {
        if (game && game.demo && game.demo.active && game.demo.cells[index] === cell) {
          sound.play("move-human");
          if (index > 0 && game.demo.seams[index - 1]) {
            sound.play("seam");
          }
        }
      }, index * 245);
    });
  }

  function finishBoundaryDemo() {
    if (!game || !game.demo || !game.demo.active) {
      return;
    }
    game.demo.active = false;
    dom.ruleCaption.classList.remove("is-demonstrating");
    updateTurnUI();
    requestRender();
  }

  function updateTurnUI() {
    if (!game) {
      return;
    }
    var demoActive = Boolean(game.demo && game.demo.active);
    var humanTurn = game.status === "playing" && game.turn === HUMAN && !demoActive;
    var aiTurn = game.status === "playing" && game.turn === AI && !demoActive;
    var aiActuallyThinking = aiTurn && !(DEV_MODE && developer.aiPaused);
    dom.humanChip.classList.toggle("is-active", humanTurn);
    dom.aiChip.classList.toggle("is-active", aiTurn);
    dom.difficultyLabel.textContent = DIFFICULTIES[prefs.difficulty].label;
    dom.thinkingIndicator.classList.toggle("is-visible", aiActuallyThinking);
    dom.undoButton.disabled = game.moves.length === 0 || game.status !== "playing";
    if (demoActive) {
      dom.turnStatus.textContent = "边界演示";
    } else if (game.status === "ended") {
      dom.turnStatus.textContent = "本局结束";
    } else if (aiTurn && DEV_MODE && developer.aiPaused) {
      dom.turnStatus.textContent = "AI 已暂停";
    } else if (aiTurn) {
      dom.turnStatus.textContent = "思考中";
    } else {
      dom.turnStatus.textContent = "你的回合";
    }
    if (DEV_MODE && activeSheet === dom.developerSheet) {
      syncDeveloperUI();
    }
  }

  function connectedSeamAtCell(cell) {
    var point = Engine.toPoint(game.rules, cell);
    var bits = 0;
    if (game.level.xConnection && (point.x === 0 || point.x === game.rules.width - 1)) {
      bits |= Engine.SEAM_X;
    }
    if (game.level.yConnection && (point.y === 0 || point.y === game.rules.height - 1)) {
      bits |= Engine.SEAM_Y;
    }
    return bits;
  }

  function performMove(cell, player) {
    if (!game || game.status !== "playing" || game.board[cell] !== Engine.EMPTY) {
      return false;
    }
    game.board[cell] = player;
    game.moves.push({ cell: cell, player: player });
    game.lastMove = cell;
    renderState.lastMoveAt = performance.now();
    renderState.hoverCell = -1;
    renderState.pressedCell = -1;

    var seamBits = connectedSeamAtCell(cell);
    if (seamBits) {
      renderState.seamPulseAt = performance.now();
      renderState.seamPulseBits = seamBits;
    }

    sound.play(player === HUMAN ? "move-human" : "move-ai");
    if (seamBits) {
      window.setTimeout(function playSeamSound() { sound.play("seam"); }, 65);
    }

    var winningMask = Engine.checkWin(game.board, game.rules, cell, player);
    if (winningMask) {
      finishGame(player === HUMAN ? "win" : "lose", winningMask);
    } else if (Engine.playerWinsByBlockingAi(game.board, game.rules)) {
      finishGame("win", null, "blocked");
    } else if (Engine.boardIsFull(game.board)) {
      finishGame("draw", null);
    } else if (player === HUMAN) {
      game.turn = AI;
      updateTurnUI();
      scheduleAiMove();
    } else {
      game.turn = HUMAN;
      updateTurnUI();
    }
    requestRender();
    return true;
  }

  function scheduleAiMove() {
    if (DEV_MODE && developer.aiPaused) {
      turnToken += 1;
      updateTurnUI();
      return;
    }
    var scheduledToken = ++turnToken;
    var wait = DIFFICULTIES[prefs.difficulty].wait;
    window.setTimeout(function makeAiMove() {
      if (!game || game.status !== "playing" || game.turn !== AI || scheduledToken !== turnToken) {
        return;
      }
      var cell = Engine.chooseMove(game.board, game.rules, prefs.difficulty);
      if (cell >= 0 && scheduledToken === turnToken) {
        performMove(cell, AI);
      }
    }, wait);
  }

  function finishGame(outcome, winningMask, reason) {
    turnToken += 1;
    game.status = "ended";
    game.turn = 0;
    game.winningMask = winningMask;
    game.winReason = reason || null;
    renderState.winAt = performance.now();
    if (winningMask && winningMask.seam) {
      renderState.seamPulseAt = performance.now();
      renderState.seamPulseBits = winningMask.seam;
    }
    updateTurnUI();

    if (outcome === "win") {
      prefs.completed[game.levelIndex] = true;
      prefs.bestDifficulty[game.levelIndex] = Math.max(
        Number(prefs.bestDifficulty[game.levelIndex]) || 0,
        DIFFICULTIES[prefs.difficulty].rank
      );
      if (game.levelIndex < LEVELS.length - 1) {
        prefs.unlocked = Math.max(prefs.unlocked, game.levelIndex + 1);
      }
      savePreferences();
      sound.play("win");
    } else if (outcome === "lose") {
      sound.play("lose");
    } else {
      sound.play("draw");
    }

    window.setTimeout(function revealResult() {
      if (game && game.status === "ended") {
        showResult(outcome);
      }
    }, 820);
  }

  function undoMove() {
    if (!game || game.status !== "playing" || !game.moves.length) {
      return;
    }
    turnToken += 1;
    dom.thinkingIndicator.classList.remove("is-visible");

    var removeCount = game.turn === AI ? 1 : Math.min(2, game.moves.length);
    while (removeCount > 0 && game.moves.length) {
      var move = game.moves.pop();
      game.board[move.cell] = Engine.EMPTY;
      removeCount -= 1;
    }
    game.lastMove = game.moves.length ? game.moves[game.moves.length - 1].cell : -1;
    game.turn = HUMAN;
    renderState.lastMoveAt = performance.now();
    renderState.seamPulseAt = 0;
    updateTurnUI();
    requestRender();
    sound.play("ui");
  }

  function showResult(outcome) {
    var currentIndex = game.levelIndex;
    dom.boardStage.classList.add("is-settled");
    if (outcome === "win") {
      if (game.winReason === "blocked") {
        dom.resultKicker.textContent = "封锁";
        dom.resultTitle.textContent = "对手无路可走";
        dom.resultText.textContent = "已没有可完成的五连";
      } else {
        dom.resultKicker.textContent = currentIndex === LEVELS.length - 1 ? "全数通关" : "通关";
        dom.resultTitle.textContent = currentIndex === LEVELS.length - 1 ? "走遍所有边界" : "边界被你打通";
        dom.resultText.textContent = currentIndex === LEVELS.length - 1 ? "再换一种走法" : "下一片棋盘已解锁";
      }
      dom.resultRetryButton.textContent = "再来一局";
      dom.resultNextButton.textContent = currentIndex === LEVELS.length - 1 ? "回到旅程" : "下一关";
      resultSecondaryAction = restartGame;
      resultPrimaryAction = currentIndex === LEVELS.length - 1
        ? leaveGame
        : function nextLevel() { startLevel(currentIndex + 1); };
    } else if (outcome === "lose") {
      dom.resultKicker.textContent = "差一步";
      dom.resultTitle.textContent = "再换个方向";
      dom.resultText.textContent = "这次它先连成了五颗";
      dom.resultRetryButton.textContent = "回到旅程";
      dom.resultNextButton.textContent = "再来一局";
      resultSecondaryAction = leaveGame;
      resultPrimaryAction = restartGame;
    } else {
      dom.resultKicker.textContent = "平局";
      dom.resultTitle.textContent = "棋盘已满";
      dom.resultText.textContent = "谁也没有留下缺口";
      dom.resultRetryButton.textContent = "回到旅程";
      dom.resultNextButton.textContent = "再来一局";
      resultSecondaryAction = leaveGame;
      resultPrimaryAction = restartGame;
    }
    openSheet(dom.resultSheet);
  }

  function openSettings() {
    syncSettingsUI();
    openSheet(dom.settingsSheet);
    sound.play("ui");
  }

  function syncSettingsUI() {
    dom.difficultyButtons.forEach(function updateDifficultyButton(button) {
      button.classList.toggle("is-active", button.dataset.difficulty === prefs.difficulty);
    });
    dom.hintSwitch.classList.toggle("is-on", prefs.hints);
    dom.hintSwitch.setAttribute("aria-checked", prefs.hints ? "true" : "false");
    dom.soundSwitch.classList.toggle("is-on", prefs.sound);
    dom.soundSwitch.setAttribute("aria-checked", prefs.sound ? "true" : "false");
    dom.difficultyLabel.textContent = DIFFICULTIES[prefs.difficulty].label;
  }

  function setDifficulty(difficulty) {
    if (!DIFFICULTIES[difficulty]) {
      return;
    }
    prefs.difficulty = difficulty;
    savePreferences();
    syncSettingsUI();
    showToast("对手 · " + DIFFICULTIES[difficulty].label);
    sound.play("ui");
  }

  function toggleSound() {
    prefs.sound = !prefs.sound;
    sound.setEnabled(prefs.sound);
    savePreferences();
    syncSettingsUI();
    if (prefs.sound) {
      sound.play("ui");
    }
  }

  function toggleHints() {
    prefs.hints = !prefs.hints;
    savePreferences();
    syncSettingsUI();
    requestRender();
    showToast(prefs.hints ? "落点提示已开启" : "落点提示已关闭");
    sound.play("ui");
  }

  function openDeveloperTools() {
    if (!DEV_MODE) {
      return;
    }
    syncDeveloperUI();
    openSheet(dom.developerSheet);
    sound.play("ui");
  }

  function syncDeveloperUI() {
    if (!DEV_MODE) {
      return;
    }
    var activeGame = Boolean(game && game.status === "playing");
    dom.developerGameControls.classList.toggle("is-disabled", !activeGame);
    dom.developerPauseSwitch.disabled = !activeGame;
    dom.developerPlayerWin.disabled = !activeGame;
    dom.developerAiWin.disabled = !activeGame;
    dom.developerClearBoard.disabled = !activeGame;
    dom.developerPlayerButtons.forEach(function updateDeveloperPlayer(button) {
      button.disabled = !activeGame;
      button.classList.toggle("is-active", Number(button.dataset.developerPlayer) === developer.placementPlayer);
    });
    dom.developerPauseSwitch.classList.toggle("is-on", developer.aiPaused);
    dom.developerPauseSwitch.setAttribute("aria-checked", developer.aiPaused ? "true" : "false");
    if (game) {
      var turnLabel = game.status === "ended" ? "已结束" : (game.turn === AI ? "对手回合" : "玩家回合");
      dom.developerGameStatus.textContent = padLevelNumber(game.levelIndex) + " " + game.level.name + " · " + turnLabel;
    } else {
      dom.developerGameStatus.textContent = "未进入棋局";
    }
    dom.developerUnlockButtons.forEach(function updateUnlockButton(button) {
      button.classList.toggle("is-active", Number(button.dataset.developerUnlock) <= prefs.unlocked);
    });
  }

  function toggleDeveloperPause() {
    if (!DEV_MODE || !game || game.status !== "playing") {
      return;
    }
    developer.aiPaused = !developer.aiPaused;
    turnToken += 1;
    updateTurnUI();
    syncDeveloperUI();
    showToast(developer.aiPaused ? "AI 已暂停" : "AI 已恢复");
    sound.play("ui");
    if (!developer.aiPaused && game.turn === AI) {
      scheduleAiMove();
    }
  }

  function setDeveloperPlayer(player) {
    if (!DEV_MODE || (player !== HUMAN && player !== AI)) {
      return;
    }
    developer.placementPlayer = player;
    syncDeveloperUI();
    requestRender();
    showToast(player === HUMAN ? "棋盘落黑子" : "棋盘落白子");
  }

  function developerForceOutcome(player) {
    if (!DEV_MODE || !game || game.status !== "playing") {
      showToast("请先进入棋局");
      return;
    }
    finishBoundaryDemo();
    turnToken += 1;
    var masks = game.rules.winMasks.slice().sort(function sortForceMasks(a, b) {
      var aBlocked = 0;
      var bBlocked = 0;
      Array.prototype.forEach.call(a.cells, function countA(cell) { if (game.board[cell] === -player) { aBlocked += 1; } });
      Array.prototype.forEach.call(b.cells, function countB(cell) { if (game.board[cell] === -player) { bBlocked += 1; } });
      return aBlocked - bBlocked;
    });
    var mask = masks[0];
    Array.prototype.forEach.call(mask.cells, function fillWinningMask(cell) {
      game.board[cell] = player;
    });
    game.moves = [];
    for (var cell = 0; cell < game.board.length; cell += 1) {
      if (game.board[cell] !== Engine.EMPTY) {
        game.moves.push({ cell: cell, player: game.board[cell] });
      }
    }
    game.lastMove = mask.cells[mask.cells.length - 1];
    renderState.lastMoveAt = performance.now();
    closeActiveSheet(true);
    finishGame(player === HUMAN ? "win" : "lose", mask, "developer");
    requestRender();
  }

  function developerClearCurrentBoard() {
    if (!DEV_MODE || !game) {
      showToast("请先进入棋局");
      return;
    }
    finishBoundaryDemo();
    turnToken += 1;
    game.board.fill(Engine.EMPTY);
    game.moves = [];
    game.turn = HUMAN;
    game.status = "playing";
    game.winningMask = null;
    game.winReason = null;
    game.lastMove = -1;
    renderState.lastMoveAt = 0;
    renderState.seamPulseAt = 0;
    renderState.winAt = 0;
    dom.boardStage.classList.remove("is-settled");
    updateTurnUI();
    syncDeveloperUI();
    closeActiveSheet(false);
    requestRender();
    showToast("棋盘已清空");
  }

  function developerSeedHint(kind) {
    if (!DEV_MODE || !game || game.status !== "playing") {
      showToast("请先进入棋局");
      return;
    }
    finishBoundaryDemo();
    turnToken += 1;
    var startCell = Engine.toCell(game.rules, game.level.demoStart[0], game.level.demoStart[1]);
    var path = Engine.tracePath(game.rules, startCell, game.level.demoDirection, game.rules.target);
    if (!path) {
      showToast("当前棋盘无法生成提示局面");
      return;
    }
    game.board.fill(Engine.EMPTY);
    var startIndex = kind === "three" ? 1 : 0;
    var endIndex = kind === "three" ? 3 : 3;
    game.moves = [];
    if (kind === "four") {
      var previous = Engine.step(game.rules, path.cells[0], (game.level.demoDirection + 4) % 8);
      if (previous && path.cells.indexOf(previous.cell) < 0) {
        game.board[previous.cell] = AI;
        game.moves.push({ cell: previous.cell, player: AI });
      }
    }
    for (var index = startIndex; index <= endIndex; index += 1) {
      game.board[path.cells[index]] = HUMAN;
      game.moves.push({ cell: path.cells[index], player: HUMAN });
    }
    game.turn = HUMAN;
    game.winningMask = null;
    game.winReason = null;
    game.lastMove = path.cells[endIndex];
    developer.aiPaused = true;
    renderState.lastMoveAt = performance.now();
    renderState.seamPulseAt = 0;
    renderState.winAt = 0;
    dom.boardStage.classList.remove("is-settled");
    updateTurnUI();
    closeActiveSheet(false);
    requestRender();
    showToast(kind === "three" ? "已生成活三提示" : "已生成四子提示");
  }

  function developerUnlockTo(index) {
    if (!DEV_MODE) {
      return;
    }
    prefs.unlocked = Math.max(prefs.unlocked, Math.max(0, Math.min(LEVELS.length - 1, index)));
    selectedLevel = Math.min(prefs.unlocked, LEVELS.length - 1);
    savePreferences();
    updateHome();
    syncDeveloperUI();
    showToast("已解锁至 " + padLevelNumber(prefs.unlocked));
  }

  function developerResetProgress() {
    if (!DEV_MODE) {
      return;
    }
    prefs.unlocked = 0;
    prefs.completed = [];
    prefs.bestDifficulty = [];
    selectedLevel = 0;
    savePreferences();
    updateHome();
    syncDeveloperUI();
    showToast("关卡进度已重置");
  }

  function openSheet(sheet) {
    if (activeSheet && activeSheet !== sheet) {
      activeSheet.classList.remove("is-visible");
      activeSheet.hidden = true;
    }
    activeSheet = sheet;
    dom.scrim.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(function animateSheetIn() {
      dom.scrim.classList.add("is-visible");
      sheet.classList.add("is-visible");
    });
  }

  function closeActiveSheet(immediate) {
    if (!activeSheet) {
      return;
    }
    var sheet = activeSheet;
    activeSheet = null;
    sheet.classList.remove("is-visible");
    dom.scrim.classList.remove("is-visible");
    var finish = function finishClose() {
      if (activeSheet !== sheet) {
        sheet.hidden = true;
      }
      if (!activeSheet) {
        dom.scrim.hidden = true;
      }
    };
    if (immediate) {
      finish();
    } else {
      window.setTimeout(finish, 230);
    }
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(function hideToast() {
      dom.toast.classList.remove("is-visible");
    }, 1450);
  }

  function resizeCanvas() {
    var rect = dom.boardCanvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) {
      return;
    }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pixelWidth = Math.round(rect.width * dpr);
    var pixelHeight = Math.round(rect.height * dpr);
    if (dom.boardCanvas.width !== pixelWidth || dom.boardCanvas.height !== pixelHeight) {
      dom.boardCanvas.width = pixelWidth;
      dom.boardCanvas.height = pixelHeight;
    }
    renderState.width = rect.width;
    renderState.height = rect.height;
    renderState.dpr = dpr;
    renderState.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeBoardLayout();
    requestRender();
  }

  function computeBoardLayout() {
    if (!game || !renderState.width || !renderState.height) {
      renderState.layout = null;
      return;
    }
    var margin = Math.max(34, Math.min(renderState.width, renderState.height) * 0.115);
    var availableWidth = renderState.width - margin * 2;
    var availableHeight = renderState.height - margin * 2;
    var cellSize = Math.min(
      availableWidth / Math.max(1, game.rules.width - 1),
      availableHeight / Math.max(1, game.rules.height - 1)
    );
    var boardWidth = cellSize * (game.rules.width - 1);
    var boardHeight = cellSize * (game.rules.height - 1);
    renderState.layout = {
      cell: cellSize,
      left: (renderState.width - boardWidth) / 2,
      top: (renderState.height - boardHeight) / 2,
      right: (renderState.width + boardWidth) / 2,
      bottom: (renderState.height + boardHeight) / 2
    };
  }

  function requestRender() {
    if (!renderState.frame) {
      renderState.frame = requestAnimationFrame(renderFrame);
    }
  }

  function renderFrame(time) {
    renderState.frame = 0;
    if (!game || !renderState.layout) {
      return;
    }
    if (game.demo && game.demo.active && time - game.demo.startedAt >= game.demo.duration) {
      finishBoundaryDemo();
    }
    drawBoard(time);
    var animate = false;
    if (renderState.lastMoveAt && time - renderState.lastMoveAt < 260) {
      animate = true;
    }
    if (renderState.seamPulseAt && time - renderState.seamPulseAt < 980) {
      animate = true;
    }
    if (renderState.winAt && time - renderState.winAt < 1450) {
      animate = true;
    }
    if (game.demo && game.demo.active) {
      animate = true;
    }
    if (animate) {
      requestRender();
    }
  }

  function cellCenter(cell) {
    var point = Engine.toPoint(game.rules, cell);
    return {
      x: renderState.layout.left + point.x * renderState.layout.cell,
      y: renderState.layout.top + point.y * renderState.layout.cell
    };
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function easeOutBack(value) {
    var c1 = 1.45;
    var c3 = c1 + 1;
    var shifted = value - 1;
    return 1 + c3 * shifted * shifted * shifted + c1 * shifted * shifted;
  }

  function drawBoard(time) {
    var ctx = renderState.context;
    var layout = renderState.layout;
    ctx.clearRect(0, 0, renderState.width, renderState.height);

    drawPaperTexture(ctx);
    drawTopologyRails(ctx, time);
    drawGrid(ctx, layout);
    drawDemoStones(ctx, time);
    drawWinningConnections(ctx, time);
    drawMappedGhost(ctx);
    drawPlayerHints(ctx);
    drawMovePreview(ctx);
    drawStones(ctx, time);
  }

  function drawPaperTexture(ctx) {
    var index;
    ctx.save();
    ctx.fillStyle = "rgba(81, 75, 65, 0.035)";
    for (index = 0; index < 46; index += 1) {
      var x = (Math.sin(index * 91.73) * 0.5 + 0.5) * renderState.width;
      var y = (Math.sin(index * 47.17 + 2.3) * 0.5 + 0.5) * renderState.height;
      ctx.fillRect(x, y, 0.65, 0.65);
    }
    ctx.restore();
  }

  function drawGrid(ctx, layout) {
    var x;
    var y;
    ctx.save();
    ctx.strokeStyle = "rgba(108, 103, 94, 0.5)";
    ctx.lineWidth = Math.max(0.7, layout.cell * 0.025);
    for (x = 0; x < game.rules.width; x += 1) {
      var px = layout.left + x * layout.cell;
      ctx.beginPath();
      ctx.moveTo(px, layout.top);
      ctx.lineTo(px, layout.bottom);
      ctx.stroke();
    }
    for (y = 0; y < game.rules.height; y += 1) {
      var py = layout.top + y * layout.cell;
      ctx.beginPath();
      ctx.moveTo(layout.left, py);
      ctx.lineTo(layout.right, py);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(72, 71, 65, 0.48)";
    for (y = 0; y < game.rules.height; y += 1) {
      for (x = 0; x < game.rules.width; x += 1) {
        ctx.beginPath();
        ctx.arc(layout.left + x * layout.cell, layout.top + y * layout.cell, Math.max(0.9, layout.cell * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawDemoStones(ctx, time) {
    if (!game.demo || !game.demo.active) {
      return;
    }
    var demo = game.demo;
    var elapsed = Math.max(0, time - demo.startedAt);
    var fadeStartsAt = (demo.cells.length - 1) * demo.dropInterval + demo.hold;
    var alpha = 1 - clamp01((elapsed - fadeStartsAt) / demo.fade);
    var radius = renderState.layout.cell * 0.34;

    ctx.save();
    ctx.globalAlpha = alpha * 0.45;
    ctx.strokeStyle = "#3f8c87";
    ctx.lineWidth = Math.max(2, renderState.layout.cell * 0.07);
    ctx.lineCap = "round";
    for (var lineIndex = 1; lineIndex < demo.cells.length; lineIndex += 1) {
      var lineProgress = clamp01((elapsed - lineIndex * demo.dropInterval + 130) / 210);
      if (lineProgress <= 0 || demo.seams[lineIndex - 1]) {
        continue;
      }
      var lineFrom = cellCenter(demo.cells[lineIndex - 1]);
      var lineTo = cellCenter(demo.cells[lineIndex]);
      ctx.beginPath();
      ctx.moveTo(lineFrom.x, lineFrom.y);
      ctx.lineTo(
        lineFrom.x + (lineTo.x - lineFrom.x) * lineProgress,
        lineFrom.y + (lineTo.y - lineFrom.y) * lineProgress
      );
      ctx.stroke();
    }
    ctx.restore();

    for (var index = 0; index < demo.cells.length; index += 1) {
      var localProgress = clamp01((elapsed - index * demo.dropInterval) / 185);
      if (localProgress <= 0) {
        continue;
      }
      var center = cellCenter(demo.cells[index]);
      var scale = easeOutBack(localProgress);
      ctx.save();
      ctx.globalAlpha = alpha * (0.52 + localProgress * 0.38);
      ctx.translate(center.x, center.y);
      ctx.scale(scale, scale);
      ctx.shadowColor = "rgba(24, 31, 29, 0.2)";
      ctx.shadowBlur = radius * 0.38;
      ctx.shadowOffsetY = radius * 0.16;
      var gradient = ctx.createRadialGradient(-radius * 0.28, -radius * 0.34, radius * 0.08, 0, 0, radius);
      gradient.addColorStop(0, "#74827d");
      gradient.addColorStop(0.4, "#34433f");
      gradient.addColorStop(1, "#17231f");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(93, 176, 167, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    demo.seams.forEach(function drawDemoCrossing(seam, index) {
      if (!seam) {
        return;
      }
      var crossingAt = (index + 1) * demo.dropInterval;
      var pulseProgress = (elapsed - crossingAt) / 600;
      if (pulseProgress < 0 || pulseProgress > 1) {
        return;
      }
      var pulse = Math.sin(pulseProgress * Math.PI);
      var from = cellCenter(demo.cells[index]);
      var to = cellCenter(demo.cells[index + 1]);
      ctx.save();
      ctx.globalAlpha = alpha * pulse * 0.82;
      ctx.strokeStyle = seam & Engine.SEAM_TWIST ? "#c79244" : "#3f8c87";
      ctx.lineWidth = 1.5 + pulse;
      [from, to].forEach(function drawCrossingRing(point) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + 5 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    });
  }

  function seamPulseFor(bit, time) {
    var pulse = 0;
    if ((renderState.seamPulseBits & bit) && renderState.seamPulseAt) {
      var progress = clamp01((time - renderState.seamPulseAt) / 920);
      pulse = Math.sin(progress * Math.PI) * (1 - progress * 0.25);
    }
    if (game.demo && game.demo.active) {
      game.demo.seams.forEach(function pulseDemoSeam(seam, index) {
        if (!(seam & bit)) {
          return;
        }
        var crossingAt = game.demo.startedAt + (index + 1) * game.demo.dropInterval;
        var demoProgress = (time - crossingAt) / 620;
        if (demoProgress >= 0 && demoProgress <= 1) {
          pulse = Math.max(pulse, Math.sin(demoProgress * Math.PI));
        }
      });
    }
    return pulse;
  }

  function drawTopologyRails(ctx, time) {
    var layout = renderState.layout;
    if (game.level.xConnection) {
      drawRailPair(ctx, "vertical", "#3f8c87", game.level.xConnection === "twist", seamPulseFor(Engine.SEAM_X, time));
    }
    if (game.level.yConnection) {
      drawRailPair(ctx, "horizontal", "#c79244", game.level.yConnection === "twist", seamPulseFor(Engine.SEAM_Y, time));
    }
    if (!game.level.xConnection && !game.level.yConnection) {
      ctx.save();
      ctx.strokeStyle = "rgba(95, 91, 83, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(layout.left - 8, layout.top - 8, layout.right - layout.left + 16, layout.bottom - layout.top + 16);
      ctx.restore();
    }
  }

  function drawRailPair(ctx, orientation, color, twisted, pulse) {
    var layout = renderState.layout;
    var offset = Math.min(15, layout.cell * 0.4);
    var alpha = 0.58 + pulse * 0.4;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2 + pulse * 2.2;
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = pulse * 16;
    if (twisted) {
      ctx.setLineDash([5, 5]);
    }

    if (orientation === "vertical") {
      var leftX = layout.left - offset;
      var rightX = layout.right + offset;
      drawRailLine(ctx, leftX, layout.top, leftX, layout.bottom);
      drawRailLine(ctx, rightX, layout.top, rightX, layout.bottom);
      ctx.setLineDash([]);
      drawArrow(ctx, leftX, layout.top + (layout.bottom - layout.top) * 0.34, "vertical", 1);
      drawArrow(ctx, leftX, layout.top + (layout.bottom - layout.top) * 0.7, "vertical", 1);
      drawArrow(ctx, rightX, layout.top + (layout.bottom - layout.top) * 0.34, "vertical", twisted ? -1 : 1);
      drawArrow(ctx, rightX, layout.top + (layout.bottom - layout.top) * 0.7, "vertical", twisted ? -1 : 1);
    } else {
      var topY = layout.top - offset;
      var bottomY = layout.bottom + offset;
      drawRailLine(ctx, layout.left, topY, layout.right, topY);
      drawRailLine(ctx, layout.left, bottomY, layout.right, bottomY);
      ctx.setLineDash([]);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.34, topY, "horizontal", 1);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.7, topY, "horizontal", 1);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.34, bottomY, "horizontal", twisted ? -1 : 1);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.7, bottomY, "horizontal", twisted ? -1 : 1);
    }
    ctx.restore();
  }

  function drawRailLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawArrow(ctx, x, y, orientation, sign) {
    var size = 4.5;
    ctx.beginPath();
    if (orientation === "vertical") {
      ctx.moveTo(x, y + size * sign);
      ctx.lineTo(x - size, y - size * sign);
      ctx.lineTo(x + size, y - size * sign);
    } else {
      ctx.moveTo(x + size * sign, y);
      ctx.lineTo(x - size * sign, y - size);
      ctx.lineTo(x - size * sign, y + size);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawMappedGhost(ctx) {
    var sourceCell = renderState.pressedCell >= 0 ? renderState.pressedCell : renderState.hoverCell;
    if (sourceCell < 0 || !game || game.status !== "playing") {
      return;
    }
    var point = Engine.toPoint(game.rules, sourceCell);
    var directions = [];
    if (game.level.xConnection && point.x === 0) { directions.push({ direction: 4, color: "#3f8c87" }); }
    if (game.level.xConnection && point.x === game.rules.width - 1) { directions.push({ direction: 0, color: "#3f8c87" }); }
    if (game.level.yConnection && point.y === 0) { directions.push({ direction: 6, color: "#c79244" }); }
    if (game.level.yConnection && point.y === game.rules.height - 1) { directions.push({ direction: 2, color: "#c79244" }); }

    directions.forEach(function drawGhost(mapping) {
      var mapped = Engine.step(game.rules, sourceCell, mapping.direction);
      if (!mapped || mapped.cell === sourceCell) {
        return;
      }
      var center = cellCenter(mapped.cell);
      ctx.save();
      ctx.globalAlpha = game.board[mapped.cell] === Engine.EMPTY ? 0.38 : 0.22;
      ctx.strokeStyle = mapping.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, renderState.layout.cell * 0.29, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawMovePreview(ctx) {
    var cell = renderState.pressedCell >= 0 ? renderState.pressedCell : renderState.hoverCell;
    if (cell < 0 || !canPlaceOnBoard() || game.board[cell] !== Engine.EMPTY) {
      return;
    }
    var previewPlayer = DEV_MODE ? developer.placementPlayer : HUMAN;
    var center = cellCenter(cell);
    var radius = renderState.layout.cell * 0.34;
    ctx.save();
    ctx.globalAlpha = renderState.pressedCell >= 0 ? 0.42 : 0.16;
    ctx.fillStyle = previewPlayer === HUMAN ? "#21302c" : "#f8f4e9";
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (previewPlayer === AI) {
      ctx.strokeStyle = "rgba(94, 88, 78, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerHints(ctx) {
    if (!prefs.hints || !game || game.levelIndex === 0 || game.status !== "playing" || (game.demo && game.demo.active)) {
      return;
    }
    var hints = Engine.findLineHints(game.board, game.rules, HUMAN);
    if (!hints.length) {
      return;
    }
    var cellSize = renderState.layout.cell;
    hints.forEach(function drawHint(hint) {
      if (game.board[hint.cell] !== Engine.EMPTY) {
        return;
      }
      var center = cellCenter(hint.cell);
      var urgent = hint.kind === "four";
      ctx.save();
      ctx.strokeStyle = urgent ? "#c79244" : "#3f8c87";
      ctx.fillStyle = urgent ? "rgba(199, 146, 68, 0.07)" : "rgba(63, 140, 135, 0.055)";
      ctx.globalAlpha = urgent ? 0.9 : 0.72;
      ctx.lineWidth = urgent ? 1.8 : 1.35;
      ctx.setLineDash([Math.max(3, cellSize * 0.095), Math.max(3, cellSize * 0.09)]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, cellSize * 0.27, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  function winningCellSet() {
    var set = Object.create(null);
    if (game && game.winningMask) {
      Array.prototype.forEach.call(game.winningMask.cells, function rememberCell(cell) {
        set[cell] = true;
      });
    }
    return set;
  }

  function drawWinningConnections(ctx, time) {
    if (!game.winningMask) {
      return;
    }
    var cells = game.winningMask.cells;
    var progress = clamp01((time - renderState.winAt) / 620);
    ctx.save();
    ctx.strokeStyle = "rgba(199, 146, 68, " + (0.22 + progress * 0.55) + ")";
    ctx.lineWidth = Math.max(3, renderState.layout.cell * 0.11);
    ctx.lineCap = "round";
    for (var index = 0; index < cells.length - 1; index += 1) {
      var from = cellCenter(cells[index]);
      var to = cellCenter(cells[index + 1]);
      var distance = Math.hypot(to.x - from.x, to.y - from.y);
      if (distance <= renderState.layout.cell * 1.65) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStones(ctx, time) {
    var winnerSet = winningCellSet();
    var radius = renderState.layout.cell * 0.37;
    var cell;
    for (cell = 0; cell < game.board.length; cell += 1) {
      var player = game.board[cell];
      if (player === Engine.EMPTY) {
        continue;
      }
      var center = cellCenter(cell);
      var scale = 1;
      if (cell === game.lastMove && renderState.lastMoveAt) {
        scale = easeOutBack(clamp01((time - renderState.lastMoveAt) / 190));
      }
      var isWinning = Boolean(winnerSet[cell]);
      var dimmed = game.winningMask && !isWinning;

      ctx.save();
      ctx.globalAlpha = dimmed ? 0.4 : 1;
      ctx.translate(center.x, center.y);
      ctx.scale(scale, scale);
      ctx.shadowColor = player === HUMAN ? "rgba(24, 31, 29, 0.28)" : "rgba(65, 58, 48, 0.18)";
      ctx.shadowBlur = radius * 0.42;
      ctx.shadowOffsetY = radius * 0.2;

      var gradient = ctx.createRadialGradient(-radius * 0.28, -radius * 0.34, radius * 0.08, 0, 0, radius);
      if (player === HUMAN) {
        gradient.addColorStop(0, "#66736f");
        gradient.addColorStop(0.38, "#2b3935");
        gradient.addColorStop(1, "#14201d");
      } else {
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.48, "#f8f4e9");
        gradient.addColorStop(1, "#d9d2c6");
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      if (player === AI) {
        ctx.strokeStyle = "rgba(94, 88, 78, 0.28)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (cell === game.lastMove) {
        ctx.fillStyle = "#d95b4f";
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2.1, radius * 0.15), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (isWinning) {
        var winningIndex = Array.prototype.indexOf.call(game.winningMask.cells, cell);
        var ringProgress = clamp01((time - renderState.winAt - winningIndex * 70) / 330);
        ctx.save();
        ctx.globalAlpha = ringProgress * 0.78;
        ctx.strokeStyle = "#c79244";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius + 4 + ringProgress * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function eventToCell(event) {
    if (!game || !renderState.layout) {
      return -1;
    }
    var rect = dom.boardCanvas.getBoundingClientRect();
    var localX = event.clientX - rect.left;
    var localY = event.clientY - rect.top;
    var gridX = Math.round((localX - renderState.layout.left) / renderState.layout.cell);
    var gridY = Math.round((localY - renderState.layout.top) / renderState.layout.cell);
    if (gridX < 0 || gridX >= game.rules.width || gridY < 0 || gridY >= game.rules.height) {
      return -1;
    }
    var snapX = renderState.layout.left + gridX * renderState.layout.cell;
    var snapY = renderState.layout.top + gridY * renderState.layout.cell;
    if (Math.hypot(localX - snapX, localY - snapY) > renderState.layout.cell * 0.53) {
      return -1;
    }
    return Engine.toCell(game.rules, gridX, gridY);
  }

  function canPlaceOnBoard() {
    if (!game || game.status !== "playing" || (game.demo && game.demo.active) || activeSheet) {
      return false;
    }
    return DEV_MODE || game.turn === HUMAN;
  }

  function onBoardPointerDown(event) {
    sound.unlock();
    if (game && game.demo && game.demo.active && !activeSheet) {
      event.preventDefault();
      finishBoundaryDemo();
      return;
    }
    if (!canPlaceOnBoard()) {
      return;
    }
    event.preventDefault();
    renderState.pointerId = event.pointerId;
    renderState.pressedCell = eventToCell(event);
    if (dom.boardCanvas.setPointerCapture) {
      dom.boardCanvas.setPointerCapture(event.pointerId);
    }
    requestRender();
  }

  function onBoardPointerMove(event) {
    if (!game) {
      return;
    }
    var cell = eventToCell(event);
    if (renderState.pointerId === event.pointerId) {
      event.preventDefault();
      renderState.pressedCell = cell;
    } else if (event.pointerType === "mouse" || event.pointerType === "pen") {
      renderState.hoverCell = cell;
    }
    requestRender();
  }

  function onBoardPointerUp(event) {
    if (renderState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    var cell = eventToCell(event);
    renderState.pointerId = null;
    renderState.pressedCell = -1;
    if (canPlaceOnBoard() && cell >= 0 && game.board[cell] === Engine.EMPTY) {
      performMove(cell, DEV_MODE ? developer.placementPlayer : HUMAN);
    } else {
      requestRender();
    }
  }

  function onBoardPointerCancel(event) {
    if (renderState.pointerId === event.pointerId) {
      renderState.pointerId = null;
      renderState.pressedCell = -1;
      requestRender();
    }
  }

  function bindEvents() {
    dom.levelGrid.addEventListener("click", function onLevelClick(event) {
      var card = event.target.closest(".level-card");
      if (card) {
        selectLevel(Number(card.dataset.level));
      }
    });
    dom.startButton.addEventListener("click", function startSelectedLevel() {
      sound.play("ui");
      startLevel(selectedLevel);
    });
    dom.homeSettingsButton.addEventListener("click", openSettings);
    dom.gameSettingsButton.addEventListener("click", openSettings);
    dom.backButton.addEventListener("click", leaveGame);
    dom.restartButton.addEventListener("click", restartGame);
    dom.undoButton.addEventListener("click", undoMove);
    dom.closeSettingsButton.addEventListener("click", function closeSettings() { closeActiveSheet(false); });
    dom.settingsDoneButton.addEventListener("click", function finishSettings() {
      sound.play("ui");
      closeActiveSheet(false);
    });
    dom.difficultyButtons.forEach(function bindDifficulty(button) {
      button.addEventListener("click", function chooseDifficulty() {
        setDifficulty(button.dataset.difficulty);
      });
    });
    dom.soundSwitch.addEventListener("click", toggleSound);
    dom.hintSwitch.addEventListener("click", toggleHints);
    dom.developerButton.addEventListener("click", openDeveloperTools);
    dom.closeDeveloperButton.addEventListener("click", function closeDeveloperTools() { closeActiveSheet(false); });
    dom.developerDoneButton.addEventListener("click", function finishDeveloperTools() { closeActiveSheet(false); });
    dom.developerPauseSwitch.addEventListener("click", toggleDeveloperPause);
    dom.developerPlayerButtons.forEach(function bindDeveloperPlayer(button) {
      button.addEventListener("click", function chooseDeveloperPlayer() {
        setDeveloperPlayer(Number(button.dataset.developerPlayer));
      });
    });
    dom.developerUnlockButtons.forEach(function bindDeveloperUnlock(button) {
      button.addEventListener("click", function chooseDeveloperUnlock() {
        developerUnlockTo(Number(button.dataset.developerUnlock));
      });
    });
    dom.developerPlayerWin.addEventListener("click", function forcePlayerWin() { developerForceOutcome(HUMAN); });
    dom.developerAiWin.addEventListener("click", function forceAiWin() { developerForceOutcome(AI); });
    dom.developerClearBoard.addEventListener("click", developerClearCurrentBoard);
    dom.developerHintThree.addEventListener("click", function seedLiveThree() { developerSeedHint("three"); });
    dom.developerHintFour.addEventListener("click", function seedFour() { developerSeedHint("four"); });
    dom.developerResetProgress.addEventListener("click", developerResetProgress);
    dom.resultRetryButton.addEventListener("click", function runSecondaryResultAction() {
      var action = resultSecondaryAction;
      closeActiveSheet(true);
      if (action) {
        action();
      }
    });
    dom.resultNextButton.addEventListener("click", function runPrimaryResultAction() {
      var action = resultPrimaryAction;
      closeActiveSheet(true);
      if (action) {
        action();
      }
    });
    dom.scrim.addEventListener("click", function onScrimClick() {
      if (activeSheet === dom.settingsSheet || activeSheet === dom.developerSheet) {
        closeActiveSheet(false);
      }
    });
    dom.boardCanvas.addEventListener("pointerdown", onBoardPointerDown);
    dom.boardCanvas.addEventListener("pointermove", onBoardPointerMove);
    dom.boardCanvas.addEventListener("pointerup", onBoardPointerUp);
    dom.boardCanvas.addEventListener("pointercancel", onBoardPointerCancel);
    dom.boardCanvas.addEventListener("pointerleave", function clearHover() {
      if (renderState.pointerId === null) {
        renderState.hoverCell = -1;
        requestRender();
      }
    });
    document.addEventListener("pointerdown", function unlockAudioOnce() { sound.unlock(); }, { once: true });
    window.addEventListener("resize", resizeCanvas);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", resizeCanvas);
    }
    document.addEventListener("visibilitychange", function pauseOnHide() {
      if (document.hidden) {
        renderState.pointerId = null;
        renderState.pressedCell = -1;
      }
    });
  }

  function initialize() {
    bindEvents();
    updateHome();
    syncSettingsUI();
    dom.developerButton.hidden = !DEV_MODE;
    if (DEV_MODE) {
      document.body.classList.add("is-developer-mode");
      syncDeveloperUI();
      window.setTimeout(function announceDeveloperMode() { showToast("开发者模式"); }, 260);
    }
  }

  initialize();
})();

(function topologyGomokuApp() {
  "use strict";

  var Engine = window.TopologyGomoku;
  var Morph = window.TopologyMorph;
  var Replay = window.TopologyReplay;
  var STORAGE_KEY = "topology-gomoku:v1";
  var TUTORIAL_AUTO_ADVANCE_DELAY = 820;
  var TUTORIAL_PROMPTS = [
    "传统的五子棋",
    "就是把五颗子",
    "连成一条线",
    "好无趣",
    "好无聊"
  ];
  var HUMAN = Engine.HUMAN;
  var AI = Engine.AI;
  var DEV_MODE = isDeveloperLaunch();

  var LEVELS = [
    {
      name: "方庭",
      typeName: "平面",
      topology: "plane",
      tutorial: true,
      width: 7,
      height: 7,
      edgeText: "有边界",
      xConnection: null,
      yConnection: null,
      ruleTitle: "先连成五颗",
      ruleText: "连续落子，横、竖、斜皆可",
      lessonPaths: [
        { start: [1, 3], direction: 0, prompts: TUTORIAL_PROMPTS }
      ]
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
      lessonPaths: [
        {
          start: [5, 2],
          direction: 0,
          prompts: ["从右侧开始", "走到边界", "越过右边，从左边回来", "两侧其实相接", "补上第五颗"]
        },
        {
          start: [5, 0],
          direction: 1,
          prompts: ["再试一条斜线", "斜着走向右边", "越界后从左边接回", "方向没有改变", "斜线也能五连"]
        }
      ]
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
      lessonPaths: [
        {
          start: [3, 4],
          direction: 2,
          prompts: ["先从下方开始", "走到下边界", "越过下边，从上边回来", "上下也没有尽头", "补上第五颗"]
        },
        {
          start: [1, 0],
          direction: 5,
          prompts: ["再走一条斜线", "先越过上边", "再越过左边", "两次跨界仍是同一条线", "补上第五颗"]
        }
      ]
    },
    {
      name: "扭带",
      typeName: "莫比乌斯环",
      topology: "mobius",
      width: 8,
      height: 6,
      edgeText: "左右翻转",
      xConnection: "twist",
      yConnection: null,
      ruleTitle: "左右翻转",
      ruleText: "越过边界，上下镜像",
      lessonPaths: [
        {
          start: [6, 1],
          direction: 0,
          prompts: ["从右侧开始", "走到边界", "越界后，上下镜像", "镜像后仍是同一条线", "补上第五颗"]
        },
        {
          start: [6, 0],
          direction: 1,
          prompts: ["再试一条斜线", "斜着走到右边", "越界后方向翻转", "折向的两段彼此相连", "补上第五颗"]
        }
      ]
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
      lessonPaths: [
        {
          start: [3, 4],
          direction: 2,
          prompts: ["先从下方开始", "走到下边界", "这一组边直接相接", "上下没有尽头", "补上第五颗"]
        },
        {
          start: [1, 0],
          direction: 5,
          prompts: ["再走一条斜线", "先越过相接的边", "再越过翻转的边", "一环一扭仍能连成线", "补上第五颗"]
        }
      ]
    },
    {
      name: "双生",
      typeName: "实射影平面",
      topology: "projective",
      width: 8,
      height: 8,
      edgeText: "双向翻转",
      xConnection: "twist",
      yConnection: "twist",
      ruleTitle: "双向翻转",
      ruleText: "每条边，都通向镜面",
      lessonPaths: [
        {
          start: [1, 6],
          direction: 2,
          prompts: ["从下方开始", "走到边界", "越界后，左右镜像", "下边通向倒影", "补上第五颗"]
        },
        {
          start: [1, 0],
          direction: 5,
          prompts: ["再走一条斜线", "越过上边后翻转", "接着越过左边再翻转", "两次倒映仍在同一条线上", "补上第五颗"]
        }
      ]
    },
    {
      name: "归圆",
      typeName: "球面",
      topology: "sphere",
      width: 7,
      height: 7,
      edgeText: "邻边相合",
      xConnection: "adjacent",
      yConnection: "adjacent",
      ruleTitle: "邻边相合",
      ruleText: "相邻两边，转向后相接",
      lessonPaths: [
        {
          start: [2, 1],
          direction: 6,
          prompts: ["从上方开始", "走向上边界", "上边转向左边", "转弯后，线仍连续", "补上第五颗"]
        },
        {
          start: [1, 0],
          direction: 5,
          prompts: ["再靠近顶点", "落在两边交会处", "路径沿邻边转向", "穿过顶点仍然连续", "补上第五颗"]
        }
      ]
    }
  ];

  var DIFFICULTIES = {
    easy: { label: "随性", wait: 390, rank: 1 },
    normal: { label: "机敏", wait: 520, rank: 2 },
    hard: { label: "深思", wait: 680, rank: 3 }
  };
  var DIFFICULTY_ORDER = ["easy", "normal", "hard"];

  var dom = {
    appShell: document.getElementById("appShell"),
    homeScreen: document.getElementById("homeScreen"),
    gameScreen: document.getElementById("gameScreen"),
    levelGrid: document.getElementById("levelGrid"),
    levelCards: Array.prototype.slice.call(document.querySelectorAll(".level-card")),
    progressCount: document.getElementById("progressCount"),
    gameSettingsButton: document.getElementById("gameSettingsButton"),
    backButton: document.getElementById("backButton"),
    gameLevelName: document.getElementById("gameLevelName"),
    difficultyLabel: document.getElementById("difficultyLabel"),
    humanChip: document.getElementById("humanChip"),
    aiChip: document.getElementById("aiChip"),
    endgameReviewTools: document.getElementById("endgameReviewTools"),
    reviewToggleButton: document.getElementById("reviewToggleButton"),
    reviewToggleButtonText: document.getElementById("reviewToggleButtonText"),
    reviewToggleIconPath: document.getElementById("reviewToggleIconPath"),
    reviewPreviousButton: document.getElementById("reviewPreviousButton"),
    reviewNextButton: document.getElementById("reviewNextButton"),
    dimensionToggleButton: document.getElementById("dimensionToggleButton"),
    dimensionToggleButtonText: document.getElementById("dimensionToggleButtonText"),
    dimensionToggleIconPath: document.getElementById("dimensionToggleIconPath"),
    turnStatus: document.getElementById("turnStatus"),
    boardStage: document.getElementById("boardStage"),
    boardCanvas: document.getElementById("boardCanvas"),
    thinkingIndicator: document.getElementById("thinkingIndicator"),
    gameTools: document.getElementById("gameTools"),
    boundaryDemoButton: document.getElementById("boundaryDemoButton"),
    journeyButton: document.getElementById("journeyButton"),
    undoButton: document.getElementById("undoButton"),
    undoButtonText: document.getElementById("undoButtonText"),
    undoIconPath: document.getElementById("undoIconPath"),
    settledReplayButton: document.getElementById("settledReplayButton"),
    settledReplayButtonText: document.getElementById("settledReplayButtonText"),
    settledReplayIconPath: document.getElementById("settledReplayIconPath"),
    nextLevelButton: document.getElementById("nextLevelButton"),
    nextLevelButtonText: document.getElementById("nextLevelButtonText"),
    nextLevelIconPath: document.getElementById("nextLevelIconPath"),
    restartButton: document.getElementById("restartButton"),
    restartButtonText: document.getElementById("restartButtonText"),
    restartIconPath: document.getElementById("restartIconPath"),
    scrim: document.getElementById("scrim"),
    settingsSheet: document.getElementById("settingsSheet"),
    closeSettingsButton: document.getElementById("closeSettingsButton"),
    settingsDoneButton: document.getElementById("settingsDoneButton"),
    difficultyControl: document.getElementById("difficultyControl"),
    difficultyThumb: document.getElementById("difficultyThumb"),
    difficultyButtons: Array.prototype.slice.call(document.querySelectorAll("[data-difficulty]")),
    hintSwitch: document.getElementById("hintSwitch"),
    soundSwitch: document.getElementById("soundSwitch"),
    developerButton: document.getElementById("developerButton"),
    developerSheet: document.getElementById("developerSheet"),
    closeDeveloperButton: document.getElementById("closeDeveloperButton"),
    developerDoneButton: document.getElementById("developerDoneButton"),
    developerGameControls: document.getElementById("developerGameControls"),
    developerGameStatus: document.getElementById("developerGameStatus"),
    developerPauseSwitch: document.getElementById("developerPauseSwitch"),
    developerPieceControl: document.getElementById("developerPieceControl"),
    developerPlayerButtons: Array.prototype.slice.call(document.querySelectorAll("[data-developer-player]")),
    developerUnlockButtons: Array.prototype.slice.call(document.querySelectorAll("[data-developer-unlock]")),
    developerPlayerWin: document.getElementById("developerPlayerWin"),
    developerAiWin: document.getElementById("developerAiWin"),
    developerDraw: document.getElementById("developerDraw"),
    developerClearBoard: document.getElementById("developerClearBoard"),
    developerHintThree: document.getElementById("developerHintThree"),
    developerHintFour: document.getElementById("developerHintFour"),
    developerResetProgress: document.getElementById("developerResetProgress")
  };

  var prefs = loadPreferences();
  var selectedLevel = Math.min(prefs.unlocked, LEVELS.length - 1);
  var game = null;
  var turnToken = 0;
  var activeSheet = null;
  var settledBoardAnimation = null;
  var REVERSIBLE_MOTION_DURATION = 380;
  var REVERSIBLE_MOTION_EASING = "cubic-bezier(0.37, 0, 0.63, 1)";
  var LIQUID_CARD_MOTION_DURATION = 300;
  var LIQUID_CARD_RETURN_DURATION = 240;
  var LIQUID_CARD_MOTION_EASING = "linear";
  var LIQUID_CARD_TRAVEL_EASING = "cubic-bezier(0.16, 0.84, 0.24, 1)";
  var LIQUID_CARD_BOUNCE_EASING = "cubic-bezier(0.37, 0, 0.63, 1)";
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
    pressedAt: 0,
    pressedX: 0,
    pressedY: 0,
    pressedTargetX: 0,
    pressedTargetY: 0,
    pressedVelocityX: 0,
    pressedVelocityY: 0,
    pressedMotionReady: false,
    pointerId: null,
    lastFrameAt: 0,
    lastMoveAt: 0,
    seamPulseAt: 0,
    seamPulseBits: 0,
    winAt: 0,
    lastMoveFromPress: false
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
      sound: true,
      learnedLevels: []
    };
  }

  function normalizeLearnedLevels(storedLevels, completed) {
    var learned = [];
    var saved = Array.isArray(storedLevels) ? storedLevels : [];
    for (var index = 0; index < LEVELS.length; index += 1) {
      if ((saved.indexOf(index) >= 0 || completed[index]) && learned.indexOf(index) < 0) {
        learned.push(index);
      }
    }
    return learned;
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
      defaults.learnedLevels = normalizeLearnedLevels(stored.learnedLevels, defaults.completed);
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

  function hasLearnedLevel(index) {
    return prefs.learnedLevels.indexOf(index) >= 0;
  }

  function rememberLevel(index) {
    if (index < 0 || index >= LEVELS.length || hasLearnedLevel(index)) {
      return;
    }
    prefs.learnedLevels.push(index);
    savePreferences();
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
    } else if (name === "morph") {
      this.tone(164, 0.72, 0, "sine", 0.014, 328);
      this.tone(246, 0.66, 0.18, "sine", 0.012, 493);
      this.tone(740, 0.28, 0.82, "sine", 0.012, 988);
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
      var revealed = index === 0 || complete;
      card.classList.toggle("is-locked", locked);
      card.classList.toggle("is-complete", complete);
      card.classList.toggle("is-revealed", revealed);
      card.setAttribute("aria-disabled", locked ? "true" : "false");
      card.setAttribute(
        "aria-label",
        LEVELS[index].name + (revealed ? "" : " · 图鉴未揭示")
      );
      if (complete) {
        completeCount += 1;
      }
    });
    dom.progressCount.textContent = completeCount + " / " + LEVELS.length;
  }

  function selectLevel(index, card) {
    if (index > prefs.unlocked) {
      var card = dom.levelCards[index];
      card.classList.remove("is-shaking");
      void card.offsetWidth;
      card.classList.add("is-shaking");
      sound.play("ui");
      return;
    }
    selectedLevel = index;
    updateHome();
    sound.play("ui");
    startLevel(index, { transitionCard: card });
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

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function fixedRectStyles(element, rect) {
    element.style.left = rect.left + "px";
    element.style.top = rect.top + "px";
    element.style.width = rect.width + "px";
    element.style.height = rect.height + "px";
  }

  function finishNavigationAnimation(element) {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
    dom.appShell.classList.remove("is-navigating");
    dom.appShell.classList.remove("is-shared-return");
    dom.gameScreen.classList.remove("is-shared-enter");
    dom.levelCards.forEach(function revealTransitionCard(card) {
      card.classList.remove("is-transition-target");
    });
  }

  function releaseSettledBoardAnimation() {
    if (!settledBoardAnimation) {
      return;
    }
    settledBoardAnimation.cancel();
    settledBoardAnimation = null;
  }

  function animateCardIntoBoard(transition, done) {
    if (!transition || prefersReducedMotion() || !dom.boardStage.animate) {
      finishNavigationAnimation(null);
      done();
      return;
    }
    var target = dom.boardStage.getBoundingClientRect();
    var source = transition.rect;
    var scaleX = source.width / target.width;
    var scaleY = source.height / target.height;
    var translateX = source.left + source.width / 2 - (target.left + target.width / 2);
    var translateY = source.top + source.height / 2 - (target.top + target.height / 2);
    var expansionScale = 1.068;
    var recoilScale = 0.962;
    var secondaryBounceScale = 1.028;
    var tertiaryRecoilScale = 0.988;
    var targetRadius = window.getComputedStyle(dom.boardStage).borderRadius;
    var sourceRadius = transition.borderRadius || "21px";
    dom.appShell.classList.add("is-navigating");
    var animation = dom.boardStage.animate([
      {
        transformOrigin: "center",
        transform: "translate(" + translateX + "px, " + translateY + "px) scale(" + scaleX + ", " + scaleY + ")",
        borderRadius: sourceRadius,
        opacity: 0.94,
        filter: "saturate(1.04) brightness(1.025)",
        easing: LIQUID_CARD_TRAVEL_EASING
      },
      {
        offset: 0.46,
        transform: "translate(0, 0) scale(" + expansionScale + ")",
        borderRadius: targetRadius,
        opacity: 1,
        filter: "saturate(1.1) brightness(1.025)",
        easing: LIQUID_CARD_BOUNCE_EASING
      },
      {
        offset: 0.64,
        transform: "translate(0, 0) scale(" + recoilScale + ")",
        borderRadius: targetRadius,
        opacity: 1,
        filter: "saturate(1.06) brightness(1.015)",
        easing: LIQUID_CARD_BOUNCE_EASING
      },
      {
        offset: 0.8,
        transform: "translate(0, 0) scale(" + secondaryBounceScale + ")",
        borderRadius: targetRadius,
        opacity: 1,
        filter: "saturate(1.035) brightness(1.008)",
        easing: LIQUID_CARD_BOUNCE_EASING
      },
      {
        offset: 0.92,
        transform: "translate(0, 0) scale(" + tertiaryRecoilScale + ")",
        borderRadius: targetRadius,
        opacity: 1,
        filter: "saturate(1.015) brightness(1.003)",
        easing: LIQUID_CARD_BOUNCE_EASING
      },
      {
        transform: "none",
        borderRadius: targetRadius,
        opacity: 1,
        filter: "none"
      }
    ], {
      duration: LIQUID_CARD_MOTION_DURATION,
      easing: LIQUID_CARD_MOTION_EASING,
      fill: "both"
    });
    var contentAnimation = dom.boardCanvas.animate([
      {
        opacity: 0.34,
        filter: "blur(0.8px)",
        easing: LIQUID_CARD_TRAVEL_EASING
      },
      {
        offset: 0.46,
        opacity: 0.94,
        filter: "none",
        easing: LIQUID_CARD_BOUNCE_EASING
      },
      {
        offset: 0.64,
        opacity: 1,
        filter: "none",
        easing: LIQUID_CARD_BOUNCE_EASING
      },
      {
        offset: 0.8,
        opacity: 1,
        filter: "none",
        easing: LIQUID_CARD_BOUNCE_EASING
      },
      {
        offset: 0.92,
        opacity: 1,
        filter: "none",
        easing: LIQUID_CARD_BOUNCE_EASING
      },
      {
        opacity: 1,
        filter: "none"
      }
    ], {
      duration: LIQUID_CARD_MOTION_DURATION,
      easing: LIQUID_CARD_MOTION_EASING,
      fill: "both"
    });
    animation.onfinish = function finishCardExpansion() {
      settledBoardAnimation = animation;
      done();
      requestAnimationFrame(function paintFinalBoardBeforeHandoff() {
        finishNavigationAnimation(null);
        animation.cancel();
        contentAnimation.cancel();
        settledBoardAnimation = null;
      });
    };
  }

  function animateBoardBackToCard(levelIndex, boardRect, done) {
    var tile = document.createElement("div");
    var tileCanvas = document.createElement("canvas");
    var boardRadius = window.getComputedStyle(dom.boardStage).borderRadius;
    tile.className = "level-transition-board";
    tile.setAttribute("aria-hidden", "true");
    tileCanvas.className = "transition-board-canvas";
    tileCanvas.width = dom.boardCanvas.width;
    tileCanvas.height = dom.boardCanvas.height;
    tileCanvas.getContext("2d").drawImage(dom.boardCanvas, 0, 0);
    tile.appendChild(tileCanvas);
    fixedRectStyles(tile, boardRect);
    tile.style.borderRadius = boardRadius;
    document.body.appendChild(tile);
    var targetCard = dom.levelCards[levelIndex];
    targetCard.classList.add("is-transition-target");
    dom.appShell.classList.add("is-navigating", "is-shared-return");
    releaseSettledBoardAnimation();
    showScreen("home");
    requestAnimationFrame(function measureReturnCard() {
      var target = targetCard.getBoundingClientRect();
      if (prefersReducedMotion() || !targetCard.animate) {
        finishNavigationAnimation(tile);
        done();
        return;
      }
      var translateX = target.left + target.width / 2 - (boardRect.left + boardRect.width / 2);
      var translateY = target.top + target.height / 2 - (boardRect.top + boardRect.height / 2);
      var scaleX = target.width / boardRect.width;
      var scaleY = target.height / boardRect.height;
      var uniformScale = Math.min(scaleX, scaleY);
      var canvasCounterScaleX = uniformScale / scaleX;
      var canvasCounterScaleY = uniformScale / scaleY;
      var targetRadius = parseFloat(window.getComputedStyle(targetCard).borderRadius) || 21;
      var transformedTargetRadius = targetRadius / scaleX + "px / " + targetRadius / scaleY + "px";
      var animation = tile.animate([
        {
          transformOrigin: "center",
          transform: "none",
          borderRadius: boardRadius,
          filter: "none",
          easing: LIQUID_CARD_TRAVEL_EASING
        },
        {
          transformOrigin: "center",
          transform: "translate(" + translateX + "px, " + translateY + "px) scale(" + scaleX + ", " + scaleY + ")",
          borderRadius: transformedTargetRadius,
          filter: "none"
        }
      ], {
        duration: LIQUID_CARD_RETURN_DURATION,
        easing: LIQUID_CARD_MOTION_EASING,
        fill: "forwards"
      });
      tile.animate([
        { opacity: 1 },
        { offset: 0.68, opacity: 1 },
        { opacity: 0 }
      ], { duration: LIQUID_CARD_RETURN_DURATION, easing: "linear", fill: "forwards" });
      tileCanvas.animate([
        { opacity: 1, transform: "none", filter: "none", easing: LIQUID_CARD_TRAVEL_EASING },
        {
          offset: 0.52,
          opacity: 0.58,
          transform: "scale(" + canvasCounterScaleX + ", " + canvasCounterScaleY + ")",
          filter: "none",
          easing: LIQUID_CARD_TRAVEL_EASING
        },
        {
          opacity: 0,
          transform: "scale(" + canvasCounterScaleX + ", " + canvasCounterScaleY + ")",
          filter: "blur(0.8px)"
        }
      ], { duration: LIQUID_CARD_RETURN_DURATION, easing: LIQUID_CARD_MOTION_EASING, fill: "forwards" });
      var cardAnimation = targetCard.animate([
        { opacity: 0, transform: "scale(0.96)" },
        { offset: 0.44, opacity: 0, transform: "scale(0.96)" },
        { offset: 0.88, opacity: 1, transform: "none" },
        { opacity: 1, transform: "none" }
      ], { duration: LIQUID_CARD_RETURN_DURATION, easing: LIQUID_CARD_TRAVEL_EASING, fill: "forwards" });
      animation.onfinish = function finishBoardCollapse() {
        targetCard.classList.add("is-transition-ready", "is-handoff-stable");
        targetCard.classList.remove("is-transition-target");
        requestAnimationFrame(function paintRealCardBelowTransition() {
          cardAnimation.cancel();
          requestAnimationFrame(function retireTransitionLayer() {
            finishNavigationAnimation(tile);
            requestAnimationFrame(function restoreCardInteractions() {
              targetCard.classList.remove("is-transition-ready");
            });
            done();
          });
        });
      };
    });
  }

  function animateBoardArrival(direction, done) {
    if (prefersReducedMotion() || !dom.boardStage.animate) {
      dom.appShell.classList.remove("is-navigating");
      done();
      return;
    }
    var travel = direction === 0 ? 0 : direction * 34;
    var animation = dom.boardStage.animate([
      { opacity: 0, transform: "translateX(" + travel + "px) scale(0.91)" },
      { offset: 0.7, opacity: 1, transform: "translateX(" + (-travel * 0.08) + "px) scale(1.024)" },
      { opacity: 1, transform: "translateX(0) scale(1)" }
    ], { duration: 520, easing: "cubic-bezier(0.18, 0.9, 0.24, 1)" });
    animation.onfinish = function finishBoardArrival() {
      dom.appShell.classList.remove("is-navigating");
      done();
    };
  }

  function transitionToLevel(index, options) {
    options = options || {};
    if (!game || prefersReducedMotion() || !dom.boardStage.animate) {
      startLevel(index, options);
      return;
    }
    var direction = index === game.levelIndex ? 0 : (index > game.levelIndex ? 1 : -1);
    dom.appShell.classList.add("is-navigating");
    var travel = direction === 0 ? 0 : direction * -26;
    var animation = dom.boardStage.animate([
      { opacity: 1, transform: "translateX(0) scale(1)" },
      { opacity: 0, transform: "translateX(" + travel + "px) scale(0.92)" }
    ], { duration: 260, easing: "cubic-bezier(0.55, 0, 0.8, 0.2)", fill: "forwards" });
    animation.onfinish = function replaceBoardAfterExit() {
      releaseSettledBoardAnimation();
      animation.cancel();
      var startOptions = {};
      Object.keys(options).forEach(function copyStartOption(key) {
        startOptions[key] = options[key];
      });
      startOptions.levelSwitchDirection = direction;
      startLevel(index, startOptions);
    };
  }

  function introModeFor(levelIndex, options) {
    if (levelIndex === 0) {
      return "lesson";
    }
    if (options && options.introMode) {
      return options.introMode;
    }
    if (options && options.skipDemo) {
      return "none";
    }
    return hasLearnedLevel(levelIndex) ? "demo" : "lesson";
  }

  function startLevel(index, options) {
    var level = LEVELS[index];
    var introMode = introModeFor(index, options);
    var resumeMatch = options && options.resumeMatch && options.resumeMatch.levelIndex === index
      ? options.resumeMatch
      : null;
    var transition = options && options.transitionCard ? {
      rect: options.transitionCard.getBoundingClientRect(),
      borderRadius: window.getComputedStyle(options.transitionCard).borderRadius
    } : null;
    var levelSwitchDirection = options && options.levelSwitchDirection;
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
      outcome: null,
      winningMask: null,
      winReason: null,
      autoAdvancePending: false,
      lastMove: -1,
      demo: null,
      lesson: null,
      lessonReturn: options && options.lessonReturn ? options.lessonReturn : null,
      completion: null,
      review: null
    };
    game.board = Engine.createBoard(game.rules);
    if (resumeMatch && resumeMatch.board.length === game.board.length) {
      resumeMatch.board.forEach(function restoreBoardCell(value, cell) {
        game.board[cell] = value;
      });
      game.moves = resumeMatch.moves.map(function restoreMove(move) {
        return { cell: move.cell, player: move.player };
      });
      game.turn = resumeMatch.turn;
      game.lastMove = resumeMatch.lastMove;
    }
    renderState.hoverCell = -1;
    renderState.pressedCell = -1;
    renderState.pressedAt = 0;
    renderState.pressedMotionReady = false;
    renderState.lastMoveAt = 0;
    renderState.seamPulseAt = 0;
    renderState.winAt = 0;
    renderState.lastMoveFromPress = false;
    renderState.lastFrameAt = 0;
    if (level.topology === "sphere") {
      dom.gameLevelName.innerHTML = '<span class="optical-title-rise">归</span><span>圆</span>';
    } else {
      dom.gameLevelName.textContent = level.name;
    }
    dom.boardStage.classList.remove("is-settled", "is-exploring", "is-dragging");
    if (transition) {
      dom.appShell.classList.add("is-navigating");
    }
    dom.gameScreen.classList.toggle("is-shared-enter", Boolean(transition));
    showScreen("game");
    updateTurnUI();
    function readyLevel() {
      resizeCanvas();
      requestRender();
      if (introMode === "lesson") {
        startBoundaryLesson();
      } else if (introMode === "demo") {
        startBoundaryDemo();
      } else if (resumeMatch && game.turn === AI) {
        scheduleAiMove();
      }
    }
    requestAnimationFrame(function prepareBoardTransition() {
      resizeCanvas();
      requestRender();
      if (transition) {
        animateCardIntoBoard(transition, readyLevel);
      } else if (typeof levelSwitchDirection === "number") {
        animateBoardArrival(levelSwitchDirection, readyLevel);
      } else {
        window.setTimeout(readyLevel, 90);
      }
    });
  }

  function leaveGame() {
    if (!game) {
      return;
    }
    var levelIndex = game.levelIndex;
    var boardRect = dom.boardStage.getBoundingClientRect();
    turnToken += 1;
    closeActiveSheet(true);
    dom.thinkingIndicator.classList.remove("is-visible");
    game = null;
    updateHome();
    sound.play("ui");
    animateBoardBackToCard(levelIndex, boardRect, function finishLeaveGame() {});
  }

  function restartGame() {
    if (!game) {
      return;
    }
    var levelIndex = game.levelIndex;
    sound.play("ui");
    transitionToLevel(levelIndex, { introMode: "demo" });
  }

  function snapshotMatchForLesson() {
    if (!game || game.status !== "playing" || isInteractiveLesson()) {
      return null;
    }
    return {
      levelIndex: game.levelIndex,
      board: Array.prototype.slice.call(game.board),
      moves: game.moves.map(function copyMove(move) {
        return { cell: move.cell, player: move.player };
      }),
      turn: game.turn,
      lastMove: game.lastMove
    };
  }

  function replayBoundaryLesson() {
    if (!game || game.levelIndex === 0 || game.status === "forcing" || game.status === "lesson-complete") {
      return;
    }
    var levelIndex = game.levelIndex;
    var lessonReturn = game.lessonReturn || snapshotMatchForLesson();
    sound.play("ui");
    transitionToLevel(levelIndex, {
      introMode: "lesson",
      lessonReturn: lessonReturn
    });
  }

  function handleReviewToggle() {
    if (game && game.review) {
      endReplayReview();
      return;
    }
    if (isEndedView()) {
      beginReplayReview();
    }
  }

  function handleLeftTool() {
    undoMove();
  }

  function handleRightTool() {
    restartGame();
  }

  function handleSettledAction() {
    if (!game || !isEndedView()) {
      return;
    }
    restartGame();
  }

  function handleJourney() {
    if (isEndedView()) {
      leaveGame();
    }
  }

  function handleNextLevel() {
    if (!game || !isPassedView() || game.levelIndex >= LEVELS.length - 1) {
      return;
    }
    sound.play("ui");
    transitionToLevel(game.levelIndex + 1, false);
  }

  function traceLessonPath(definition) {
    if (!game || !definition) {
      return null;
    }
    var startCell = Engine.toCell(game.rules, definition.start[0], definition.start[1]);
    var path = Engine.tracePath(game.rules, startCell, definition.direction, game.rules.target);
    if (!path) {
      return null;
    }
    path.prompts = definition.prompts || TUTORIAL_PROMPTS;
    path.direction = definition.direction;
    return path;
  }

  function boundaryGuidePaths() {
    if (!game) {
      return [];
    }
    return (game.level.lessonPaths || []).map(traceLessonPath).filter(Boolean);
  }

  function boundaryLessonPaths() {
    if (!game || !game.level.tutorial) {
      return boundaryGuidePaths();
    }
    var lessonBoard = Engine.createBoard(game.rules);
    var cells = [];
    var lastCell = -1;
    for (var index = 0; index < game.rules.target; index += 1) {
      var cell = Engine.suggestTutorialMove(lessonBoard, game.rules, lastCell);
      if (cell < 0) {
        return null;
      }
      cells.push(cell);
      lessonBoard[cell] = HUMAN;
      lastCell = cell;
    }
    return [{
      cells: cells,
      seams: [0, 0, 0, 0],
      directions: [0, 0, 0, 0, 0],
      prompts: TUTORIAL_PROMPTS,
      direction: 0
    }];
  }

  function activateDemoPath(demo, pathIndex) {
    var path = demo.paths[pathIndex];
    demo.pathIndex = pathIndex;
    demo.startedAt = performance.now();
    demo.cells = path.cells;
    demo.seams = path.seams;
    demo.directions = path.directions;
    demo.duration = (path.cells.length - 1) * demo.dropInterval + demo.hold + demo.fade;
    path.cells.forEach(function scheduleDemoSound(cell, index) {
      window.setTimeout(function playDemoStone() {
        if (
          game
          && game.demo === demo
          && demo.active
          && demo.pathIndex === pathIndex
          && demo.cells[index] === cell
        ) {
          sound.play("move-human");
          if (index > 0 && demo.seams[index - 1]) {
            sound.play("seam");
          }
        }
      }, index * demo.dropInterval);
    });
  }

  function startBoundaryDemo() {
    var paths = boundaryGuidePaths();
    if (!paths.length) {
      return;
    }
    game.demo = {
      active: true,
      paths: paths,
      pathIndex: 0,
      dropInterval: 245,
      hold: 390,
      fade: 330
    };
    activateDemoPath(game.demo, 0);
    updateTurnUI();
    requestRender();
  }

  function activateLessonPath(lesson, pathIndex) {
    var path = lesson.paths[pathIndex];
    lesson.pathIndex = pathIndex;
    lesson.cells = path.cells;
    lesson.seams = path.seams;
    lesson.directions = path.directions;
    lesson.prompts = path.prompts;
    lesson.step = 0;
    lesson.startedAt = performance.now();
  }

  function startBoundaryLesson() {
    var paths = boundaryLessonPaths();
    if (!paths.length) {
      return;
    }
    game.lesson = {
      active: true,
      completed: false,
      paths: paths,
      pathIndex: 0
    };
    activateLessonPath(game.lesson, 0);
    game.turn = HUMAN;
    updateTurnUI();
    requestRender();
  }

  function finishBoundaryDemo(continueSequence) {
    if (!game || !game.demo || !game.demo.active) {
      return;
    }
    if (continueSequence && game.demo.pathIndex < game.demo.paths.length - 1) {
      activateDemoPath(game.demo, game.demo.pathIndex + 1);
      updateTurnUI();
      requestRender();
      return;
    }
    game.demo.active = false;
    updateTurnUI();
    requestRender();
  }

  function tutorialMoveCount() {
    return game.moves.filter(function countTutorialStones(move) {
      return move.player === HUMAN;
    }).length;
  }

  function tutorialPromptText() {
    var count = tutorialMoveCount();
    return TUTORIAL_PROMPTS[Math.min(count, TUTORIAL_PROMPTS.length - 1)];
  }

  function isInteractiveLesson() {
    return Boolean(game && game.lesson && game.lesson.active);
  }

  function lessonPromptText() {
    if (!game || !game.lesson) {
      return game ? game.level.ruleText : "";
    }
    if (game.level.tutorial) {
      return tutorialPromptText();
    }
    var prompts = game.lesson.prompts || TUTORIAL_PROMPTS;
    return prompts[Math.min(game.lesson.step, prompts.length - 1)];
  }

  function isVictoryView() {
    return Boolean(game && game.status === "ended" && game.outcome === "win");
  }

  function isPassedView() {
    return Boolean(game && game.status === "ended" && (game.outcome === "win" || game.outcome === "draw"));
  }

  function isEndedView() {
    return Boolean(game && game.status === "ended");
  }

  function isReviewing() {
    return Boolean(game && game.review && game.status === "ended");
  }

  function canPresentCompletion() {
    return Boolean(game && game.levelIndex > 0 && Morph);
  }

  function resultMoveText() {
    if (!game) {
      return "";
    }
    if (Replay) {
      return Replay.resultText(game.outcome, game.moves.length);
    }
    return game.moves.length + " 手";
  }

  function syncGameTools() {
    if (!game) {
      return;
    }
    var ended = isEndedView();
    var passed = isPassedView();
    var reviewing = isReviewing();
    var lessonComplete = game.status === "lesson-complete";
    var firstLevel = game.levelIndex === 0;
    var autoAdvancing = ended && Boolean(game.autoAdvancePending);
    var hasNextLevel = passed && game.levelIndex < LEVELS.length - 1;
    var canToggleDimension = ended && canPresentCompletion();
    var surfaceVisible = Boolean(game.completion && game.completion.phase === "presenting");
    var dimensionTransitioning = Boolean(game.completion && !game.completion.settled);
    var reviewToolsHidden = !ended || autoAdvancing || firstLevel;

    dom.gameScreen.classList.toggle("has-endgame-tools", ended && !autoAdvancing && !firstLevel);
    dom.gameTools.classList.toggle("is-ended", ended);
    dom.gameTools.classList.toggle("has-next-level", ended && hasNextLevel);
    dom.gameTools.classList.toggle("is-auto-advancing", autoAdvancing);
    dom.gameTools.classList.toggle("is-basic-tutorial", !ended && game.levelIndex === 0);
    dom.endgameReviewTools.hidden = false;
    dom.endgameReviewTools.classList.toggle("is-reserved", reviewToolsHidden);
    dom.endgameReviewTools.setAttribute("aria-hidden", String(reviewToolsHidden));
    dom.endgameReviewTools.classList.toggle("is-reviewing", reviewing);
    dom.endgameReviewTools.classList.toggle("has-no-dimension", !canToggleDimension);
    dom.humanChip.hidden = false;
    dom.aiChip.hidden = false;
    dom.reviewToggleButton.disabled = dimensionTransitioning;
    dom.reviewPreviousButton.disabled = dimensionTransitioning || !reviewing || game.review.step <= 0;
    dom.reviewNextButton.disabled = dimensionTransitioning || !reviewing || game.review.step >= game.review.total;
    dom.dimensionToggleButton.hidden = !canToggleDimension;
    dom.dimensionToggleButton.disabled = dimensionTransitioning;
    dom.boundaryDemoButton.hidden = ended || game.levelIndex === 0;
    dom.boundaryDemoButton.disabled = game.status === "forcing" || lessonComplete;
    dom.boundaryDemoButton.classList.toggle(
      "is-active",
      Boolean((game.demo && game.demo.active) || isInteractiveLesson())
    );
    dom.undoButton.hidden = ended;
    dom.journeyButton.hidden = !ended;
    dom.settledReplayButton.hidden = !ended || firstLevel;
    dom.nextLevelButton.hidden = !ended;
    dom.restartButton.hidden = ended;

    if (ended) {
      if (reviewing) {
        dom.reviewToggleButton.setAttribute("aria-label", "结束复盘并返回终局");
        dom.reviewToggleButtonText.textContent = "定局";
        dom.reviewToggleIconPath.setAttribute("d", "m5 12 4 4L19 6");
      } else {
        dom.reviewToggleButton.setAttribute("aria-label", "复盘棋局");
        dom.reviewToggleButtonText.textContent = "复盘";
        dom.reviewToggleIconPath.setAttribute("d", "M9 8H5V4M5 8c2-3 5-4 8-4 5 0 8 4 8 8s-3 8-8 8c-3 0-6-2-7-4");
      }
      dom.settledReplayButton.disabled = dimensionTransitioning;
      dom.settledReplayButton.setAttribute("aria-label", "再玩一次");
      dom.settledReplayButtonText.textContent = "再来";
      dom.settledReplayIconPath.setAttribute("d", "M20 7v5h-5M19 12a7 7 0 1 0-2 5");
      dom.nextLevelButton.disabled = dimensionTransitioning || !hasNextLevel;
      dom.journeyButton.disabled = dimensionTransitioning;
      dom.nextLevelButton.setAttribute("aria-label", hasNextLevel ? "进入下一关" : "下一关不可用");
      dom.nextLevelButtonText.textContent = "下一关";
      dom.nextLevelIconPath.setAttribute("d", "m9 6 6 6-6 6");
      dom.dimensionToggleButton.setAttribute("aria-label", surfaceVisible ? "查看二维棋盘" : "查看三维棋局");
      dom.dimensionToggleButtonText.textContent = surfaceVisible ? "二维" : "三维";
      dom.dimensionToggleIconPath.setAttribute(
        "d",
        surfaceVisible
          ? "M4 4h16v16H4zM9.33 4v16M14.67 4v16M4 9.33h16M4 14.67h16"
          : "M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Zm0 0v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"
      );
      dom.boardStage.classList.toggle("is-exploring", surfaceVisible);
      dom.boardStage.classList.toggle("is-settled", !surfaceVisible && !reviewing);
      dom.boardStage.classList.toggle("is-returning", Boolean(game.completion && game.completion.phase === "returning"));
      return;
    }

    dom.boundaryDemoButton.hidden = game.levelIndex === 0;
    dom.journeyButton.hidden = true;
    dom.settledReplayButton.hidden = true;
    dom.nextLevelButton.hidden = true;
    dom.undoButton.hidden = false;
    dom.restartButton.hidden = false;
    dom.undoButton.setAttribute("aria-label", "悔棋");
    dom.undoButtonText.textContent = "悔棋";
    dom.undoIconPath.setAttribute("d", "M9 8H5v-4M5 8c2-3 5-4 8-4 5 0 8 4 8 8s-3 8-8 8c-3 0-6-2-7-4");
    dom.restartButton.setAttribute("aria-label", "重新开始");
    dom.restartButtonText.textContent = "重来";
    dom.restartIconPath.setAttribute("d", "M20 7v5h-5M19 12a7 7 0 1 0-2 5");
    dom.boardStage.classList.remove("is-exploring", "is-settled", "is-dragging", "is-returning");
  }

  function updateTurnUI() {
    if (!game) {
      return;
    }
    var demoActive = Boolean(game.demo && game.demo.active);
    var lessonActive = isInteractiveLesson();
    var completionActive = Boolean(game.completion && game.completion.active);
    var humanTurn = game.status === "playing" && game.turn === HUMAN && !demoActive;
    var aiTurn = game.status === "playing" && game.turn === AI && !demoActive;
    var aiActuallyThinking = aiTurn && !(DEV_MODE && developer.aiPaused);
    dom.humanChip.classList.toggle("is-active", humanTurn);
    dom.aiChip.classList.toggle("is-active", aiTurn);
    dom.aiChip.classList.toggle("is-tutorial-hidden", Boolean(game.level.tutorial || lessonActive));
    dom.difficultyLabel.textContent = game.level.tutorial || lessonActive ? "教学" : DIFFICULTIES[prefs.difficulty].label;
    dom.thinkingIndicator.classList.toggle("is-visible", aiActuallyThinking);
    dom.undoButton.disabled = game.moves.length === 0 || game.status !== "playing";
    if (completionActive && game.completion.phase === "returning") {
      dom.turnStatus.textContent = "回到二维";
    } else if (isReviewing()) {
      dom.turnStatus.textContent = (Replay ? Replay.progressTitle(game.review.step) : "复盘")
        + " · " + game.review.step + " / " + game.review.total;
    } else if (completionActive) {
      dom.turnStatus.textContent = game.completion.settled ? resultMoveText() : "边界合拢";
    } else if (demoActive) {
      dom.turnStatus.textContent = "边界演示";
    } else if (game.status === "lesson-line-complete") {
      dom.turnStatus.textContent = "再看一条连线";
    } else if (game.status === "lesson-complete") {
      dom.turnStatus.textContent = "边界已懂";
    } else if (game.status === "ended") {
      dom.turnStatus.textContent = game.autoAdvancePending
        ? "下一关"
        : resultMoveText();
    } else if (game.status === "forcing") {
      dom.turnStatus.textContent = "跨界连线";
    } else if (aiTurn && DEV_MODE && developer.aiPaused) {
      dom.turnStatus.textContent = "AI 已暂停";
    } else if (aiTurn) {
      dom.turnStatus.textContent = "思考中";
    } else {
      if (lessonActive) {
        dom.turnStatus.textContent = lessonPromptText();
      } else if (game.level.tutorial) {
        dom.turnStatus.textContent = "自由落子";
      } else {
        dom.turnStatus.textContent = "你的回合";
      }
    }
    if (DEV_MODE && activeSheet === dom.developerSheet) {
      syncDeveloperUI();
    }
    syncGameTools();
  }

  function connectedSeamAtCell(cell) {
    var point = Engine.toPoint(game.rules, cell);
    var bits = 0;
    if (game.level.topology === "sphere") {
      if (point.x === 0 || point.y === 0) {
        bits |= Engine.SEAM_X;
      }
      if (point.x === game.rules.width - 1 || point.y === game.rules.height - 1) {
        bits |= Engine.SEAM_Y;
      }
      return bits;
    }
    if (game.level.xConnection && (point.x === 0 || point.x === game.rules.width - 1)) {
      bits |= Engine.SEAM_X;
    }
    if (game.level.yConnection && (point.y === 0 || point.y === game.rules.height - 1)) {
      bits |= Engine.SEAM_Y;
    }
    return bits;
  }

  function performMove(cell, player, options) {
    if (!game || game.status !== "playing" || game.board[cell] !== Engine.EMPTY) {
      return false;
    }
    var lesson = isInteractiveLesson() ? game.lesson : null;
    if (lesson && (player !== HUMAN || lesson.cells[lesson.step] !== cell)) {
      return false;
    }
    game.board[cell] = player;
    game.moves.push({ cell: cell, player: player });
    game.lastMove = cell;
    renderState.lastMoveAt = performance.now();
    renderState.lastMoveFromPress = Boolean(options && options.fromPress);
    renderState.hoverCell = -1;
    renderState.pressedCell = -1;
    renderState.pressedAt = 0;
    renderState.pressedMotionReady = false;

    var lessonSeam = lesson && lesson.step > 0 ? lesson.seams[lesson.step - 1] : 0;
    var seamBits = lessonSeam || connectedSeamAtCell(cell);
    if (seamBits) {
      renderState.seamPulseAt = performance.now();
      renderState.seamPulseBits = seamBits;
    }

    sound.play(player === HUMAN ? "move-human" : "move-ai");
    if (seamBits) {
      window.setTimeout(function playSeamSound() { sound.play("seam"); }, 65);
    }

    if (lesson) {
      lesson.step += 1;
    }

    var winningMask = Engine.checkWin(game.board, game.rules, cell, player);
    if (winningMask) {
      if (lesson && (game.lessonReturn || !game.level.tutorial)) {
        finishBoundaryLesson(winningMask);
      } else {
        finishGame(player === HUMAN ? "win" : "lose", winningMask);
      }
    } else if (game.level.tutorial || lesson) {
      game.turn = HUMAN;
      updateTurnUI();
    } else if (Engine.playerWinsByBlockingAi(game.board, game.rules)) {
      finishGame("win", null, "blocked");
    } else if (Engine.playerHasNoWinningPath(game.board, game.rules)) {
      finishGame("win", null, "settled");
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

  function finishBoundaryLesson(winningMask) {
    if (!game || !game.lesson) {
      return;
    }
    turnToken += 1;
    var lessonGame = game;
    var lessonToken = turnToken;
    var hasNextPath = game.lesson.pathIndex < game.lesson.paths.length - 1;
    game.lesson.active = false;
    game.lesson.completed = true;
    game.status = hasNextPath ? "lesson-line-complete" : "lesson-complete";
    game.turn = 0;
    game.winningMask = winningMask;
    renderState.winAt = performance.now();
    if (!hasNextPath) {
      rememberLevel(game.levelIndex);
    }
    updateTurnUI();
    sound.play("win");
    requestRender();
    window.setTimeout(function continueAfterLessonLine() {
      if (
        game !== lessonGame
        || turnToken !== lessonToken
        || (game.status !== "lesson-line-complete" && game.status !== "lesson-complete")
      ) {
        return;
      }
      if (hasNextPath) {
        game.board.fill(Engine.EMPTY);
        game.moves = [];
        game.lastMove = -1;
        game.winningMask = null;
        game.status = "playing";
        game.turn = HUMAN;
        game.lesson.active = true;
        game.lesson.completed = false;
        activateLessonPath(game.lesson, game.lesson.pathIndex + 1);
        renderState.lastMoveAt = 0;
        renderState.seamPulseAt = 0;
        renderState.winAt = 0;
        updateTurnUI();
        requestRender();
        return;
      }
      if (game.lessonReturn) {
        transitionToLevel(game.levelIndex, {
          introMode: "none",
          resumeMatch: game.lessonReturn
        });
        return;
      }
      transitionToLevel(game.levelIndex, { introMode: "none" });
    }, hasNextPath ? 920 : 1080);
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

  function chooseCompletionView(winningMask, presentation) {
    if (!winningMask || !winningMask.cells || !winningMask.cells.length || !Morph) {
      return { x: 0, y: 0, z: 0, shapeX: 1, shapeY: 1, shapeZ: 1 };
    }
    var cells = Array.prototype.slice.call(winningMask.cells);
    var size = Math.max(1, Math.min(renderState.width, renderState.height));
    var targetLength = size * 0.34;
    var best = { x: 0, y: 0, z: 0, shapeX: 1, shapeY: 1, shapeZ: 1 };
    var bestScore = -Infinity;
    var pitchSteps = [-0.66, -0.44, -0.22, 0, 0.22, 0.44, 0.66];
    var rollSteps = [-0.36, -0.18, 0, 0.18, 0.36];
    var shapeSteps = game.level.topology === "sphere" ? [
      { x: 1, y: 1, z: 1 }
    ] : [
      { x: 1, y: 1, z: 1 },
      { x: 0.92, y: 1.06, z: 1.04 },
      { x: 1.07, y: 0.93, z: 1.02 },
      { x: 0.96, y: 1.02, z: 1.09 }
    ];
    pitchSteps.forEach(function testPitch(pitch) {
      for (var yawIndex = 0; yawIndex < 41; yawIndex += 1) {
        var yaw = -Math.PI + yawIndex / 40 * Math.PI * 2;
        rollSteps.forEach(function testRoll(roll) {
          shapeSteps.forEach(function testShape(shape) {
            var points = cells.map(function projectWinningCell(cell) {
              var uv = Morph.stoneUV(game.rules, cell);
              return Morph.project(game.level.topology, uv.u, uv.v, renderState.width, renderState.height, {
                x: pitch,
                y: yaw,
                z: roll,
                shapeX: shape.x,
                shapeY: shape.y,
                shapeZ: shape.z,
                presentation: presentation
              });
            });
            var pathLength = 0;
            var segmentLengths = [];
            var depthTotal = 0;
            var minDepth = Infinity;
            var maxDepth = -Infinity;
            var centerX = 0;
            var centerY = 0;
            points.forEach(function scorePoint(point, index) {
              depthTotal += point.depth;
              minDepth = Math.min(minDepth, point.depth);
              maxDepth = Math.max(maxDepth, point.depth);
              centerX += point.x;
              centerY += point.y;
              if (index > 0) {
                var segmentLength = Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y);
                segmentLengths.push(segmentLength);
                pathLength += segmentLength;
              }
            });
            centerX /= points.length;
            centerY /= points.length;
            var meanSegment = pathLength / Math.max(1, segmentLengths.length);
            var segmentVariance = segmentLengths.reduce(function sumSegmentVariance(total, length) {
              return total + Math.pow(length - meanSegment, 2);
            }, 0) / Math.max(1, segmentLengths.length);
            var segmentVariation = Math.sqrt(segmentVariance) / Math.max(1, meanSegment);
            var shortestSegment = Math.min.apply(Math, segmentLengths);
            var longestSegment = Math.max.apply(Math, segmentLengths);
            var extremeStretch = longestSegment / Math.max(1, shortestSegment);
            var averageDepth = depthTotal / points.length;
            var centerDistance = Math.hypot(centerX - renderState.width * 0.5, centerY - renderState.height * 0.5);
            var shapeCost = Math.abs(shape.x - 1) + Math.abs(shape.y - 1) + Math.abs(shape.z - 1);
            var lineDeviation = 0;
            var turnPenalty = 0;
            var sphereSingularityDepth = 0;
            if (game.level.topology === "sphere" && points.length > 2) {
              var lineStart = points[0];
              var lineEnd = points[points.length - 1];
              var lineX = lineEnd.x - lineStart.x;
              var lineY = lineEnd.y - lineStart.y;
              var lineLength = Math.hypot(lineX, lineY) || 1;
              for (var bendIndex = 1; bendIndex < points.length - 1; bendIndex += 1) {
                lineDeviation += Math.abs(
                  lineX * (points[bendIndex].y - lineStart.y) -
                  lineY * (points[bendIndex].x - lineStart.x)
                ) / lineLength / size;
                var incomingX = points[bendIndex].x - points[bendIndex - 1].x;
                var incomingY = points[bendIndex].y - points[bendIndex - 1].y;
                var outgoingX = points[bendIndex + 1].x - points[bendIndex].x;
                var outgoingY = points[bendIndex + 1].y - points[bendIndex].y;
                turnPenalty += 1 - (
                  incomingX * outgoingX + incomingY * outgoingY
                ) / Math.max(1, Math.hypot(incomingX, incomingY) * Math.hypot(outgoingX, outgoingY));
              }
              var sphereView = {
                x: pitch,
                y: yaw,
                z: roll,
                shapeX: 1,
                shapeY: 1,
                shapeZ: 1,
                presentation: presentation
              };
              var upperPole = Morph.project("sphere", 2 / 3, 1 / 3, renderState.width, renderState.height, sphereView);
              var lowerPole = Morph.project("sphere", 1 / 3, 2 / 3, renderState.width, renderState.height, sphereView);
              sphereSingularityDepth = Math.max(Math.abs(upperPole.depth), Math.abs(lowerPole.depth));
            }
            var score = averageDepth * 5.4 + minDepth * 4.8;
            score -= Math.abs(pathLength - targetLength) / size * 1.35;
            score -= (maxDepth - minDepth) * 0.8;
            score -= segmentVariation * 2.1;
            score -= Math.max(0, extremeStretch - 2.15) * 2.8;
            score -= shortestSegment < size * 0.026 ? 2.8 : 0;
            score -= centerDistance / size * 0.2;
            score -= Math.abs(roll) * 0.06;
            score -= shapeCost * 0.28;
            score -= lineDeviation * 5.6;
            score -= turnPenalty * 0.72;
            score -= sphereSingularityDepth * 1.15;
            if (score > bestScore) {
              bestScore = score;
              best = {
                x: pitch,
                y: yaw,
                z: roll,
                shapeX: shape.x,
                shapeY: shape.y,
                shapeZ: shape.z
              };
            }
          });
        });
      }
    });
    return best;
  }

  function createCompletionState() {
    if (!canPresentCompletion()) {
      return null;
    }
    var startedAt = performance.now();
    var winningMask = game.winningMask;
    var presentation = winningMask
      ? Morph.createPresentation(game.level.topology, game.rules, Array.prototype.slice.call(winningMask.cells))
      : null;
    return {
      active: true,
      phase: "presenting",
      startedAt: startedAt,
      lineStartedAt: renderState.winAt || startedAt,
      duration: 3000,
      settled: false,
      view: chooseCompletionView(winningMask, presentation),
      presentation: presentation,
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0 },
      elastic: { x: 0, y: 0, velocityX: 0, velocityY: 0 },
      dragging: false,
      pointerId: null,
      lastX: 0,
      lastY: 0,
      lastPointerAt: 0,
      autoResumeAt: startedAt + 2450
    };
  }

  function startCompletionPresentation(manual) {
    if (!game || !isEndedView() || game.completion || !canPresentCompletion()) {
      return;
    }
    game.completion = createCompletionState();
    updateTurnUI();
    if (manual) {
      sound.play("ui");
      window.setTimeout(function playRequestedMorph() {
        if (game && game.completion && game.completion.phase === "presenting") {
          sound.play("morph");
        }
      }, 120);
    }
    requestRender();
  }

  function returnCompletionToFlat() {
    if (!game || !game.completion || game.completion.phase !== "presenting" || !game.completion.settled) {
      return;
    }
    game.completion.phase = "returning";
    game.completion.startedAt = performance.now();
    game.completion.duration = prefersReducedMotion() ? 1 : 1050;
    game.completion.settled = false;
    game.completion.dragging = false;
    game.completion.pointerId = null;
    game.completion.velocity.x = 0;
    game.completion.velocity.y = 0;
    game.completion.elastic.velocityX = 0;
    game.completion.elastic.velocityY = 0;
    dom.boardStage.classList.remove("is-dragging");
    sound.play("ui");
    updateTurnUI();
    requestRender();
  }

  function toggleEndgameDimension() {
    if (!game || !isEndedView() || !canPresentCompletion()) {
      return;
    }
    if (game.completion) {
      returnCompletionToFlat();
    } else {
      startCompletionPresentation(true);
    }
  }

  function setReplayStep(step, animateMove) {
    if (!game || !game.review || !Replay) {
      return false;
    }
    var previousStep = game.review.step;
    var nextStep = Replay.clampStep(step, game.review.total);
    if (nextStep === previousStep) {
      return false;
    }
    game.review.step = nextStep;
    game.board = Replay.boardAt(game.moves, game.rules.cellCount, nextStep, Engine.EMPTY);
    game.lastMove = nextStep > 0 ? game.moves[nextStep - 1].cell : -1;
    renderState.lastMoveAt = animateMove && nextStep > previousStep ? performance.now() : 0;
    renderState.lastMoveFromPress = false;
    renderState.winAt = nextStep === game.review.total && game.winningMask
      ? (animateMove ? performance.now() : performance.now() - 800)
      : 0;
    if (game.completion && renderState.winAt) {
      game.completion.lineStartedAt = renderState.winAt;
    }
    updateTurnUI();
    requestRender();
    return true;
  }

  function activateReplayReview() {
    if (!game || !isEndedView() || !Replay) {
      return;
    }
    var total = game.moves.length;
    game.review = { step: -1, total: total };
    setReplayStep(total, false);
  }

  function beginReplayReview() {
    if (!game || !isEndedView() || game.review) {
      return;
    }
    if (game.completion && !game.completion.settled) {
      return;
    }
    sound.play("ui");
    activateReplayReview();
  }

  function endReplayReview() {
    if (!game || !game.review) {
      return;
    }
    setReplayStep(game.review.total, false);
    game.review = null;
    sound.play("ui");
    updateTurnUI();
    requestRender();
  }

  function stepReplay(direction) {
    if (!game || !game.review) {
      return;
    }
    if (setReplayStep(game.review.step + direction, direction > 0)) {
      sound.play("ui");
    }
  }

  function finishGame(outcome, winningMask, reason) {
    turnToken += 1;
    var finishedGame = game;
    var passed = outcome === "win" || outcome === "draw";
    var firstLevelAutoAdvance = passed
      && game.levelIndex === 0
      && LEVELS.length > 1;
    game.status = "ended";
    game.outcome = outcome;
    game.turn = 0;
    game.winningMask = winningMask;
    game.winReason = reason || null;
    game.review = null;
    game.autoAdvancePending = firstLevelAutoAdvance;
    renderState.winAt = performance.now();
    var shouldMorph = passed && game.levelIndex > 0 && Boolean(Morph);
    game.completion = shouldMorph ? createCompletionState() : null;
    if (winningMask && winningMask.seam) {
      renderState.seamPulseAt = performance.now();
      renderState.seamPulseBits = winningMask.seam;
    }
    updateTurnUI();

    if (passed) {
      rememberLevel(game.levelIndex);
      prefs.completed[game.levelIndex] = true;
      prefs.bestDifficulty[game.levelIndex] = Math.max(
        Number(prefs.bestDifficulty[game.levelIndex]) || 0,
        DIFFICULTIES[prefs.difficulty].rank
      );
      if (game.levelIndex < LEVELS.length - 1) {
        prefs.unlocked = Math.max(prefs.unlocked, game.levelIndex + 1);
      }
      savePreferences();
      sound.play(outcome === "win" ? "win" : "draw");
      if (shouldMorph) {
        window.setTimeout(function playMorphSound() {
          if (game === finishedGame && game.completion) {
            sound.play("morph");
          }
        }, 260);
      }
      if (firstLevelAutoAdvance) {
        window.setTimeout(function enterSecondLevel() {
          if (game !== finishedGame || game.status !== "ended" || !game.autoAdvancePending) {
            return;
          }
          game.autoAdvancePending = false;
          transitionToLevel(1, {});
        }, TUTORIAL_AUTO_ADVANCE_DELAY);
      }
    } else if (outcome === "lose") {
      sound.play("lose");
    }

    requestRender();
  }

  function undoMove() {
    if (!game || game.status !== "playing" || !game.moves.length) {
      return;
    }
    turnToken += 1;
    dom.thinkingIndicator.classList.remove("is-visible");

    var lessonActive = isInteractiveLesson();
    var removeCount = game.level.tutorial || lessonActive ? 1 : (game.turn === AI ? 1 : Math.min(2, game.moves.length));
    while (removeCount > 0 && game.moves.length) {
      var move = game.moves.pop();
      game.board[move.cell] = Engine.EMPTY;
      removeCount -= 1;
    }
    game.lastMove = game.moves.length ? game.moves[game.moves.length - 1].cell : -1;
    if (lessonActive) {
      game.lesson.step = game.moves.length;
    }
    game.turn = HUMAN;
    renderState.lastMoveAt = performance.now();
    renderState.seamPulseAt = 0;
    updateTurnUI();
    requestRender();
    sound.play("ui");
  }

  function openSettings() {
    syncSettingsUI();
    openSheet(dom.settingsSheet);
    requestAnimationFrame(syncSettingsUI);
    sound.play("ui");
  }

  function difficultyIndex(difficulty) {
    return Math.max(0, DIFFICULTY_ORDER.indexOf(difficulty));
  }

  function previewDifficulty(index) {
    var bounded = Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, Math.round(index)));
    dom.difficultyButtons.forEach(function updateDifficultyPreview(button) {
      var active = button.dataset.difficulty === DIFFICULTY_ORDER[bounded];
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncDifficultyLensGeometry(index) {
    var controlWidth = dom.difficultyControl.clientWidth;
    var itemWidth = dom.difficultyThumb.offsetWidth || Math.max(1, (controlWidth - 14) / 3);
    var translation = index * (itemWidth + 3);
    dom.difficultyThumb.style.setProperty("--lens-track-width", controlWidth + "px");
    dom.difficultyThumb.style.setProperty("--lens-track-offset", (-4 - translation) + "px");
    dom.difficultyThumb.style.setProperty("--lens-origin-x", (4 + translation + itemWidth / 2) + "px");
  }

  function syncSwitchLensGeometry(control, enabled) {
    var knob = control.querySelector("i");
    var travel = Math.max(1, control.clientWidth - 6 - knob.offsetWidth);
    var translation = enabled ? travel : 0;
    knob.style.setProperty("--lens-track-width", control.clientWidth + "px");
    knob.style.setProperty("--lens-track-offset", (-3 - translation) + "px");
    knob.style.setProperty("--lens-origin-x", (3 + translation + knob.offsetWidth / 2) + "px");
  }

  function syncSettingsUI() {
    var selectedDifficulty = difficultyIndex(prefs.difficulty);
    previewDifficulty(selectedDifficulty);
    dom.difficultyControl.dataset.index = String(selectedDifficulty);
    syncDifficultyLensGeometry(selectedDifficulty);
    if (!dom.difficultyControl.classList.contains("is-dragging")) {
      dom.difficultyThumb.style.removeProperty("transform");
      dom.difficultyThumb.style.removeProperty("transform-origin");
    }
    syncSwitchUI(dom.hintSwitch, prefs.hints);
    dom.hintSwitch.setAttribute("aria-checked", prefs.hints ? "true" : "false");
    syncSwitchUI(dom.soundSwitch, prefs.sound);
    dom.soundSwitch.setAttribute("aria-checked", prefs.sound ? "true" : "false");
    dom.difficultyLabel.textContent = DIFFICULTIES[prefs.difficulty].label;
  }

  function syncSwitchUI(control, enabled) {
    control.classList.toggle("is-on", enabled);
    syncSwitchLensGeometry(control, enabled);
    if (!control.classList.contains("is-dragging")) {
      var knob = control.querySelector("i");
      knob.style.removeProperty("transform");
      knob.style.removeProperty("transform-origin");
    }
  }

  function liquidGlideDuration(control, travelDistance, directSelection, touchInput) {
    var distance = Math.max(0, Math.min(2, Math.abs(travelDistance || 0)));
    if (control === dom.difficultyControl) {
      if (directSelection) {
        if (touchInput) {
          return Math.round(660 + distance * 140);
        }
        return Math.round(540 + distance * 100);
      }
      if (touchInput) {
        return Math.round(720 + distance * 140);
      }
      return Math.round(680 + distance * 120);
    }
    if (directSelection) {
      return touchInput ? 820 : 660;
    }
    if (touchInput) {
      return Math.round(720 + Math.min(1, distance) * 120);
    }
    return Math.round(660 + Math.min(1, distance) * 100);
  }

  function settleLiquidControl(control, duration) {
    control.classList.remove("is-settling");
    void control.offsetWidth;
    control.classList.add("is-settling");
    window.setTimeout(function finishLiquidSettlement() {
      control.classList.remove("is-settling");
      control.style.removeProperty("--liquid-glide-duration");
    }, duration);
  }

  function finishLiquidGlide(control, duration, pressedMovingElement) {
    if (pressedMovingElement) {
      settleLiquidControl(control, duration);
      return;
    }
    window.setTimeout(function finishUnpressedLiquidGlide() {
      control.style.removeProperty("--liquid-glide-duration");
    }, duration);
  }

  function animateLiquidSelection(control, movingElement, travelDistance, directSelection, touchInput, pressedMovingElement, commitSelection) {
    if (!movingElement.style.translate) {
      movingElement.style.translate = window.getComputedStyle(movingElement).translate;
    }
    var duration = liquidGlideDuration(control, travelDistance, directSelection, touchInput);
    control.style.setProperty("--liquid-glide-duration", duration + "ms");
    control.classList.remove("is-dragging", "is-settling");
    commitSelection();
    window.requestAnimationFrame(function releaseLiquidSelection() {
      movingElement.style.removeProperty("translate");
      movingElement.style.removeProperty("scale");
      movingElement.style.removeProperty("transform-origin");
      finishLiquidGlide(control, duration, pressedMovingElement);
    });
  }

  function pointerHitsElement(event, element) {
    var rect = element.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  function setDifficulty(difficulty) {
    if (!DIFFICULTIES[difficulty]) {
      return;
    }
    prefs.difficulty = difficulty;
    savePreferences();
    syncSettingsUI();
    sound.play("ui");
  }

  function setSoundEnabled(enabled) {
    prefs.sound = Boolean(enabled);
    sound.setEnabled(prefs.sound);
    savePreferences();
    syncSettingsUI();
    if (prefs.sound) {
      sound.play("ui");
    }
  }

  function setHintsEnabled(enabled) {
    prefs.hints = Boolean(enabled);
    savePreferences();
    syncSettingsUI();
    requestRender();
    sound.play("ui");
  }

  function detentProgress(progress, maximum) {
    if (progress <= 0 || progress >= maximum) {
      return progress;
    }
    var nearestStop = Math.round(progress);
    var distance = progress - nearestStop;
    var normalizedDistance = Math.min(1, Math.abs(distance) * 2);
    var attractedDistance = Math.pow(normalizedDistance, 2.05) * 0.5;
    return nearestStop + (distance < 0 ? -attractedDistance : attractedDistance);
  }

  function bindDifficultySlider() {
    var control = dom.difficultyControl;
    var drag = null;

    function geometry() {
      var rect = control.getBoundingClientRect();
      var itemWidth = dom.difficultyThumb.offsetWidth || Math.max(1, (rect.width - 14) / 3);
      return {
        rect: rect,
        itemWidth: itemWidth,
        step: itemWidth + 3
      };
    }

    function indexAt(clientX, metrics) {
      var firstCenter = metrics.rect.left + 4 + metrics.itemWidth / 2;
      return Math.max(0, Math.min(2, (clientX - firstCenter) / metrics.step));
    }

    function paint(progress, delta, pressedThumb) {
      var energy = Math.min(1, Math.abs(delta) / 18);
      var stretch = pressedThumb ? 1.24 + energy * 0.12 : 1;
      var lift = pressedThumb ? 1.62 + energy * 0.08 : 1;
      var anchor = progress / 2;
      var expansionOffset = drag.metrics.itemWidth * (stretch - 1) * anchor * 0.6;
      var thumbTranslation = progress * drag.metrics.step - expansionOffset;
      dom.difficultyThumb.style.translate = thumbTranslation + "px 0";
      if (pressedThumb) {
        dom.difficultyThumb.style.scale = stretch + " " + lift;
        dom.difficultyThumb.style.transformOrigin = "left center";
      } else {
        dom.difficultyThumb.style.removeProperty("scale");
        dom.difficultyThumb.style.removeProperty("transform-origin");
      }
      dom.difficultyThumb.style.setProperty("--lens-track-width", drag.metrics.rect.width + "px");
      dom.difficultyThumb.style.setProperty("--lens-track-offset", (-4 - thumbTranslation) + "px");
      dom.difficultyThumb.style.setProperty("--lens-origin-x", (4 + thumbTranslation + drag.metrics.itemWidth / 2) + "px");
      control.style.setProperty("--press-origin", ((progress / 2) * 100).toFixed(1) + "%");
      previewDifficulty(Math.max(0, Math.min(2, progress)));
    }

    control.addEventListener("pointerdown", function beginDifficultyDrag(event) {
      if (event.isPrimary === false || event.button > 0) {
        return;
      }
      var metrics = geometry();
      var startIndex = difficultyIndex(prefs.difficulty);
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        lastX: event.clientX,
        rawProgress: startIndex,
        progress: startIndex,
        moved: false,
        pressedThumb: pointerHitsElement(event, dom.difficultyThumb),
        touchInput: event.pointerType === "touch" || event.pointerType === "pen",
        metrics: metrics
      };
      control.classList.toggle("is-dragging", drag.pressedThumb);
      try { control.setPointerCapture(event.pointerId); } catch (error) { /* Pointer capture is an enhancement. */ }
      paint(startIndex, 0, drag.pressedThumb);
      event.preventDefault();
    });

    control.addEventListener("pointermove", function moveDifficultyDrag(event) {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      var totalDelta = event.clientX - drag.startX;
      var frameDelta = event.clientX - drag.lastX;
      drag.lastX = event.clientX;
      drag.moved = drag.moved || Math.abs(totalDelta) > 3;
      drag.rawProgress += frameDelta / drag.metrics.step;
      drag.progress = Math.max(0, Math.min(2, drag.rawProgress));
      var visualProgress = drag.rawProgress < 0
        ? Math.max(-0.24, drag.rawProgress * 0.56)
        : (drag.rawProgress > 2 ? Math.min(2.24, 2 + (drag.rawProgress - 2) * 0.56) : drag.rawProgress);
      paint(detentProgress(visualProgress, 2), frameDelta, drag.pressedThumb);
      event.preventDefault();
    });

    function finishDifficultyDrag(event, cancelled) {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      var nextIndex = cancelled
        ? difficultyIndex(prefs.difficulty)
        : Math.round(drag.moved ? drag.progress : indexAt(event.clientX, drag.metrics));
      var travelDistance = Math.abs(nextIndex - drag.progress);
      var directSelection = !cancelled && !drag.moved;
      var touchInput = drag.touchInput;
      var pressedThumb = drag.pressedThumb;
      try { control.releasePointerCapture(event.pointerId); } catch (error) { /* Capture may already be released. */ }
      drag = null;
      animateLiquidSelection(control, dom.difficultyThumb, travelDistance, directSelection, touchInput, pressedThumb, function commitDifficultySelection() {
        if (cancelled) {
          syncSettingsUI();
        } else {
          setDifficulty(DIFFICULTY_ORDER[nextIndex]);
        }
      });
      window.setTimeout(function clearDifficultyPressOrigin() {
        control.style.removeProperty("--press-origin");
      }, 560);
      event.preventDefault();
    }

    control.addEventListener("pointerup", function endDifficultyDrag(event) {
      finishDifficultyDrag(event, false);
    });
    control.addEventListener("pointercancel", function cancelDifficultyDrag(event) {
      finishDifficultyDrag(event, true);
    });
    control.addEventListener("click", function supportDifficultyKeyboard(event) {
      if (event.detail !== 0) {
        event.preventDefault();
        return;
      }
      var button = event.target.closest("[data-difficulty]");
      if (button) {
        var targetIndex = difficultyIndex(button.dataset.difficulty);
        animateLiquidSelection(control, dom.difficultyThumb, Math.abs(targetIndex - difficultyIndex(prefs.difficulty)), true, false, false, function commitKeyboardDifficulty() {
          setDifficulty(button.dataset.difficulty);
        });
      }
    });
  }

  function bindLiquidSwitch(control, getValue, setValue) {
    var knob = control.querySelector("i");
    var drag = null;

    function paint(progress, delta, travel, pressedKnob) {
      var energy = Math.min(1, Math.abs(delta) / 14);
      var stretch = pressedKnob ? 1.72 + energy * 0.12 : 1;
      var lift = pressedKnob ? 1.5 + energy * 0.06 : 1;
      var anchor = Math.max(0, Math.min(1, progress));
      var expansionOffset = knob.offsetWidth * (stretch - 1) * anchor * 0.45;
      var knobTranslation = progress * travel - expansionOffset;
      knob.style.translate = knobTranslation + "px 0";
      if (pressedKnob) {
        knob.style.scale = stretch + " " + lift;
        knob.style.transformOrigin = "left center";
      } else {
        knob.style.removeProperty("scale");
        knob.style.removeProperty("transform-origin");
      }
      knob.style.setProperty("--lens-track-width", control.clientWidth + "px");
      knob.style.setProperty("--lens-track-offset", (-3 - knobTranslation) + "px");
      knob.style.setProperty("--lens-origin-x", (3 + knobTranslation + knob.offsetWidth / 2) + "px");
      control.style.setProperty("--press-origin", (anchor * 100).toFixed(1) + "%");
      control.classList.toggle("is-on", anchor >= 0.5);
    }

    control.addEventListener("pointerdown", function beginSwitchDrag(event) {
      if (event.isPrimary === false || event.button > 0) {
        return;
      }
      var travel = Math.max(1, control.clientWidth - 6 - knob.offsetWidth);
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        lastX: event.clientX,
        startProgress: getValue() ? 1 : 0,
        progress: getValue() ? 1 : 0,
        travel: travel,
        moved: false,
        pressedKnob: pointerHitsElement(event, knob),
        touchInput: event.pointerType === "touch" || event.pointerType === "pen"
      };
      control.classList.toggle("is-dragging", drag.pressedKnob);
      try { control.setPointerCapture(event.pointerId); } catch (error) { /* Pointer capture is an enhancement. */ }
      paint(drag.progress, 0, drag.travel, drag.pressedKnob);
      event.preventDefault();
    });

    control.addEventListener("pointermove", function moveSwitchDrag(event) {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      var totalDelta = event.clientX - drag.startX;
      var frameDelta = event.clientX - drag.lastX;
      drag.lastX = event.clientX;
      drag.moved = drag.moved || Math.abs(totalDelta) > 3;
      var rawProgress = drag.startProgress + totalDelta / drag.travel;
      drag.progress = Math.max(0, Math.min(1, rawProgress));
      var visualProgress = rawProgress < 0
        ? Math.max(-0.22, rawProgress * 0.58)
        : (rawProgress > 1 ? Math.min(1.22, 1 + (rawProgress - 1) * 0.58) : rawProgress);
      paint(detentProgress(visualProgress, 1), frameDelta, drag.travel, drag.pressedKnob);
      event.preventDefault();
    });

    function finishSwitchDrag(event, cancelled) {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      var nextValue = cancelled ? getValue() : (drag.moved ? drag.progress >= 0.5 : !drag.startProgress);
      var travelDistance = Math.abs((nextValue ? 1 : 0) - drag.progress);
      var directSelection = !cancelled && !drag.moved;
      var touchInput = drag.touchInput;
      var pressedKnob = drag.pressedKnob;
      try { control.releasePointerCapture(event.pointerId); } catch (error) { /* Capture may already be released. */ }
      drag = null;
      animateLiquidSelection(control, knob, travelDistance, directSelection, touchInput, pressedKnob, function commitSwitchSelection() {
        if (cancelled) {
          syncSettingsUI();
        } else {
          setValue(Boolean(nextValue));
        }
      });
      window.setTimeout(function clearSwitchPressOrigin() {
        control.style.removeProperty("--press-origin");
      }, 560);
      event.preventDefault();
    }

    control.addEventListener("pointerup", function endSwitchDrag(event) {
      finishSwitchDrag(event, false);
    });
    control.addEventListener("pointercancel", function cancelSwitchDrag(event) {
      finishSwitchDrag(event, true);
    });
    control.addEventListener("click", function supportSwitchKeyboard(event) {
      if (event.detail !== 0) {
        event.preventDefault();
        return;
      }
      animateLiquidSelection(control, knob, 1, true, false, false, function commitKeyboardSwitch() {
        setValue(!getValue());
      });
    });
  }

  function bindSettingsSheetDismiss() {
    var sheet = dom.settingsSheet;
    var softbody = sheet.querySelector(".settings-softbody");
    var softLayers = [
      { element: softbody.querySelector(".sheet-handle"), collapse: 0.22 },
      { element: softbody.querySelector(".sheet-head"), collapse: 0.26 },
      { element: softbody.querySelectorAll(".setting-row")[0], collapse: 0.36 },
      { element: softbody.querySelectorAll(".setting-row")[1], collapse: 0.44 },
      { element: softbody.querySelectorAll(".setting-row")[2], collapse: 0.52 },
      { element: softbody.querySelector(".sheet-done"), collapse: 0.6 }
    ];
    var drag = null;

    function clearSheetDragStyles() {
      sheet.style.removeProperty("transform");
      sheet.style.removeProperty("--sheet-edge-top");
      sheet.style.removeProperty("--sheet-edge-bottom");
      softbody.style.removeProperty("transform");
      softbody.style.removeProperty("opacity");
      softLayers.forEach(function clearSoftLayerStyle(layer) {
        layer.element.style.removeProperty("transform");
      });
      dom.scrim.style.removeProperty("opacity");
    }

    function paintSheetCollapse(progress, distance) {
      var topInset = progress * 4.5;
      var bottomInset = progress * 15;
      sheet.style.transform = "translate3d(0, " + distance + "px, 0) scaleX(" + (1 - progress * 0.1) + ") scaleY(" + (1 - progress * 0.035) + ")";
      sheet.style.setProperty("--sheet-edge-top", topInset + "%");
      sheet.style.setProperty("--sheet-edge-bottom", bottomInset + "%");
      softbody.style.transform = "translateY(" + (progress * 22) + "px) scaleY(" + (1 - progress * 0.06) + ")";
      softbody.style.opacity = String(1 - progress * 0.8);
      softLayers.forEach(function paintSoftLayer(layer) {
        layer.element.style.transform = "scaleX(" + (1 - progress * layer.collapse) + ")";
      });
    }

    sheet.addEventListener("pointerdown", function beginSheetDismiss(event) {
      if (event.isPrimary === false || event.button > 0 || activeSheet !== sheet) {
        return;
      }
      var rect = sheet.getBoundingClientRect();
      if (event.clientY - rect.top > 92 || event.target.closest("button, .segmented, .switch")) {
        return;
      }
      drag = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        lastAt: performance.now(),
        velocity: 0,
        distance: 0
      };
      sheet.classList.add("is-dragging-sheet");
      try { sheet.setPointerCapture(event.pointerId); } catch (error) { /* Pointer capture is an enhancement. */ }
      event.preventDefault();
    });

    sheet.addEventListener("pointermove", function moveSheetDismiss(event) {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      var now = performance.now();
      var distance = Math.max(0, event.clientY - drag.startY);
      var frameTime = Math.max(8, now - drag.lastAt);
      drag.velocity = (event.clientY - drag.lastY) / frameTime;
      drag.lastY = event.clientY;
      drag.lastAt = now;
      drag.distance = distance;
      var progress = Math.min(1, distance / Math.max(180, sheet.offsetHeight * 0.54));
      paintSheetCollapse(progress, distance);
      dom.scrim.style.opacity = String(1 - progress * 0.68);
      event.preventDefault();
    });

    function finishSheetDismiss(event, cancelled) {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      var shouldDismiss = !cancelled && (drag.distance > 82 || drag.velocity > 0.72);
      try { sheet.releasePointerCapture(event.pointerId); } catch (error) { /* Capture may already be released. */ }
      drag = null;
      sheet.classList.remove("is-dragging-sheet");
      if (shouldDismiss) {
        closeActiveSheet(false);
        requestAnimationFrame(clearSheetDragStyles);
      } else {
        sheet.classList.add("is-returning-sheet");
        sheet.style.transform = "translate3d(0, 0, 0) scaleX(1) scaleY(1)";
        sheet.style.setProperty("--sheet-edge-top", "0%");
        sheet.style.setProperty("--sheet-edge-bottom", "0%");
        softbody.style.transform = "translateY(0) scaleY(1)";
        softbody.style.opacity = "1";
        softLayers.forEach(function restoreSoftLayer(layer) {
          layer.element.style.transform = "scaleX(1)";
        });
        dom.scrim.style.removeProperty("opacity");
        window.setTimeout(function finishSheetReturn() {
          sheet.classList.remove("is-returning-sheet");
          clearSheetDragStyles();
        }, REVERSIBLE_MOTION_DURATION + 30);
      }
      event.preventDefault();
    }

    sheet.addEventListener("pointerup", function endSheetDismiss(event) {
      finishSheetDismiss(event, false);
    });
    sheet.addEventListener("pointercancel", function cancelSheetDismiss(event) {
      finishSheetDismiss(event, true);
    });
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
    dom.developerDraw.disabled = !activeGame;
    dom.developerClearBoard.disabled = !activeGame;
    dom.developerPlayerButtons.forEach(function updateDeveloperPlayer(button) {
      button.disabled = !activeGame;
      button.classList.toggle("is-active", Number(button.dataset.developerPlayer) === developer.placementPlayer);
    });
    dom.developerPauseSwitch.classList.toggle("is-on", developer.aiPaused);
    dom.developerPauseSwitch.setAttribute("aria-checked", developer.aiPaused ? "true" : "false");
    dom.developerPieceControl.dataset.index = developer.placementPlayer === HUMAN ? "0" : "1";
    dom.developerPlayerButtons.forEach(function syncDeveloperPlayerA11y(button) {
      button.setAttribute(
        "aria-pressed",
        Number(button.dataset.developerPlayer) === developer.placementPlayer ? "true" : "false"
      );
    });
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
  }

  function developerForceOutcome(player) {
    if (!DEV_MODE || !game || game.status !== "playing") {
      return;
    }
    finishBoundaryDemo();
    turnToken += 1;
    var forceToken = turnToken;
    var forcedGame = game;
    var boundaryPath = null;
    if (player === HUMAN && game.levelIndex > 0) {
      boundaryPath = boundaryGuidePaths()[0] || null;
    }
    var masks = game.rules.winMasks.slice().sort(function sortForceMasks(a, b) {
      var aBlocked = 0;
      var bBlocked = 0;
      Array.prototype.forEach.call(a.cells, function countA(cell) { if (game.board[cell] === -player) { aBlocked += 1; } });
      Array.prototype.forEach.call(b.cells, function countB(cell) { if (game.board[cell] === -player) { bBlocked += 1; } });
      return aBlocked - bBlocked;
    });
    var mask = masks[0];
    if (boundaryPath) {
      var boundaryKey = boundaryPath.cells.slice().sort(function numericSort(a, b) { return a - b; }).join(",");
      mask = masks.find(function findBoundaryMask(candidate) {
        return Array.prototype.slice.call(candidate.cells).sort(function numericSort(a, b) { return a - b; }).join(",") === boundaryKey;
      }) || mask;
    }
    var forcedCells = boundaryPath ? boundaryPath.cells : Array.prototype.slice.call(mask.cells);
    game.board.fill(Engine.EMPTY);
    game.moves = [];
    game.status = "forcing";
    game.turn = 0;
    game.lastMove = -1;
    game.winningMask = null;
    game.outcome = null;
    renderState.seamPulseAt = 0;
    renderState.winAt = 0;
    closeActiveSheet(true);
    updateTurnUI();
    requestRender();
    forcedCells.forEach(function scheduleForcedStone(cell, index) {
      window.setTimeout(function placeForcedStone() {
        if (game !== forcedGame || turnToken !== forceToken || game.status !== "forcing") {
          return;
        }
        game.board[cell] = player;
        game.moves.push({ cell: cell, player: player });
        game.lastMove = cell;
        renderState.lastMoveAt = performance.now();
        sound.play(player === HUMAN ? "move-human" : "move-ai");
        if (boundaryPath && index > 0 && boundaryPath.seams[index - 1]) {
          renderState.seamPulseAt = performance.now();
          renderState.seamPulseBits = boundaryPath.seams[index - 1];
          sound.play("seam");
        }
        requestRender();
        if (index === forcedCells.length - 1) {
          var verifiedMask = Engine.checkWin(game.board, game.rules, cell, player) || mask;
          finishGame(player === HUMAN ? "win" : "lose", verifiedMask, "developer");
        }
      }, index * 220);
    });
  }

  function developerForceDraw() {
    if (!DEV_MODE || !game || game.status !== "playing") {
      return;
    }
    finishBoundaryDemo();
    turnToken += 1;
    game.board.fill(Engine.EMPTY);
    game.moves = [];
    [[0, 0], [2, 1], [4, 3], [1, 4], [5, 0], [3, 5]].forEach(function seedDrawMove(point, index) {
      var cell = Engine.toCell(game.rules, point[0], point[1]);
      var player = index % 2 === 0 ? HUMAN : AI;
      game.board[cell] = player;
      game.moves.push({ cell: cell, player: player });
    });
    game.lastMove = game.moves[game.moves.length - 1].cell;
    renderState.lastMoveAt = performance.now();
    closeActiveSheet(true);
    finishGame("draw", null, "developer");
  }

  function developerClearCurrentBoard() {
    if (!DEV_MODE || !game) {
      return;
    }
    finishBoundaryDemo();
    turnToken += 1;
    game.board.fill(Engine.EMPTY);
    game.moves = [];
    game.turn = HUMAN;
    game.status = "playing";
    game.winningMask = null;
    game.outcome = null;
    game.winReason = null;
    game.completion = null;
    game.review = null;
    game.lastMove = -1;
    renderState.lastMoveAt = 0;
    renderState.seamPulseAt = 0;
    renderState.winAt = 0;
    dom.boardStage.classList.remove("is-settled");
    updateTurnUI();
    syncDeveloperUI();
    closeActiveSheet(false);
    requestRender();
  }

  function developerSeedHint(kind) {
    if (!DEV_MODE || !game || game.status !== "playing") {
      return;
    }
    finishBoundaryDemo();
    turnToken += 1;
    var path = boundaryGuidePaths()[0] || null;
    if (!path) {
      return;
    }
    game.board.fill(Engine.EMPTY);
    var startIndex = kind === "three" ? 1 : 0;
    var endIndex = kind === "three" ? 3 : 3;
    game.moves = [];
    if (kind === "four") {
      var previous = Engine.step(game.rules, path.cells[0], (path.direction + 4) % 8);
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
    game.completion = null;
    game.review = null;
    game.lastMove = path.cells[endIndex];
    developer.aiPaused = true;
    renderState.lastMoveAt = performance.now();
    renderState.seamPulseAt = 0;
    renderState.winAt = 0;
    dom.boardStage.classList.remove("is-settled");
    updateTurnUI();
    closeActiveSheet(false);
    requestRender();
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
  }

  function developerResetProgress() {
    if (!DEV_MODE) {
      return;
    }
    prefs.unlocked = 0;
    prefs.completed = [];
    prefs.bestDifficulty = [];
    prefs.learnedLevels = [];
    selectedLevel = 0;
    savePreferences();
    updateHome();
    syncDeveloperUI();
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
      window.setTimeout(finish, sheet === dom.settingsSheet ? REVERSIBLE_MOTION_DURATION + 30 : 570);
    }
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

  function updateCompletionMotion(time, delta) {
    if (!game || !game.completion) {
      return;
    }
    var completion = game.completion;
    var elapsed = time - completion.startedAt;
    if (completion.phase === "returning") {
      if (elapsed >= completion.duration) {
        game.completion = null;
        updateTurnUI();
        requestRender();
      }
      return;
    }
    if (!completion.settled && elapsed >= completion.duration) {
      completion.settled = true;
      updateTurnUI();
    }
    var frameScale = Math.max(0.25, Math.min(2, delta / 16.67));
    var friction = Math.pow(0.925, frameScale);
    if (!completion.dragging) {
      completion.rotation.x += completion.velocity.x * delta;
      completion.rotation.y += completion.velocity.y * delta;
      completion.velocity.x *= friction;
      completion.velocity.y *= friction;
    } else if (time - completion.lastPointerAt > 72) {
      completion.velocity.x *= friction;
      completion.velocity.y *= friction;
    }
    if (Math.abs(completion.velocity.x) < 0.00001) {
      completion.velocity.x = 0;
    }
    if (Math.abs(completion.velocity.y) < 0.00001) {
      completion.velocity.y = 0;
    }
    var elastic = completion.elastic;
    var targetElasticX = Math.max(-0.14, Math.min(0.14, completion.velocity.x * 20));
    var targetElasticY = Math.max(-0.15, Math.min(0.15, completion.velocity.y * 19));
    elastic.velocityX += (targetElasticX - elastic.x) * 0.16 * frameScale;
    elastic.velocityY += (targetElasticY - elastic.y) * 0.16 * frameScale;
    var elasticDamping = Math.pow(0.78, frameScale);
    elastic.velocityX *= elasticDamping;
    elastic.velocityY *= elasticDamping;
    elastic.x += elastic.velocityX * frameScale;
    elastic.y += elastic.velocityY * frameScale;
    if (!completion.dragging && elapsed > completion.duration * 0.55 && time >= completion.autoResumeAt) {
      completion.rotation.y += 0.00016 * delta;
    }
  }

  function renderFrame(time) {
    renderState.frame = 0;
    if (!game || !renderState.layout) {
      return;
    }
    if (game.demo && game.demo.active && time - game.demo.startedAt >= game.demo.duration) {
      finishBoundaryDemo(true);
    }
    var delta = renderState.lastFrameAt ? Math.min(34, time - renderState.lastFrameAt) : 16.67;
    renderState.lastFrameAt = time;
    updateCompletionMotion(time, delta);
    updatePressedStoneMotion(delta);
    drawBoard(time);
    var animate = false;
    if (renderState.lastMoveAt && time - renderState.lastMoveAt < 320) {
      animate = true;
    }
    if (renderState.pressedCell >= 0 && renderState.pointerId !== null) {
      animate = true;
    }
    if (renderState.seamPulseAt && time - renderState.seamPulseAt < 980) {
      animate = true;
    }
    if (renderState.winAt && time - renderState.winAt < 1450) {
      animate = true;
    }
    if (game.completion) {
      animate = true;
    }
    if (game.demo && game.demo.active) {
      animate = true;
    }
    if (isInteractiveLesson()) {
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
    if (game.completion) {
      drawCompletionMorph(ctx, time);
      return;
    }
    drawTopologyRails(ctx, time);
    drawGrid(ctx, layout);
    drawLessonConnections(ctx, time);
    drawTutorialGuide(ctx, time);
    drawDemoStones(ctx, time);
    drawWinningConnections(ctx, time);
    drawMappedGhost(ctx);
    drawTacticalHints(ctx);
    drawMovePreview(ctx, time);
    drawStones(ctx, time);
  }

  function drawTutorialGuide(ctx, time) {
    if (!isInteractiveLesson() || game.status !== "playing") {
      return;
    }
    var hintCell = game.lesson.cells[game.lesson.step];
    if (hintCell < 0 || game.board[hintCell] !== Engine.EMPTY) {
      return;
    }
    var center = cellCenter(hintCell);
    var breath = Math.sin(time * 0.006);
    var pulse = breath * 0.5 + 0.5;
    var radius = renderState.layout.cell * 0.25 + pulse * 2.2;
    var guideText = lessonPromptText();
    var fontSize = Math.max(12, Math.min(14, renderState.layout.cell * 0.195));
    var floatY = -breath * 1.25;
    ctx.save();
    ctx.globalAlpha = 0.52 + pulse * 0.24;
    ctx.strokeStyle = "#3f8c87";
    ctx.fillStyle = "rgba(63, 140, 135, 0.08)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4.5, 4.5]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha *= 0.72;
    ctx.fillStyle = "#3f8c87";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 1.7 + pulse * 0.65, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "700 " + fontSize + "px 'Topo Serif', 'Songti SC', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var textWidth = ctx.measureText(guideText).width;
    var textX = Math.max(
      renderState.layout.left + textWidth * 0.5 + 7,
      Math.min(renderState.layout.right - textWidth * 0.5 - 7, center.x)
    );
    var textY = center.y - radius - fontSize * 1.15 + floatY;
    if (textY - fontSize * 0.6 < renderState.layout.top) {
      textY = center.y + radius + fontSize * 1.2 - floatY;
    }
    ctx.globalAlpha = 0.74 + pulse * 0.22;
    ctx.lineWidth = 4.1;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(251, 250, 246, 0.92)";
    ctx.fillStyle = "#315f5b";
    ctx.strokeText(guideText, textX, textY);
    ctx.fillText(guideText, textX, textY);
    ctx.restore();
  }

  function drawLessonConnections(ctx, time) {
    if (!isInteractiveLesson() || game.level.tutorial || game.lesson.step < 1) {
      return;
    }
    var lesson = game.lesson;
    var pulse = Math.sin(time * 0.0055) * 0.5 + 0.5;
    var cell = renderState.layout.cell;

    for (var index = 1; index < lesson.step; index += 1) {
      drawLessonSegment(ctx, lesson, index, false, pulse, cell, time);
    }
    if (lesson.step < lesson.cells.length) {
      drawLessonSegment(ctx, lesson, lesson.step, true, pulse, cell, time);
    }
  }

  function drawLessonSegment(ctx, lesson, index, pending, pulse, cell, time) {
    var from = cellCenter(lesson.cells[index - 1]);
    var to = cellCenter(lesson.cells[index]);
    var seam = lesson.seams[index - 1];
    var color = seam & Engine.SEAM_TWIST ? "#c79244" : "#3f8c87";
    if (seam) {
      drawLessonSeamCue(ctx, lesson, index, from, to, color, pending, pulse, cell, time);
      return;
    }
    ctx.save();
    ctx.globalAlpha = pending ? 0.3 + pulse * 0.2 : 0.34;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, cell * 0.045);
    ctx.lineCap = "round";
    if (pending) {
      ctx.setLineDash([cell * 0.12, cell * 0.1]);
      ctx.lineDashOffset = -time * 0.018;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawLessonSeamCue(ctx, lesson, index, from, to, color, pending, pulse, cell, time) {
    var fromDirection = Engine.DIRECTIONS[lesson.directions[index - 1]];
    var toDirection = Engine.DIRECTIONS[lesson.directions[index]];
    var ray = cell * (pending ? 0.72 : 0.58);
    var radius = cell * 0.37 + pulse * (pending ? 4 : 2);
    var alpha = pending ? 0.5 + pulse * 0.34 : 0.34;
    var fromEdge = { x: from.x + fromDirection.dx * ray, y: from.y + fromDirection.dy * ray };
    var toEdge = { x: to.x - toDirection.dx * ray, y: to.y - toDirection.dy * ray };
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.4, cell * 0.04);
    ctx.lineCap = "round";
    ctx.setLineDash(pending ? [cell * 0.11, cell * 0.09] : []);
    ctx.lineDashOffset = -time * 0.02;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(fromEdge.x, fromEdge.y);
    ctx.moveTo(toEdge.x, toEdge.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    [from, to].forEach(function drawLessonCrossingRing(point) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    });
    if (pending) {
      var travel = 0.2 + pulse * 0.64;
      [
        { start: from, end: fromEdge },
        { start: toEdge, end: to }
      ].forEach(function drawTravelDot(segment) {
        ctx.beginPath();
        ctx.arc(
          segment.start.x + (segment.end.x - segment.start.x) * travel,
          segment.start.y + (segment.end.y - segment.start.y) * travel,
          Math.max(2, cell * 0.055),
          0,
          Math.PI * 2
        );
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function completionMappedPoint(flatX, flatY, u, v, morph, spin) {
    var projected = Morph.project(game.level.topology, u, v, renderState.width, renderState.height, spin);
    return {
      x: flatX + (projected.x - flatX) * morph,
      y: flatY + (projected.y - flatY) * morph,
      depth: projected.depth * morph
    };
  }

  function completionPoint(u, v, morph, spin) {
    var flatX = renderState.layout.left + u * (renderState.layout.right - renderState.layout.left);
    var flatY = renderState.layout.top + v * (renderState.layout.bottom - renderState.layout.top);
    return completionMappedPoint(flatX, flatY, u, v, morph, spin);
  }

  function completionCellPoint(cell, morph, spin) {
    var flat = cellCenter(cell);
    var uv = Morph.stoneUV(game.rules, cell);
    return completionMappedPoint(flat.x, flat.y, uv.u, uv.v, morph, spin);
  }

  function drawCompletionSurface(ctx, morph, spin) {
    var columns = game.level.topology === "sphere" ? 48 : 46;
    var rows = game.level.topology === "sphere" ? columns : 36;
    var points = [];
    var row;
    var column;
    for (row = 0; row <= rows; row += 1) {
      var pointRow = [];
      for (column = 0; column <= columns; column += 1) {
        pointRow.push(completionPoint(column / columns, row / rows, morph, spin));
      }
      points.push(pointRow);
    }

    var patches = [];
    for (row = 0; row < rows; row += 1) {
      for (column = 0; column < columns; column += 1) {
        var patchPoints = [
          points[row][column],
          points[row][column + 1],
          points[row + 1][column + 1],
          points[row + 1][column]
        ];
        if (game.level.topology === "sphere") {
          [[0, 1, 2], [0, 2, 3]].forEach(function addSphereTriangle(indices) {
            var triangle = indices.map(function sphereTrianglePoint(index) { return patchPoints[index]; });
            patches.push({
              points: triangle,
              depth: triangle.reduce(function sumDepth(total, point) { return total + point.depth; }, 0) / 3
            });
          });
        } else {
          patches.push({
            points: patchPoints,
            depth: patchPoints.reduce(function sumDepth(total, point) { return total + point.depth; }, 0) / 4
          });
        }
      }
    }
    patches.sort(function sortPatches(a, b) { return a.depth - b.depth; });

    var surfaceGradient = ctx.createLinearGradient(
      0,
      renderState.height * 0.2,
      0,
      renderState.height * 0.82
    );
    surfaceGradient.addColorStop(0, "rgba(251,249,243,0.98)");
    surfaceGradient.addColorStop(0.48, "rgba(238,235,226,0.98)");
    surfaceGradient.addColorStop(1, "rgba(213,210,201,0.98)");

    ctx.save();
    ctx.globalAlpha = 0.3 + morph * 0.66;
    ctx.fillStyle = surfaceGradient;
    ctx.strokeStyle = surfaceGradient;
    ctx.lineWidth = 0.82;
    ctx.lineJoin = "round";
    patches.forEach(function drawPatch(patch) {
      ctx.beginPath();
      ctx.moveTo(patch.points[0].x, patch.points[0].y);
      for (var index = 1; index < patch.points.length; index += 1) {
        ctx.lineTo(patch.points[index].x, patch.points[index].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function appendCompletionSegment(points, from, to, samples, morph, spin) {
    for (var sample = points.length ? 1 : 0; sample <= samples; sample += 1) {
      var amount = sample / samples;
      points.push(completionMappedPoint(
        from.flatX + (to.flatX - from.flatX) * amount,
        from.flatY + (to.flatY - from.flatY) * amount,
        from.u + (to.u - from.u) * amount,
        from.v + (to.v - from.v) * amount,
        morph,
        spin
      ));
    }
  }

  function completionFlatPointFromUV(u, v) {
    var xRatio = Morph.isPeriodicX(game.rules.type)
      ? (u * game.rules.width - 0.5) / Math.max(1, game.rules.width - 1)
      : u;
    var yRatio = Morph.isPeriodicY(game.rules.type)
      ? (v * game.rules.height - 0.5) / Math.max(1, game.rules.height - 1)
      : v;
    return {
      x: renderState.layout.left + clamp01(xRatio) * (renderState.layout.right - renderState.layout.left),
      y: renderState.layout.top + clamp01(yRatio) * (renderState.layout.bottom - renderState.layout.top)
    };
  }

  function completionGridEdgePoints(cell, step, direction, morph, spin) {
    var fromFlat = cellCenter(cell);
    var toFlat = cellCenter(step.cell);
    var fromUV = Morph.stoneUV(game.rules, cell);
    var toUV = Morph.stoneUV(game.rules, step.cell);
    var from = { flatX: fromFlat.x, flatY: fromFlat.y, u: fromUV.u, v: fromUV.v };
    var to = { flatX: toFlat.x, flatY: toFlat.y, u: toUV.u, v: toUV.v };
    var points = [];
    var samples = game.level.topology === "sphere" ? 16 : 12;
    if (!step.seam) {
      appendCompletionSegment(points, from, to, samples, morph, spin);
      return points;
    }

    var vector = Engine.DIRECTIONS[direction];
    var bridge = Morph.seamBridgeUV(
      game.rules.type,
      fromUV,
      toUV,
      vector,
      Boolean(step.seam & Engine.SEAM_X),
      Boolean(step.seam & Engine.SEAM_Y)
    );
    var sourceFlat = completionFlatPointFromUV(bridge.source.u, bridge.source.v);
    var targetFlat = completionFlatPointFromUV(bridge.target.u, bridge.target.v);
    var sourceBoundary = {
      flatX: sourceFlat.x,
      flatY: sourceFlat.y,
      u: bridge.source.u,
      v: bridge.source.v
    };
    var targetBoundary = {
      flatX: targetFlat.x,
      flatY: targetFlat.y,
      u: bridge.target.u,
      v: bridge.target.v
    };
    var seamSamples = game.level.topology === "sphere" ? 12 : 8;
    appendCompletionSegment(points, from, sourceBoundary, seamSamples, morph, spin);
    points.push(completionMappedPoint(
      targetBoundary.flatX,
      targetBoundary.flatY,
      targetBoundary.u,
      targetBoundary.v,
      morph,
      spin
    ));
    appendCompletionSegment(points, targetBoundary, to, seamSamples, morph, spin);
    return points;
  }

  function strokeSmoothCompletionPath(ctx, points) {
    if (!points.length) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
    } else {
      // Interpolate every sampled surface point with a C1-continuous
      // Catmull-Rom spline.  It still passes through the original chess-grid
      // samples (including stone intersections), while rounding the harmless
      // chart-derivative changes that would otherwise look like sharp folds.
      for (var index = 0; index < points.length - 1; index += 1) {
        var before = points[Math.max(0, index - 1)];
        var from = points[index];
        var to = points[index + 1];
        var after = points[Math.min(points.length - 1, index + 2)];
        ctx.bezierCurveTo(
          from.x + (to.x - before.x) / 6,
          from.y + (to.y - before.y) / 6,
          to.x - (after.x - from.x) / 6,
          to.y - (after.y - from.y) / 6,
          to.x,
          to.y
        );
      }
    }
    ctx.stroke();
  }

  function completionDepthIntersection(from, to, threshold) {
    var span = to.depth - from.depth;
    var amount = Math.abs(span) < 1e-8 ? 0.5 : (threshold - from.depth) / span;
    amount = clamp01(amount);
    return {
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
      depth: threshold
    };
  }

  function strokeFrontFacingCompletionPath(ctx, points, threshold) {
    var visible = [];
    function finishVisibleRun() {
      if (visible.length > 1) {
        strokeSmoothCompletionPath(ctx, visible);
      }
      visible = [];
    }
    for (var index = 1; index < points.length; index += 1) {
      var from = points[index - 1];
      var to = points[index];
      var fromVisible = from.depth >= threshold;
      var toVisible = to.depth >= threshold;
      if (fromVisible && toVisible) {
        if (!visible.length) {
          visible.push(from);
        }
        visible.push(to);
      } else if (fromVisible) {
        if (!visible.length) {
          visible.push(from);
        }
        visible.push(completionDepthIntersection(from, to, threshold));
        finishVisibleRun();
      } else if (toVisible) {
        visible.push(completionDepthIntersection(from, to, threshold));
        visible.push(to);
      } else {
        finishVisibleRun();
      }
    }
    finishVisibleRun();
  }

  function completionSphereRailPoint(u, v, morph, spin) {
    var firstUV = Morph.stoneUV(game.rules, 0);
    var lastUV = Morph.stoneUV(game.rules, game.rules.cellCount - 1);
    var xRatio = (u - firstUV.u) / Math.max(1e-6, lastUV.u - firstUV.u);
    var yRatio = (v - firstUV.v) / Math.max(1e-6, lastUV.v - firstUV.v);
    return completionMappedPoint(
      renderState.layout.left + xRatio * (renderState.layout.right - renderState.layout.left),
      renderState.layout.top + yRatio * (renderState.layout.bottom - renderState.layout.top),
      u,
      v,
      morph,
      spin
    );
  }

  function drawCompletionSphereGrid(ctx, morph, spin) {
    var samples = 72;
    var frontBlend = Morph.smooth((morph - 0.46) / 0.42);
    var depthThreshold = -0.012 * morph;
    var firstGridUV = Morph.stoneUV(game.rules, 0);
    var lastGridUV = Morph.stoneUV(game.rules, game.rules.cellCount - 1);
    var firstU = firstGridUV.u;
    var lastU = lastGridUV.u;
    var firstV = firstGridUV.v;
    var lastV = lastGridUV.v;
    for (var x = 0; x < game.rules.width; x += 1) {
      var u = Morph.stoneUV(game.rules, x).u;
      var vertical = [];
      for (var verticalSample = 0; verticalSample <= samples; verticalSample += 1) {
        var verticalAmount = verticalSample / samples;
        vertical.push(completionSphereRailPoint(u, firstV + (lastV - firstV) * verticalAmount, morph, spin));
      }
      ctx.save();
      ctx.globalAlpha *= 1 - frontBlend * 0.84;
      strokeSmoothCompletionPath(ctx, vertical);
      ctx.restore();
      if (frontBlend > 0) {
        ctx.save();
        ctx.globalAlpha *= frontBlend * 0.84;
        strokeFrontFacingCompletionPath(ctx, vertical, depthThreshold);
        ctx.restore();
      }
    }
    for (var y = 0; y < game.rules.height; y += 1) {
      var v = Morph.stoneUV(game.rules, y * game.rules.width).v;
      var horizontal = [];
      for (var horizontalSample = 0; horizontalSample <= samples; horizontalSample += 1) {
        var horizontalAmount = horizontalSample / samples;
        horizontal.push(completionSphereRailPoint(firstU + (lastU - firstU) * horizontalAmount, v, morph, spin));
      }
      ctx.save();
      ctx.globalAlpha *= 1 - frontBlend * 0.84;
      strokeSmoothCompletionPath(ctx, horizontal);
      ctx.restore();
      if (frontBlend > 0) {
        ctx.save();
        ctx.globalAlpha *= frontBlend * 0.84;
        strokeFrontFacingCompletionPath(ctx, horizontal, depthThreshold);
        ctx.restore();
      }
    }
  }

  function drawCompletionGrid(ctx, morph, spin) {
    ctx.save();
    ctx.strokeStyle = "rgba(92, 88, 80," + (0.48 - morph * 0.17) + ")";
    ctx.lineWidth = Math.max(0.7, renderState.layout.cell * (0.025 - morph * 0.006));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (game.level.topology === "sphere") {
      var sphereRound = morph > 0.9 && Math.abs(spin.wobbleX || 0) + Math.abs(spin.wobbleY || 0) < 0.012;
      if (sphereRound) {
        var clipScale = Number(spin.scale) || 1;
        ctx.beginPath();
        ctx.arc(
          renderState.width * 0.5,
          renderState.height * 0.5,
          Math.min(renderState.width, renderState.height) * 0.315 * clipScale,
          0,
          Math.PI * 2
        );
        ctx.clip();
      }
      drawCompletionSphereGrid(ctx, morph, spin);
      ctx.restore();
      return;
    }
    for (var cell = 0; cell < game.rules.cellCount; cell += 1) {
      var gridDirections = [0, 2];
      gridDirections.forEach(function drawDirection(direction) {
        var step = Engine.step(game.rules, cell, direction);
        if (!step) {
          return;
        }
        ctx.globalAlpha = step.seam ? Morph.smooth((morph - 0.16) / 0.66) : 1;
        var points = completionGridEdgePoints(cell, step, direction, morph, spin);
        if (points.length > 1) {
          strokeSmoothCompletionPath(ctx, points);
        }
      });
    }
    ctx.restore();
  }

  function drawCompletionBoundary(ctx, axis, morph, spin, color) {
    var samples = 72;
    var fade = 1 - Morph.smooth((morph - 0.72) / 0.28);
    ctx.save();
    ctx.globalAlpha = (0.36 + morph * 0.5) * fade;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    [0, 1].forEach(function drawSide(side) {
      ctx.beginPath();
      for (var index = 0; index <= samples; index += 1) {
        var along = index / samples;
        var point = axis === "x"
          ? completionPoint(side, along, morph, spin)
          : completionPoint(along, side, morph, spin);
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawCompletionSphereBoundary(ctx, pair, morph, spin, color) {
    var samples = 72;
    var fade = 1 - Morph.smooth((morph - 0.72) / 0.28);
    var sides = pair === "a"
      ? [function top(along) { return completionPoint(along, 0, morph, spin); }, function left(along) { return completionPoint(0, along, morph, spin); }]
      : [function bottom(along) { return completionPoint(along, 1, morph, spin); }, function right(along) { return completionPoint(1, along, morph, spin); }];
    ctx.save();
    ctx.globalAlpha = (0.36 + morph * 0.5) * fade;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    sides.forEach(function drawSphereSide(pointAt) {
      ctx.beginPath();
      for (var index = 0; index <= samples; index += 1) {
        var point = pointAt(index / samples);
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  function catmullRomPoint(points, segment, amount) {
    var first = points[Math.max(0, segment - 1)];
    var from = points[segment];
    var to = points[Math.min(points.length - 1, segment + 1)];
    var last = points[Math.min(points.length - 1, segment + 2)];
    var amount2 = amount * amount;
    var amount3 = amount2 * amount;
    return from.map(function interpolateCoordinate(value, axis) {
      return 0.5 * (
        2 * value +
        (-first[axis] + to[axis]) * amount +
        (2 * first[axis] - 5 * value + 4 * to[axis] - last[axis]) * amount2 +
        (-first[axis] + 3 * value - 3 * to[axis] + last[axis]) * amount3
      );
    });
  }

  function normalizeSurfacePoint(point) {
    var length = Math.hypot(point[0], point[1], point[2]) || 1;
    return [point[0] / length, point[1] / length, point[2] / length];
  }

  function completionSphereWinningCurve(cells, morph, spin) {
    var flatAnchors = cells.map(function flatWinningAnchor(cell) {
      var point = cellCenter(cell);
      return [point.x, point.y];
    });
    var sphereAnchors = cells.map(function sphereWinningAnchor(cell) {
      var uv = Morph.stoneUV(game.rules, cell);
      return Morph.surfacePoint("sphere", uv.u, uv.v);
    });
    var curve = [];
    var samples = 18;
    for (var segment = 0; segment < cells.length - 1; segment += 1) {
      for (var sample = segment ? 1 : 0; sample <= samples; sample += 1) {
        var amount = sample / samples;
        var flat = catmullRomPoint(flatAnchors, segment, amount);
        var surface = normalizeSurfacePoint(catmullRomPoint(sphereAnchors, segment, amount));
        var projected = Morph.projectPoint("sphere", surface, renderState.width, renderState.height, spin);
        curve.push({
          x: flat[0] + (projected.x - flat[0]) * morph,
          y: flat[1] + (projected.y - flat[1]) * morph,
          depth: projected.depth * morph
        });
      }
    }
    return curve;
  }

  function drawCompletionWinningLine(ctx, time, morph, spin) {
    var winningMask = activeWinningMask();
    if (!winningMask) {
      return;
    }
    var cells = Array.prototype.slice.call(winningMask.cells);
    var reveal = Morph.smooth((time - game.completion.lineStartedAt - 1080) / 820);
    var pulse = 0.78 + Math.sin(time * 0.009) * 0.16;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(199, 146, 68, 0.8)";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(199, 146, 68," + pulse + ")";
    ctx.lineWidth = Math.max(3.4, renderState.layout.cell * 0.12);
    if (game.level.topology === "sphere") {
      var sphereCurve = completionSphereWinningCurve(cells, morph, spin);
      var visibleEnd = (sphereCurve.length - 1) * reveal;
      ctx.beginPath();
      ctx.moveTo(sphereCurve[0].x, sphereCurve[0].y);
      for (var sphereIndex = 1; sphereIndex <= Math.floor(visibleEnd); sphereIndex += 1) {
        ctx.lineTo(sphereCurve[sphereIndex].x, sphereCurve[sphereIndex].y);
      }
      if (visibleEnd < sphereCurve.length - 1) {
        var sphereWhole = Math.floor(visibleEnd);
        var sphereFraction = visibleEnd - sphereWhole;
        ctx.lineTo(
          sphereCurve[sphereWhole].x + (sphereCurve[sphereWhole + 1].x - sphereCurve[sphereWhole].x) * sphereFraction,
          sphereCurve[sphereWhole].y + (sphereCurve[sphereWhole + 1].y - sphereCurve[sphereWhole].y) * sphereFraction
        );
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    var direction = winningMask.direction;
    for (var index = 0; index < cells.length - 1; index += 1) {
      var segmentProgress = clamp01(reveal * (cells.length - 1) - index);
      if (segmentProgress <= 0) {
        continue;
      }
      var step = Engine.step(game.rules, cells[index], direction);
      if (!step || step.cell !== cells[index + 1]) {
        for (var candidate = 0; candidate < Engine.DIRECTIONS.length; candidate += 1) {
          var candidateStep = Engine.step(game.rules, cells[index], candidate);
          if (candidateStep && candidateStep.cell === cells[index + 1]) {
            direction = candidate;
            step = candidateStep;
            break;
          }
        }
      }
      if (!step || step.cell !== cells[index + 1]) {
        continue;
      }
      var points = completionGridEdgePoints(cells[index], step, direction, morph, spin);
      var lastPointIndex = (points.length - 1) * segmentProgress;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var pointIndex = 1; pointIndex <= Math.floor(lastPointIndex); pointIndex += 1) {
        ctx.lineTo(points[pointIndex].x, points[pointIndex].y);
      }
      if (lastPointIndex < points.length - 1) {
        var wholeIndex = Math.floor(lastPointIndex);
        var fraction = lastPointIndex - wholeIndex;
        var fromPoint = points[wholeIndex];
        var toPoint = points[wholeIndex + 1];
        ctx.lineTo(
          fromPoint.x + (toPoint.x - fromPoint.x) * fraction,
          fromPoint.y + (toPoint.y - fromPoint.y) * fraction
        );
      }
      ctx.stroke();
      direction = step.direction;
    }
    ctx.restore();
  }

  function drawCompletionStone(ctx, item, radius, dimmed) {
    ctx.save();
    ctx.globalAlpha = dimmed ? 0.5 : 1;
    ctx.translate(item.point.x, item.point.y);
    ctx.shadowColor = item.player === HUMAN ? "rgba(24, 31, 29, 0.3)" : "rgba(65, 58, 48, 0.2)";
    ctx.shadowBlur = radius * 0.48;
    ctx.shadowOffsetY = radius * 0.2;
    var gradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.34, radius * 0.07, 0, 0, radius);
    if (item.player === HUMAN) {
      gradient.addColorStop(0, "#6d7b76");
      gradient.addColorStop(0.38, "#2b3935");
      gradient.addColorStop(1, "#14201d");
    } else {
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.48, "#f8f4e9");
      gradient.addColorStop(1, "#d5cec1");
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    if (item.player === AI) {
      ctx.strokeStyle = "rgba(94, 88, 78, 0.36)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCompletionStones(ctx, morph, spin) {
    var winningMask = activeWinningMask();
    var winnerSet = winningCellSet();
    var items = [];
    for (var cell = 0; cell < game.board.length; cell += 1) {
      if (game.board[cell] !== Engine.EMPTY) {
        var point = completionCellPoint(cell, morph, spin);
        items.push({
          cell: cell,
          player: game.board[cell],
          point: point
        });
      }
    }
    items.sort(function sortStones(a, b) { return a.point.depth - b.point.depth; });
    var radius = renderState.layout.cell * (0.37 - morph * 0.07);
    items.forEach(function drawItem(item) {
      drawCompletionStone(ctx, item, radius, Boolean(winningMask && !winnerSet[item.cell]));
    });
  }

  function drawCompletionMorph(ctx, time) {
    var elapsed = time - game.completion.startedAt;
    var returning = game.completion.phase === "returning";
    var progress = returning
      ? clamp01(elapsed / game.completion.duration)
      : clamp01((elapsed - 80) / 2550);
    var morph = returning ? 1 - Morph.smooth(progress) : Morph.spring(progress);
    var viewBlend = returning ? morph : Morph.smooth((elapsed - 100) / 1850);
    var rotationBlend = returning ? viewBlend : 1;
    var restingBounce = !returning && game.completion.settled && !game.completion.dragging
      ? Math.sin(time * 0.00245) * 0.012
      : 0;
    var jellyScale = returning
      ? 1
      : 1 + Math.sin(progress * Math.PI * 2.35) * Math.pow(1 - progress, 1.85) * 0.048 + restingBounce * 0.42;
    var sphereCompletion = game.level.topology === "sphere";
    var orientation = {
      x: game.completion.view.x * viewBlend + game.completion.rotation.x * rotationBlend,
      y: game.completion.view.y * viewBlend + game.completion.rotation.y * rotationBlend,
      z: game.completion.view.z * viewBlend + game.completion.rotation.z * rotationBlend,
      scale: jellyScale,
      shapeX: sphereCompletion ? 1 : 1 + ((Number(game.completion.view.shapeX) || 1) - 1) * viewBlend,
      shapeY: sphereCompletion ? 1 : 1 + ((Number(game.completion.view.shapeY) || 1) - 1) * viewBlend,
      shapeZ: sphereCompletion ? 1 : 1 + ((Number(game.completion.view.shapeZ) || 1) - 1) * viewBlend,
      wobbleX: sphereCompletion ? game.completion.elastic.x : game.completion.elastic.x + restingBounce,
      wobbleY: sphereCompletion ? game.completion.elastic.y : game.completion.elastic.y + Math.cos(time * 0.0021) * (game.completion.settled ? 0.009 : 0),
      presentation: game.completion.presentation
    };

    drawCompletionSurface(ctx, morph, orientation);
    drawCompletionGrid(ctx, morph, orientation);
    if (game.level.topology === "sphere") {
      drawCompletionSphereBoundary(ctx, "a", morph, orientation, "#3f8c87");
      drawCompletionSphereBoundary(ctx, "b", morph, orientation, "#c79244");
    } else {
      if (game.level.xConnection) {
        drawCompletionBoundary(ctx, "x", morph, orientation, "#3f8c87");
      }
      if (game.level.yConnection) {
        drawCompletionBoundary(ctx, "y", morph, orientation, "#c79244");
      }
    }
    drawCompletionWinningLine(ctx, time, morph, orientation);
    drawCompletionStones(ctx, morph, orientation);
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
    if (isInteractiveLesson() && game.lesson.step > 0 && game.lesson.step < game.lesson.cells.length) {
      var pendingSeam = game.lesson.seams[game.lesson.step - 1];
      if (pendingSeam & bit) {
        pulse = Math.max(pulse, 0.34 + (Math.sin(time * 0.0055) * 0.5 + 0.5) * 0.56);
      }
    }
    return pulse;
  }

  function drawTopologyRails(ctx, time) {
    var layout = renderState.layout;
    if (game.level.topology === "sphere") {
      drawSphereRails(ctx, time);
      return;
    }
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

  function drawSphereRails(ctx, time) {
    var layout = renderState.layout;
    var offset = Math.min(15, layout.cell * 0.4);
    var pairs = [
      { color: "#3f8c87", pulse: seamPulseFor(Engine.SEAM_X, time), sides: ["top", "left"] },
      { color: "#c79244", pulse: seamPulseFor(Engine.SEAM_Y, time), sides: ["bottom", "right"] }
    ];
    pairs.forEach(function drawAdjacentPair(pair) {
      ctx.save();
      ctx.strokeStyle = pair.color;
      ctx.fillStyle = pair.color;
      ctx.globalAlpha = 0.58 + pair.pulse * 0.4;
      ctx.lineWidth = 2 + pair.pulse * 2.2;
      ctx.lineCap = "round";
      ctx.shadowColor = pair.color;
      ctx.shadowBlur = pair.pulse * 16;
      pair.sides.forEach(function drawAdjacentSide(side) {
        if (side === "top" || side === "bottom") {
          var y = side === "top" ? layout.top - offset : layout.bottom + offset;
          drawRailLine(ctx, layout.left, y, layout.right, y);
          drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.36, y, "horizontal", 1);
          drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.7, y, "horizontal", 1);
        } else {
          var x = side === "left" ? layout.left - offset : layout.right + offset;
          drawRailLine(ctx, x, layout.top, x, layout.bottom);
          drawArrow(ctx, x, layout.top + (layout.bottom - layout.top) * 0.36, "vertical", 1);
          drawArrow(ctx, x, layout.top + (layout.bottom - layout.top) * 0.7, "vertical", 1);
        }
      });
      ctx.restore();
    });
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
    if (sourceCell < 0 || !game || game.status !== "playing" || !canPlaceCell(sourceCell)) {
      return;
    }
    var point = Engine.toPoint(game.rules, sourceCell);
    var directions = [];
    if (game.level.topology === "sphere") {
      if (point.y === 0) { directions.push({ direction: 6, color: "#3f8c87" }); }
      if (point.x === 0) { directions.push({ direction: 4, color: "#3f8c87" }); }
      if (point.y === game.rules.height - 1) { directions.push({ direction: 2, color: "#c79244" }); }
      if (point.x === game.rules.width - 1) { directions.push({ direction: 0, color: "#c79244" }); }
    } else {
    if (game.level.xConnection && point.x === 0) { directions.push({ direction: 4, color: "#3f8c87" }); }
    if (game.level.xConnection && point.x === game.rules.width - 1) { directions.push({ direction: 0, color: "#3f8c87" }); }
    if (game.level.yConnection && point.y === 0) { directions.push({ direction: 6, color: "#c79244" }); }
    if (game.level.yConnection && point.y === game.rules.height - 1) { directions.push({ direction: 2, color: "#c79244" }); }
    }

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

  function drawStoneFace(ctx, player, radius, markLastMove, compression) {
    var pressedDepth = compression || 0;
    var highlightX = -radius * (0.28 - pressedDepth * 0.055);
    var highlightY = -radius * (0.34 - pressedDepth * 0.12);
    var gradient = ctx.createRadialGradient(highlightX, highlightY, radius * (0.08 + pressedDepth * 0.035), 0, 0, radius);
    if (player === HUMAN) {
      gradient.addColorStop(0, pressedDepth ? "#56635f" : "#66736f");
      gradient.addColorStop(0.38, "#2b3935");
      gradient.addColorStop(1, "#14201d");
    } else {
      gradient.addColorStop(0, pressedDepth ? "#fbfaf5" : "#ffffff");
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
    if (markLastMove) {
      ctx.fillStyle = "#d95b4f";
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2.1, radius * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMovePreview(ctx, time) {
    var cell = renderState.pressedCell >= 0 ? renderState.pressedCell : renderState.hoverCell;
    if (!canPlaceCell(cell)) {
      return;
    }
    var previewPlayer = DEV_MODE ? developer.placementPlayer : HUMAN;
    var pressed = renderState.pressedCell >= 0;
    var center = pressed && renderState.pressedMotionReady
      ? { x: renderState.pressedX, y: renderState.pressedY }
      : cellCenter(cell);
    var radius = renderState.layout.cell * 0.34;
    ctx.save();
    if (!pressed) {
      ctx.globalAlpha = 0.16;
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
      return;
    }

    var pressProgress = clamp01((time - renderState.pressedAt) / 135);
    var landing = 1 - Math.pow(1 - pressProgress, 3);
    var softBounce = Math.sin(pressProgress * Math.PI) * 0.045;
    var planarScale = 0.72 + (1.16 - 0.72) * landing + softBounce;
    ctx.globalAlpha = 0.46 + landing * 0.54;
    ctx.translate(center.x, center.y + radius * (1 - landing) * -0.16);
    ctx.scale(planarScale, planarScale);
    ctx.shadowColor = previewPlayer === HUMAN ? "rgba(24, 31, 29, 0.24)" : "rgba(65, 58, 48, 0.16)";
    ctx.shadowBlur = radius * (0.34 - landing * 0.08);
    ctx.shadowOffsetY = radius * (0.18 - landing * 0.105);
    drawStoneFace(ctx, previewPlayer, radius, false, landing);
    ctx.restore();
  }

  function tacticalHintPriority(hint) {
    if (hint.player === HUMAN && hint.kind === "four") {
      return 4;
    }
    if (hint.player === AI && hint.kind === "four") {
      return 3;
    }
    if (hint.player === AI && hint.kind === "three") {
      return 2;
    }
    return 1;
  }

  function drawTacticalHints(ctx) {
    if (!prefs.hints || !game || game.levelIndex === 0 || game.status !== "playing" || isInteractiveLesson() || (game.demo && game.demo.active)) {
      return;
    }
    var hintsByCell = Object.create(null);
    [HUMAN, AI].forEach(function collectPlayerHints(player) {
      Engine.findLineHints(game.board, game.rules, player).forEach(function rememberTacticalHint(hint) {
        var candidate = { cell: hint.cell, kind: hint.kind, player: player };
        var current = hintsByCell[hint.cell];
        if (!current || tacticalHintPriority(candidate) > tacticalHintPriority(current)) {
          hintsByCell[hint.cell] = candidate;
        }
      });
    });
    var hints = Object.keys(hintsByCell).map(function toTacticalHint(cell) {
      return hintsByCell[cell];
    });
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
      var defensive = hint.player === AI;
      ctx.save();
      ctx.strokeStyle = defensive ? "#d95b4f" : (urgent ? "#c79244" : "#3f8c87");
      ctx.fillStyle = defensive
        ? (urgent ? "rgba(217, 91, 79, 0.085)" : "rgba(217, 91, 79, 0.04)")
        : (urgent ? "rgba(199, 146, 68, 0.07)" : "rgba(63, 140, 135, 0.055)");
      ctx.globalAlpha = urgent ? 0.92 : 0.72;
      ctx.lineWidth = urgent ? 1.85 : 1.35;
      ctx.setLineDash(defensive
        ? [Math.max(2.2, cellSize * 0.06), Math.max(3.2, cellSize * 0.105)]
        : [Math.max(3, cellSize * 0.095), Math.max(3, cellSize * 0.09)]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, cellSize * 0.27, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (defensive) {
        ctx.setLineDash([]);
        ctx.globalAlpha = urgent ? 0.52 : 0.32;
        ctx.fillStyle = "#d95b4f";
        ctx.beginPath();
        ctx.arc(center.x, center.y, urgent ? 2.15 : 1.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function activeWinningMask() {
    if (!game || !game.winningMask) {
      return null;
    }
    if (game.review && game.review.step < game.review.total) {
      return null;
    }
    return game.winningMask;
  }

  function winningCellSet() {
    var set = Object.create(null);
    var winningMask = activeWinningMask();
    if (winningMask) {
      Array.prototype.forEach.call(winningMask.cells, function rememberCell(cell) {
        set[cell] = true;
      });
    }
    return set;
  }

  function drawWinningConnections(ctx, time) {
    var winningMask = activeWinningMask();
    if (!winningMask) {
      return;
    }
    var cells = winningMask.cells;
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
    var winningMask = activeWinningMask();
    var winnerSet = winningCellSet();
    var radius = renderState.layout.cell * 0.37;
    var cell;
    for (cell = 0; cell < game.board.length; cell += 1) {
      var player = game.board[cell];
      if (player === Engine.EMPTY) {
        continue;
      }
      var center = cellCenter(cell);
      var scaleX = 1;
      var scaleY = 1;
      var releaseCompression = 0;
      if (cell === game.lastMove && renderState.lastMoveAt) {
        if (renderState.lastMoveFromPress) {
          var releaseProgress = clamp01((time - renderState.lastMoveAt) / 260);
          var releaseWave = Math.exp(-5.2 * releaseProgress) * Math.cos(releaseProgress * Math.PI * 2.15);
          scaleX = 1 + 0.16 * releaseWave;
          scaleY = scaleX;
          releaseCompression = Math.exp(-5.4 * releaseProgress);
        } else {
          var entranceScale = easeOutBack(clamp01((time - renderState.lastMoveAt) / 190));
          scaleX = entranceScale;
          scaleY = entranceScale;
        }
      }
      var isWinning = Boolean(winnerSet[cell]);
      var dimmed = winningMask && !isWinning;

      ctx.save();
      ctx.globalAlpha = dimmed ? 0.4 : 1;
      ctx.translate(center.x, center.y);
      ctx.scale(scaleX, scaleY);
      ctx.shadowColor = player === HUMAN ? "rgba(24, 31, 29, 0.28)" : "rgba(65, 58, 48, 0.18)";
      ctx.shadowBlur = radius * (0.42 - releaseCompression * 0.16);
      ctx.shadowOffsetY = radius * (0.2 - releaseCompression * 0.125);

      drawStoneFace(ctx, player, radius, cell === game.lastMove, releaseCompression);
      ctx.restore();

      if (isWinning) {
        var winningIndex = Array.prototype.indexOf.call(winningMask.cells, cell);
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

  function clearPressedStoneMotion() {
    renderState.pressedMotionReady = false;
    renderState.pressedVelocityX = 0;
    renderState.pressedVelocityY = 0;
  }

  function targetPressedStone(cell, immediate) {
    if (cell < 0) {
      return;
    }
    var center = cellCenter(cell);
    renderState.pressedTargetX = center.x;
    renderState.pressedTargetY = center.y;
    if (immediate || !renderState.pressedMotionReady) {
      renderState.pressedX = center.x;
      renderState.pressedY = center.y;
      renderState.pressedVelocityX = 0;
      renderState.pressedVelocityY = 0;
      renderState.pressedMotionReady = true;
      return;
    }
    renderState.pressedVelocityX = 0;
    renderState.pressedVelocityY = 0;
  }

  function updatePressedStoneMotion(delta) {
    if (!renderState.pressedMotionReady || renderState.pointerId === null || renderState.pressedCell < 0) {
      return;
    }
    var frameScale = Math.max(0.55, Math.min(2.05, delta / 16.67));
    var follow = 1 - Math.pow(0.46, frameScale);
    renderState.pressedVelocityX = (renderState.pressedTargetX - renderState.pressedX) * follow;
    renderState.pressedVelocityY = (renderState.pressedTargetY - renderState.pressedY) * follow;
    renderState.pressedX += renderState.pressedVelocityX * frameScale;
    renderState.pressedY += renderState.pressedVelocityY * frameScale;
    if (Math.abs(renderState.pressedTargetX - renderState.pressedX) < 0.04 && Math.abs(renderState.pressedVelocityX) < 0.04) {
      renderState.pressedX = renderState.pressedTargetX;
      renderState.pressedVelocityX = 0;
    }
    if (Math.abs(renderState.pressedTargetY - renderState.pressedY) < 0.04 && Math.abs(renderState.pressedVelocityY) < 0.04) {
      renderState.pressedY = renderState.pressedTargetY;
      renderState.pressedVelocityY = 0;
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

  function pointerInsideBoard(event) {
    if (!renderState.layout) {
      return false;
    }
    var rect = dom.boardCanvas.getBoundingClientRect();
    var localX = event.clientX - rect.left;
    var localY = event.clientY - rect.top;
    var margin = renderState.layout.cell * 0.58;
    return localX >= renderState.layout.left - margin
      && localX <= renderState.layout.right + margin
      && localY >= renderState.layout.top - margin
      && localY <= renderState.layout.bottom + margin;
  }

  function canPlaceOnBoard() {
    if (!game || game.status !== "playing" || (game.demo && game.demo.active) || activeSheet) {
      return false;
    }
    return DEV_MODE || game.turn === HUMAN;
  }

  function canPlaceCell(cell) {
    if (!canPlaceOnBoard() || cell < 0 || game.board[cell] !== Engine.EMPTY) {
      return false;
    }
    return !isInteractiveLesson() || game.lesson.cells[game.lesson.step] === cell;
  }

  function canExploreCompletion() {
    return Boolean(
      game
      && game.completion
      && game.completion.phase === "presenting"
      && game.status === "ended"
      && !activeSheet
    );
  }

  function onBoardPointerDown(event) {
    sound.unlock();
    if (canExploreCompletion()) {
      event.preventDefault();
      var completion = game.completion;
      completion.dragging = true;
      completion.pointerId = event.pointerId;
      completion.lastX = event.clientX;
      completion.lastY = event.clientY;
      completion.lastPointerAt = event.timeStamp || performance.now();
      completion.velocity.x = 0;
      completion.velocity.y = 0;
      completion.autoResumeAt = Infinity;
      dom.boardStage.classList.add("is-dragging");
      if (dom.boardCanvas.setPointerCapture) {
        dom.boardCanvas.setPointerCapture(event.pointerId);
      }
      requestRender();
      return;
    }
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
    renderState.pressedAt = event.timeStamp || performance.now();
    if (canPlaceCell(renderState.pressedCell)) {
      targetPressedStone(renderState.pressedCell, true);
    } else {
      renderState.pressedCell = -1;
      clearPressedStoneMotion();
    }
    if (dom.boardCanvas.setPointerCapture) {
      dom.boardCanvas.setPointerCapture(event.pointerId);
    }
    requestRender();
  }

  function onBoardPointerMove(event) {
    if (!game) {
      return;
    }
    if (game.completion && game.completion.dragging && game.completion.pointerId === event.pointerId) {
      event.preventDefault();
      var completion = game.completion;
      var now = event.timeStamp || performance.now();
      var deltaTime = Math.max(8, Math.min(40, now - completion.lastPointerAt));
      var deltaX = event.clientX - completion.lastX;
      var deltaY = event.clientY - completion.lastY;
      var yawDelta = deltaX * 0.009;
      var pitchDelta = deltaY * 0.009;
      completion.rotation.y += yawDelta;
      completion.rotation.x += pitchDelta;
      completion.velocity.y = yawDelta / deltaTime;
      completion.velocity.x = pitchDelta / deltaTime;
      completion.elastic.velocityY += yawDelta * 0.18;
      completion.elastic.velocityX += pitchDelta * 0.18;
      completion.lastX = event.clientX;
      completion.lastY = event.clientY;
      completion.lastPointerAt = now;
      requestRender();
      return;
    }
    var cell = eventToCell(event);
    if (renderState.pointerId === event.pointerId) {
      event.preventDefault();
      if (canPlaceCell(cell) && cell !== renderState.pressedCell) {
        renderState.pressedCell = cell;
        targetPressedStone(cell, false);
      }
    } else if (event.pointerType === "mouse" || event.pointerType === "pen") {
      renderState.hoverCell = cell;
    }
    requestRender();
  }

  function onBoardPointerUp(event) {
    if (game && game.completion && game.completion.pointerId === event.pointerId) {
      event.preventDefault();
      game.completion.dragging = false;
      game.completion.pointerId = null;
      game.completion.autoResumeAt = (event.timeStamp || performance.now()) + 1500;
      dom.boardStage.classList.remove("is-dragging");
      requestRender();
      return;
    }
    if (renderState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    var cell = eventToCell(event);
    if (cell < 0 && pointerInsideBoard(event)) {
      cell = renderState.pressedCell;
    }
    var releasedFromPress = cell >= 0 && cell === renderState.pressedCell && renderState.pressedAt > 0;
    renderState.pointerId = null;
    renderState.pressedCell = -1;
    renderState.pressedAt = 0;
    clearPressedStoneMotion();
    if (canPlaceCell(cell)) {
      performMove(cell, DEV_MODE ? developer.placementPlayer : HUMAN, { fromPress: releasedFromPress });
    } else {
      requestRender();
    }
  }

  function onBoardPointerCancel(event) {
    if (game && game.completion && game.completion.pointerId === event.pointerId) {
      game.completion.dragging = false;
      game.completion.pointerId = null;
      game.completion.autoResumeAt = performance.now() + 900;
      dom.boardStage.classList.remove("is-dragging");
      requestRender();
      return;
    }
    if (renderState.pointerId === event.pointerId) {
      renderState.pointerId = null;
      renderState.pressedCell = -1;
      renderState.pressedAt = 0;
      clearPressedStoneMotion();
      requestRender();
    }
  }

  function bindEvents() {
    dom.levelGrid.addEventListener("click", function onLevelClick(event) {
      var card = event.target.closest(".level-card");
      if (card) {
        selectLevel(Number(card.dataset.level), card);
      }
    });
    dom.gameSettingsButton.addEventListener("click", openSettings);
    dom.backButton.addEventListener("click", leaveGame);
    dom.reviewToggleButton.addEventListener("click", handleReviewToggle);
    dom.reviewPreviousButton.addEventListener("click", function showPreviousMove() { stepReplay(-1); });
    dom.reviewNextButton.addEventListener("click", function showNextMove() { stepReplay(1); });
    dom.dimensionToggleButton.addEventListener("click", toggleEndgameDimension);
    dom.restartButton.addEventListener("click", handleRightTool);
    dom.journeyButton.addEventListener("click", handleJourney);
    dom.settledReplayButton.addEventListener("click", handleSettledAction);
    dom.nextLevelButton.addEventListener("click", handleNextLevel);
    dom.boundaryDemoButton.addEventListener("click", replayBoundaryLesson);
    dom.undoButton.addEventListener("click", handleLeftTool);
    dom.closeSettingsButton.addEventListener("click", function closeSettings() { closeActiveSheet(false); });
    dom.settingsDoneButton.addEventListener("click", function finishSettings() {
      sound.play("ui");
      closeActiveSheet(false);
    });
    bindDifficultySlider();
    bindLiquidSwitch(dom.hintSwitch, function hintsEnabled() { return prefs.hints; }, setHintsEnabled);
    bindLiquidSwitch(dom.soundSwitch, function soundEnabled() { return prefs.sound; }, setSoundEnabled);
    bindSettingsSheetDismiss();
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
    dom.developerDraw.addEventListener("click", developerForceDraw);
    dom.developerClearBoard.addEventListener("click", developerClearCurrentBoard);
    dom.developerHintThree.addEventListener("click", function seedLiveThree() { developerSeedHint("three"); });
    dom.developerHintFour.addEventListener("click", function seedFour() { developerSeedHint("four"); });
    dom.developerResetProgress.addEventListener("click", developerResetProgress);
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
        renderState.pressedAt = 0;
        clearPressedStoneMotion();
      }
    });
  }

  function initialize() {
    bindEvents();
    updateHome();
    syncSettingsUI();
    var warmSphereParameterization = function warmSphereParameterization() {
      if (Morph && typeof Morph.prepareSphere === "function") {
        Morph.prepareSphere();
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(warmSphereParameterization, { timeout: 1400 });
    } else {
      window.setTimeout(warmSphereParameterization, 1200);
    }
    dom.developerButton.hidden = !DEV_MODE;
    if (DEV_MODE) {
      document.body.classList.add("is-developer-mode");
      syncDeveloperUI();
    }
  }

  initialize();
})();

(function attachTopologyBoardArt(root, factory) {
  "use strict";

  var Engine = root && root.TopologyGomoku;
  var Morph = root && root.TopologyMorph;
  if (typeof module === "object" && module.exports) {
    Engine = require("./topology.js");
    Morph = require("./topology-morph.js");
  }
  var api = factory(Engine, Morph);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TopologyBoardArt = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function topologyBoardArtFactory(Engine, Morph) {
  "use strict";

  if (!Engine || !Morph) {
    throw new Error("TopologyBoardArt requires topology and morph modules");
  }

  var TOKENS = {
    paper: "#f2efe7",
    paperDeep: "#e8e2d7",
    card: "rgba(251, 250, 246, 0.94)",
    ink: "#21302c",
    muted: "#817f77",
    faint: "#c8c1b5",
    red: "#d95b4f",
    redDark: "#bd493f",
    teal: "#3f8c87",
    gold: "#c79244",
    spatial: "#8b7556",
    violet: "#7f6ca8"
  };

  var DEFAULT_VIEWS = {
    cylinder: { x: 0.34, y: -0.56, z: -0.12, scale: 1 },
    torus: { x: 0.72, y: -0.12, z: -0.24, scale: 1 },
    mobius: { x: 0.96, y: -0.08, z: -0.12, scale: 1 },
    klein: { x: 0.18, y: -0.2, z: -0.08, scale: 1 },
    projective: { x: 0.66, y: -0.52, z: 0.12, scale: 1 },
    sphere: { x: 0.42, y: -0.58, z: -0.08, scale: 1 }
  };

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function easeOutBack(value) {
    var c1 = 1.45;
    var c3 = c1 + 1;
    var shifted = value - 1;
    return 1 + c3 * shifted * shifted * shifted + c1 * shifted * shifted;
  }

  function computeLayout(width, height, rules, options) {
    var settings = options || {};
    var minimumMargin = Number(settings.minimumMargin) || 34;
    var marginRatio = Number(settings.marginRatio) || 0.115;
    var margin = Math.max(minimumMargin, Math.min(width, height) * marginRatio);
    var availableWidth = Math.max(1, width - margin * 2);
    var availableHeight = Math.max(1, height - margin * 2);
    var cell = Math.min(
      availableWidth / Math.max(1, rules.width - 1),
      availableHeight / Math.max(1, rules.height - 1)
    );
    var boardWidth = cell * (rules.width - 1);
    var boardHeight = cell * (rules.height - 1);
    return {
      cell: cell,
      left: (width - boardWidth) / 2,
      top: (height - boardHeight) / 2,
      right: (width + boardWidth) / 2,
      bottom: (height + boardHeight) / 2,
      width: width,
      height: height
    };
  }

  function cellCenter(rules, layout, cell) {
    var point = Engine.toPoint(rules, cell);
    return {
      x: layout.left + point.x * layout.cell,
      y: layout.top + point.y * layout.cell
    };
  }

  function hitTestCell(rules, layout, x, y) {
    if (!rules || !layout) {
      return -1;
    }
    var gridX = Math.round((x - layout.left) / layout.cell);
    var gridY = Math.round((y - layout.top) / layout.cell);
    if (gridX < 0 || gridX >= rules.width || gridY < 0 || gridY >= rules.height) {
      return -1;
    }
    var snapX = layout.left + gridX * layout.cell;
    var snapY = layout.top + gridY * layout.cell;
    if (Math.hypot(x - snapX, y - snapY) > layout.cell * 0.53) {
      return -1;
    }
    return Engine.toCell(rules, gridX, gridY);
  }

  function pointInsideBoard(layout, x, y) {
    var margin = layout.cell * 0.58;
    return x >= layout.left - margin && x <= layout.right + margin
      && y >= layout.top - margin && y <= layout.bottom + margin;
  }

  function drawPaperTexture(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = "rgba(81, 75, 65, 0.035)";
    for (var index = 0; index < 46; index += 1) {
      var x = (Math.sin(index * 91.73) * 0.5 + 0.5) * width;
      var y = (Math.sin(index * 47.17 + 2.3) * 0.5 + 0.5) * height;
      ctx.fillRect(x, y, 0.65, 0.65);
    }
    ctx.restore();
  }

  function drawGrid(ctx, game, layout) {
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

  function seamPulse(game, bit, time) {
    var pulse = 0;
    if ((game.seamPulseBits & bit) && game.seamPulseAt) {
      var progress = clamp01((time - game.seamPulseAt) / 920);
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
    if (game.lesson && game.lesson.active && game.lesson.step > 0 && game.lesson.step < game.lesson.cells.length) {
      var pendingSeam = game.lesson.seams[game.lesson.step - 1];
      if (pendingSeam & bit) {
        pulse = Math.max(pulse, 0.34 + (Math.sin(time * 0.0055) * 0.5 + 0.5) * 0.56);
      }
    }
    return pulse;
  }

  function drawRailPair(ctx, layout, orientation, color, twisted, pulse) {
    var offset = Math.min(15, layout.cell * 0.4);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.58 + pulse * 0.4;
    ctx.lineWidth = 2 + pulse * 2.2;
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = pulse * 16;
    if (twisted && ctx.setLineDash) {
      ctx.setLineDash([5, 5]);
    }
    if (orientation === "vertical") {
      var leftX = layout.left - offset;
      var rightX = layout.right + offset;
      drawRailLine(ctx, leftX, layout.top, leftX, layout.bottom);
      drawRailLine(ctx, rightX, layout.top, rightX, layout.bottom);
      if (ctx.setLineDash) { ctx.setLineDash([]); }
      drawArrow(ctx, leftX, layout.top + (layout.bottom - layout.top) * 0.34, "vertical", 1);
      drawArrow(ctx, leftX, layout.top + (layout.bottom - layout.top) * 0.7, "vertical", 1);
      drawArrow(ctx, rightX, layout.top + (layout.bottom - layout.top) * 0.34, "vertical", twisted ? -1 : 1);
      drawArrow(ctx, rightX, layout.top + (layout.bottom - layout.top) * 0.7, "vertical", twisted ? -1 : 1);
    } else {
      var topY = layout.top - offset;
      var bottomY = layout.bottom + offset;
      drawRailLine(ctx, layout.left, topY, layout.right, topY);
      drawRailLine(ctx, layout.left, bottomY, layout.right, bottomY);
      if (ctx.setLineDash) { ctx.setLineDash([]); }
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.34, topY, "horizontal", 1);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.7, topY, "horizontal", 1);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.34, bottomY, "horizontal", twisted ? -1 : 1);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.7, bottomY, "horizontal", twisted ? -1 : 1);
    }
    ctx.restore();
  }

  function drawSphereRails(ctx, game, layout, time) {
    var offset = Math.min(15, layout.cell * 0.4);
    var pairs = [
      { color: TOKENS.teal, pulse: seamPulse(game, Engine.SEAM_X, time), sides: ["top", "left"] },
      { color: TOKENS.gold, pulse: seamPulse(game, Engine.SEAM_Y, time), sides: ["bottom", "right"] }
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
      pair.sides.forEach(function drawSide(side) {
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

  function drawTopologyRails(ctx, game, layout, time) {
    if (game.level.topology === "sphere") {
      drawSphereRails(ctx, game, layout, time);
      return;
    }
    if (game.level.xConnection) {
      drawRailPair(ctx, layout, "vertical", TOKENS.teal, game.level.xConnection === "twist", seamPulse(game, Engine.SEAM_X, time));
    }
    if (game.level.yConnection) {
      drawRailPair(ctx, layout, "horizontal", TOKENS.gold, game.level.yConnection === "twist", seamPulse(game, Engine.SEAM_Y, time));
    }
    if (!game.level.xConnection && !game.level.yConnection) {
      ctx.save();
      ctx.strokeStyle = "rgba(95, 91, 83, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(layout.left - 8, layout.top - 8, layout.right - layout.left + 16, layout.bottom - layout.top + 16);
      ctx.restore();
    }
  }

  function drawStoneFace(ctx, player, radius, markLastMove, compression) {
    var pressedDepth = compression || 0;
    var highlightX = -radius * (0.28 - pressedDepth * 0.055);
    var highlightY = -radius * (0.34 - pressedDepth * 0.12);
    var gradient = ctx.createRadialGradient(highlightX, highlightY, radius * (0.08 + pressedDepth * 0.035), 0, 0, radius);
    if (player === Engine.HUMAN) {
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
    if (player === Engine.AI) {
      ctx.strokeStyle = "rgba(94, 88, 78, 0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (markLastMove) {
      ctx.fillStyle = TOKENS.red;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2.1, radius * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function winningCellSet(game) {
    var set = Object.create(null);
    var mask = game.winningMask;
    if (mask && (!game.review || game.review.step === game.review.total)) {
      Array.prototype.forEach.call(mask.cells, function remember(cell) { set[cell] = true; });
    }
    return set;
  }

  function drawWinningConnections(ctx, game, layout, time) {
    var mask = game.winningMask;
    if (!mask || (game.review && game.review.step < game.review.total)) {
      return;
    }
    var progress = clamp01((time - game.winAt) / 620);
    ctx.save();
    ctx.strokeStyle = "rgba(199, 146, 68, " + (0.22 + progress * 0.55) + ")";
    ctx.lineWidth = Math.max(3, layout.cell * 0.11);
    ctx.lineCap = "round";
    for (var index = 0; index < mask.cells.length - 1; index += 1) {
      var from = cellCenter(game.rules, layout, mask.cells[index]);
      var to = cellCenter(game.rules, layout, mask.cells[index + 1]);
      if (Math.hypot(to.x - from.x, to.y - from.y) <= layout.cell * 1.65) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStones(ctx, game, layout, time) {
    var winnerSet = winningCellSet(game);
    var mask = game.winningMask;
    var radius = layout.cell * 0.37;
    for (var cell = 0; cell < game.board.length; cell += 1) {
      var player = game.board[cell];
      if (player === Engine.EMPTY) {
        continue;
      }
      var center = cellCenter(game.rules, layout, cell);
      var scale = 1;
      var compression = 0;
      if (cell === game.lastMove && game.lastMoveAt) {
        if (game.lastMoveFromPress) {
          var releaseProgress = clamp01((time - game.lastMoveAt) / 260);
          var releaseWave = Math.exp(-5.2 * releaseProgress) * Math.cos(releaseProgress * Math.PI * 2.15);
          scale = 1 + 0.16 * releaseWave;
          compression = Math.exp(-5.4 * releaseProgress);
        } else {
          scale = easeOutBack(clamp01((time - game.lastMoveAt) / 190));
        }
      }
      var winning = Boolean(winnerSet[cell]);
      ctx.save();
      ctx.globalAlpha = mask && !winning ? 0.4 : 1;
      ctx.translate(center.x, center.y);
      ctx.scale(scale, scale);
      ctx.shadowColor = player === Engine.HUMAN ? "rgba(24, 31, 29, 0.28)" : "rgba(65, 58, 48, 0.18)";
      ctx.shadowBlur = radius * (0.42 - compression * 0.16);
      ctx.shadowOffsetY = radius * (0.2 - compression * 0.125);
      drawStoneFace(ctx, player, radius, cell === game.lastMove, compression);
      ctx.restore();
      if (winning) {
        var winningIndex = Array.prototype.indexOf.call(mask.cells, cell);
        var ringProgress = clamp01((time - game.winAt - winningIndex * 70) / 330);
        ctx.save();
        ctx.globalAlpha = ringProgress * 0.78;
        ctx.strokeStyle = TOKENS.gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius + 4 + ringProgress * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawMovePreview(ctx, game, layout, time, interaction) {
    var input = interaction || {};
    var cell = Number.isFinite(input.pressedCell) ? input.pressedCell : -1;
    if (cell < 0 || game.board[cell] !== Engine.EMPTY || game.turn !== Engine.HUMAN || game.status !== "playing") {
      return;
    }
    if (game.lesson && game.lesson.active && game.lesson.cells[game.lesson.step] !== cell) {
      return;
    }
    var center = input.position || cellCenter(game.rules, layout, cell);
    var radius = layout.cell * 0.34;
    var progress = clamp01((time - (input.pressedAt || time)) / 135);
    var landing = 1 - Math.pow(1 - progress, 3);
    var scale = 0.72 + (1.16 - 0.72) * landing + Math.sin(progress * Math.PI) * 0.045;
    ctx.save();
    ctx.globalAlpha = 0.46 + landing * 0.54;
    ctx.translate(center.x, center.y + radius * (1 - landing) * -0.16);
    ctx.scale(scale, scale);
    ctx.shadowColor = "rgba(24, 31, 29, 0.24)";
    ctx.shadowBlur = radius * (0.34 - landing * 0.08);
    ctx.shadowOffsetY = radius * (0.18 - landing * 0.105);
    drawStoneFace(ctx, Engine.HUMAN, radius, false, landing);
    ctx.restore();
  }

  function tacticalPriority(hint) {
    if (hint.player === Engine.HUMAN && hint.kind === "four") { return 4; }
    if (hint.player === Engine.AI && hint.kind === "four") { return 3; }
    if (hint.player === Engine.AI && hint.kind === "three") { return 2; }
    return 1;
  }

  function drawTacticalHints(ctx, game, layout, preferences) {
    if (!preferences || !preferences.hints || game.levelIndex === 0 || game.status !== "playing"
      || (game.lesson && game.lesson.active) || (game.demo && game.demo.active)) {
      return;
    }
    var byCell = Object.create(null);
    [Engine.HUMAN, Engine.AI].forEach(function collect(player) {
      Engine.findLineHints(game.board, game.rules, player).forEach(function remember(hint) {
        var candidate = { cell: hint.cell, kind: hint.kind, player: player };
        if (!byCell[hint.cell] || tacticalPriority(candidate) > tacticalPriority(byCell[hint.cell])) {
          byCell[hint.cell] = candidate;
        }
      });
    });
    Object.keys(byCell).forEach(function draw(cellKey) {
      var hint = byCell[cellKey];
      if (game.board[hint.cell] !== Engine.EMPTY) {
        return;
      }
      var center = cellCenter(game.rules, layout, hint.cell);
      var urgent = hint.kind === "four";
      var defensive = hint.player === Engine.AI;
      ctx.save();
      ctx.strokeStyle = defensive ? TOKENS.red : (urgent ? TOKENS.gold : TOKENS.teal);
      ctx.fillStyle = defensive
        ? (urgent ? "rgba(217, 91, 79, 0.085)" : "rgba(217, 91, 79, 0.04)")
        : (urgent ? "rgba(199, 146, 68, 0.07)" : "rgba(63, 140, 135, 0.055)");
      ctx.globalAlpha = urgent ? 0.92 : 0.72;
      ctx.lineWidth = urgent ? 1.85 : 1.35;
      if (ctx.setLineDash) {
        ctx.setLineDash(defensive
          ? [Math.max(2.2, layout.cell * 0.06), Math.max(3.2, layout.cell * 0.105)]
          : [Math.max(3, layout.cell * 0.095), Math.max(3, layout.cell * 0.09)]);
      }
      ctx.beginPath();
      ctx.arc(center.x, center.y, layout.cell * 0.27, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawLessonGuide(ctx, game, layout, time, fontFamily) {
    if (!game.lesson || !game.lesson.active || game.status !== "playing") {
      return;
    }
    var hintCell = game.lesson.cells[game.lesson.step];
    if (hintCell < 0 || game.board[hintCell] !== Engine.EMPTY) {
      return;
    }
    var center = cellCenter(game.rules, layout, hintCell);
    var pulse = Math.sin(time * 0.006) * 0.5 + 0.5;
    var radius = layout.cell * 0.25 + pulse * 2.2;
    var prompts = game.lesson.prompts || [];
    var text = prompts[Math.min(game.lesson.step, prompts.length - 1)] || game.level.ruleText;
    var fontSize = Math.max(12, Math.min(14, layout.cell * 0.195));
    ctx.save();
    ctx.globalAlpha = 0.52 + pulse * 0.24;
    ctx.strokeStyle = TOKENS.teal;
    ctx.fillStyle = "rgba(63, 140, 135, 0.08)";
    ctx.lineWidth = 1.5;
    if (ctx.setLineDash) { ctx.setLineDash([4.5, 4.5]); }
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (ctx.setLineDash) { ctx.setLineDash([]); }
    ctx.font = "700 " + fontSize + "px " + (fontFamily || "serif");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var textWidth = ctx.measureText(text).width;
    var textX = Math.max(layout.left + textWidth * 0.5 + 7, Math.min(layout.right - textWidth * 0.5 - 7, center.x));
    var textY = center.y - radius - fontSize * 1.15;
    if (textY - fontSize * 0.6 < layout.top) {
      textY = center.y + radius + fontSize * 1.2;
    }
    ctx.globalAlpha = 0.74 + pulse * 0.22;
    ctx.lineWidth = 4.1;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(251, 250, 246, 0.92)";
    ctx.fillStyle = "#315f5b";
    ctx.strokeText(text, textX, textY);
    ctx.fillText(text, textX, textY);
    ctx.restore();
  }

  function drawDemo(ctx, game, layout, time) {
    if (!game.demo || !game.demo.active) {
      return;
    }
    var demo = game.demo;
    var elapsed = Math.max(0, time - demo.startedAt);
    var fadeStartsAt = (demo.cells.length - 1) * demo.dropInterval + demo.hold;
    var alpha = 1 - clamp01((elapsed - fadeStartsAt) / demo.fade);
    var radius = layout.cell * 0.34;
    for (var index = 0; index < demo.cells.length; index += 1) {
      var localProgress = clamp01((elapsed - index * demo.dropInterval) / 185);
      if (localProgress <= 0) {
        continue;
      }
      var center = cellCenter(game.rules, layout, demo.cells[index]);
      ctx.save();
      ctx.globalAlpha = alpha * (0.52 + localProgress * 0.38);
      ctx.translate(center.x, center.y);
      ctx.scale(easeOutBack(localProgress), easeOutBack(localProgress));
      ctx.shadowColor = "rgba(24, 31, 29, 0.2)";
      ctx.shadowBlur = radius * 0.38;
      ctx.shadowOffsetY = radius * 0.16;
      drawStoneFace(ctx, Engine.HUMAN, radius, false, 0);
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(93, 176, 167, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBoard(ctx, options) {
    var settings = options || {};
    var game = settings.game;
    var layout = settings.layout;
    var time = Number(settings.time) || 0;
    if (!game || !layout) {
      return;
    }
    drawPaperTexture(ctx, layout.width, layout.height);
    drawTopologyRails(ctx, game, layout, time);
    drawGrid(ctx, game, layout);
    drawDemo(ctx, game, layout, time);
    drawTacticalHints(ctx, game, layout, settings.preferences || {});
    drawLessonGuide(ctx, game, layout, time, settings.fontFamily);
    drawWinningConnections(ctx, game, layout, time);
    drawMovePreview(ctx, game, layout, time, settings.interaction);
    drawStones(ctx, game, layout, time);
  }

  function surfacePoint(game, layout, width, height, u, v, orientation) {
    var flat = {
      x: layout.left + u * (layout.right - layout.left),
      y: layout.top + v * (layout.bottom - layout.top)
    };
    var projected = Morph.project(game.level.topology, u, v, width, height, orientation);
    return { x: projected.x, y: projected.y, depth: projected.depth, flat: flat };
  }

  function drawSurface(ctx, game, layout, width, height, orientation) {
    var columns = game.level.topology === "sphere" ? 28 : 26;
    var rows = game.level.topology === "sphere" ? 28 : 20;
    var patches = [];
    for (var row = 0; row < rows; row += 1) {
      for (var column = 0; column < columns; column += 1) {
        var points = [
          surfacePoint(game, layout, width, height, column / columns, row / rows, orientation),
          surfacePoint(game, layout, width, height, (column + 1) / columns, row / rows, orientation),
          surfacePoint(game, layout, width, height, (column + 1) / columns, (row + 1) / rows, orientation),
          surfacePoint(game, layout, width, height, column / columns, (row + 1) / rows, orientation)
        ];
        patches.push({
          points: points,
          depth: points.reduce(function sum(total, point) { return total + point.depth; }, 0) / points.length
        });
      }
    }
    patches.sort(function sort(a, b) { return a.depth - b.depth; });
    var gradient = ctx.createLinearGradient(0, height * 0.2, 0, height * 0.82);
    gradient.addColorStop(0, "rgba(251,249,243,0.98)");
    gradient.addColorStop(0.48, "rgba(238,235,226,0.98)");
    gradient.addColorStop(1, "rgba(213,210,201,0.98)");
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.strokeStyle = gradient;
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

  function drawSurfaceGrid(ctx, game, width, height, orientation) {
    var samples = game.level.topology === "sphere" ? 48 : 32;
    ctx.save();
    ctx.strokeStyle = "rgba(92, 88, 80, 0.31)";
    ctx.lineWidth = 0.8;
    ctx.lineCap = "round";
    for (var x = 0; x < game.rules.width; x += 1) {
      var u = Morph.stoneUV(game.rules, x).u;
      ctx.beginPath();
      for (var sample = 0; sample <= samples; sample += 1) {
        var point = Morph.project(game.level.topology, u, sample / samples, width, height, orientation);
        if (sample === 0) { ctx.moveTo(point.x, point.y); } else { ctx.lineTo(point.x, point.y); }
      }
      ctx.stroke();
    }
    for (var y = 0; y < game.rules.height; y += 1) {
      var v = Morph.stoneUV(game.rules, y * game.rules.width).v;
      ctx.beginPath();
      for (var rowSample = 0; rowSample <= samples; rowSample += 1) {
        var rowPoint = Morph.project(game.level.topology, rowSample / samples, v, width, height, orientation);
        if (rowSample === 0) { ctx.moveTo(rowPoint.x, rowPoint.y); } else { ctx.lineTo(rowPoint.x, rowPoint.y); }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCompletion(ctx, options) {
    var settings = options || {};
    var game = settings.game;
    var layout = settings.layout;
    if (!game || !layout || !game.completionAvailable) {
      return;
    }
    var base = DEFAULT_VIEWS[game.level.topology] || { x: 0.5, y: -0.4, z: 0, scale: 1 };
    var rotation = settings.rotation || { x: 0, y: 0, z: 0 };
    var orientation = {
      x: base.x + (rotation.x || 0),
      y: base.y + (rotation.y || 0),
      z: base.z + (rotation.z || 0),
      scale: Number(settings.scale) || 1,
      shapeX: 1,
      shapeY: 1,
      shapeZ: 1,
      presentation: settings.presentation || (game.winningMask
        ? Morph.createPresentation(game.level.topology, game.rules, Array.prototype.slice.call(game.winningMask.cells))
        : null)
    };
    drawSurface(ctx, game, layout, layout.width, layout.height, orientation);
    drawSurfaceGrid(ctx, game, layout.width, layout.height, orientation);
    var winnerSet = winningCellSet(game);
    var stones = [];
    for (var cell = 0; cell < game.board.length; cell += 1) {
      if (game.board[cell] === Engine.EMPTY) {
        continue;
      }
      var uv = Morph.stoneUV(game.rules, cell);
      stones.push({
        cell: cell,
        player: game.board[cell],
        point: Morph.project(game.level.topology, uv.u, uv.v, layout.width, layout.height, orientation)
      });
    }
    stones.sort(function sortStones(a, b) { return a.point.depth - b.point.depth; });
    var radius = layout.cell * 0.3;
    stones.forEach(function drawSurfaceStone(item) {
      ctx.save();
      ctx.globalAlpha = game.winningMask && !winnerSet[item.cell] ? 0.5 : 1;
      ctx.translate(item.point.x, item.point.y);
      ctx.shadowColor = item.player === Engine.HUMAN ? "rgba(24, 31, 29, 0.3)" : "rgba(65, 58, 48, 0.2)";
      ctx.shadowBlur = radius * 0.48;
      ctx.shadowOffsetY = radius * 0.2;
      drawStoneFace(ctx, item.player, radius, item.cell === game.lastMove, 0);
      ctx.restore();
    });
    if (game.winningMask) {
      var cells = Array.prototype.slice.call(game.winningMask.cells);
      ctx.save();
      ctx.strokeStyle = "rgba(199, 146, 68, 0.88)";
      ctx.shadowColor = "rgba(199, 146, 68, 0.7)";
      ctx.shadowBlur = 10;
      ctx.lineWidth = Math.max(3.4, layout.cell * 0.12);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      cells.forEach(function trace(cell, index) {
        var uv = Morph.stoneUV(game.rules, cell);
        var point = Morph.project(game.level.topology, uv.u, uv.v, layout.width, layout.height, orientation);
        if (index === 0) { ctx.moveTo(point.x, point.y); } else { ctx.lineTo(point.x, point.y); }
      });
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTopologyGlyph(ctx, topology, rect, options) {
    var settings = options || {};
    var type = topology || "plane";
    var orientation = DEFAULT_VIEWS[type] || { x: 0.45, y: -0.4, z: 0, scale: 1 };
    var width = rect.width;
    var height = rect.height;
    var centerX = rect.x + width / 2;
    var centerY = rect.y + height / 2;
    var samples = 34;
    ctx.save();
    ctx.translate(rect.x, rect.y);
    ctx.strokeStyle = settings.locked ? "rgba(129,127,119,0.34)" : "rgba(63,140,135,0.82)";
    ctx.lineWidth = Math.max(1, width * 0.016);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (type === "plane") {
      ctx.strokeRect(width * 0.24, height * 0.2, width * 0.52, height * 0.6);
    } else {
      for (var row = 0; row <= 5; row += 1) {
        ctx.beginPath();
        for (var sample = 0; sample <= samples; sample += 1) {
          var u = sample / samples;
          var v = row / 5;
          var point = Morph.project(type, u, v, width, height, orientation);
          if (sample === 0) { ctx.moveTo(point.x, point.y); } else { ctx.lineTo(point.x, point.y); }
        }
        ctx.stroke();
      }
      for (var column = 0; column <= 5; column += 1) {
        ctx.beginPath();
        for (var rowSample = 0; rowSample <= samples; rowSample += 1) {
          var columnPoint = Morph.project(type, column / 5, rowSample / samples, width, height, orientation);
          if (rowSample === 0) { ctx.moveTo(columnPoint.x, columnPoint.y); } else { ctx.lineTo(columnPoint.x, columnPoint.y); }
        }
        ctx.stroke();
      }
    }
    ctx.restore();
    return { centerX: centerX, centerY: centerY };
  }

  function drawTopologySilhouette(ctx, topology, rect, options) {
    var settings = options || {};
    var type = topology || "plane";
    var orientation = DEFAULT_VIEWS[type] || { x: 0.45, y: -0.4, z: 0, scale: 1 };
    var width = rect.width;
    var height = rect.height;
    var columns = type === "sphere" ? 20 : 18;
    var rows = type === "sphere" ? 20 : 14;
    var patches = [];
    for (var row = 0; row < rows; row += 1) {
      for (var column = 0; column < columns; column += 1) {
        var points = [
          Morph.project(type, column / columns, row / rows, width, height, orientation),
          Morph.project(type, (column + 1) / columns, row / rows, width, height, orientation),
          Morph.project(type, (column + 1) / columns, (row + 1) / rows, width, height, orientation),
          Morph.project(type, column / columns, (row + 1) / rows, width, height, orientation)
        ];
        patches.push({
          points: points,
          depth: points.reduce(function sum(total, point) { return total + point.depth; }, 0) / points.length
        });
      }
    }
    patches.sort(function sort(a, b) { return a.depth - b.depth; });
    ctx.save();
    ctx.translate(rect.x, rect.y);
    ctx.fillStyle = settings.color || "rgba(28,40,36,0.68)";
    ctx.strokeStyle = settings.color || "rgba(28,40,36,0.68)";
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.shadowColor = settings.shadowColor || "rgba(28,40,36,0.2)";
    ctx.shadowBlur = Math.max(4, width * 0.065);
    ctx.shadowOffsetY = Math.max(2, height * 0.055);
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
    return { centerX: rect.x + width / 2, centerY: rect.y + height / 2 };
  }

  return {
    TOKENS: TOKENS,
    computeLayout: computeLayout,
    cellCenter: cellCenter,
    hitTestCell: hitTestCell,
    pointInsideBoard: pointInsideBoard,
    drawBoard: drawBoard,
    drawCompletion: drawCompletion,
    drawTopologyGlyph: drawTopologyGlyph,
    drawTopologySilhouette: drawTopologySilhouette
  };
});

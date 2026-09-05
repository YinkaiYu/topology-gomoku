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

  var CONTEXT_PIXEL_RATIOS = typeof WeakMap === "function" ? new WeakMap() : null;

  function setContextPixelRatio(ctx, pixelRatio) {
    var next = Math.max(1, Number(pixelRatio) || 1);
    if (CONTEXT_PIXEL_RATIOS && ctx) {
      CONTEXT_PIXEL_RATIOS.set(ctx, next);
    } else if (ctx) {
      ctx.__topologyPixelRatio = next;
    }
  }

  function effectPixels(ctx, logicalPixels) {
    var stored = CONTEXT_PIXEL_RATIOS && ctx ? CONTEXT_PIXEL_RATIOS.get(ctx) : null;
    var pixelRatio = Math.max(1, Number(stored || (ctx && ctx.__topologyPixelRatio)) || 1);
    return logicalPixels * pixelRatio;
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
    ctx.globalAlpha *= 0.58 + pulse * 0.4;
    ctx.lineWidth = 2 + pulse * 2.2;
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = effectPixels(ctx, pulse * 16);
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
      ctx.globalAlpha *= 0.58 + pair.pulse * 0.4;
      ctx.lineWidth = 2 + pair.pulse * 2.2;
      ctx.lineCap = "round";
      ctx.shadowColor = pair.color;
      ctx.shadowBlur = effectPixels(ctx, pair.pulse * 16);
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
      ctx.globalAlpha *= mask && !winning ? 0.4 : 1;
      ctx.translate(center.x, center.y);
      ctx.scale(scale, scale);
      ctx.shadowColor = player === Engine.HUMAN ? "rgba(24, 31, 29, 0.28)" : "rgba(65, 58, 48, 0.18)";
      ctx.shadowBlur = effectPixels(ctx, radius * (0.42 - compression * 0.16));
      ctx.shadowOffsetY = effectPixels(ctx, radius * (0.2 - compression * 0.125));
      drawStoneFace(ctx, player, radius, cell === game.lastMove, compression);
      ctx.restore();
      if (winning) {
        var winningIndex = Array.prototype.indexOf.call(mask.cells, cell);
        var ringProgress = clamp01((time - game.winAt - winningIndex * 70) / 330);
        ctx.save();
        ctx.globalAlpha *= ringProgress * 0.78;
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
    ctx.globalAlpha *= 0.46 + landing * 0.54;
    ctx.translate(center.x, center.y + radius * (1 - landing) * -0.16);
    ctx.scale(scale, scale);
    ctx.shadowColor = "rgba(24, 31, 29, 0.24)";
    ctx.shadowBlur = effectPixels(ctx, radius * (0.34 - landing * 0.08));
    ctx.shadowOffsetY = effectPixels(ctx, radius * (0.18 - landing * 0.105));
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
      ctx.globalAlpha *= urgent ? 0.92 : 0.72;
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
    var breath = Math.sin(time * 0.006);
    var pulse = breath * 0.5 + 0.5;
    var radius = layout.cell * 0.25 + pulse * 2.2;
    var prompts = game.lesson.prompts || [];
    var text = prompts[Math.min(game.lesson.step, prompts.length - 1)] || game.level.ruleText;
    var fontSize = Math.max(12, Math.min(14, layout.cell * 0.195));
    var floatY = -breath * 1.25;
    ctx.save();
    ctx.globalAlpha *= 0.52 + pulse * 0.24;
    ctx.strokeStyle = TOKENS.teal;
    ctx.fillStyle = "rgba(63, 140, 135, 0.08)";
    ctx.lineWidth = 1.5;
    if (ctx.setLineDash) { ctx.setLineDash([4.5, 4.5]); }
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (ctx.setLineDash) { ctx.setLineDash([]); }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= (0.52 + pulse * 0.24) * 0.72;
    ctx.fillStyle = TOKENS.teal;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 1.7 + pulse * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.font = "700 " + fontSize + "px " + (fontFamily || "serif");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var textWidth = ctx.measureText(text).width;
    var textX = Math.max(layout.left + textWidth * 0.5 + 7, Math.min(layout.right - textWidth * 0.5 - 7, center.x));
    var textY = center.y - radius - fontSize * 1.15 + floatY;
    if (textY - fontSize * 0.6 < layout.top) {
      textY = center.y + radius + fontSize * 1.2 - floatY;
    }
    ctx.globalAlpha *= 0.74 + pulse * 0.22;
    ctx.lineWidth = 4.1;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(251, 250, 246, 0.92)";
    ctx.fillStyle = "#315f5b";
    ctx.strokeText(text, textX, textY);
    ctx.fillText(text, textX, textY);
    ctx.restore();
  }

  function drawLessonSeamCue(ctx, game, lesson, index, from, to, color, pending, pulse, cell, time) {
    var fromDirection = Engine.DIRECTIONS[lesson.directions[index - 1]];
    var toDirection = Engine.DIRECTIONS[lesson.directions[index]];
    var ray = cell * (pending ? 0.72 : 0.58);
    var radius = cell * 0.37 + pulse * (pending ? 4 : 2);
    var alpha = pending ? 0.5 + pulse * 0.34 : 0.34;
    var fromEdge = { x: from.x + fromDirection.dx * ray, y: from.y + fromDirection.dy * ray };
    var toEdge = { x: to.x - toDirection.dx * ray, y: to.y - toDirection.dy * ray };
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.4, cell * 0.04);
    ctx.lineCap = "round";
    if (ctx.setLineDash) { ctx.setLineDash(pending ? [cell * 0.11, cell * 0.09] : []); }
    ctx.lineDashOffset = -time * 0.02;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(fromEdge.x, fromEdge.y);
    ctx.moveTo(toEdge.x, toEdge.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    if (ctx.setLineDash) { ctx.setLineDash([]); }
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

  function drawLessonSegment(ctx, game, layout, lesson, index, pending, pulse, cell, time) {
    var from = cellCenter(game.rules, layout, lesson.cells[index - 1]);
    var to = cellCenter(game.rules, layout, lesson.cells[index]);
    var seam = lesson.seams[index - 1];
    var color = seam & Engine.SEAM_TWIST ? TOKENS.gold : TOKENS.teal;
    if (seam) {
      drawLessonSeamCue(ctx, game, lesson, index, from, to, color, pending, pulse, cell, time);
      return;
    }
    ctx.save();
    ctx.globalAlpha *= pending ? 0.3 + pulse * 0.2 : 0.34;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, cell * 0.045);
    ctx.lineCap = "round";
    if (pending && ctx.setLineDash) {
      ctx.setLineDash([cell * 0.12, cell * 0.1]);
      ctx.lineDashOffset = -time * 0.018;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawLessonConnections(ctx, game, layout, time) {
    if (!game.lesson || !game.lesson.active || game.level.tutorial || game.lesson.step < 1) {
      return;
    }
    var lesson = game.lesson;
    var pulse = Math.sin(time * 0.0055) * 0.5 + 0.5;
    var cell = layout.cell;
    for (var index = 1; index < lesson.step; index += 1) {
      drawLessonSegment(ctx, game, layout, lesson, index, false, pulse, cell, time);
    }
    if (lesson.step < lesson.cells.length) {
      drawLessonSegment(ctx, game, layout, lesson, lesson.step, true, pulse, cell, time);
    }
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

    ctx.save();
    ctx.globalAlpha *= alpha * 0.45;
    ctx.strokeStyle = TOKENS.teal;
    ctx.lineWidth = Math.max(2, layout.cell * 0.07);
    ctx.lineCap = "round";
    for (var lineIndex = 1; lineIndex < demo.cells.length; lineIndex += 1) {
      var lineProgress = clamp01((elapsed - lineIndex * demo.dropInterval + 130) / 210);
      if (lineProgress <= 0 || demo.seams[lineIndex - 1]) {
        continue;
      }
      var lineFrom = cellCenter(game.rules, layout, demo.cells[lineIndex - 1]);
      var lineTo = cellCenter(game.rules, layout, demo.cells[lineIndex]);
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
      var center = cellCenter(game.rules, layout, demo.cells[index]);
      ctx.save();
      ctx.globalAlpha *= alpha * (0.52 + localProgress * 0.38);
      ctx.translate(center.x, center.y);
      ctx.scale(easeOutBack(localProgress), easeOutBack(localProgress));
      ctx.shadowColor = "rgba(24, 31, 29, 0.2)";
      ctx.shadowBlur = effectPixels(ctx, radius * 0.38);
      ctx.shadowOffsetY = effectPixels(ctx, radius * 0.16);
      drawStoneFace(ctx, Engine.HUMAN, radius, false, 0);
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
      var from = cellCenter(game.rules, layout, demo.cells[index]);
      var to = cellCenter(game.rules, layout, demo.cells[index + 1]);
      ctx.save();
      ctx.globalAlpha *= alpha * pulse * 0.82;
      ctx.strokeStyle = seam & Engine.SEAM_TWIST ? TOKENS.gold : TOKENS.teal;
      ctx.lineWidth = 1.5 + pulse;
      [from, to].forEach(function drawCrossingRing(point) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + 5 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    });
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
    drawLessonConnections(ctx, game, layout, time);
    drawLessonGuide(ctx, game, layout, time, settings.fontFamily);
    drawDemo(ctx, game, layout, time);
    drawWinningConnections(ctx, game, layout, time);
    drawTacticalHints(ctx, game, layout, settings.preferences || {});
    drawMovePreview(ctx, game, layout, time, settings.interaction);
    drawStones(ctx, game, layout, time);
  }

  function surfacePoint(game, layout, width, height, u, v, orientation) {
    var flat = {
      x: layout.left + u * (layout.right - layout.left),
      y: layout.top + v * (layout.bottom - layout.top)
    };
    var projected = Morph.project(game.level.topology, u, v, width, height, orientation);
    var morph = orientation && Number.isFinite(orientation.morph)
      ? clamp01(orientation.morph)
      : 1;
    return {
      x: flat.x + (projected.x - flat.x) * morph,
      y: flat.y + (projected.y - flat.y) * morph,
      depth: projected.depth * morph,
      flat: flat
    };
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

  function drawSurfaceGrid(ctx, game, layout, width, height, orientation) {
    var samples = game.level.topology === "sphere" ? 48 : 32;
    ctx.save();
    ctx.strokeStyle = "rgba(92, 88, 80, 0.31)";
    ctx.lineWidth = 0.8;
    ctx.lineCap = "round";
    for (var x = 0; x < game.rules.width; x += 1) {
      var u = Morph.stoneUV(game.rules, x).u;
      ctx.beginPath();
      for (var sample = 0; sample <= samples; sample += 1) {
        var point = surfacePoint(game, layout, width, height, u, sample / samples, orientation);
        if (sample === 0) { ctx.moveTo(point.x, point.y); } else { ctx.lineTo(point.x, point.y); }
      }
      ctx.stroke();
    }
    for (var y = 0; y < game.rules.height; y += 1) {
      var v = Morph.stoneUV(game.rules, y * game.rules.width).v;
      ctx.beginPath();
      for (var rowSample = 0; rowSample <= samples; rowSample += 1) {
        var rowPoint = surfacePoint(game, layout, width, height, rowSample / samples, v, orientation);
        if (rowSample === 0) { ctx.moveTo(rowPoint.x, rowPoint.y); } else { ctx.lineTo(rowPoint.x, rowPoint.y); }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSurfaceBoundary(ctx, game, layout, width, height, orientation, axis, color) {
    var samples = game.level.topology === "sphere" ? 64 : 42;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = effectPixels(ctx, 5);
    [0, 1].forEach(function drawEdge(edge) {
      ctx.beginPath();
      for (var sample = 0; sample <= samples; sample += 1) {
        var amount = sample / samples;
        var point = axis === "x"
          ? surfacePoint(game, layout, width, height, edge, amount, orientation)
          : surfacePoint(game, layout, width, height, amount, edge, orientation);
        if (sample === 0) { ctx.moveTo(point.x, point.y); } else { ctx.lineTo(point.x, point.y); }
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  function completionFlatPointFromUV(game, layout, u, v) {
    var xRatio = Morph.isPeriodicX(game.rules.type)
      ? (u * game.rules.width - 0.5) / Math.max(1, game.rules.width - 1)
      : u;
    var yRatio = Morph.isPeriodicY(game.rules.type)
      ? (v * game.rules.height - 0.5) / Math.max(1, game.rules.height - 1)
      : v;
    return {
      x: layout.left + clamp01(xRatio) * (layout.right - layout.left),
      y: layout.top + clamp01(yRatio) * (layout.bottom - layout.top)
    };
  }

  function mappedCompletionPoint(game, layout, flat, uv, orientation) {
    var projected = Morph.project(
      game.level.topology,
      uv.u,
      uv.v,
      layout.width,
      layout.height,
      orientation
    );
    var morph = orientation && Number.isFinite(orientation.morph)
      ? clamp01(orientation.morph)
      : 1;
    return {
      x: flat.x + (projected.x - flat.x) * morph,
      y: flat.y + (projected.y - flat.y) * morph,
      depth: projected.depth * morph
    };
  }

  function appendCompletionSegment(points, game, layout, from, to, samples, orientation) {
    for (var sample = points.length ? 1 : 0; sample <= samples; sample += 1) {
      var amount = sample / samples;
      points.push(mappedCompletionPoint(game, layout, {
        x: from.flat.x + (to.flat.x - from.flat.x) * amount,
        y: from.flat.y + (to.flat.y - from.flat.y) * amount
      }, {
        u: from.uv.u + (to.uv.u - from.uv.u) * amount,
        v: from.uv.v + (to.uv.v - from.uv.v) * amount
      }, orientation));
    }
  }

  function completionEdgePoints(game, layout, fromCell, step, direction, orientation) {
    var fromUV = Morph.stoneUV(game.rules, fromCell);
    var toUV = Morph.stoneUV(game.rules, step.cell);
    var from = { flat: cellCenter(game.rules, layout, fromCell), uv: fromUV };
    var to = { flat: cellCenter(game.rules, layout, step.cell), uv: toUV };
    var points = [];
    var samples = game.level.topology === "sphere" ? 16 : 12;
    if (!step.seam) {
      appendCompletionSegment(points, game, layout, from, to, samples, orientation);
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
    var source = {
      flat: completionFlatPointFromUV(game, layout, bridge.source.u, bridge.source.v),
      uv: bridge.source
    };
    var target = {
      flat: completionFlatPointFromUV(game, layout, bridge.target.u, bridge.target.v),
      uv: bridge.target
    };
    var seamSamples = game.level.topology === "sphere" ? 12 : 8;
    appendCompletionSegment(points, game, layout, from, source, seamSamples, orientation);
    points.push(mappedCompletionPoint(game, layout, target.flat, target.uv, orientation));
    appendCompletionSegment(points, game, layout, target, to, seamSamples, orientation);
    return points;
  }

  function drawCompletionWinningLine(ctx, game, layout, orientation, time) {
    if (!game.winningMask) {
      return;
    }
    var cells = Array.prototype.slice.call(game.winningMask.cells);
    var reveal = Morph.smooth(clamp01((time - game.winAt - 180) / 820));
    var direction = game.winningMask.direction;
    ctx.save();
    ctx.strokeStyle = "rgba(199, 146, 68," + (0.78 + Math.sin(time * 0.009) * 0.16) + ")";
    ctx.shadowColor = "rgba(199, 146, 68,0.8)";
    ctx.shadowBlur = effectPixels(ctx, 12);
    ctx.lineWidth = Math.max(3.4, layout.cell * 0.12);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
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
      var points = completionEdgePoints(game, layout, cells[index], step, direction, orientation);
      var visibleEnd = (points.length - 1) * segmentProgress;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var pointIndex = 1; pointIndex <= Math.floor(visibleEnd); pointIndex += 1) {
        ctx.lineTo(points[pointIndex].x, points[pointIndex].y);
      }
      if (visibleEnd < points.length - 1) {
        var whole = Math.floor(visibleEnd);
        var fraction = visibleEnd - whole;
        ctx.lineTo(
          points[whole].x + (points[whole + 1].x - points[whole].x) * fraction,
          points[whole].y + (points[whole + 1].y - points[whole].y) * fraction
        );
      }
      ctx.stroke();
      direction = step.direction;
    }
    ctx.restore();
  }

  function drawCompletion(ctx, options) {
    var settings = options || {};
    var game = settings.game;
    var layout = settings.layout;
    if (!game || !layout) {
      return;
    }
    var base = DEFAULT_VIEWS[game.level.topology] || { x: 0.5, y: -0.4, z: 0, scale: 1 };
    var view = settings.view || base;
    var rotation = settings.rotation || { x: 0, y: 0, z: 0 };
    var morph = settings.morph === undefined ? 1 : clamp01(Number(settings.morph) || 0);
    var viewBlend = Morph.smooth(morph);
    var orientation = settings.orientation || {
      x: ((Number(view.x) || 0) + (rotation.x || 0)) * viewBlend,
      y: ((Number(view.y) || 0) + (rotation.y || 0)) * viewBlend,
      z: ((Number(view.z) || 0) + (rotation.z || 0)) * viewBlend,
      scale: Number(settings.scale) || 1,
      shapeX: 1 + ((Number(view.shapeX) || 1) - 1) * viewBlend,
      shapeY: 1 + ((Number(view.shapeY) || 1) - 1) * viewBlend,
      shapeZ: 1 + ((Number(view.shapeZ) || 1) - 1) * viewBlend,
      wobbleX: Number(settings.wobbleX) || 0,
      wobbleY: Number(settings.wobbleY) || 0,
      morph: morph,
      presentation: settings.presentation || (game.winningMask
        ? Morph.createPresentation(game.level.topology, game.rules, Array.prototype.slice.call(game.winningMask.cells))
        : null)
    };
    drawSurface(ctx, game, layout, layout.width, layout.height, orientation);
    drawSurfaceGrid(ctx, game, layout, layout.width, layout.height, orientation);
    var boundaryFade = 1 - Morph.smooth((morph - 0.72) / 0.28);
    ctx.save();
    ctx.globalAlpha *= (0.36 + morph * 0.5) * boundaryFade;
    if (game.level.xConnection || game.level.topology === "sphere") {
      drawSurfaceBoundary(ctx, game, layout, layout.width, layout.height, orientation, "x", "rgba(63,140,135,0.78)");
    }
    if (game.level.yConnection || game.level.topology === "sphere") {
      drawSurfaceBoundary(ctx, game, layout, layout.width, layout.height, orientation, "y", "rgba(199,146,68,0.76)");
    }
    ctx.restore();
    if (morph < 0.98) {
      ctx.save();
      ctx.globalAlpha *= 1 - morph;
      drawTopologyRails(ctx, game, layout, Number(settings.time) || 0);
      ctx.restore();
    }
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
        point: mappedCompletionPoint(
          game,
          layout,
          cellCenter(game.rules, layout, cell),
          uv,
          orientation
        )
      });
    }
    stones.sort(function sortStones(a, b) { return a.point.depth - b.point.depth; });
    var radius = layout.cell * (0.37 - morph * 0.07);
    stones.forEach(function drawSurfaceStone(item) {
      ctx.save();
      ctx.globalAlpha *= game.winningMask && !winnerSet[item.cell] ? 0.5 : 1;
      ctx.translate(item.point.x, item.point.y);
      ctx.shadowColor = item.player === Engine.HUMAN ? "rgba(24, 31, 29, 0.3)" : "rgba(65, 58, 48, 0.2)";
      ctx.shadowBlur = effectPixels(ctx, radius * 0.48);
      ctx.shadowOffsetY = effectPixels(ctx, radius * 0.2);
      drawStoneFace(ctx, item.player, radius, item.cell === game.lastMove, 0);
      ctx.restore();
    });
    drawCompletionWinningLine(ctx, game, layout, orientation, Number(settings.time) || 0);
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
    ctx.shadowBlur = effectPixels(ctx, Math.max(4, width * 0.065));
    ctx.shadowOffsetY = effectPixels(ctx, Math.max(2, height * 0.055));
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
    setContextPixelRatio: setContextPixelRatio,
    computeLayout: computeLayout,
    cellCenter: cellCenter,
    hitTestCell: hitTestCell,
    pointInsideBoard: pointInsideBoard,
    drawBoard: drawBoard,
    drawCompletion: drawCompletion,
    mappedCompletionPoint: mappedCompletionPoint,
    drawTopologyGlyph: drawTopologyGlyph,
    drawTopologySilhouette: drawTopologySilhouette
  };
});

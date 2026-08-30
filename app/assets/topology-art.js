(function attachTopologyArt(root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.TopologyArt = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function topologyArtFactory() {
  "use strict";

  var TAU = Math.PI * 2;
  var PALETTE = Object.freeze({
    paper: "#f2efe7",
    paperDeep: "#e8e2d7",
    paperTop: "#f5f2eb",
    paperBottom: "#ece6db",
    card: "#fbfaf6",
    ink: "#21302c",
    muted: "#817f77",
    faint: "#c8c1b5",
    connection: "#3f8c87",
    twist: "#c79244",
    danger: "#d95b4f",
    spatial: "#8b7556"
  });

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function colorWithAlpha(color, alpha) {
    var value = String(color || PALETTE.connection);
    if (/^#[0-9a-f]{6}$/iu.test(value)) {
      return "rgba(" +
        Number.parseInt(value.slice(1, 3), 16) + "," +
        Number.parseInt(value.slice(3, 5), 16) + "," +
        Number.parseInt(value.slice(5, 7), 16) + "," + clamp01(alpha) + ")";
    }
    return value;
  }

  function roundedRect(ctx, left, top, width, height, radius) {
    var right = left + width;
    var bottom = top + height;
    radius = Math.min(Math.max(0, radius), width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(left + radius, top);
    ctx.lineTo(right - radius, top);
    ctx.quadraticCurveTo(right, top, right, top + radius);
    ctx.lineTo(right, bottom - radius);
    ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
    ctx.lineTo(left + radius, bottom);
    ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
    ctx.lineTo(left, top + radius);
    ctx.quadraticCurveTo(left, top, left + radius, top);
    ctx.closePath();
  }

  // Canvas equivalent of .app-shell and its two ambient fields in style.css.
  function drawAppBackdrop(ctx, width, height, options) {
    options = options || {};
    var alpha = options.alpha == null ? 1 : clamp01(options.alpha);
    var accent = options.accent || null;
    ctx.save();
    ctx.globalAlpha = alpha;
    var base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, PALETTE.paperTop);
    base.addColorStop(0.56, PALETTE.paper);
    base.addColorStop(1, PALETTE.paperBottom);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    var teal = ctx.createRadialGradient(width * 0.88, height * 0.34, 0, width * 0.88, height * 0.34, Math.max(width, height) * 0.55);
    teal.addColorStop(0, "rgba(69,154,139,0.11)");
    teal.addColorStop(1, "rgba(69,154,139,0)");
    ctx.fillStyle = teal;
    ctx.fillRect(0, 0, width, height);

    var gold = ctx.createRadialGradient(width * 0.10, height * 0.74, 0, width * 0.10, height * 0.74, Math.max(width, height) * 0.52);
    gold.addColorStop(0, "rgba(205,158,88,0.10)");
    gold.addColorStop(1, "rgba(205,158,88,0)");
    ctx.fillStyle = gold;
    ctx.fillRect(0, 0, width, height);

    var white = ctx.createRadialGradient(width * 0.15, height * 0.08, 0, width * 0.15, height * 0.08, Math.max(width, height) * 0.44);
    white.addColorStop(0, "rgba(255,255,255,0.76)");
    white.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, width, height);

    if (accent) {
      var chapter = ctx.createRadialGradient(width * 0.53, height * 0.47, 0, width * 0.53, height * 0.47, Math.max(width, height) * 0.42);
      chapter.addColorStop(0, colorWithAlpha(accent, 0.035));
      chapter.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = chapter;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  // The same deterministic fleck pattern used by the live board canvas.
  function drawPaperTexture(ctx, width, height, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : clamp01(alpha);
    ctx.fillStyle = "rgba(81, 75, 65, 0.035)";
    for (var index = 0; index < 46; index += 1) {
      var x = (Math.sin(index * 91.73) * 0.5 + 0.5) * width;
      var y = (Math.sin(index * 47.17 + 2.3) * 0.5 + 0.5) * height;
      ctx.fillRect(x, y, 0.65, 0.65);
    }
    ctx.restore();
  }

  // Shared rendition of .board-stage: transparent paper glass, white edge and restrained depth.
  function drawBoardStage(ctx, bounds, alpha) {
    alpha = clamp01(alpha == null ? 1 : alpha);
    if (alpha <= 0) return;
    var width = bounds.right - bounds.left;
    var height = bounds.bottom - bounds.top;
    var scale = Math.min(width, height) / 640;
    var radius = Math.max(16, 29 * scale);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(33,48,44,0.13)";
    ctx.shadowBlur = 34 * scale;
    ctx.shadowOffsetY = 18 * scale;
    roundedRect(ctx, bounds.left, bounds.top, width, height, radius);
    var glass = ctx.createLinearGradient(bounds.left, bounds.top, bounds.right, bounds.bottom);
    glass.addColorStop(0, "rgba(255,255,255,0.54)");
    glass.addColorStop(0.52, "rgba(251,250,246,0.28)");
    glass.addColorStop(1, "rgba(223,241,232,0.10)");
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255,255,255,0.74)";
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.stroke();
    roundedRect(ctx, bounds.left + 3 * scale, bounds.top + 3 * scale, width - 6 * scale, height - 6 * scale, Math.max(12, radius - 3 * scale));
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    ctx.lineWidth = Math.max(0.8, 0.9 * scale);
    ctx.stroke();
    ctx.restore();
  }

  function drawGrid(ctx, layout, rules, alpha) {
    var x;
    var y;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : clamp01(alpha);
    ctx.strokeStyle = "rgba(108, 103, 94, 0.5)";
    ctx.lineWidth = Math.max(0.7, layout.cell * 0.025);
    for (x = 0; x < rules.width; x += 1) {
      var px = layout.left + x * layout.cellX;
      ctx.beginPath();
      ctx.moveTo(px, layout.top);
      ctx.lineTo(px, layout.bottom);
      ctx.stroke();
    }
    for (y = 0; y < rules.height; y += 1) {
      var py = layout.top + y * layout.cellY;
      ctx.beginPath();
      ctx.moveTo(layout.left, py);
      ctx.lineTo(layout.right, py);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(72, 71, 65, 0.48)";
    for (y = 0; y < rules.height; y += 1) {
      for (x = 0; x < rules.width; x += 1) {
        ctx.beginPath();
        ctx.arc(layout.left + x * layout.cellX, layout.top + y * layout.cellY, Math.max(0.9, layout.cell * 0.035), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawTutorialGuide(ctx, options) {
    options = options || {};
    var time = Number(options.time) || 0;
    var cell = Number(options.cell) || 40;
    var breath = Math.sin(time * 0.006);
    var pulse = breath * 0.5 + 0.5;
    var radius = cell * 0.25 + pulse * 2.2;
    var alpha = options.alpha == null ? 1 : clamp01(options.alpha);
    ctx.save();
    ctx.globalAlpha = alpha * (0.52 + pulse * 0.24);
    ctx.strokeStyle = PALETTE.connection;
    ctx.fillStyle = "rgba(63, 140, 135, 0.08)";
    ctx.lineWidth = Math.max(1.5, cell * 0.018);
    ctx.setLineDash([4.5, 4.5]);
    ctx.beginPath();
    ctx.arc(options.x, options.y, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha *= 0.72;
    ctx.fillStyle = PALETTE.connection;
    ctx.beginPath();
    ctx.arc(options.x, options.y, 1.7 + pulse * 0.65, 0, TAU);
    ctx.fill();

    if (options.text) {
      var fontSize = Math.max(12, Math.min(14, cell * 0.195));
      var floatY = -breath * 1.25;
      var textY = options.y - radius - fontSize * 1.15 + floatY;
      if (options.minY != null && textY - fontSize * 0.6 < options.minY) {
        textY = options.y + radius + fontSize * 1.2 - floatY;
      }
      ctx.globalAlpha = alpha * (0.74 + pulse * 0.22);
      ctx.font = "700 " + fontSize + "px 'Topo Serif', 'Songti SC', serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4.1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(251, 250, 246, 0.92)";
      ctx.fillStyle = "#315f5b";
      ctx.strokeText(options.text, options.x, textY);
      ctx.fillText(options.text, options.x, textY);
    }
    ctx.restore();
  }

  function drawRailLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawArrow(ctx, x, y, orientation, sign, scale) {
    var size = 4.5 * (scale || 1);
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

  function drawRailPair(ctx, layout, orientation, color, twisted, pulse, alpha) {
    var scale = Number(layout.artScale) || 1;
    var offset = Math.min(15 * scale, layout.cell * 0.4);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = clamp01(alpha == null ? 1 : alpha) * (0.58 + pulse * 0.4);
    ctx.lineWidth = Math.max(1.4, (2 + pulse * 2.2) * scale);
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = pulse * 16 * scale;
    if (twisted) ctx.setLineDash([5 * scale, 5 * scale]);
    if (orientation === "vertical") {
      var leftX = layout.left - offset;
      var rightX = layout.right + offset;
      drawRailLine(ctx, leftX, layout.top, leftX, layout.bottom);
      drawRailLine(ctx, rightX, layout.top, rightX, layout.bottom);
      ctx.setLineDash([]);
      drawArrow(ctx, leftX, layout.top + (layout.bottom - layout.top) * 0.34, "vertical", 1, scale);
      drawArrow(ctx, leftX, layout.top + (layout.bottom - layout.top) * 0.7, "vertical", 1, scale);
      drawArrow(ctx, rightX, layout.top + (layout.bottom - layout.top) * 0.34, "vertical", twisted ? -1 : 1, scale);
      drawArrow(ctx, rightX, layout.top + (layout.bottom - layout.top) * 0.7, "vertical", twisted ? -1 : 1, scale);
    } else {
      var topY = layout.top - offset;
      var bottomY = layout.bottom + offset;
      drawRailLine(ctx, layout.left, topY, layout.right, topY);
      drawRailLine(ctx, layout.left, bottomY, layout.right, bottomY);
      ctx.setLineDash([]);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.34, topY, "horizontal", 1, scale);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.7, topY, "horizontal", 1, scale);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.34, bottomY, "horizontal", twisted ? -1 : 1, scale);
      drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.7, bottomY, "horizontal", twisted ? -1 : 1, scale);
    }
    ctx.restore();
  }

  function drawTopologyRails(ctx, options) {
    options = options || {};
    var layout = options.layout;
    var alpha = options.alpha == null ? 1 : clamp01(options.alpha);
    if (!layout || alpha <= 0) return;
    if (options.type === "sphere") {
      var scale = Number(layout.artScale) || 1;
      var offset = Math.min(15 * scale, layout.cell * 0.4);
      [
        { color: PALETTE.connection, pulse: Number(options.pulseX) || 0, sides: ["top", "left"] },
        { color: PALETTE.twist, pulse: Number(options.pulseY) || 0, sides: ["bottom", "right"] }
      ].forEach(function drawAdjacentPair(pair) {
        ctx.save();
        ctx.strokeStyle = pair.color;
        ctx.fillStyle = pair.color;
        ctx.globalAlpha = alpha * (0.58 + pair.pulse * 0.4);
        ctx.lineWidth = Math.max(1.4 * scale, (2 + pair.pulse * 2.2) * scale);
        ctx.lineCap = "round";
        ctx.shadowColor = pair.color;
        ctx.shadowBlur = pair.pulse * 16 * scale;
        pair.sides.forEach(function drawAdjacentSide(side) {
          if (side === "top" || side === "bottom") {
            var y = side === "top" ? layout.top - offset : layout.bottom + offset;
            drawRailLine(ctx, layout.left, y, layout.right, y);
            drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.36, y, "horizontal", 1, scale);
            drawArrow(ctx, layout.left + (layout.right - layout.left) * 0.7, y, "horizontal", 1, scale);
          } else {
            var x = side === "left" ? layout.left - offset : layout.right + offset;
            drawRailLine(ctx, x, layout.top, x, layout.bottom);
            drawArrow(ctx, x, layout.top + (layout.bottom - layout.top) * 0.36, "vertical", 1, scale);
            drawArrow(ctx, x, layout.top + (layout.bottom - layout.top) * 0.7, "vertical", 1, scale);
          }
        });
        ctx.restore();
      });
      return;
    }
    if (options.xConnection) {
      drawRailPair(ctx, layout, "vertical", PALETTE.connection, options.xConnection === "twist", Number(options.pulseX) || 0, alpha);
    }
    if (options.yConnection) {
      drawRailPair(ctx, layout, "horizontal", PALETTE.twist, options.yConnection === "twist", Number(options.pulseY) || 0, alpha);
    }
    if (!options.xConnection && !options.yConnection) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "rgba(95, 91, 83, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(layout.left - 8, layout.top - 8, layout.right - layout.left + 16, layout.bottom - layout.top + 16);
      ctx.restore();
    }
  }

  function drawStoneFace(ctx, options) {
    options = options || {};
    var radius = Number(options.radius) || 12;
    if (!Number.isFinite(radius) || radius < 0.25) return;
    var pressedDepth = Number(options.compression) || 0;
    var dark = options.dark === true || options.player === 1;
    var highlightX = -radius * (0.28 - pressedDepth * 0.055);
    var highlightY = -radius * (0.34 - pressedDepth * 0.12);
    var gradient = ctx.createRadialGradient(highlightX, highlightY, radius * (0.08 + pressedDepth * 0.035), 0, 0, radius);
    if (dark) {
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
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.shadowColor = "transparent";
    if (!dark) {
      ctx.strokeStyle = "rgba(94, 88, 78, 0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (options.markLastMove) {
      ctx.fillStyle = PALETTE.danger;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2.1, radius * 0.15), 0, TAU);
      ctx.fill();
    }
  }

  function drawCompletionSurface(ctx, patches, height, morph, alpha, accent) {
    var morphValue = Number(morph) || 0;
    var surfaceGradient = ctx.createLinearGradient(0, height * 0.2, 0, height * 0.82);
    surfaceGradient.addColorStop(0, "rgba(251,249,243,0.98)");
    surfaceGradient.addColorStop(0.48, "rgba(238,235,226,0.98)");
    surfaceGradient.addColorStop(1, "rgba(213,210,201,0.98)");
    ctx.save();
    ctx.globalAlpha = clamp01(alpha == null ? 1 : alpha) * (0.3 + morphValue * 0.66);
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
    if (accent) {
      ctx.globalAlpha *= 0.055;
      ctx.fillStyle = accent;
      patches.forEach(function tintPatch(patch) {
        ctx.beginPath();
        ctx.moveTo(patch.points[0].x, patch.points[0].y);
        for (var index = 1; index < patch.points.length; index += 1) ctx.lineTo(patch.points[index].x, patch.points[index].y);
        ctx.closePath();
        ctx.fill();
      });
    }
    ctx.restore();
  }

  return {
    PALETTE: PALETTE,
    drawAppBackdrop: drawAppBackdrop,
    drawPaperTexture: drawPaperTexture,
    drawBoardStage: drawBoardStage,
    drawGrid: drawGrid,
    drawTutorialGuide: drawTutorialGuide,
    drawTopologyRails: drawTopologyRails,
    drawStoneFace: drawStoneFace,
    drawCompletionSurface: drawCompletionSurface,
    internals: {
      roundedRect: roundedRect,
      drawArrow: drawArrow,
      drawRailLine: drawRailLine,
      clamp01: clamp01
    }
  };
});

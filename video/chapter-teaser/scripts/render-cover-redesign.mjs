import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts, Path2D } = require("@napi-rs/canvas");
const Art = require("../../../app/assets/topology-art.js");
const Morph = require("../../../app/assets/topology-morph.js");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pvRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(pvRoot, "../..");
const outputDirectory = path.join(repositoryRoot, ".tmp", "chapter-teaser", "cover-redesign");

const profiles = Object.freeze([
  Object.freeze({ id: "4x3", label: "4:3", width: 1600, height: 1200 }),
  Object.freeze({ id: "16x9", label: "16:9", width: 1920, height: 1080 }),
  Object.freeze({ id: "3x4", label: "3:4", width: 1080, height: 1440 })
]);

const directions = Object.freeze([
  Object.freeze({
    id: "klein-monolith",
    code: "A",
    label: "克莱因玄瓷",
    topology: "klein",
    accent: "#c79244",
    layout: "split",
    caption: "负形剖口表现自穿越的实心玄瓷"
  }),
  Object.freeze({
    id: "mobius-lacquer",
    code: "B",
    label: "莫比乌斯漆刃",
    topology: "mobius",
    accent: "#3f8c87",
    layout: "reverse",
    caption: "正反双色直接说明翻转的漆面宽带"
  }),
  Object.freeze({
    id: "projective-seal",
    code: "C",
    label: "射影徽章",
    topology: "projective",
    accent: "#8374a8",
    layout: "crest",
    caption: "三叶自交压缩为不透明的大色面徽章"
  }),
  Object.freeze({
    id: "atlas-ink",
    code: "D",
    label: "图鉴墨刻",
    topology: "klein",
    accent: "#c79244",
    layout: "atlas",
    caption: "基于游戏图鉴姿态重绘的墨刻拓扑异兽"
  })
]);

const palette = Object.freeze({
  paper: "#f2efe7",
  paperBright: "#faf8f2",
  paperDeep: "#ded7ca",
  ink: "#172521",
  inkSoft: "#263832",
  teal: "#3f8c87",
  tealDeep: "#215d5a",
  gold: "#c79244",
  goldDeep: "#8d602f",
  bone: "#f6f1e6",
  violet: "#8374a8",
  danger: "#d95b4f"
});

const WORDMARK_VIEWBOX = Object.freeze({ width: 1200, height: 300 });
const WORDMARK_WEIGHT = 0.90;

// This is lettering, not typesetting. Every visible stroke in 拓扑五子棋 is
// redrawn here as one shared system of curved bands. Adjacent characters share
// boundaries and the last stroke of 棋 returns beneath the whole wordmark.
const WORDMARK_STROKES = Object.freeze([
  // 拓 — 扌 and 石 are interlocked by the upper boundary.
  { role: "ink", width: 33, d: "M67 48 C62 92 66 151 55 215" },
  { role: "ink", width: 27, d: "M28 103 C65 101 104 94 139 82 C166 72 190 64 221 65" },
  { role: "ink", width: 28, d: "M32 188 C60 169 88 142 111 114" },
  { role: "ink", width: 28, d: "M154 67 C144 84 134 98 122 111" },
  { role: "ink", width: 30, d: "M120 112 C148 105 192 105 215 116 L210 184 C184 191 147 190 122 181 Z" },

  // 扑 — the right-hand stroke grows from a shared boundary rather than a dot.
  { role: "ink", dx: 12, width: 32, d: "M260 50 C254 102 259 160 247 219" },
  { role: "ink", dx: 12, width: 26, d: "M224 103 C263 99 298 92 333 74 C354 64 376 59 400 60" },
  { role: "ink", dx: 12, width: 27, d: "M224 189 C252 171 278 145 300 116" },
  { role: "ink", dx: 12, width: 34, d: "M350 53 C344 99 349 161 338 220" },
  { role: "ink", dx: 12, width: 31, d: "M356 108 C377 123 395 143 411 174" },

  // 五 — the central Z-band is the unmistakable topology crossing.
  { role: "ink", dx: 35, width: 34, d: "M400 61 C451 51 508 53 561 64" },
  { role: "ink", dx: 35, width: 30, d: "M430 67 C424 91 422 116 421 140" },
  { role: "ink", dx: 35, width: 32, d: "M421 140 C458 144 499 142 539 136" },
  { role: "ink", dx: 35, width: 30, d: "M532 138 C521 160 516 182 512 204" },
  { role: "ink", dx: 35, width: 34, d: "M401 207 C451 215 514 214 570 202" },

  // 子 — an open ring turns into the crossbar, then the hook enters 棋.
  { role: "ink", dx: 65, width: 30, d: "M583 78 C615 54 674 55 710 78 C690 96 670 106 648 113" },
  { role: "ink", dx: 65, width: 29, d: "M570 140 C620 146 673 140 723 129" },
  { role: "ink", dx: 65, width: 32, d: "M650 111 C651 151 650 190 634 216 C668 214 701 201 731 179" },

  // 棋 — 木 and 其 share a horizontal spine and close the outer silhouette.
  { role: "ink", dx: 95, width: 31, d: "M788 55 C783 104 785 163 778 219" },
  { role: "ink", dx: 95, width: 28, d: "M744 117 C783 112 818 112 850 119" },
  { role: "ink", dx: 95, width: 28, d: "M779 119 C764 151 749 181 731 208" },
  { role: "ink", dx: 95, width: 29, d: "M790 121 C807 151 824 180 845 207" },
  { role: "ink", dx: 95, width: 28, d: "M834 67 C889 55 954 56 1017 67" },
  { role: "ink", dx: 95, width: 29, d: "M864 65 C858 103 858 144 857 181" },
  { role: "ink", dx: 95, width: 29, d: "M985 64 C982 103 985 144 978 180" },
  { role: "ink", dx: 95, width: 25, d: "M852 111 C893 107 944 107 991 113" },
  { role: "ink", dx: 95, width: 26, d: "M846 153 C893 158 948 157 997 150" },
  { role: "ink", dx: 95, width: 30, d: "M834 183 C890 193 957 192 1021 178" },
  { role: "ink", dx: 95, width: 30, d: "M876 187 C860 201 846 215 833 226" },
  { role: "ink", dx: 95, width: 30, d: "M975 187 C992 200 1008 214 1025 226" },

  // The return stroke is structurally attached to 棋 and gives the full mark
  // its own silhouette even after every colour and texture is removed.
  { role: "return", cap: "round", width: 27, d: "M1119 224 C1090 256 1005 268 865 261 C680 252 490 249 300 257 C155 263 76 251 55 216" }
]);

const WORDMARK_OVERPASSES = Object.freeze([
  { role: "accent", dx: 35, width: 28, d: "M472 142 C494 142 518 140 539 136" }
]);

const WORDMARK_KNOCKOUTS = Object.freeze([
  { dx: 35, width: 39, d: "M481 122 L496 157" }
]);

const publishingCopy = require("../publishing-copy.json");

function registerFonts() {
  const fontPath = path.join(pvRoot, "assets", "fonts", "topo-serif-pv-600.ttf");
  if (!GlobalFonts.registerFromPath(fontPath, "Topo Serif PV")) {
    throw new Error(`Unable to register embedded font: ${fontPath}`);
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function hexRgb(hex) {
  const value = String(hex).replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

function rgba(hex, alpha) {
  const [red, green, blue] = hexRgb(hex);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function drawPathStroke(ctx, item, colour, scale = 1) {
  ctx.save();
  ctx.translate(item.dx || 0, item.dy || 0);
  ctx.strokeStyle = colour;
  ctx.lineWidth = item.width * scale * WORDMARK_WEIGHT;
  ctx.lineCap = item.cap || "butt";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(item.d));
  ctx.restore();
}

function drawWordmark(ctx, box, options = {}) {
  const mode = options.mode || "colour";
  const reverse = mode === "reverse";
  const mono = mode === "mono" || reverse;
  const scale = Math.min(box.width / WORDMARK_VIEWBOX.width, box.height / WORDMARK_VIEWBOX.height);
  const drawWidth = WORDMARK_VIEWBOX.width * scale;
  const drawHeight = WORDMARK_VIEWBOX.height * scale;
  const originX = box.x + (box.width - drawWidth) / 2;
  const originY = box.y + (box.height - drawHeight) / 2;
  const ink = reverse ? palette.bone : palette.ink;
  const accent = mono ? ink : (options.accent || palette.gold);
  const background = options.background || palette.paper;

  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(scale, scale);
  if (options.shadow) {
    ctx.shadowColor = "rgba(23,37,33,0.17)";
    ctx.shadowBlur = 18 / scale;
    ctx.shadowOffsetY = 9 / scale;
  }

  // The return band sits behind the glyphs, so its re-entry reads as a loop.
  WORDMARK_STROKES.filter((item) => item.role === "return").forEach((item) => drawPathStroke(ctx, item, accent));
  ctx.shadowColor = "transparent";
  WORDMARK_STROKES.filter((item) => item.role === "ink").forEach((item) => drawPathStroke(ctx, item, ink));

  // Negative cuts create real over/under crossings in monochrome as well as colour.
  WORDMARK_KNOCKOUTS.forEach((item) => drawPathStroke(ctx, item, background));
  WORDMARK_OVERPASSES.forEach((item) => drawPathStroke(ctx, item, accent));
  ctx.restore();
}

function wordmarkSvg({ mode = "colour", background = palette.paper } = {}) {
  const reverse = mode === "reverse";
  const mono = mode === "mono" || reverse;
  const ink = reverse ? palette.bone : palette.ink;
  const accent = mono ? ink : palette.gold;
  const elements = [];
  elements.push(`<rect width="1200" height="300" fill="${background}"/>`);
  WORDMARK_STROKES.filter((item) => item.role === "return").forEach((item) => {
    elements.push(`<path d="${item.d}"${item.dx ? ` transform="translate(${item.dx} 0)"` : ""} fill="none" stroke="${accent}" stroke-width="${item.width * WORDMARK_WEIGHT}" stroke-linecap="${item.cap || "butt"}" stroke-linejoin="round"/>`);
  });
  WORDMARK_STROKES.filter((item) => item.role === "ink").forEach((item) => {
    elements.push(`<path d="${item.d}"${item.dx ? ` transform="translate(${item.dx} 0)"` : ""} fill="none" stroke="${ink}" stroke-width="${item.width * WORDMARK_WEIGHT}" stroke-linecap="${item.cap || "butt"}" stroke-linejoin="round"/>`);
  });
  WORDMARK_KNOCKOUTS.forEach((item) => {
    elements.push(`<path d="${item.d}"${item.dx ? ` transform="translate(${item.dx} 0)"` : ""} fill="none" stroke="${background}" stroke-width="${item.width * WORDMARK_WEIGHT}" stroke-linecap="butt" stroke-linejoin="round"/>`);
  });
  WORDMARK_OVERPASSES.forEach((item) => {
    elements.push(`<path d="${item.d}"${item.dx ? ` transform="translate(${item.dx} 0)"` : ""} fill="none" stroke="${accent}" stroke-width="${item.width * WORDMARK_WEIGHT}" stroke-linecap="butt" stroke-linejoin="round"/>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300" role="img" aria-label="拓扑五子棋原创回环字标">\n${elements.map((line) => `  ${line}`).join("\n")}\n</svg>\n`;
}

function drawBackdrop(ctx, width, height, direction) {
  Art.drawAppBackdrop(ctx, width, height, { accent: direction.accent });
  Art.drawPaperTexture(ctx, width, height, 0.62);
  const minimum = Math.min(width, height);
  const light = ctx.createRadialGradient(width * 0.16, height * 0.13, 0, width * 0.16, height * 0.13, minimum * 0.82);
  light.addColorStop(0, "rgba(255,255,255,0.72)");
  light.addColorStop(0.55, "rgba(255,255,255,0.10)");
  light.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
  const vignette = ctx.createRadialGradient(width * 0.54, height * 0.47, minimum * 0.28, width * 0.54, height * 0.47, Math.max(width, height) * 0.76);
  vignette.addColorStop(0, "rgba(23,37,33,0)");
  vignette.addColorStop(1, "rgba(23,37,33,0.055)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function orientationFor(type) {
  if (type === "mobius") {
    return { x: -0.10, y: 0.27, z: -0.045, scale: 0.94, shapeX: 1.05, shapeY: 1.02, shapeZ: 1.02, wobbleX: 0, wobbleY: 0 };
  }
  return { x: -0.03, y: 0.10, z: 0.018, scale: 0.91, shapeX: 1.02, shapeY: 1.02, shapeZ: 1.02, wobbleX: 0, wobbleY: 0 };
}

function project(type, u, v, box) {
  const point = Morph.project(type, u, v, box.size, box.size, orientationFor(type));
  return {
    x: box.cx - box.size / 2 + point.x,
    y: box.cy - box.size / 2 + point.y,
    depth: point.depth
  };
}

function patchPath(points) {
  const path = new Path2D();
  path.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => path.lineTo(point.x, point.y));
  path.closePath();
  return path;
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return area / 2;
}

function buildSurfacePatches(type, box, columns, rows) {
  const patches = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns;
      const u1 = (column + 1) / columns;
      const v0 = row / rows;
      const v1 = (row + 1) / rows;
      const points = [
        project(type, u0, v0, box),
        project(type, u1, v0, box),
        project(type, u1, v1, box),
        project(type, u0, v1, box)
      ];
      patches.push({
        points,
        u: (u0 + u1) / 2,
        v: (v0 + v1) / 2,
        depth: points.reduce((sum, point) => sum + point.depth, 0) / 4,
        facing: signedArea(points)
      });
    }
  }
  patches.sort((first, second) => first.depth - second.depth);
  return patches;
}

function drawCurveOnSurface(ctx, type, box, fixed, axis = "u", steps = 120) {
  const curve = new Path2D();
  for (let index = 0; index <= steps; index += 1) {
    const amount = index / steps;
    const point = axis === "u" ? project(type, amount, fixed, box) : project(type, fixed, amount, box);
    if (index === 0) curve.moveTo(point.x, point.y);
    else curve.lineTo(point.x, point.y);
  }
  ctx.stroke(curve);
}

function drawMobiusLacquer(ctx, box) {
  const layer = createCanvas(Math.ceil(box.canvasWidth), Math.ceil(box.canvasHeight));
  const lctx = layer.getContext("2d");
  const patches = buildSurfacePatches("mobius", box, 56, 18);
  patches.forEach((patch) => {
    const light = clamp((patch.depth + 1.1) / 2.2, 0, 1);
    const front = patch.facing < 0;
    const gradient = lctx.createLinearGradient(box.cx - box.size * 0.35, box.cy - box.size * 0.3, box.cx + box.size * 0.38, box.cy + box.size * 0.32);
    if (front) {
      gradient.addColorStop(0, light > 0.45 ? "#fffaf0" : "#dfd8cb");
      gradient.addColorStop(1, light > 0.45 ? "#e7dfd1" : "#bfb7aa");
    } else {
      gradient.addColorStop(0, light > 0.45 ? "#397f7b" : "#183f3d");
      gradient.addColorStop(1, light > 0.45 ? "#245e5a" : "#102d2a");
    }
    lctx.fillStyle = gradient;
    lctx.fill(patchPath(patch.points));
  });
  lctx.save();
  lctx.lineCap = "round";
  lctx.lineJoin = "round";
  lctx.strokeStyle = rgba(palette.ink, 0.90);
  lctx.lineWidth = Math.max(8, box.size * 0.018);
  drawCurveOnSurface(lctx, "mobius", box, 0, "v");
  drawCurveOnSurface(lctx, "mobius", box, 1, "v");
  lctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(23,37,33,0.28)";
  ctx.shadowBlur = box.size * 0.032;
  ctx.shadowOffsetY = box.size * 0.020;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  drawFiveStonesOnParametricPath(ctx, "mobius", box, 0.50, "u", [0.05, 0.23, 0.42, 0.62, 0.82]);
}

function drawKleinMonolith(ctx, box) {
  const s = box.size;
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(-0.055);

  const body = new Path2D();
  body.moveTo(-s * 0.11, -s * 0.42);
  body.bezierCurveTo(-s * 0.27, -s * 0.38, -s * 0.30, -s * 0.21, -s * 0.22, -s * 0.09);
  body.bezierCurveTo(-s * 0.12, s * 0.04, -s * 0.33, s * 0.13, -s * 0.30, s * 0.29);
  body.bezierCurveTo(-s * 0.27, s * 0.48, -s * 0.05, s * 0.52, s * 0.18, s * 0.47);
  body.bezierCurveTo(s * 0.38, s * 0.42, s * 0.44, s * 0.22, s * 0.33, s * 0.07);
  body.bezierCurveTo(s * 0.26, -s * 0.02, s * 0.16, -s * 0.07, s * 0.08, -s * 0.11);
  body.bezierCurveTo(s * 0.18, -s * 0.18, s * 0.26, -s * 0.27, s * 0.22, -s * 0.35);
  body.bezierCurveTo(s * 0.18, -s * 0.44, s * 0.03, -s * 0.47, -s * 0.11, -s * 0.42);
  body.closePath();

  ctx.shadowColor = "rgba(23,37,33,0.34)";
  ctx.shadowBlur = s * 0.036;
  ctx.shadowOffsetY = s * 0.024;
  const glaze = ctx.createLinearGradient(-s * 0.30, -s * 0.40, s * 0.32, s * 0.44);
  glaze.addColorStop(0, "#4c7068");
  glaze.addColorStop(0.25, "#294b45");
  glaze.addColorStop(0.70, "#17342f");
  glaze.addColorStop(1, "#0f2723");
  ctx.fillStyle = glaze;
  ctx.fill(body);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(7, s * 0.016);
  ctx.stroke(body);

  // The pale carved channel is the bottle neck itself; it loops around and
  // disappears into the belly instead of being described by a wireframe.
  const channel = new Path2D();
  channel.moveTo(-s * 0.085, -s * 0.355);
  channel.bezierCurveTo(-s * 0.075, -s * 0.505, s * 0.12, -s * 0.545, s * 0.255, -s * 0.425);
  channel.bezierCurveTo(s * 0.382, -s * 0.305, s * 0.300, -s * 0.170, s * 0.125, -s * 0.095);
  channel.bezierCurveTo(-s * 0.035, -s * 0.025, -s * 0.085, s * 0.070, -s * 0.040, s * 0.180);
  channel.bezierCurveTo(s * 0.010, s * 0.292, s * 0.155, s * 0.315, s * 0.255, s * 0.215);
  ctx.strokeStyle = palette.bone;
  ctx.lineWidth = s * 0.112;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(channel);
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = s * 0.038;
  ctx.stroke(channel);

  // A foreground lip establishes the self-intersection unambiguously.
  ctx.save();
  ctx.translate(s * 0.095, -s * 0.080);
  ctx.rotate(-0.20);
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.094, s * 0.051, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = s * 0.016;
  ctx.stroke();
  ctx.restore();

  const stones = [
    [-0.085, -0.355],
    [0.095, -0.485],
    [0.270, -0.345],
    [0.105, -0.080],
    [-0.040, 0.180]
  ];
  stones.forEach(([x, y], index) => {
    const radius = s * 0.033;
    ctx.save();
    ctx.translate(x * s, y * s);
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(246,241,230,0.64)";
    ctx.lineWidth = Math.max(1.5, radius * 0.09);
    ctx.stroke();
    if (index === stones.length - 1) {
      ctx.fillStyle = palette.danger;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  ctx.restore();
}

function drawFiveStonesOnParametricPath(ctx, type, box, fixed, axis, positions) {
  const points = positions.map((amount) => axis === "u" ? project(type, amount, fixed, box) : project(type, fixed, amount, box));
  ctx.save();
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = Math.max(7, box.size * 0.014);
  ctx.lineCap = "round";
  const route = new Path2D();
  const start = positions[0];
  const end = positions[positions.length - 1];
  for (let index = 0; index <= 120; index += 1) {
    const amount = mix(start, end, index / 120);
    const point = axis === "u" ? project(type, amount, fixed, box) : project(type, fixed, amount, box);
    if (index === 0) route.moveTo(point.x, point.y);
    else route.lineTo(point.x, point.y);
  }
  ctx.stroke(route);
  const radius = box.size * 0.033;
  points.forEach((point, index) => {
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(246,241,230,0.54)";
    ctx.lineWidth = Math.max(1.5, radius * 0.085);
    ctx.stroke();
    if (index === points.length - 1) {
      ctx.fillStyle = palette.danger;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  ctx.restore();
}

function drawProjectiveSeal(ctx, box) {
  const s = box.size;
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(-0.09);
  ctx.shadowColor = "rgba(23,37,33,0.24)";
  ctx.shadowBlur = s * 0.026;
  ctx.shadowOffsetY = s * 0.016;

  // Three opaque chart-loops pass through the same centre. Their crossings,
  // not a flower-like outer contour, carry the projective-plane semantics.
  const loops = [
    { rotation: 0, colour: palette.bone },
    { rotation: Math.PI / 3, colour: palette.teal },
    { rotation: -Math.PI / 3, colour: palette.violet }
  ];
  loops.forEach((loop) => {
    ctx.save();
    ctx.rotate(loop.rotation);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = s * 0.154;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.345, s * 0.148, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = loop.colour;
    ctx.lineWidth = s * 0.112;
    ctx.stroke();
    ctx.restore();
  });
  ctx.shadowColor = "transparent";

  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.105, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.paper;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.064);
  ctx.lineTo(s * 0.061, s * 0.045);
  ctx.lineTo(-s * 0.068, s * 0.041);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = Math.max(8, s * 0.020);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 0.31, s * 0.06);
  ctx.bezierCurveTo(-s * 0.16, -s * 0.18, s * 0.13, s * 0.18, s * 0.31, -s * 0.06);
  ctx.stroke();
  const positions = [-0.31, -0.155, 0, 0.155, 0.31];
  positions.forEach((amount, index) => {
    const x = amount * s;
    const y = Math.sin(amount * Math.PI * 3.05) * s * 0.085;
    const r = s * 0.031;
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.bone;
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.stroke();
    if (index === 4) {
      ctx.fillStyle = palette.danger;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

function drawAtlasInk(ctx, box) {
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(-0.075);
  const s = box.size;
  ctx.shadowColor = "rgba(23,37,33,0.22)";
  ctx.shadowBlur = s * 0.026;
  ctx.shadowOffsetY = s * 0.016;

  // A deliberately irregular figure-eight band, redrawn from the visual
  // grammar of the in-game atlas rather than copied from a video frame.
  const band = new Path2D();
  band.moveTo(-s * 0.31, -s * 0.13);
  band.bezierCurveTo(-s * 0.23, -s * 0.39, s * 0.10, -s * 0.43, s * 0.29, -s * 0.23);
  band.bezierCurveTo(s * 0.44, -s * 0.06, s * 0.28, s * 0.14, s * 0.08, s * 0.29);
  band.bezierCurveTo(-s * 0.15, s * 0.46, -s * 0.43, s * 0.29, -s * 0.37, s * 0.04);
  band.bezierCurveTo(-s * 0.33, -s * 0.15, -s * 0.13, -s * 0.20, s * 0.03, -s * 0.04);
  band.bezierCurveTo(s * 0.19, s * 0.12, s * 0.39, s * 0.10, s * 0.35, -s * 0.08);
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = s * 0.132;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(band);
  ctx.shadowColor = "transparent";

  // The pale overpass and gold spine make the single half-twist readable
  // without any small wireframe detail.
  const overpass = new Path2D();
  overpass.moveTo(-s * 0.105, -s * 0.145);
  overpass.bezierCurveTo(-s * 0.035, -s * 0.090, s * 0.025, -s * 0.025, s * 0.095, s * 0.045);
  ctx.strokeStyle = palette.bone;
  ctx.lineWidth = s * 0.148;
  ctx.lineCap = "round";
  ctx.stroke(overpass);
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = s * 0.046;
  ctx.stroke(overpass);

  const route = new Path2D();
  route.moveTo(-s * 0.28, -s * 0.17);
  route.bezierCurveTo(-s * 0.16, -s * 0.35, s * 0.12, -s * 0.36, s * 0.27, -s * 0.20);
  route.bezierCurveTo(s * 0.38, -s * 0.07, s * 0.25, s * 0.11, s * 0.07, s * 0.26);
  route.bezierCurveTo(-s * 0.10, s * 0.39, -s * 0.32, s * 0.26, -s * 0.29, s * 0.07);
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = s * 0.040;
  ctx.stroke(route);

  const stones = [
    [-0.28, -0.17],
    [-0.07, -0.34],
    [0.23, -0.24],
    [0.22, 0.12],
    [-0.12, 0.34]
  ];
  stones.forEach(([x, y], index) => {
    ctx.fillStyle = palette.bone;
    ctx.beginPath();
    ctx.arc(x * s, y * s, s * 0.039, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = s * 0.010;
    ctx.stroke();
    if (index === stones.length - 1) {
      ctx.fillStyle = palette.danger;
      ctx.beginPath();
      ctx.arc(x * s, y * s, s * 0.009, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

function trackedText(ctx, text, x, y, tracking) {
  const glyphs = Array.from(text);
  const widths = glyphs.map((glyph) => ctx.measureText(glyph).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, glyphs.length - 1);
  let cursor = x - total / 2;
  glyphs.forEach((glyph, index) => {
    ctx.fillText(glyph, cursor + widths[index] / 2, y);
    cursor += widths[index] + tracking;
  });
}

function layoutFor(profile, direction) {
  const { width, height } = profile;
  const vertical = height > width;
  if (vertical) {
    const verticalSize = direction.id === "klein-monolith"
      ? 0.54
      : direction.id === "mobius-lacquer"
        ? 0.62
        : direction.id === "projective-seal"
          ? 0.58
          : 0.56;
    return {
      hero: {
        cx: width * 0.50,
        cy: height * 0.355,
        size: width * verticalSize,
        canvasWidth: width,
        canvasHeight: height
      },
      wordmark: { x: width * 0.09, y: height * 0.585, width: width * 0.82, height: height * 0.20 },
      subtitle: { x: width * 0.50, y: height * 0.835, size: width * 0.080 }
    };
  }
  const heroLeft = direction.layout === "reverse" || direction.layout === "crest";
  return {
    hero: {
      cx: width * (heroLeft ? 0.29 : 0.71),
      cy: height * 0.49,
      size: height * (direction.id === "klein-monolith" ? 0.68 : (direction.layout === "atlas" ? 0.70 : 0.82)),
      canvasWidth: width,
      canvasHeight: height
    },
    wordmark: {
      x: width * (heroLeft ? 0.49 : 0.07),
      y: height * 0.28,
      width: width * (heroLeft ? 0.42 : 0.45),
      height: height * 0.28
    },
    subtitle: { x: width * (heroLeft ? 0.70 : 0.295), y: height * 0.665, size: height * 0.078 }
  };
}

function drawCover(profile, direction) {
  const canvas = createCanvas(profile.width, profile.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  const layout = layoutFor(profile, direction);
  drawBackdrop(ctx, profile.width, profile.height, direction);
  if (direction.id === "klein-monolith") drawKleinMonolith(ctx, layout.hero);
  else if (direction.id === "mobius-lacquer") drawMobiusLacquer(ctx, layout.hero);
  else if (direction.id === "projective-seal") drawProjectiveSeal(ctx, layout.hero);
  else drawAtlasInk(ctx, layout.hero);

  drawWordmark(ctx, layout.wordmark, {
    mode: "colour",
    accent: direction.id === "projective-seal" ? palette.violet : palette.gold,
    background: palette.paper,
    shadow: true
  });

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(layout.subtitle.size)}px "Topo Serif PV"`;
  ctx.fillStyle = rgba(palette.ink, 0.88);
  trackedText(ctx, "足迹回环", layout.subtitle.x, layout.subtitle.y, layout.subtitle.size * 0.30);
  ctx.fillStyle = rgba(direction.accent, 0.80);
  const ruleWidth = layout.subtitle.size * 1.54;
  ctx.fillRect(layout.subtitle.x - ruleWidth / 2, layout.subtitle.y + layout.subtitle.size * 0.82, ruleWidth, Math.max(3, layout.subtitle.size * 0.043));
  ctx.restore();
  return canvas;
}

function drawContactSheet(directionCanvases, profile) {
  const tileWidth = 960;
  const tileHeight = Math.round(tileWidth * profile.height / profile.width);
  const gutter = 34;
  const labelHeight = 62;
  const canvas = createCanvas(tileWidth * 2 + gutter * 3, (tileHeight + labelHeight) * 2 + gutter * 3);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d9d4ca";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  directionCanvases.forEach(({ direction, canvas: cover }, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = gutter + column * (tileWidth + gutter);
    const y = gutter + row * (tileHeight + labelHeight + gutter);
    ctx.drawImage(cover, x, y, tileWidth, tileHeight);
    ctx.fillStyle = palette.ink;
    ctx.font = "600 27px 'Topo Serif PV'";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${direction.code}  ${direction.id}`, x + 4, y + tileHeight + labelHeight * 0.52);
  });
  return canvas;
}

function drawThumbnailSheet(directionCanvases, profile) {
  const vertical = profile.height > profile.width;
  const tileWidth = vertical ? 135 : (profile.id === "16x9" ? 160 : 160);
  const tileHeight = vertical ? 180 : (profile.id === "16x9" ? 90 : 120);
  const gap = 14;
  const labelHeight = 25;
  const canvas = createCanvas((tileWidth + gap) * 4 + gap, tileHeight + labelHeight + gap * 2);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d9d4ca";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  directionCanvases.forEach(({ direction, canvas: cover }, index) => {
    const x = gap + index * (tileWidth + gap);
    const y = gap;
    ctx.drawImage(cover, x, y, tileWidth, tileHeight);
    ctx.fillStyle = palette.ink;
    ctx.font = "600 16px 'Topo Serif PV'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(direction.code, x + tileWidth / 2, y + tileHeight + labelHeight * 0.58);
  });
  return canvas;
}

async function writeWordmarkProofs() {
  const proofs = [
    { id: "colour", mode: "colour", background: palette.paper },
    { id: "black", mode: "mono", background: palette.paperBright },
    { id: "reverse", mode: "reverse", background: palette.ink }
  ];
  for (const proof of proofs) {
    const svg = wordmarkSvg({ mode: proof.mode, background: proof.background });
    await fs.writeFile(path.join(outputDirectory, `topology-gomoku-wordmark-${proof.id}.svg`), svg, "utf8");
    const canvas = createCanvas(1320, 360);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = proof.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawWordmark(ctx, { x: 26, y: 22, width: 1268, height: 316 }, { mode: proof.mode, background: proof.background });
    await fs.writeFile(path.join(outputDirectory, `topology-gomoku-wordmark-${proof.id}.png`), canvas.toBuffer("image/png"));
  }

  const miniature = createCanvas(240, 84);
  const miniContext = miniature.getContext("2d", { alpha: false });
  miniContext.fillStyle = palette.paperBright;
  miniContext.fillRect(0, 0, miniature.width, miniature.height);
  drawWordmark(miniContext, { x: 3, y: 8, width: 234, height: 68 }, { mode: "mono", background: palette.paperBright });
  await fs.writeFile(path.join(outputDirectory, "topology-gomoku-wordmark-240px.png"), miniature.toBuffer("image/png"));

  const blur = createCanvas(1320, 360);
  const blurContext = blur.getContext("2d", { alpha: false });
  blurContext.fillStyle = palette.paperBright;
  blurContext.fillRect(0, 0, blur.width, blur.height);
  blurContext.filter = "blur(4px)";
  drawWordmark(blurContext, { x: 26, y: 22, width: 1268, height: 316 }, { mode: "mono", background: palette.paperBright });
  blurContext.filter = "none";
  await fs.writeFile(path.join(outputDirectory, "topology-gomoku-wordmark-blur-proof.png"), blur.toBuffer("image/png"));
}

async function main() {
  registerFonts();
  await fs.mkdir(outputDirectory, { recursive: true });
  await writeWordmarkProofs();

  const rendered = new Map();
  const manifestDirections = [];
  for (const direction of directions) {
    const exports = [];
    for (const profile of profiles) {
      const canvas = drawCover(profile, direction);
      const buffer = canvas.toBuffer("image/png");
      const filename = `${direction.code}-${direction.id}-cover-${profile.id}.png`;
      await fs.writeFile(path.join(outputDirectory, filename), buffer);
      rendered.set(`${direction.id}:${profile.id}`, canvas);
      exports.push({
        profile: profile.id,
        label: profile.label,
        file: filename,
        width: profile.width,
        height: profile.height,
        bytes: buffer.length,
        sha256: sha256(buffer),
        safeZone: "main wordmark, subtitle, and topology anchor remain inside the inner 9% frame"
      });
    }
    manifestDirections.push({
      id: direction.id,
      code: direction.code,
      label: direction.label,
      topology: direction.topology,
      caption: direction.caption,
      wordmark: "original shared-band Chinese lettering; no font glyph is used for 拓扑五子棋",
      exports
    });
  }

  for (const profile of profiles) {
    const canvases = directions.map((direction) => ({ direction, canvas: rendered.get(`${direction.id}:${profile.id}`) }));
    await fs.writeFile(path.join(outputDirectory, `contact-sheet-${profile.id}.png`), drawContactSheet(canvases, profile).toBuffer("image/png"));
    await fs.writeFile(path.join(outputDirectory, `thumbnail-proof-${profile.id}.png`), drawThumbnailSheet(canvases, profile).toBuffer("image/png"));
  }

  const manifest = {
    schemaVersion: 2,
    title: publishingCopy.title,
    exactCoverCopy: ["拓扑五子棋", "足迹回环"],
    contentPolicy: "no small cover copy; exact custom wordmark and title only",
    wordmark: {
      name: "回环字标",
      source: "manually redrawn centreline bands; no installed or embedded font glyphs",
      structuralAnchors: ["shared upper boundary", "central over-under twist", "棋 terminal return loop"],
      vectorMasters: [
        "topology-gomoku-wordmark-colour.svg",
        "topology-gomoku-wordmark-black.svg",
        "topology-gomoku-wordmark-reverse.svg"
      ],
      proofs: ["topology-gomoku-wordmark-240px.png", "topology-gomoku-wordmark-blur-proof.png"]
    },
    sourceAssets: [
      "app/assets/topology-morph.js",
      "app/assets/topology-art.js",
      "app/assets/topologies/klein.svg",
      "app/assets/silhouettes/klein.svg",
      "video/chapter-teaser/assets/fonts/topo-serif-pv-600.ttf"
    ],
    designSystem: "warm game paper, high-contrast opaque topology forms, restrained teal/gold, bespoke topology-native Chinese lettering",
    thumbnailChecks: ["160x90", "160x120", "135x180", "240px wordmark"],
    directions: manifestDirections
  };
  await fs.writeFile(path.join(outputDirectory, "delivery-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outputDirectory, "publishing-copy.txt"), `${publishingCopy.title}\n\n${publishingCopy.descriptionLines.join("\n")}\n`, "utf8");
  process.stdout.write(`Four redesigned covers and original vector wordmark written to ${outputDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

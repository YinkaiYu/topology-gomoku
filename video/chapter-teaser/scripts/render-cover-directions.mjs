import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const Art = require("../../../app/assets/topology-art.js");
const Engine = require("../../../app/assets/topology.js");
const Morph = require("../../../app/assets/topology-morph.js");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pvRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(pvRoot, "../..");
const outputDirectory = path.join(repositoryRoot, ".tmp", "chapter-teaser", "cover-directions");

const profiles = Object.freeze([
  Object.freeze({ id: "4x3", label: "4:3", width: 1600, height: 1200 }),
  Object.freeze({ id: "16x9", label: "16:9", width: 1920, height: 1080 }),
  Object.freeze({ id: "3x4", label: "3:4", width: 1080, height: 1440 })
]);

const directions = Object.freeze([
  Object.freeze({
    id: "mobius-continuum",
    code: "A",
    label: "莫比乌斯连续体",
    type: "mobius",
    wordmark: "mobius",
    layout: "split",
    accent: "#c79244",
    orientation: { x: -0.08, y: 0.30, z: -0.05, scale: 0.94 }
  }),
  Object.freeze({
    id: "klein-passage",
    code: "B",
    label: "克莱因内外通道",
    type: "klein",
    wordmark: "klein",
    layout: "monument",
    accent: "#b27848",
    orientation: { x: -0.04, y: 0.10, z: 0.025, scale: 0.90 }
  }),
  Object.freeze({
    id: "projective-crossing",
    code: "C",
    label: "射影交汇",
    type: "projective",
    wordmark: "projective",
    layout: "reverse",
    accent: "#8374a8",
    orientation: { x: -0.08, y: 0.25, z: -0.04, scale: 0.90 }
  }),
  Object.freeze({
    id: "torus-orbit",
    code: "D",
    label: "环面双周期轨道",
    type: "torus",
    wordmark: "torus",
    layout: "frame",
    accent: "#667fac",
    orientation: { x: -0.04, y: 0.22, z: -0.035, scale: 0.96 }
  }),
  Object.freeze({
    id: "seam-gate",
    code: "E",
    label: "边界粘合之门",
    type: "mobius",
    wordmark: "seam",
    layout: "horizon",
    accent: "#3f8c87",
    orientation: { x: -0.06, y: 0.29, z: -0.04, scale: 0.88 },
    morphing: true
  }),
  Object.freeze({
    id: "wordmark-manifold",
    code: "F",
    label: "字成流形",
    type: "klein",
    wordmark: "wordmark",
    layout: "wordmark",
    accent: "#c79244",
    orientation: { x: -0.04, y: 0.10, z: 0.02, scale: 0.92 },
    wordmarkLed: true
  })
]);

const story = require("../story.json");
const publishingCopy = require("../publishing-copy.json");

function registerFonts() {
  const fonts = [
    ["topo-serif-pv-600.ttf", "Topo Serif PV"],
    ["topo-serif-pv-700.ttf", "Topo Serif PV"],
    ["topo-sans-pv-600.ttf", "Topo Sans PV"]
  ];
  for (const [filename, family] of fonts) {
    const fontPath = path.join(pvRoot, "assets", "fonts", filename);
    if (!GlobalFonts.registerFromPath(fontPath, family)) throw new Error(`Unable to register embedded font: ${fontPath}`);
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
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

function trackedText(ctx, text, x, y, tracking) {
  const glyphs = Array.from(text);
  const widths = glyphs.map((glyph) => ctx.measureText(glyph).width);
  const total = widths.reduce((sum, value) => sum + value, 0) + tracking * Math.max(0, glyphs.length - 1);
  let cursor = x - total / 2;
  glyphs.forEach((glyph, index) => {
    ctx.fillText(glyph, cursor + widths[index] / 2, y);
    cursor += widths[index] + tracking;
  });
}

function prepareModel(type) {
  const chapter = story.chapters.find((candidate) => candidate.id === type);
  if (!chapter) throw new Error(`Missing chapter model for ${type}`);
  const rules = Engine.createRules({ type, width: chapter.width, height: chapter.height, target: 5 });
  const startCell = Engine.toCell(rules, chapter.start[0], chapter.start[1]);
  const trace = Engine.tracePath(rules, startCell, chapter.direction, 5);
  return {
    chapter,
    rules,
    trace,
    presentation: Morph.createPresentation(type, rules, trace.cells)
  };
}

const models = Object.freeze(Object.fromEntries(["mobius", "klein", "projective", "torus"].map((type) => [type, prepareModel(type)])));

function orientationFor(direction) {
  return {
    ...direction.orientation,
    shapeX: 1,
    shapeY: 1,
    shapeZ: 1,
    wobbleX: 0,
    wobbleY: 0,
    presentation: models[direction.type].presentation
  };
}

function projectPoint(direction, u, v, box) {
  const projected = Morph.project(direction.type, u, v, box.size, box.size, orientationFor(direction));
  const surface = {
    x: box.cx - box.size / 2 + projected.x,
    y: box.cy - box.size / 2 + projected.y,
    depth: projected.depth
  };
  if (!direction.morphing) return surface;
  const flat = {
    x: box.cx - box.size * 0.43 + u * box.size * 0.86,
    y: box.cy - box.size * 0.35 + v * box.size * 0.70,
    depth: 0
  };
  const amount = smoothstep(0.12, 0.88, u);
  return {
    x: mix(flat.x, surface.x, amount),
    y: mix(flat.y, surface.y, amount),
    depth: mix(flat.depth, surface.depth, amount)
  };
}

function drawBackdrop(ctx, width, height, direction) {
  Art.drawAppBackdrop(ctx, width, height, { accent: direction.accent });
  Art.drawPaperTexture(ctx, width, height, 0.9);
  const minimum = Math.min(width, height);
  const glow = ctx.createRadialGradient(width * 0.58, height * 0.42, 0, width * 0.58, height * 0.42, minimum * 0.78);
  glow.addColorStop(0, rgba(direction.accent, 0.055));
  glow.addColorStop(0.58, "rgba(242,239,231,0.02)");
  glow.addColorStop(1, "rgba(242,239,231,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawSurface(ctx, direction, box, opacity = 1) {
  const columns = direction.type === "projective" ? 34 : 32;
  const rows = direction.type === "projective" ? 28 : 20;
  const patches = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns;
      const u1 = (column + 1) / columns;
      const v0 = row / rows;
      const v1 = (row + 1) / rows;
      const points = [
        projectPoint(direction, u0, v0, box),
        projectPoint(direction, u1, v0, box),
        projectPoint(direction, u1, v1, box),
        projectPoint(direction, u0, v1, box)
      ];
      patches.push({ points, depth: points.reduce((sum, point) => sum + point.depth, 0) / 4 });
    }
  }
  patches.sort((first, second) => first.depth - second.depth);
  ctx.save();
  ctx.lineJoin = "round";
  for (const patch of patches) {
    const depthLight = clamp((patch.depth + 1.2) / 2.4, 0, 1);
    ctx.beginPath();
    ctx.moveTo(patch.points[0].x, patch.points[0].y);
    for (let index = 1; index < patch.points.length; index += 1) ctx.lineTo(patch.points[index].x, patch.points[index].y);
    ctx.closePath();
    ctx.fillStyle = depthLight > 0.48
      ? `rgba(246,244,237,${opacity * (0.16 + depthLight * 0.12)})`
      : `rgba(207,204,195,${opacity * (0.055 + depthLight * 0.045)})`;
    ctx.fill();
    ctx.strokeStyle = rgba(Art.PALETTE.ink, opacity * (0.030 + depthLight * 0.040));
    ctx.lineWidth = Math.max(0.65, box.size * 0.0009);
    ctx.stroke();
  }
  ctx.restore();
  drawSurfaceGesture(ctx, direction, box, opacity);
}

function drawSurfaceGesture(ctx, direction, box, opacity) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = rgba(Art.PALETTE.ink, opacity * 0.30);
  ctx.lineWidth = Math.max(1.4, box.size * 0.0028);
  for (const fixed of [0, 1]) {
    for (const axis of ["u", "v"]) {
      ctx.beginPath();
      for (let index = 0; index <= 80; index += 1) {
        const amount = index / 80;
        const point = axis === "u"
          ? projectPoint(direction, fixed, amount, box)
          : projectPoint(direction, amount, fixed, box);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawUvSegment(ctx, direction, box, from, to) {
  ctx.beginPath();
  for (let index = 0; index <= 28; index += 1) {
    const amount = index / 28;
    const point = projectPoint(direction, mix(from.u, to.u, amount), mix(from.v, to.v, amount), box);
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}

function drawTopologyPath(ctx, direction, box, opacity = 1) {
  const model = models[direction.type];
  ctx.save();
  ctx.strokeStyle = rgba(Art.PALETTE.twist, opacity * 0.98);
  ctx.lineWidth = Math.max(5, box.size * 0.0135);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = rgba(Art.PALETTE.twist, opacity * 0.20);
  ctx.shadowBlur = box.size * 0.022;
  for (let index = 0; index < model.trace.cells.length - 1; index += 1) {
    const from = Morph.stoneUV(model.rules, model.trace.cells[index]);
    const to = Morph.stoneUV(model.rules, model.trace.cells[index + 1]);
    const seam = model.trace.seams[index];
    if (!seam) {
      drawUvSegment(ctx, direction, box, from, to);
      continue;
    }
    const vector = Engine.DIRECTIONS[model.trace.directions[index]];
    const bridge = Morph.seamBridgeUV(
      direction.type,
      from,
      to,
      vector,
      Boolean(seam & Engine.SEAM_X),
      Boolean(seam & Engine.SEAM_Y)
    );
    drawUvSegment(ctx, direction, box, from, bridge.source);
    drawUvSegment(ctx, direction, box, bridge.target, to);
  }
  ctx.shadowColor = "transparent";
  model.trace.cells.forEach((cell, index) => {
    const uv = Morph.stoneUV(model.rules, cell);
    const point = projectPoint(direction, uv.u, uv.v, box);
    ctx.save();
    ctx.translate(point.x, point.y);
    Art.drawStoneFace(ctx, {
      player: 1,
      radius: box.size * 0.034,
      markLastMove: index === model.trace.cells.length - 1
    });
    ctx.restore();
  });
  ctx.restore();
}

function wordmarkFont(style) {
  return style === "torus" || style === "wordmark" ? "Topo Sans PV" : "Topo Serif PV";
}

function buildWordmark(fontSize, tracking, style) {
  const text = "拓扑五子棋";
  const scratch = createCanvas(32, 32);
  const scratchContext = scratch.getContext("2d");
  const family = wordmarkFont(style);
  const weight = style === "torus" || style === "wordmark" ? 600 : 700;
  scratchContext.font = `${weight} ${fontSize}px "${family}"`;
  const widths = Array.from(text).map((glyph) => scratchContext.measureText(glyph).width);
  const total = widths.reduce((sum, value) => sum + value, 0) + tracking * 4;
  const padding = fontSize * 0.36;
  const canvas = createCanvas(Math.ceil(total + padding * 2), Math.ceil(fontSize * 1.62));
  const ctx = canvas.getContext("2d");
  ctx.font = `${weight} ${fontSize}px "${family}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = Art.PALETTE.ink;
  const baseline = fontSize * 1.12;
  const centers = [];
  let cursor = padding;
  Array.from(text).forEach((glyph, index) => {
    const center = cursor + widths[index] / 2;
    const offset = style === "mobius" ? [0, -0.025, 0.010, -0.012, 0.006][index] * fontSize : 0;
    ctx.fillText(glyph, center, baseline + offset);
    centers.push(center);
    cursor += widths[index] + tracking;
  });
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = "round";
  if (style === "mobius") {
    [1, 2, 3].forEach((index, position) => {
      ctx.beginPath();
      ctx.arc(centers[index], baseline - fontSize * [0.31, 0.47, 0.24][position], fontSize * 0.052, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (style === "klein") {
    [1, 2, 3].forEach((index) => {
      ctx.beginPath();
      ctx.arc(centers[index], baseline - fontSize * (index === 2 ? 0.42 : 0.34), fontSize * 0.064, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (style === "projective") {
    [1, 3].forEach((index) => {
      ctx.beginPath();
      ctx.arc(centers[index], baseline - fontSize * (index === 1 ? 0.70 : 0.18), fontSize * 0.048, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (style === "torus") {
    centers.forEach((center) => {
      ctx.beginPath();
      ctx.arc(center, baseline - fontSize * 0.45, fontSize * 0.061, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (style === "seam") {
    ctx.fillRect(centers[1] - fontSize * 0.035, baseline - fontSize * 0.94, fontSize * 0.07, fontSize * 1.02);
    ctx.fillRect(centers[3] - fontSize * 0.035, baseline - fontSize * 0.94, fontSize * 0.07, fontSize * 1.02);
  } else if (style === "wordmark") {
    centers.forEach((center, index) => {
      ctx.beginPath();
      ctx.arc(center, baseline - fontSize * [0.15, 0.20, 0.13, 0.23, 0.16][index], fontSize * 0.041, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalCompositeOperation = "source-over";
  return { canvas, centers, baseline, fontSize, padding, total };
}

function drawWordmark(ctx, centerX, centerY, fontSize, style, accent, scale = 1) {
  const tracking = fontSize * (style === "wordmark" ? -0.045 : -0.015);
  const mark = buildWordmark(fontSize, tracking, style);
  const left = centerX - mark.canvas.width * scale / 2;
  const top = centerY - mark.canvas.height * scale / 2;
  const toMainX = (value) => left + value * scale;
  const toMainY = (value) => top + value * scale;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = rgba(accent, 0.12);
  ctx.shadowBlur = fontSize * scale * 0.09;
  if (style === "mobius") {
    ctx.strokeStyle = rgba(Art.PALETTE.connection, 0.86);
    ctx.lineWidth = fontSize * scale * 0.028;
    ctx.beginPath();
    ctx.moveTo(toMainX(mark.centers[1]), toMainY(mark.baseline - fontSize * 0.31));
    ctx.bezierCurveTo(
      toMainX(mark.centers[1] + fontSize * 0.40), toMainY(mark.baseline - fontSize * 0.68),
      toMainX(mark.centers[3] - fontSize * 0.38), toMainY(mark.baseline + fontSize * 0.02),
      toMainX(mark.centers[3]), toMainY(mark.baseline - fontSize * 0.24)
    );
    ctx.stroke();
    ctx.strokeStyle = rgba(Art.PALETTE.twist, 0.94);
    ctx.beginPath();
    ctx.moveTo(toMainX(mark.centers[1]), toMainY(mark.baseline - fontSize * 0.25));
    ctx.bezierCurveTo(
      toMainX(mark.centers[1] + fontSize * 0.42), toMainY(mark.baseline - fontSize * 0.60),
      toMainX(mark.centers[3] - fontSize * 0.34), toMainY(mark.baseline + fontSize * 0.06),
      toMainX(mark.centers[3]), toMainY(mark.baseline - fontSize * 0.18)
    );
    ctx.stroke();
  } else if (style === "klein") {
    ctx.strokeStyle = rgba(Art.PALETTE.connection, 0.92);
    ctx.lineWidth = fontSize * scale * 0.038;
    ctx.beginPath();
    ctx.moveTo(toMainX(mark.centers[1]), toMainY(mark.baseline - fontSize * 0.34));
    ctx.bezierCurveTo(
      toMainX(mark.centers[1]), toMainY(mark.baseline - fontSize * 0.88),
      toMainX(mark.centers[3]), toMainY(mark.baseline - fontSize * 0.05),
      toMainX(mark.centers[3]), toMainY(mark.baseline - fontSize * 0.34)
    );
    ctx.stroke();
    ctx.strokeStyle = rgba(Art.PALETTE.twist, 0.94);
    ctx.beginPath();
    ctx.moveTo(toMainX(mark.centers[2]), toMainY(mark.baseline - fontSize * 0.42));
    ctx.bezierCurveTo(
      toMainX(mark.centers[2] + fontSize * 0.36), toMainY(mark.baseline - fontSize * 0.75),
      toMainX(mark.centers[3] - fontSize * 0.18), toMainY(mark.baseline - fontSize * 0.12),
      toMainX(mark.centers[3]), toMainY(mark.baseline - fontSize * 0.34)
    );
    ctx.stroke();
  } else if (style === "projective") {
    ctx.lineWidth = fontSize * scale * 0.026;
    ctx.strokeStyle = rgba(Art.PALETTE.connection, 0.78);
    ctx.beginPath();
    ctx.moveTo(toMainX(mark.padding * 0.92), toMainY(mark.baseline - fontSize * 0.74));
    ctx.bezierCurveTo(centerX - fontSize * scale * 0.35, toMainY(mark.baseline - fontSize * 1.00), centerX + fontSize * scale * 0.35, toMainY(mark.baseline - fontSize * 0.52), toMainX(mark.total + mark.padding * 1.08), toMainY(mark.baseline - fontSize * 0.74));
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.82);
    ctx.beginPath();
    ctx.moveTo(toMainX(mark.padding * 0.92), toMainY(mark.baseline - fontSize * 0.08));
    ctx.bezierCurveTo(centerX - fontSize * scale * 0.30, toMainY(mark.baseline - fontSize * 0.34), centerX + fontSize * scale * 0.30, toMainY(mark.baseline + fontSize * 0.12), toMainX(mark.total + mark.padding * 1.08), toMainY(mark.baseline - fontSize * 0.08));
    ctx.stroke();
  } else if (style === "torus") {
    ctx.strokeStyle = rgba(accent, 0.82);
    ctx.lineWidth = fontSize * scale * 0.028;
    ctx.beginPath();
    ctx.ellipse(centerX, toMainY(mark.baseline - fontSize * 0.45), mark.total * scale * 0.52, fontSize * scale * 0.28, -0.07, 0, Math.PI * 2);
    ctx.stroke();
  } else if (style === "seam") {
    ctx.lineWidth = fontSize * scale * 0.027;
    [1, 3].forEach((index, railIndex) => {
      ctx.strokeStyle = rgba(railIndex === 0 ? Art.PALETTE.connection : Art.PALETTE.twist, 0.92);
      ctx.beginPath();
      ctx.moveTo(toMainX(mark.centers[index]), toMainY(mark.baseline - fontSize * 0.96));
      ctx.lineTo(toMainX(mark.centers[index]), toMainY(mark.baseline + fontSize * 0.02));
      ctx.stroke();
    });
    ctx.strokeStyle = rgba(accent, 0.75);
    ctx.setLineDash([fontSize * scale * 0.08, fontSize * scale * 0.06]);
    ctx.beginPath();
    ctx.moveTo(toMainX(mark.centers[1]), toMainY(mark.baseline - fontSize * 0.55));
    ctx.bezierCurveTo(centerX - fontSize * scale * 0.20, toMainY(mark.baseline - fontSize * 0.82), centerX + fontSize * scale * 0.20, toMainY(mark.baseline - fontSize * 0.20), toMainX(mark.centers[3]), toMainY(mark.baseline - fontSize * 0.55));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.shadowColor = "transparent";
  ctx.drawImage(mark.canvas, left, top, mark.canvas.width * scale, mark.canvas.height * scale);
  if (style === "wordmark") {
    const pathY = (index) => toMainY(mark.baseline - fontSize * [0.15, 0.20, 0.13, 0.23, 0.16][index]);
    ctx.strokeStyle = rgba(Art.PALETTE.twist, 0.96);
    ctx.lineWidth = fontSize * scale * 0.038;
    ctx.beginPath();
    ctx.moveTo(toMainX(mark.centers[0]), pathY(0));
    for (let index = 1; index < mark.centers.length; index += 1) {
      const previousX = toMainX(mark.centers[index - 1]);
      const currentX = toMainX(mark.centers[index]);
      const middle = (previousX + currentX) / 2;
      ctx.bezierCurveTo(middle, pathY(index - 1), middle, pathY(index), currentX, pathY(index));
    }
    ctx.stroke();
    mark.centers.forEach((center, index) => {
      const x = toMainX(center);
      const y = pathY(index);
      ctx.save();
      ctx.fillStyle = Art.PALETTE.ink;
      ctx.beginPath();
      ctx.arc(x, y, fontSize * scale * 0.042, 0, Math.PI * 2);
      ctx.fill();
      if (index === 4) {
        ctx.fillStyle = Art.PALETTE.danger;
        ctx.beginPath();
        ctx.arc(x, y, fontSize * scale * 0.013, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    ctx.strokeStyle = rgba(Art.PALETTE.connection, 0.82);
    ctx.lineWidth = fontSize * scale * 0.020;
    [[mark.padding * 0.74, -1], [mark.total + mark.padding * 1.26, 1]].forEach(([x, sign]) => {
      ctx.beginPath();
      ctx.moveTo(toMainX(x), toMainY(mark.baseline - fontSize * 0.66));
      ctx.lineTo(toMainX(x), toMainY(mark.baseline - fontSize * 0.08));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toMainX(x), toMainY(mark.baseline - fontSize * 0.37));
      ctx.lineTo(toMainX(x + sign * fontSize * 0.12), toMainY(mark.baseline - fontSize * 0.37));
      ctx.stroke();
    });
  }
  ctx.restore();
}

function layoutFor(profile, direction) {
  const { width, height } = profile;
  const vertical = height > width;
  const minimum = Math.min(width, height);
  if (vertical) {
    return {
      hero: { cx: width * 0.50, cy: height * (direction.layout === "wordmark" ? 0.32 : 0.335), size: width * (direction.layout === "wordmark" ? 0.80 : 0.76) },
      title: { x: width * 0.50, y: height * (direction.layout === "wordmark" ? 0.575 : 0.69), size: width * (direction.layout === "wordmark" ? 0.126 : 0.108) },
      subtitle: { x: width * 0.50, y: height * (direction.layout === "wordmark" ? 0.725 : 0.825), size: width * 0.074 }
    };
  }
  if (direction.layout === "reverse") {
    return {
      hero: { cx: width * 0.30, cy: height * 0.48, size: height * 0.72 },
      title: { x: width * 0.70, y: height * 0.44, size: minimum * 0.105 },
      subtitle: { x: width * 0.70, y: height * 0.61, size: minimum * 0.066 }
    };
  }
  if (direction.layout === "frame") {
    return {
      hero: { cx: width * 0.64, cy: height * 0.48, size: height * 0.90 },
      title: { x: width * 0.30, y: height * 0.43, size: minimum * 0.104 },
      subtitle: { x: width * 0.30, y: height * 0.60, size: minimum * 0.066 }
    };
  }
  if (direction.layout === "horizon") {
    return {
      hero: { cx: width * 0.68, cy: height * 0.50, size: height * 0.76 },
      title: { x: width * 0.29, y: height * 0.43, size: minimum * 0.102 },
      subtitle: { x: width * 0.29, y: height * 0.60, size: minimum * 0.066 }
    };
  }
  if (direction.layout === "wordmark") {
    return {
      hero: { cx: width * 0.68, cy: height * 0.49, size: height * 0.80 },
      title: { x: width * 0.42, y: height * 0.46, size: minimum * 0.125 },
      subtitle: { x: width * 0.42, y: height * 0.66, size: minimum * 0.067 }
    };
  }
  return {
    hero: { cx: width * 0.71, cy: height * 0.49, size: height * (direction.layout === "monument" ? 0.77 : 0.73) },
    title: { x: width * 0.29, y: height * 0.43, size: minimum * 0.104 },
    subtitle: { x: width * 0.29, y: height * 0.60, size: minimum * 0.066 }
  };
}

function drawCover(profile, direction) {
  const canvas = createCanvas(profile.width, profile.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  const layout = layoutFor(profile, direction);
  drawBackdrop(ctx, profile.width, profile.height, direction);
  const heroOpacity = direction.wordmarkLed ? 0.28 : 0.92;
  drawSurface(ctx, direction, layout.hero, heroOpacity);
  if (!direction.wordmarkLed) drawTopologyPath(ctx, direction, layout.hero, 0.96);
  drawWordmark(ctx, layout.title.x, layout.title.y, layout.title.size, direction.wordmark, direction.accent);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(layout.subtitle.size)}px "Topo Serif PV"`;
  ctx.fillStyle = "rgba(33,48,44,0.84)";
  trackedText(ctx, "足迹回环", layout.subtitle.x, layout.subtitle.y, layout.subtitle.size * 0.28);
  ctx.fillStyle = rgba(direction.accent, 0.64);
  const ruleWidth = layout.subtitle.size * 1.42;
  ctx.fillRect(layout.subtitle.x - ruleWidth / 2, layout.subtitle.y + layout.subtitle.size * 0.82, ruleWidth, Math.max(3, layout.subtitle.size * 0.038));
  ctx.restore();
  return canvas;
}

async function main() {
  registerFonts();
  await fs.mkdir(outputDirectory, { recursive: true });
  const manifestDirections = [];
  for (const direction of directions) {
    const exports = [];
    for (const profile of profiles) {
      const canvas = drawCover(profile, direction);
      const buffer = canvas.toBuffer("image/png");
      const filename = `${direction.code}-${direction.id}-cover-${profile.id}.png`;
      await fs.writeFile(path.join(outputDirectory, filename), buffer);
      exports.push({
        profile: profile.id,
        label: profile.label,
        file: filename,
        width: profile.width,
        height: profile.height,
        bytes: buffer.length,
        sha256: sha256(buffer),
        safeZone: "all exact copy and hero content remain inside the inner 9% frame"
      });
    }
    manifestDirections.push({
      id: direction.id,
      code: direction.code,
      label: direction.label,
      topology: direction.type,
      wordmark: direction.wordmark,
      path: direction.wordmarkLed ? "five-stone path integrated into the exact wordmark" : "exact live-game trace projected through topology-morph.js",
      exports
    });
  }
  const manifest = {
    schemaVersion: 1,
    title: publishingCopy.title,
    exactCoverCopy: ["拓扑五子棋", "足迹回环"],
    sourceAssets: [
      "app/assets/topology.js",
      "app/assets/topology-morph.js",
      "app/assets/topology-art.js",
      "video/chapter-teaser/story.json",
      "video/chapter-teaser/assets/fonts/*"
    ],
    designSystem: "warm paper, hand-drawn parametric manifolds, restrained teal and gold, exact five-stone paths, bespoke Chinese wordmarks",
    contentPolicy: "no small cover copy; exact wordmark and title only",
    directions: manifestDirections
  };
  await fs.writeFile(path.join(outputDirectory, "delivery-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outputDirectory, "publishing-copy.txt"), `${publishingCopy.title}\n\n${publishingCopy.descriptionLines.join("\n")}\n`, "utf8");
  process.stdout.write(`Six cover directions written to ${outputDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

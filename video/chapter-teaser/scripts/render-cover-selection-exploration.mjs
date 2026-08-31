import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const Art = require("../../../app/assets/topology-art.js");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pvRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(pvRoot, "../..");
const outputDirectory = path.join(repositoryRoot, ".tmp", "chapter-teaser", "cover-selection-exploration-v4");
const artifactDirectory = path.join(repositoryRoot, "artifacts");
const legacyExplorationRoot = path.join(pvRoot, "assets", "cover-exploration");
const explorationRoot = path.join(pvRoot, "assets", "cover-exploration-v4");

const profiles = Object.freeze([
  Object.freeze({ id: "4x3", label: "4:3", width: 1600, height: 1200 }),
  Object.freeze({ id: "16x9", label: "16:9", width: 1920, height: 1080 }),
  Object.freeze({ id: "3x4", label: "3:4", width: 1080, height: 1440 })
]);

const palette = Object.freeze({
  ink: "#132621",
  inkSoft: "#33453f",
  teal: "#3f8c87",
  gold: "#c79244",
  red: "#e44c38",
  paper: "#f2efe7",
  paperBright: "#faf8f2"
});

const assetPaths = Object.freeze({
  logo: path.join(repositoryRoot, "app", "assets", "brand-icon.png"),
  plane: path.join(repositoryRoot, "app", "assets", "topologies", "plane.svg"),
  cylinder: path.join(repositoryRoot, "app", "assets", "topologies", "cylinder.svg"),
  torus: path.join(repositoryRoot, "app", "assets", "topologies", "torus.svg"),
  mobius: path.join(repositoryRoot, "app", "assets", "topologies", "mobius.svg"),
  klein: path.join(repositoryRoot, "app", "assets", "topologies", "klein.svg"),
  projective: path.join(repositoryRoot, "app", "assets", "topologies", "projective.svg"),
  sphere: path.join(repositoryRoot, "app", "assets", "topologies", "sphere.svg"),
  geometricAtlas: path.join(legacyExplorationRoot, "manifolds", "07b-geometric-refined.png"),
  geometricKlein: path.join(legacyExplorationRoot, "manifolds", "08-geometric-klein.png"),
  wordmark08d: path.join(explorationRoot, "wordmarks", "08d-footsteps-corrected.png"),
  wordmark09c: path.join(explorationRoot, "wordmarks", "09c-folded-inscription.png"),
  wordmark09d: path.join(explorationRoot, "wordmarks", "09d-single-ribbon.png"),
  wordmark09e: path.join(explorationRoot, "wordmarks", "09e-modular-join.png"),
  wordmark09f: path.join(explorationRoot, "wordmarks", "09f-geometric-corrected.png"),
  backplateOrbit: path.join(explorationRoot, "backplates", "10-seven-manifold-orbit-4x3.png"),
  backplateMobius: path.join(explorationRoot, "backplates", "11-mobius-hero-4x3.png"),
  backplateBoard: path.join(explorationRoot, "backplates", "12-torus-board-4x3.png"),
  backplateFootsteps: path.join(explorationRoot, "backplates", "13-footsteps-atlas-4x3.png")
});

const directions = Object.freeze([
  Object.freeze({ code: "00", id: "selected-sphere-baseline", layout: "classic", hero: "sphere" }),
  Object.freeze({ code: "01", id: "mobius-footsteps", layout: "split", hero: "mobius", wordmarks: ["wordmark08d", "wordmark09d"], path: true }),
  Object.freeze({ code: "02", id: "torus-board-4x4", layout: "board", wordmarks: ["wordmark09e", "wordmark09c"] }),
  Object.freeze({ code: "03", id: "real-game-logo", layout: "icon", hero: "logo", wordmarks: ["wordmark09f", "wordmark09e"] }),
  Object.freeze({ code: "04", id: "geometric-atlas", layout: "split-reverse", hero: "geometricAtlas", wordmarks: ["wordmark09c", "wordmark09e"] }),
  Object.freeze({ code: "05", id: "geometric-klein", layout: "center", hero: "geometricKlein", wordmarks: ["wordmark09e", "wordmark09c"] }),
  Object.freeze({ code: "06", id: "seven-manifold-orbit", layout: "orbit", wordmarks: ["wordmark09d", "wordmark09c"] }),
  Object.freeze({ code: "07", id: "imagegen-seven-orbit", layout: "backplate-center", hero: "backplateOrbit", wordmarks: ["wordmark09e", "wordmark09c"], optional: true }),
  Object.freeze({ code: "08", id: "imagegen-mobius-stage", layout: "backplate-split", hero: "backplateMobius", wordmarks: ["wordmark09f", "wordmark09c"], optional: true }),
  Object.freeze({ code: "09", id: "imagegen-torus-board", layout: "backplate-split", hero: "backplateBoard", wordmarks: ["wordmark08d", "wordmark09e"], optional: true }),
  Object.freeze({ code: "10", id: "imagegen-footsteps-atlas", layout: "backplate-split", hero: "backplateFootsteps", wordmarks: ["wordmark09f", "wordmark09d"], optional: true })
]);

function registerFonts() {
  for (const weight of [600, 700]) {
    const fontPath = path.join(pvRoot, "assets", "fonts", `topo-serif-pv-${weight}.ttf`);
    if (!GlobalFonts.registerFromPath(fontPath, "Topo Serif PV")) throw new Error(`Unable to register font: ${fontPath}`);
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function loadAsset(sourcePath, fullFrame = false) {
  try {
    await fs.access(sourcePath);
    const image = await loadImage(sourcePath);
    if (fullFrame) return Object.freeze({ image, bounds: { x: 0, y: 0, width: image.width, height: image.height }, sourcePath });
    const probe = createCanvas(image.width, image.height);
    const context = probe.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let left = image.width;
    let top = image.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if (pixels[(y * image.width + x) * 4 + 3] <= 10) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    const bounds = right >= left && bottom >= top
      ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
      : { x: 0, y: 0, width: image.width, height: image.height };
    return Object.freeze({ image, bounds, sourcePath });
  } catch {
    return null;
  }
}

function drawBackground(ctx, width, height) {
  Art.drawAppBackdrop(ctx, width, height, { accent: Art.PALETTE.connection });
  Art.drawPaperTexture(ctx, width, height, 0.86);
  const light = ctx.createRadialGradient(width * 0.46, height * 0.38, 0, width * 0.46, height * 0.38, Math.max(width, height) * 0.64);
  light.addColorStop(0, "rgba(255,255,255,0.48)");
  light.addColorStop(0.58, "rgba(255,255,255,0.10)");
  light.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
}

function drawAsset(ctx, asset, box, options = {}) {
  if (!asset) return;
  const { image, bounds } = asset;
  const scale = Math.min(box.width / bounds.width, box.height / bounds.height) * (options.scale || 1);
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  const x = box.x + (box.width - width) * (options.alignX ?? 0.5) + (options.offsetX || 0);
  const y = box.y + (box.height - height) * (options.alignY ?? 0.5) + (options.offsetY || 0);
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  if (options.shadow !== false) {
    ctx.shadowColor = options.shadowColor || "rgba(19,38,33,0.16)";
    ctx.shadowBlur = options.shadowBlur || Math.min(box.width, box.height) * 0.035;
    ctx.shadowOffsetY = options.shadowOffsetY || Math.min(box.width, box.height) * 0.018;
  }
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, x, y, width, height);
  ctx.restore();
}

function drawImageCover(ctx, asset, width, height) {
  const image = asset.image;
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
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

function resolveWordmark(direction, assets) {
  return (direction.wordmarks || []).map((key) => assets[key]).find(Boolean) || null;
}

function drawFallbackWordmark(ctx, box) {
  const size = Math.min(box.height * 0.66, box.width * 0.19);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.ink;
  ctx.font = `700 ${Math.round(size)}px "Topo Serif PV"`;
  trackedText(ctx, "拓扑五子棋", box.x + box.width / 2, box.y + box.height / 2, size * 0.10);
  ctx.restore();
}

function drawWordmark(ctx, direction, assets, box, options = {}) {
  const asset = resolveWordmark(direction, assets);
  if (asset) drawAsset(ctx, asset, box, { shadow: false, scale: options.scale || 1 });
  else drawFallbackWordmark(ctx, box);
}

function drawSubtitle(ctx, width, height, x, y, scale = 1) {
  const size = Math.min(width, height) * 0.073 * scale;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(19,38,33,0.86)";
  ctx.font = `600 ${Math.round(size)}px "Topo Serif PV"`;
  trackedText(ctx, "足迹回环", x, y, size * 0.16);
  ctx.fillStyle = "rgba(63,140,135,0.62)";
  ctx.fillRect(x - size * 0.72, y + size * 0.92, size * 1.44, Math.max(3, size * 0.045));
  ctx.restore();
}

function drawHeroPath(ctx, box) {
  const from = { x: box.x + box.width * 0.19, y: box.y + box.height * 0.63 };
  const control = { x: box.x + box.width * 0.50, y: box.y + box.height * 0.17 };
  const to = { x: box.x + box.width * 0.81, y: box.y + box.height * 0.60 };
  const radius = Math.min(box.width, box.height) * 0.035;
  ctx.save();
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = Math.max(7, radius * 0.38);
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(199,146,68,0.22)";
  ctx.shadowBlur = radius * 0.65;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
  ctx.stroke();
  ctx.shadowColor = "transparent";
  [0.08, 0.29, 0.50, 0.71, 0.92].forEach((amount, index) => {
    const inverse = 1 - amount;
    const x = inverse * inverse * from.x + 2 * inverse * amount * control.x + amount * amount * to.x;
    const y = inverse * inverse * from.y + 2 * inverse * amount * control.y + amount * amount * to.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "rgba(24,31,29,0.24)";
    ctx.shadowBlur = radius * 0.55;
    ctx.shadowOffsetY = radius * 0.28;
    Art.drawStoneFace(ctx, { player: 1, radius, markLastMove: index === 4 });
    ctx.restore();
  });
  ctx.restore();
}

function drawClassic(profile, ctx, assets, direction) {
  const { width, height } = profile;
  const vertical = height > width;
  const minimum = Math.min(width, height);
  if (vertical) {
    const heroBox = { x: width * 0.14, y: height * 0.06, width: width * 0.72, height: height * 0.53 };
    drawAsset(ctx, assets[direction.hero], heroBox, { scale: 0.96, alpha: 0.96 });
    drawHeroPath(ctx, heroBox);
    drawFallbackWordmark(ctx, { x: width * 0.08, y: height * 0.65, width: width * 0.84, height: height * 0.14 });
    drawSubtitle(ctx, width, height, width * 0.5, height * 0.82, 1.02);
    return;
  }
  const heroBox = { x: width * 0.52, y: height * 0.12, width: width * 0.40, height: height * 0.75 };
  drawAsset(ctx, assets[direction.hero], heroBox, { scale: 0.98, alpha: 0.96 });
  drawHeroPath(ctx, heroBox);
  const textX = width * 0.285;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = Art.PALETTE.ink;
  ctx.font = `700 ${Math.round(minimum * 0.105)}px "Topo Serif PV"`;
  trackedText(ctx, "拓扑五子棋", textX, height * 0.44, minimum * 0.018);
  ctx.restore();
  drawSubtitle(ctx, width, height, textX, height * 0.59, 0.94);
}

function drawSplit(profile, ctx, assets, direction) {
  const { width, height } = profile;
  const vertical = height > width;
  const reverse = direction.layout === "split-reverse";
  if (vertical) {
    const heroBox = { x: width * 0.08, y: height * 0.05, width: width * 0.84, height: height * 0.57 };
    drawAsset(ctx, assets[direction.hero], heroBox, { scale: 0.95, alpha: 0.97 });
    if (direction.path) drawHeroPath(ctx, heroBox);
    drawWordmark(ctx, direction, assets, { x: width * 0.06, y: height * 0.65, width: width * 0.88, height: height * 0.14 });
    drawSubtitle(ctx, width, height, width * 0.5, height * 0.84, 1.0);
    return;
  }
  const heroBox = reverse
    ? { x: width * 0.06, y: height * 0.09, width: width * 0.45, height: height * 0.79 }
    : { x: width * 0.52, y: height * 0.09, width: width * 0.43, height: height * 0.79 };
  const wordBox = reverse
    ? { x: width * 0.54, y: height * 0.31, width: width * 0.39, height: height * 0.20 }
    : { x: width * 0.06, y: height * 0.31, width: width * 0.42, height: height * 0.20 };
  drawAsset(ctx, assets[direction.hero], heroBox, { scale: 0.96, alpha: 0.97 });
  if (direction.path) drawHeroPath(ctx, heroBox);
  drawWordmark(ctx, direction, assets, wordBox);
  drawSubtitle(ctx, width, height, wordBox.x + wordBox.width / 2, height * 0.63, 0.92);
}

function drawCenter(profile, ctx, assets, direction) {
  const { width, height } = profile;
  const vertical = height > width;
  const heroBox = vertical
    ? { x: width * 0.08, y: height * 0.05, width: width * 0.84, height: height * 0.58 }
    : { x: width * 0.19, y: height * 0.04, width: width * 0.62, height: height * 0.64 };
  drawAsset(ctx, assets[direction.hero], heroBox, { scale: 0.96, alpha: 0.98 });
  const wordBox = vertical
    ? { x: width * 0.06, y: height * 0.67, width: width * 0.88, height: height * 0.14 }
    : { x: width * 0.24, y: height * 0.65, width: width * 0.52, height: height * 0.15 };
  drawWordmark(ctx, direction, assets, wordBox);
  drawSubtitle(ctx, width, height, width * 0.5, vertical ? height * 0.85 : height * 0.85, vertical ? 1.0 : 0.90);
}

function drawIcon(profile, ctx, assets, direction) {
  const { width, height } = profile;
  const vertical = height > width;
  if (vertical) {
    drawAsset(ctx, assets[direction.hero], { x: width * 0.17, y: height * 0.08, width: width * 0.66, height: height * 0.50 }, { scale: 0.88 });
    drawWordmark(ctx, direction, assets, { x: width * 0.06, y: height * 0.65, width: width * 0.88, height: height * 0.14 });
    drawSubtitle(ctx, width, height, width * 0.5, height * 0.84, 1.0);
    return;
  }
  drawAsset(ctx, assets[direction.hero], { x: width * 0.56, y: height * 0.13, width: width * 0.36, height: height * 0.70 }, { scale: 0.90 });
  const wordBox = { x: width * 0.06, y: height * 0.31, width: width * 0.44, height: height * 0.20 };
  drawWordmark(ctx, direction, assets, wordBox);
  drawSubtitle(ctx, width, height, wordBox.x + wordBox.width / 2, height * 0.63, 0.92);
}

function drawTorusBoard(ctx, box) {
  const size = Math.min(box.width, box.height) * 0.82;
  const left = box.x + (box.width - size) / 2;
  const top = box.y + (box.height - size) / 2;
  const stage = { left: left - size * 0.09, top: top - size * 0.09, right: left + size * 1.09, bottom: top + size * 1.09 };
  Art.drawBoardStage(ctx, stage, 0.94);
  const layout = {
    left,
    top,
    right: left + size,
    bottom: top + size,
    cellX: size / 4,
    cellY: size / 4,
    cell: size / 4,
    artScale: size / 560
  };
  ctx.save();
  ctx.strokeStyle = "rgba(79,77,70,0.55)";
  ctx.lineWidth = Math.max(3, size * 0.0065);
  for (let index = 0; index < 5; index += 1) {
    const amount = index / 4;
    ctx.beginPath();
    ctx.moveTo(left + size * amount, top);
    ctx.lineTo(left + size * amount, top + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(left, top + size * amount);
    ctx.lineTo(left + size, top + size * amount);
    ctx.stroke();
  }
  ctx.restore();
  Art.drawTopologyRails(ctx, { layout, type: "torus", xConnection: "same", yConnection: "same", pulseX: 0.46, pulseY: 0.46, alpha: 0.82 });

  const point = (x, y) => ({ x: left + x * layout.cellX, y: top + y * layout.cellY });
  const pathSegments = [
    [point(2, 1), point(1, 0)],
    [point(1, 0), point(0.50, -0.50)],
    [point(0.50, 4.50), point(0, 4)],
    [point(0, 4), point(-0.50, 3.50)],
    [point(4.50, 3.50), point(4, 3)],
    [point(4, 3), point(3, 2)],
    [point(3, 2), point(2, 1)]
  ];
  ctx.save();
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = Math.max(7, size * 0.018);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(199,146,68,0.24)";
  ctx.shadowBlur = size * 0.026;
  pathSegments.forEach(([from, to]) => {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  });
  ctx.restore();
  [[2, 1], [1, 0], [0, 4], [4, 3], [3, 2]].forEach(([x, y], index) => {
    const position = point(x, y);
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.shadowColor = "rgba(24,31,29,0.24)";
    ctx.shadowBlur = size * 0.022;
    ctx.shadowOffsetY = size * 0.009;
    Art.drawStoneFace(ctx, { player: 1, radius: size * 0.050, markLastMove: index === 4 });
    ctx.restore();
  });
}

function drawBoard(profile, ctx, assets, direction) {
  const { width, height } = profile;
  const vertical = height > width;
  if (vertical) {
    drawTorusBoard(ctx, { x: width * 0.08, y: height * 0.06, width: width * 0.84, height: height * 0.57 });
    drawWordmark(ctx, direction, assets, { x: width * 0.06, y: height * 0.66, width: width * 0.88, height: height * 0.14 });
    drawSubtitle(ctx, width, height, width * 0.5, height * 0.85, 1.0);
    return;
  }
  drawTorusBoard(ctx, { x: width * 0.51, y: height * 0.08, width: width * 0.44, height: height * 0.82 });
  const wordBox = { x: width * 0.06, y: height * 0.31, width: width * 0.42, height: height * 0.20 };
  drawWordmark(ctx, direction, assets, wordBox);
  drawSubtitle(ctx, width, height, wordBox.x + wordBox.width / 2, height * 0.63, 0.92);
}

function orbitPlacements(vertical) {
  if (vertical) {
    return [
      ["plane", 0.07, 0.04, 0.25, 0.14, 0.44],
      ["cylinder", 0.68, 0.04, 0.25, 0.14, 0.58],
      ["torus", 0.35, 0.15, 0.30, 0.16, 0.70],
      ["klein", 0.03, 0.53, 0.22, 0.18, 0.82],
      ["mobius", 0.75, 0.53, 0.22, 0.18, 0.82],
      ["projective", 0.14, 0.73, 0.25, 0.16, 0.60],
      ["sphere", 0.61, 0.73, 0.25, 0.16, 0.60]
    ];
  }
  return [
    ["plane", 0.04, 0.06, 0.20, 0.24, 0.44],
    ["cylinder", 0.25, 0.02, 0.18, 0.23, 0.58],
    ["torus", 0.71, 0.03, 0.22, 0.24, 0.70],
    ["klein", 0.01, 0.58, 0.24, 0.31, 0.82],
    ["mobius", 0.76, 0.56, 0.22, 0.32, 0.82],
    ["projective", 0.27, 0.73, 0.18, 0.20, 0.58],
    ["sphere", 0.58, 0.73, 0.18, 0.20, 0.58]
  ];
}

function drawOrbit(profile, ctx, assets, direction) {
  const { width, height } = profile;
  const vertical = height > width;
  orbitPlacements(vertical).forEach(([key, x, y, w, h, alpha], index) => {
    drawAsset(ctx, assets[key], { x: width * x, y: height * y, width: width * w, height: height * h }, {
      scale: index === 3 || index === 4 ? 1.03 : 0.94,
      alpha,
      shadowBlur: Math.min(width, height) * (index === 3 || index === 4 ? 0.028 : 0.016)
    });
  });
  if (vertical) {
    drawWordmark(ctx, direction, assets, { x: width * 0.08, y: height * 0.35, width: width * 0.84, height: height * 0.13 });
    drawSubtitle(ctx, width, height, width * 0.5, height * 0.50, 0.90);
  } else {
    drawWordmark(ctx, direction, assets, { x: width * 0.21, y: height * 0.35, width: width * 0.58, height: height * 0.18 });
    drawSubtitle(ctx, width, height, width * 0.5, height * 0.60, 0.88);
  }
}

function drawBackplate(profile, ctx, assets, direction) {
  const { width, height } = profile;
  const vertical = height > width;
  const center = direction.layout === "backplate-center";
  const containSource = vertical || (center && profile.id === "16x9");
  if (containSource) {
    drawBackground(ctx, width, height);
    const sourceBox = vertical
      ? { x: width * 0.03, y: height * 0.04, width: width * 0.94, height: height * 0.57 }
      : { x: width * 0.11, y: height * 0.02, width: width * 0.78, height: height * 0.96 };
    drawAsset(ctx, assets[direction.hero], sourceBox, {
      scale: 0.98,
      shadow: false
    });
  } else {
    drawImageCover(ctx, assets[direction.hero], width, height);
  }
  const haloX = center || vertical ? width * 0.5 : width * 0.29;
  const haloY = vertical ? height * 0.72 : center ? height * 0.50 : height * 0.48;
  const halo = ctx.createRadialGradient(haloX, haloY, 0, haloX, haloY, Math.max(width, height) * 0.31);
  halo.addColorStop(0, "rgba(248,245,236,0.94)");
  halo.addColorStop(0.56, "rgba(248,245,236,0.64)");
  halo.addColorStop(1, "rgba(248,245,236,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);
  const wordBox = center
    ? vertical
      ? { x: width * 0.07, y: height * 0.67, width: width * 0.86, height: height * 0.14 }
      : { x: width * 0.20, y: height * 0.39, width: width * 0.60, height: height * 0.17 }
    : vertical
      ? { x: width * 0.06, y: height * 0.66, width: width * 0.88, height: height * 0.14 }
      : { x: width * 0.06, y: height * 0.36, width: width * 0.44, height: height * 0.18 };
  drawWordmark(ctx, direction, assets, wordBox);
  drawSubtitle(ctx, width, height, wordBox.x + wordBox.width / 2, vertical ? height * 0.85 : center ? height * 0.63 : height * 0.63, vertical ? 0.96 : 0.88);
}

function drawCover(profile, direction, assets) {
  const canvas = createCanvas(profile.width, profile.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!direction.layout.startsWith("backplate")) drawBackground(ctx, profile.width, profile.height);
  if (direction.layout === "classic") drawClassic(profile, ctx, assets, direction);
  else if (direction.layout === "split" || direction.layout === "split-reverse") drawSplit(profile, ctx, assets, direction);
  else if (direction.layout === "center") drawCenter(profile, ctx, assets, direction);
  else if (direction.layout === "icon") drawIcon(profile, ctx, assets, direction);
  else if (direction.layout === "board") drawBoard(profile, ctx, assets, direction);
  else if (direction.layout === "orbit") drawOrbit(profile, ctx, assets, direction);
  else if (direction.layout.startsWith("backplate")) drawBackplate(profile, ctx, assets, direction);
  return canvas;
}

function renderContactSheet(entries, profile) {
  const columns = profile.id === "3x4" ? 4 : 3;
  const previewWidth = profile.id === "3x4" ? 240 : 480;
  const previewHeight = Math.round(previewWidth * profile.height / profile.width);
  const rows = Math.ceil(entries.length / columns);
  const gutter = 24;
  const labelHeight = 40;
  const canvas = createCanvas(columns * previewWidth + (columns + 1) * gutter, rows * (previewHeight + labelHeight) + (rows + 1) * gutter);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "20px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.ink;
  entries.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gutter + column * (previewWidth + gutter);
    const y = gutter + row * (previewHeight + labelHeight + gutter);
    ctx.drawImage(entry.canvas, x, y, previewWidth, previewHeight);
    ctx.fillText(`${entry.direction.code} ${entry.direction.id}`, x + 3, y + previewHeight + labelHeight / 2);
  });
  return canvas;
}

function thumbnailSize(profile) {
  if (profile.id === "16x9") return { width: 160, height: 90 };
  if (profile.id === "4x3") return { width: 160, height: 120 };
  return { width: 135, height: 180 };
}

function renderThumbnailProof(entries, profile) {
  const size = thumbnailSize(profile);
  const columns = profile.id === "3x4" ? 5 : 4;
  const rows = Math.ceil(entries.length / columns);
  const gutter = 20;
  const labelHeight = 28;
  const canvas = createCanvas(columns * size.width + (columns + 1) * gutter, rows * (size.height + labelHeight) + (rows + 1) * gutter);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "16px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.ink;
  entries.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gutter + column * (size.width + gutter);
    const y = gutter + row * (size.height + labelHeight + gutter);
    ctx.drawImage(entry.canvas, x, y, size.width, size.height);
    ctx.fillText(`${entry.direction.code} ${entry.direction.id}`, x, y + size.height + labelHeight / 2);
  });
  return canvas;
}

function renderWordmarkSheet(assets) {
  const candidates = [
    ["08D", "footsteps-corrected", "wordmark08d"],
    ["09C", "folded-inscription", "wordmark09c"],
    ["09D", "single-ribbon", "wordmark09d"],
    ["09E", "modular-join", "wordmark09e"],
    ["09F", "geometric-corrected", "wordmark09f"]
  ].filter(([, , key]) => assets[key]);
  const columns = 2;
  const cardWidth = 760;
  const cardHeight = 300;
  const rows = Math.ceil(candidates.length / columns);
  const gutter = 26;
  const labelHeight = 38;
  const canvas = createCanvas(columns * cardWidth + (columns + 1) * gutter, rows * (cardHeight + labelHeight) + (rows + 1) * gutter);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "20px sans-serif";
  ctx.textBaseline = "middle";
  candidates.forEach(([code, label, key], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gutter + column * (cardWidth + gutter);
    const y = gutter + row * (cardHeight + labelHeight + gutter);
    ctx.fillStyle = palette.paperBright;
    ctx.fillRect(x, y, cardWidth, cardHeight);
    drawAsset(ctx, assets[key], { x: x + 28, y: y + 36, width: cardWidth - 56, height: cardHeight - 72 }, { shadow: false });
    ctx.fillStyle = palette.ink;
    ctx.fillText(`${code} ${label}`, x + 4, y + cardHeight + labelHeight / 2);
  });
  return canvas;
}

async function main() {
  registerFonts();
  await Promise.all([fs.mkdir(outputDirectory, { recursive: true }), fs.mkdir(artifactDirectory, { recursive: true })]);
  const entries = await Promise.all(Object.entries(assetPaths).map(async ([key, sourcePath]) => {
    const fullFrame = key.startsWith("backplate");
    return [key, await loadAsset(sourcePath, fullFrame)];
  }));
  const assets = Object.fromEntries(entries);
  const activeDirections = directions.filter((direction) => !direction.optional || assets[direction.hero]);
  const exports = [];
  for (const profile of profiles) {
    const rendered = [];
    for (const direction of activeDirections) {
      const canvas = drawCover(profile, direction, assets);
      const buffer = canvas.toBuffer("image/png");
      const filename = `${direction.code}-${direction.id}-${profile.id}.png`;
      await fs.writeFile(path.join(outputDirectory, filename), buffer);
      rendered.push({ direction, canvas });
      exports.push({ direction: direction.id, profile: profile.id, file: filename, width: profile.width, height: profile.height, bytes: buffer.length, sha256: sha256(buffer) });
    }
    const contact = renderContactSheet(rendered, profile).toBuffer("image/png");
    const thumbnail = renderThumbnailProof(rendered, profile).toBuffer("image/png");
    await fs.writeFile(path.join(outputDirectory, `contact-sheet-${profile.id}.png`), contact);
    await fs.writeFile(path.join(outputDirectory, `thumbnail-proof-${profile.id}.png`), thumbnail);
    await fs.writeFile(path.join(artifactDirectory, `qa-chapter-teaser-cover-selection-v4-${profile.id}.png`), contact);
    await fs.writeFile(path.join(artifactDirectory, `qa-chapter-teaser-cover-selection-v4-thumbnail-${profile.id}.png`), thumbnail);
  }
  const wordmarkSheet = renderWordmarkSheet(assets).toBuffer("image/png");
  await fs.writeFile(path.join(outputDirectory, "wordmark-candidates.png"), wordmarkSheet);
  await fs.writeFile(path.join(artifactDirectory, "qa-chapter-teaser-wordmark-selection-v4.png"), wordmarkSheet);
  await fs.writeFile(path.join(outputDirectory, "delivery-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    title: "《拓扑五子棋》章节预告PV-「足迹回环」",
    exactCoverText: ["拓扑五子棋", "足迹回环"],
    contentPolicy: "large exact title and subtitle only; no small cover copy",
    visualSystem: "warm paper, deep green, ivory, restrained gold, game topology assets and generated backplates",
    directions: activeDirections.map(({ code, id }) => ({ code, id })),
    exports
  }, null, 2)}\n`, "utf8");
  process.stdout.write(`Cover selection exploration written to ${outputDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

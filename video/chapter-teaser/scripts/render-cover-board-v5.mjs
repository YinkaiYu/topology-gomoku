import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createCanvas } = require("@napi-rs/canvas");
const Art = require("../../../app/assets/topology-art.js");
const Engine = require("../../../app/assets/topology.js");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pvRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(pvRoot, "../..");
const defaultOutputDirectory = path.join(repositoryRoot, ".tmp", "chapter-teaser", "cover-board-v5");

export const COVER_BOARD_PROFILES = Object.freeze([
  Object.freeze({ id: "4x3", label: "4:3", width: 1600, height: 1200 }),
  Object.freeze({ id: "16x9", label: "16:9", width: 1920, height: 1080 }),
  Object.freeze({ id: "3x4", label: "3:4", width: 1080, height: 1440 })
]);

const torusRules = Engine.createRules({ type: "torus", width: 5, height: 5, target: 5 });
const torusPath = Engine.tracePath(torusRules, Engine.toCell(torusRules, 2, 1), 5, 5);
if (!torusPath) throw new Error("Unable to derive the v5 torus cover path from the live game rules");
const torusPathSeamMask = torusPath.seams.reduce((mask, seam) => mask | seam, 0);
if ((torusPathSeamMask & (Engine.SEAM_X | Engine.SEAM_Y)) !== (Engine.SEAM_X | Engine.SEAM_Y)) {
  throw new Error("The v5 torus cover path must cross both periodic boundary pairs");
}
const torusPathPoints = torusPath.cells.map((cell) => {
  const point = Engine.toPoint(torusRules, cell);
  return Object.freeze([point.x, point.y]);
});

export const COVER_BOARD_SPEC = Object.freeze({
  projection: "orthographic",
  cells: Object.freeze({ columns: 4, rows: 4 }),
  gridLines: Object.freeze({ vertical: 5, horizontal: 5 }),
  intersections: 25,
  stoneCount: 5,
  auxiliaryCircleCount: 0,
  connections: Object.freeze({ x: "same", y: "same" }),
  rulePath: Object.freeze({
    type: torusRules.type,
    width: torusRules.width,
    height: torusRules.height,
    target: torusRules.target,
    start: Object.freeze([2, 1]),
    direction: 5,
    seamMask: torusPathSeamMask
  }),
  stones: Object.freeze(torusPathPoints)
});

const palette = Object.freeze({
  ink: Art.PALETTE.ink,
  inkDeep: "#132621",
  teal: Art.PALETTE.connection,
  gold: Art.PALETTE.twist,
  goldLight: "#d7aa61",
  paper: Art.PALETTE.paper,
  paperBright: Art.PALETTE.card
});

const layoutPresets = Object.freeze({
  "4x3": Object.freeze({
    board: Object.freeze({ left: 0.455, top: 0.18, sizeBy: "height", size: 0.64 }),
    title: Object.freeze({ x: 0.05, y: 0.33, width: 0.525, height: 0.24 }),
    overlapAxis: "x"
  }),
  "16x9": Object.freeze({
    board: Object.freeze({ left: 0.525, top: 0.14, sizeBy: "height", size: 0.72 }),
    title: Object.freeze({ x: 0.05, y: 0.32, width: 0.55, height: 0.26 }),
    overlapAxis: "x"
  }),
  "3x4": Object.freeze({
    board: Object.freeze({ left: 0.16, top: 0.12, sizeBy: "width", size: 0.68 }),
    title: Object.freeze({ x: 0.06, yFromBoard: 0.78, width: 0.88, height: 0.18 }),
    overlapAxis: "y"
  })
});

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function roundGeometry(value) {
  return Math.round(value * 1000) / 1000;
}

function normalizeProfile(profile) {
  if (!profile || !Number.isFinite(profile.width) || !Number.isFinite(profile.height)) {
    throw new Error("profile must include finite width and height");
  }
  const matched = COVER_BOARD_PROFILES.find(({ id }) => id === profile.id);
  const id = matched ? matched.id : profile.height > profile.width ? "3x4" : profile.width / profile.height > 1.5 ? "16x9" : "4x3";
  return { id, label: profile.label || id, width: profile.width, height: profile.height };
}

function rectangleFromFractions(profile, source) {
  return {
    x: profile.width * source.x,
    y: profile.height * source.y,
    width: profile.width * source.width,
    height: profile.height * source.height
  };
}

function overlapFraction(boardRect, titleRect, axis) {
  if (axis === "y") {
    const amount = Math.max(0, Math.min(boardRect.y + boardRect.height, titleRect.y + titleRect.height) - Math.max(boardRect.y, titleRect.y));
    return amount / boardRect.height;
  }
  const amount = Math.max(0, Math.min(boardRect.x + boardRect.width, titleRect.x + titleRect.width) - Math.max(boardRect.x, titleRect.x));
  return amount / boardRect.width;
}

export function getCoverBoardLayout(profileInput, overrides = {}) {
  const profile = normalizeProfile(profileInput);
  const preset = layoutPresets[profile.id];
  const baseSize = preset.board.sizeBy === "width" ? profile.width : profile.height;
  const size = Number.isFinite(overrides.size) ? overrides.size : baseSize * preset.board.size;
  const left = Number.isFinite(overrides.left) ? overrides.left : profile.width * preset.board.left;
  const top = Number.isFinite(overrides.top) ? overrides.top : profile.height * preset.board.top;
  const boardRect = { x: left, y: top, width: size, height: size };
  const titleSource = preset.title;
  const titleRect = overrides.titleRect || (titleSource.yFromBoard == null
    ? rectangleFromFractions(profile, titleSource)
    : {
        x: profile.width * titleSource.x,
        y: top + size * titleSource.yFromBoard,
        width: profile.width * titleSource.width,
        height: profile.height * titleSource.height
      });
  const stageMargin = size * 0.085;
  const stageRect = {
    x: left - stageMargin,
    y: top - stageMargin,
    width: size + stageMargin * 2,
    height: size + stageMargin * 2
  };
  const layout = {
    profile,
    boardRect,
    stageRect,
    titleRect,
    titleOverlapAxis: preset.overlapAxis,
    titleOverlapFraction: overlapFraction(boardRect, titleRect, preset.overlapAxis),
    cell: size / COVER_BOARD_SPEC.cells.columns,
    artScale: size / 560
  };
  validateCoverBoardLayout(layout);
  return layout;
}

export function validateCoverBoardLayout(layout) {
  const { profile, boardRect, titleOverlapFraction, cell } = layout;
  if (Math.abs(boardRect.width - boardRect.height) > 1e-6 || Math.abs(cell * 4 - boardRect.width) > 1e-6) {
    throw new Error(`${profile.id}: board cells are not mathematically square`);
  }
  if (titleOverlapFraction < 0.10 - 1e-6 || titleOverlapFraction > 0.25 + 1e-6) {
    throw new Error(`${profile.id}: title overlap ${titleOverlapFraction.toFixed(3)} is outside 10–25%`);
  }
  const pathOverflow = boardRect.width * 0.13;
  if (
    boardRect.x - pathOverflow < -1 ||
    boardRect.y - pathOverflow < -1 ||
    boardRect.x + boardRect.width + pathOverflow > profile.width + 1 ||
    boardRect.y + boardRect.height + pathOverflow > profile.height + 1
  ) {
    throw new Error(`${profile.id}: board path or shadow would be clipped`);
  }
  if (
    COVER_BOARD_SPEC.gridLines.vertical !== 5 ||
    COVER_BOARD_SPEC.gridLines.horizontal !== 5 ||
    COVER_BOARD_SPEC.stones.length !== COVER_BOARD_SPEC.stoneCount ||
    COVER_BOARD_SPEC.auxiliaryCircleCount !== 0
  ) {
    throw new Error("cover board specification is internally inconsistent");
  }
  return true;
}

function drawPaperFibres(ctx, width, height) {
  ctx.save();
  ctx.lineWidth = Math.max(0.5, Math.min(width, height) * 0.00042);
  for (let index = 0; index < 42; index += 1) {
    const x = (Math.sin(index * 41.17 + 0.9) * 0.5 + 0.5) * width;
    const y = (Math.sin(index * 73.31 + 2.1) * 0.5 + 0.5) * height;
    const length = Math.min(width, height) * (0.008 + (index % 5) * 0.0022);
    ctx.strokeStyle = index % 3 === 0 ? "rgba(63,140,135,0.018)" : "rgba(81,75,65,0.020)";
    ctx.beginPath();
    ctx.moveTo(x - length * 0.5, y);
    ctx.quadraticCurveTo(x, y + Math.sin(index) * 0.7, x + length * 0.5, y + Math.cos(index) * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawCoverBoardBackdrop(ctx, profileInput, placement = {}) {
  const profile = normalizeProfile(profileInput);
  const layout = getCoverBoardLayout(profile, placement);
  const { width, height } = profile;
  Art.drawAppBackdrop(ctx, width, height, { accent: palette.teal });
  Art.drawPaperTexture(ctx, width, height, 0.92);
  drawPaperFibres(ctx, width, height);

  const quietLight = ctx.createRadialGradient(width * 0.14, height * 0.17, 0, width * 0.14, height * 0.17, Math.max(width, height) * 0.50);
  quietLight.addColorStop(0, "rgba(255,255,255,0.62)");
  quietLight.addColorStop(0.68, "rgba(255,255,255,0.10)");
  quietLight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = quietLight;
  ctx.fillRect(0, 0, width, height);

  const boardGlow = ctx.createRadialGradient(
    layout.boardRect.x + layout.boardRect.width * 0.54,
    layout.boardRect.y + layout.boardRect.height * 0.52,
    0,
    layout.boardRect.x + layout.boardRect.width * 0.54,
    layout.boardRect.y + layout.boardRect.height * 0.52,
    layout.boardRect.width * 0.83
  );
  boardGlow.addColorStop(0, "rgba(255,255,255,0.38)");
  boardGlow.addColorStop(0.55, "rgba(63,140,135,0.035)");
  boardGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = boardGlow;
  ctx.fillRect(0, 0, width, height);
  return layout;
}

function drawBoardHalo(ctx, boardRect) {
  const centerX = boardRect.x + boardRect.width * 0.52;
  const centerY = boardRect.y + boardRect.height * 0.57;
  const halo = ctx.createRadialGradient(centerX, centerY, boardRect.width * 0.15, centerX, centerY, boardRect.width * 0.76);
  halo.addColorStop(0, "rgba(33,48,44,0.075)");
  halo.addColorStop(0.48, "rgba(199,146,68,0.025)");
  halo.addColorStop(1, "rgba(33,48,44,0)");
  ctx.save();
  ctx.fillStyle = halo;
  ctx.fillRect(
    boardRect.x - boardRect.width * 0.35,
    boardRect.y - boardRect.height * 0.30,
    boardRect.width * 1.70,
    boardRect.height * 1.70
  );
  ctx.restore();
}

function drawBoardSurface(ctx, boardRect) {
  const { x, y, width, height } = boardRect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  const surface = ctx.createLinearGradient(x, y, x + width, y + height);
  surface.addColorStop(0, "rgba(255,255,255,0.46)");
  surface.addColorStop(0.46, "rgba(250,248,241,0.29)");
  surface.addColorStop(1, "rgba(215,236,226,0.17)");
  ctx.fillStyle = surface;
  ctx.fillRect(x, y, width, height);

  const specular = ctx.createRadialGradient(x + width * 0.20, y + height * 0.12, 0, x + width * 0.20, y + height * 0.12, width * 0.82);
  specular.addColorStop(0, "rgba(255,255,255,0.42)");
  specular.addColorStop(0.42, "rgba(255,255,255,0.11)");
  specular.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = specular;
  ctx.fillRect(x, y, width, height);

  const lowerTint = ctx.createLinearGradient(x, y + height * 0.55, x + width, y + height);
  lowerTint.addColorStop(0, "rgba(63,140,135,0)");
  lowerTint.addColorStop(1, "rgba(63,140,135,0.035)");
  ctx.fillStyle = lowerTint;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function drawSquareGrid(ctx, layout) {
  const { boardRect } = layout;
  const { x, y, width, height } = boardRect;
  ctx.save();
  ctx.lineCap = "square";
  for (let index = 0; index < COVER_BOARD_SPEC.gridLines.vertical; index += 1) {
    const amount = index / COVER_BOARD_SPEC.cells.columns;
    const outer = index === 0 || index === COVER_BOARD_SPEC.gridLines.vertical - 1;
    ctx.strokeStyle = outer ? "rgba(33,48,44,0.62)" : "rgba(33,48,44,0.45)";
    ctx.lineWidth = Math.max(3.2, width * (outer ? 0.0064 : 0.0047));
    ctx.beginPath();
    ctx.moveTo(x + width * amount, y);
    ctx.lineTo(x + width * amount, y + height);
    ctx.stroke();
  }
  for (let index = 0; index < COVER_BOARD_SPEC.gridLines.horizontal; index += 1) {
    const amount = index / COVER_BOARD_SPEC.cells.rows;
    const outer = index === 0 || index === COVER_BOARD_SPEC.gridLines.horizontal - 1;
    ctx.strokeStyle = outer ? "rgba(33,48,44,0.62)" : "rgba(33,48,44,0.45)";
    ctx.lineWidth = Math.max(3.2, height * (outer ? 0.0064 : 0.0047));
    ctx.beginPath();
    ctx.moveTo(x, y + height * amount);
    ctx.lineTo(x + width, y + height * amount);
    ctx.stroke();
  }
  ctx.restore();
}

function pointOnBoard(layout, x, y) {
  return {
    x: layout.boardRect.x + x * layout.cell,
    y: layout.boardRect.y + y * layout.cell
  };
}

function getPathSegments(layout) {
  const point = (x, y) => pointOnBoard(layout, x, y);
  return [
    [point(2, 1), point(1, 0)],
    [point(1, 0), point(0.50, -0.50)],
    [point(0.50, 4.50), point(0, 4)],
    [point(0, 4), point(-0.50, 3.50)],
    [point(4.50, 3.50), point(4, 3)],
    [point(4, 3), point(3, 2)],
    [point(3, 2), point(2, 1)]
  ];
}

function strokePathSegments(ctx, segments, style, width, shadowBlur = 0) {
  ctx.save();
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (shadowBlur > 0) {
    ctx.shadowColor = "rgba(199,146,68,0.24)";
    ctx.shadowBlur = shadowBlur;
  }
  segments.forEach(([from, to]) => {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  });
  ctx.restore();
}

function drawFiveStonePath(ctx, layout) {
  const segments = getPathSegments(layout);
  strokePathSegments(ctx, segments, "rgba(199,146,68,0.10)", layout.boardRect.width * 0.034, layout.boardRect.width * 0.020);
  const gold = ctx.createLinearGradient(
    layout.boardRect.x,
    layout.boardRect.y,
    layout.boardRect.x + layout.boardRect.width,
    layout.boardRect.y + layout.boardRect.height
  );
  gold.addColorStop(0, palette.goldLight);
  gold.addColorStop(0.48, palette.gold);
  gold.addColorStop(1, "#b67c32");
  strokePathSegments(ctx, segments, gold, Math.max(7, layout.boardRect.width * 0.0165), layout.boardRect.width * 0.014);
  strokePathSegments(ctx, segments, "rgba(255,246,219,0.22)", Math.max(1.5, layout.boardRect.width * 0.0031));
}

function drawFiveStones(ctx, layout) {
  const radius = layout.boardRect.width * 0.0475;
  COVER_BOARD_SPEC.stones.forEach(([x, y]) => {
    const position = pointOnBoard(layout, x, y);
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.shadowColor = "rgba(19,38,33,0.28)";
    ctx.shadowBlur = layout.boardRect.width * 0.026;
    ctx.shadowOffsetY = layout.boardRect.width * 0.010;
    Art.drawStoneFace(ctx, { player: 1, radius, markLastMove: false });
    ctx.restore();
  });
}

export function drawCoverBoard(ctx, profileInput, placement = {}) {
  const layout = getCoverBoardLayout(profileInput, placement);
  const { boardRect, stageRect } = layout;
  drawBoardHalo(ctx, boardRect);
  Art.drawBoardStage(ctx, {
    left: stageRect.x,
    top: stageRect.y,
    right: stageRect.x + stageRect.width,
    bottom: stageRect.y + stageRect.height
  }, placement.stageAlpha == null ? 0.96 : clamp(placement.stageAlpha, 0, 1));
  drawBoardSurface(ctx, boardRect);
  drawSquareGrid(ctx, layout);

  Art.drawTopologyRails(ctx, {
    layout: {
      left: boardRect.x,
      top: boardRect.y,
      right: boardRect.x + boardRect.width,
      bottom: boardRect.y + boardRect.height,
      cellX: layout.cell,
      cellY: layout.cell,
      cell: layout.cell,
      artScale: layout.artScale
    },
    type: "torus",
    xConnection: COVER_BOARD_SPEC.connections.x,
    yConnection: COVER_BOARD_SPEC.connections.y,
    pulseX: placement.railPulse == null ? 0.50 : clamp(placement.railPulse, 0, 1),
    pulseY: placement.railPulse == null ? 0.50 : clamp(placement.railPulse, 0, 1),
    alpha: placement.railAlpha == null ? 0.88 : clamp(placement.railAlpha, 0, 1)
  });

  drawFiveStonePath(ctx, layout);
  drawFiveStones(ctx, layout);
  return layout;
}

export function renderCoverBoard(profileInput, placement = {}) {
  const profile = normalizeProfile(profileInput);
  const canvas = createCanvas(profile.width, profile.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  drawCoverBoardBackdrop(ctx, profile, placement);
  const layout = drawCoverBoard(ctx, profile, placement);
  return { canvas, layout };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function thumbnailSize(profile) {
  if (profile.id === "16x9") return { width: 160, height: 90 };
  if (profile.id === "4x3") return { width: 160, height: 120 };
  return { width: 135, height: 180 };
}

function serializeRectangle(rect) {
  return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, roundGeometry(value)]));
}

function renderThumbnailProof(entries) {
  const padding = 22;
  const labelHeight = 32;
  const cardWidth = 188;
  const height = 236;
  const canvas = createCanvas(padding * 2 + cardWidth * entries.length, height);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.inkDeep;
  ctx.font = "600 16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  entries.forEach((entry, index) => {
    const thumb = thumbnailSize(entry.profile);
    const x = padding + index * cardWidth + (cardWidth - thumb.width) / 2;
    const y = padding + (180 - thumb.height) / 2;
    ctx.drawImage(entry.canvas, x, y, thumb.width, thumb.height);
    ctx.fillText(entry.profile.label, padding + index * cardWidth + cardWidth / 2, height - labelHeight / 2 - 3);
  });
  return canvas;
}

function parseOutputDirectory(argv) {
  const outputIndex = argv.indexOf("--output");
  if (outputIndex < 0) return defaultOutputDirectory;
  const value = argv[outputIndex + 1];
  if (!value) throw new Error("--output requires a directory path");
  return path.resolve(process.cwd(), value);
}

export async function renderCoverBoardPreviews(options = {}) {
  const outputDirectory = options.outputDirectory || defaultOutputDirectory;
  await fs.mkdir(outputDirectory, { recursive: true });
  const entries = [];
  const exports = [];
  for (const profile of COVER_BOARD_PROFILES) {
    const { canvas, layout } = renderCoverBoard(profile);
    const buffer = canvas.toBuffer("image/png");
    const filename = `board-only-${profile.id}.png`;
    await fs.writeFile(path.join(outputDirectory, filename), buffer);
    const thumbnail = thumbnailSize(profile);
    const thumbnailCanvas = createCanvas(thumbnail.width, thumbnail.height);
    thumbnailCanvas.getContext("2d", { alpha: false }).drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
    const thumbnailFilename = `thumbnail-${profile.id}.png`;
    await fs.writeFile(path.join(outputDirectory, thumbnailFilename), thumbnailCanvas.toBuffer("image/png"));
    entries.push({ profile, canvas, layout });
    exports.push({
      id: profile.id,
      file: filename,
      thumbnail: thumbnailFilename,
      width: profile.width,
      height: profile.height,
      bytes: buffer.length,
      sha256: sha256(buffer),
      boardRect: serializeRectangle(layout.boardRect),
      stageRect: serializeRectangle(layout.stageRect),
      titleRect: serializeRectangle(layout.titleRect),
      titleOverlapAxis: layout.titleOverlapAxis,
      titleOverlapFraction: roundGeometry(layout.titleOverlapFraction),
      cellSize: roundGeometry(layout.cell)
    });
  }
  const proof = renderThumbnailProof(entries).toBuffer("image/png");
  await fs.writeFile(path.join(outputDirectory, "thumbnail-proof.png"), proof);
  const manifest = {
    schemaVersion: 1,
    renderer: path.relative(repositoryRoot, fileURLToPath(import.meta.url)).replaceAll("\\", "/"),
    deterministic: true,
    boardSpec: COVER_BOARD_SPEC,
    palette,
    outputs: exports
  };
  await fs.writeFile(path.join(outputDirectory, "layout-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { outputDirectory, manifest };
}

async function main() {
  const outputDirectory = parseOutputDirectory(process.argv.slice(2));
  const result = await renderCoverBoardPreviews({ outputDirectory });
  process.stdout.write(`Cover board v5 previews written to ${result.outputDirectory}\n`);
  result.manifest.outputs.forEach((entry) => {
    process.stdout.write(`${entry.id}: ${entry.width}x${entry.height}, title overlap ${(entry.titleOverlapFraction * 100).toFixed(1)}%, ${entry.sha256}\n`);
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}

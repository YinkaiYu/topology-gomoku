import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COVER_BOARD_PROFILES,
  drawCoverBoard,
  drawCoverBoardBackdrop,
  getCoverBoardLayout
} from "./render-cover-board-v5.mjs";

const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pvRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(pvRoot, "../..");
const wordmarkRoot = path.join(pvRoot, "assets", "cover-exploration-v5", "wordmarks");
const outputDirectory = path.join(repositoryRoot, ".tmp", "chapter-teaser", "cover-wordmark-exploration-v5");
const artifactDirectory = path.join(repositoryRoot, "artifacts");

const palette = Object.freeze({
  ink: "#132621",
  inkSoft: "#33453f",
  paper: "#f2efe7",
  paperBright: "#faf8f2",
  teal: "#3f8c87",
  gold: "#c79244"
});

const candidates = Object.freeze([
  Object.freeze({ code: "00", id: "serif-baseline", family: "baseline", label: "Serif baseline", source: null }),
  Object.freeze({ code: "01", id: "08g-footsteps-release-tight", family: "footsteps", label: "08G Footsteps repaired", source: "08g-footsteps-release-tight.png" }),
  Object.freeze({ code: "02", id: "08h-footsteps-twin-surface", family: "footsteps", label: "08H Twin surface", source: "08h-footsteps-twin-surface.png" }),
  Object.freeze({ code: "03", id: "08i-footsteps-ribbon-release", family: "footsteps", label: "08I Release lockup", source: "08i-footsteps-ribbon-release.png" }),
  Object.freeze({ code: "04", id: "09g-geometric-repaired", family: "geometric", label: "09G Geometric repaired", source: "09g-geometric-repaired.png" }),
  Object.freeze({ code: "05", id: "09h-geometric-folded", family: "geometric", label: "09H Folded surface", source: "09h-geometric-folded.png" }),
  Object.freeze({ code: "06", id: "09i-geometric-release", family: "geometric", label: "09I Release lockup", source: "09i-geometric-release.png" })
]);

const titleLayouts = Object.freeze({
  "4x3": Object.freeze({ x: 0.075, y: 0.285, width: 0.50, height: 0.34, subtitleX: 0.31, subtitleY: 0.70 }),
  "16x9": Object.freeze({ x: 0.07, y: 0.25, width: 0.555, height: 0.42, subtitleX: 0.30, subtitleY: 0.75 }),
  "3x4": Object.freeze({ x: 0.07, yFromBoard: 0.78, width: 0.86, height: 0.28, subtitleX: 0.50, subtitleY: 0.84 })
});

function registerFonts() {
  for (const weight of [600, 700]) {
    const fontPath = path.join(pvRoot, "assets", "fonts", `topo-serif-pv-${weight}.ttf`);
    if (!GlobalFonts.registerFromPath(fontPath, "Topo Serif PV")) {
      throw new Error(`Unable to register font: ${fontPath}`);
    }
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function alphaBounds(image) {
  const probe = createCanvas(image.width, image.height);
  const context = probe.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  let transparent = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = pixels[(y * image.width + x) * 4 + 3];
      if (alpha <= 10) {
        transparent += 1;
        continue;
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (transparent < image.width * image.height * 0.08) {
    throw new Error("Generated wordmark must have a real transparent background");
  }
  if (right < left || bottom < top) throw new Error("Generated wordmark has no visible pixels");
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

async function loadCandidateAssets() {
  const pairs = await Promise.all(candidates.filter(({ source }) => source).map(async (candidate) => {
    const sourcePath = path.join(wordmarkRoot, candidate.source);
    await fs.access(sourcePath);
    const image = await loadImage(sourcePath);
    return [candidate.id, Object.freeze({ image, bounds: alphaBounds(image), sourcePath })];
  }));
  return Object.fromEntries(pairs);
}

function titleRectangle(profile) {
  const preset = titleLayouts[profile.id];
  const defaultLayout = getCoverBoardLayout(profile);
  return {
    x: profile.width * preset.x,
    y: preset.yFromBoard == null
      ? profile.height * preset.y
      : defaultLayout.boardRect.y + defaultLayout.boardRect.height * preset.yFromBoard,
    width: profile.width * preset.width,
    height: profile.height * preset.height
  };
}

function drawTitleReadabilityField(ctx, rect) {
  const centerX = rect.x + rect.width * 0.48;
  const centerY = rect.y + rect.height * 0.52;
  const radius = Math.max(rect.width * 0.68, rect.height * 1.7);
  const field = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  field.addColorStop(0, "rgba(250,248,242,0.78)");
  field.addColorStop(0.52, "rgba(250,248,242,0.34)");
  field.addColorStop(1, "rgba(250,248,242,0)");
  ctx.save();
  ctx.fillStyle = field;
  ctx.fillRect(rect.x - rect.width * 0.17, rect.y - rect.height * 0.8, rect.width * 1.34, rect.height * 2.6);
  ctx.restore();
}

function trackedWidth(ctx, text, tracking) {
  const glyphs = Array.from(text);
  return glyphs.reduce((sum, glyph) => sum + ctx.measureText(glyph).width, 0) + tracking * Math.max(0, glyphs.length - 1);
}

function drawTrackedText(ctx, text, centerX, centerY, tracking) {
  const glyphs = Array.from(text);
  const widths = glyphs.map((glyph) => ctx.measureText(glyph).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, glyphs.length - 1);
  let cursor = centerX - total / 2;
  glyphs.forEach((glyph, index) => {
    const x = cursor + widths[index] / 2;
    ctx.strokeText(glyph, x, centerY);
    ctx.fillText(glyph, x, centerY);
    cursor += widths[index] + tracking;
  });
}

function drawBaselineWordmark(ctx, rect) {
  const text = "拓扑五子棋";
  let size = rect.height * 0.86;
  let tracking = size * 0.035;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  while (size > 18) {
    ctx.font = `700 ${Math.round(size)}px "Topo Serif PV"`;
    tracking = size * 0.035;
    if (trackedWidth(ctx, text, tracking) <= rect.width) break;
    size -= 2;
  }
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(250,248,242,0.90)";
  ctx.lineWidth = Math.max(4, size * 0.045);
  ctx.fillStyle = palette.ink;
  ctx.shadowColor = "rgba(19,38,33,0.12)";
  ctx.shadowBlur = size * 0.055;
  ctx.shadowOffsetY = size * 0.018;
  drawTrackedText(ctx, text, rect.x + rect.width / 2, rect.y + rect.height / 2, tracking);
  ctx.restore();
}

function drawRasterWordmark(ctx, asset, rect) {
  const { image, bounds } = asset;
  const scale = Math.min(rect.width / bounds.width, rect.height / bounds.height);
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  const x = rect.x + (rect.width - width) / 2;
  const y = rect.y + (rect.height - height) / 2;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.shadowColor = "rgba(19,38,33,0.13)";
  ctx.shadowBlur = Math.max(8, rect.height * 0.035);
  ctx.shadowOffsetY = Math.max(2, rect.height * 0.012);
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, x, y, width, height);
  ctx.restore();
}

function drawSubtitle(ctx, profile, preset) {
  const minimum = Math.min(profile.width, profile.height);
  const size = minimum * (profile.id === "3x4" ? 0.075 : 0.066);
  const x = profile.width * preset.subtitleX;
  const y = profile.height * preset.subtitleY;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(19,38,33,0.88)";
  ctx.font = `600 ${Math.round(size)}px "Topo Serif PV"`;
  const tracking = size * 0.15;
  const text = "足迹回环";
  const glyphs = Array.from(text);
  const widths = glyphs.map((glyph) => ctx.measureText(glyph).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * (glyphs.length - 1);
  let cursor = x - total / 2;
  glyphs.forEach((glyph, index) => {
    ctx.fillText(glyph, cursor + widths[index] / 2, y);
    cursor += widths[index] + tracking;
  });
  ctx.fillStyle = "rgba(63,140,135,0.70)";
  ctx.fillRect(x - size * 0.72, y + size * 0.85, size * 1.44, Math.max(3, size * 0.048));
  ctx.restore();
}

function drawCover(profile, candidate, assets) {
  const canvas = createCanvas(profile.width, profile.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  const rect = titleRectangle(profile);
  const placement = { titleRect: rect, railPulse: 0.50, railAlpha: 0.88 };
  drawCoverBoardBackdrop(ctx, profile, placement);
  const boardLayout = drawCoverBoard(ctx, profile, placement);
  drawTitleReadabilityField(ctx, rect);
  if (candidate.source) drawRasterWordmark(ctx, assets[candidate.id], rect);
  else drawBaselineWordmark(ctx, rect);
  drawSubtitle(ctx, profile, titleLayouts[profile.id]);
  return { canvas, boardLayout, titleRect: rect };
}

function contactGeometry(profile) {
  if (profile.id === "3x4") return { columns: 4, previewWidth: 243, previewHeight: 324 };
  if (profile.id === "16x9") return { columns: 3, previewWidth: 512, previewHeight: 288 };
  return { columns: 3, previewWidth: 480, previewHeight: 360 };
}

function renderContactSheet(entries, profile, thumbnail = false) {
  const base = contactGeometry(profile);
  const previewWidth = thumbnail ? Math.round(base.previewWidth * 0.42) : base.previewWidth;
  const previewHeight = thumbnail ? Math.round(base.previewHeight * 0.42) : base.previewHeight;
  const columns = thumbnail ? (profile.id === "3x4" ? 7 : 4) : base.columns;
  const rows = Math.ceil(entries.length / columns);
  const gutter = thumbnail ? 16 : 24;
  const labelHeight = thumbnail ? 28 : 42;
  const canvas = createCanvas(
    columns * previewWidth + (columns + 1) * gutter,
    rows * (previewHeight + labelHeight) + (rows + 1) * gutter
  );
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${thumbnail ? 14 : 18}px "Topo Serif PV"`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.ink;
  entries.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gutter + column * (previewWidth + gutter);
    const y = gutter + row * (previewHeight + labelHeight + gutter);
    ctx.drawImage(entry.canvas, x, y, previewWidth, previewHeight);
    const label = thumbnail ? entry.candidate.code : `${entry.candidate.code} ${entry.candidate.label}`;
    ctx.fillText(label, x + 2, y + previewHeight + labelHeight / 2);
  });
  return canvas;
}

function renderWordmarkSheet(assets) {
  const width = 1640;
  const cardWidth = 760;
  const cardHeight = 260;
  const gutter = 30;
  const rows = Math.ceil(candidates.length / 2);
  const canvas = createCanvas(width, rows * (cardHeight + 48) + gutter * 2);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "600 18px \"Topo Serif PV\"";
  ctx.textBaseline = "middle";
  candidates.forEach((candidate, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = gutter + column * (cardWidth + gutter);
    const y = gutter + row * (cardHeight + 48);
    ctx.fillStyle = palette.paperBright;
    ctx.fillRect(x, y, cardWidth, cardHeight);
    const rect = { x: x + 24, y: y + 18, width: cardWidth - 48, height: cardHeight - 36 };
    if (candidate.source) drawRasterWordmark(ctx, assets[candidate.id], rect);
    else drawBaselineWordmark(ctx, rect);
    ctx.fillStyle = palette.ink;
    ctx.fillText(`${candidate.code} ${candidate.label}`, x + 4, y + cardHeight + 24);
  });
  return canvas;
}

async function main() {
  registerFonts();
  await Promise.all([
    fs.mkdir(outputDirectory, { recursive: true }),
    fs.mkdir(artifactDirectory, { recursive: true })
  ]);
  const staleOutputs = await fs.readdir(outputDirectory, { withFileTypes: true });
  await Promise.all(staleOutputs
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".png") || entry.name === "delivery-manifest.json"))
    .map((entry) => fs.unlink(path.join(outputDirectory, entry.name))));
  const assets = await loadCandidateAssets();
  const exports = [];
  for (const profile of COVER_BOARD_PROFILES) {
    const entries = [];
    for (const candidate of candidates) {
      const rendered = drawCover(profile, candidate, assets);
      const buffer = rendered.canvas.toBuffer("image/png");
      const filename = `${candidate.code}-${candidate.id}-${profile.id}.png`;
      await fs.writeFile(path.join(outputDirectory, filename), buffer);
      entries.push({ candidate, ...rendered });
      exports.push({
        candidate: candidate.id,
        family: candidate.family,
        profile: profile.id,
        file: filename,
        width: profile.width,
        height: profile.height,
        bytes: buffer.length,
        sha256: sha256(buffer),
        titleOverlapFraction: Number(rendered.boardLayout.titleOverlapFraction.toFixed(4))
      });
    }
    const contact = renderContactSheet(entries, profile, false).toBuffer("image/png");
    const thumbnails = renderContactSheet(entries, profile, true).toBuffer("image/png");
    await fs.writeFile(path.join(outputDirectory, `contact-sheet-${profile.id}.png`), contact);
    await fs.writeFile(path.join(outputDirectory, `thumbnail-proof-${profile.id}.png`), thumbnails);
    await fs.writeFile(path.join(artifactDirectory, `qa-chapter-teaser-cover-wordmarks-v5-${profile.id}.png`), contact);
    await fs.writeFile(path.join(artifactDirectory, `qa-chapter-teaser-cover-wordmarks-v5-thumbnail-${profile.id}.png`), thumbnails);
  }
  const wordmarkSheet = renderWordmarkSheet(assets).toBuffer("image/png");
  await fs.writeFile(path.join(outputDirectory, "wordmark-candidates.png"), wordmarkSheet);
  await fs.writeFile(path.join(artifactDirectory, "qa-chapter-teaser-wordmarks-v5.png"), wordmarkSheet);
  await fs.writeFile(path.join(outputDirectory, "delivery-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    title: "《拓扑五子棋》章节预告PV-「足迹回环」",
    exactCoverText: ["拓扑五子棋", "足迹回环"],
    boardSource: "repository game art: topology-art.js",
    boardRules: "4x4 square cells, 5x5 intersections, torus same-direction rails, five black stones, no auxiliary circles",
    composition: "large title overlaps the board; each aspect ratio is natively rearranged",
    candidates: candidates.map(({ code, id, family, label, source }) => ({ code, id, family, label, source })),
    exports
  }, null, 2)}\n`, "utf8");
  process.stdout.write(`Cover wordmark exploration v5 written to ${outputDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

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
const wordmarkPath = path.join(pvRoot, "assets", "cover-final", "wordmark.png");
const outputDirectory = path.join(pvRoot, "deliverables", "covers");
const artifactDirectory = path.join(repositoryRoot, "artifacts");

const palette = Object.freeze({
  ink: "#132621",
  inkSoft: "#33453f",
  paper: "#f2efe7",
  paperBright: "#faf8f2",
  teal: "#3f8c87",
  gold: "#c79244"
});

const finalLayouts = Object.freeze({
  "4x3": Object.freeze({
    board: Object.freeze({ left: 0.455, top: 0.17, sizeBy: "height", size: 0.64 }),
    wordmark: Object.freeze({ x: 0.05, y: 0.255, width: 0.60, height: 0.32 }),
    subtitle: Object.freeze({ x: 0.31, y: 0.70, size: 0.090 })
  }),
  "16x9": Object.freeze({
    board: Object.freeze({ left: 0.525, top: 0.13, sizeBy: "height", size: 0.72 }),
    wordmark: Object.freeze({ x: 0.05, y: 0.245, width: 0.61, height: 0.39 }),
    subtitle: Object.freeze({ x: 0.315, y: 0.73, size: 0.090 })
  }),
  "3x4": Object.freeze({
    board: Object.freeze({ left: 0.16, top: 0.075, sizeBy: "width", size: 0.68 }),
    wordmark: Object.freeze({ x: 0.06, y: 0.675, width: 0.88, height: 0.18 }),
    subtitle: Object.freeze({ x: 0.50, y: 0.885, size: 0.090 })
  })
});

function registerFonts() {
  for (const weight of [600, 700]) {
    const fontPath = path.join(pvRoot, "assets", "fonts", `topo-serif-pv-${weight}.ttf`);
    if (!GlobalFonts.registerFromPath(fontPath, "Topo Serif PV")) {
      throw new Error(`Unable to register embedded font: ${fontPath}`);
    }
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function rectangle(profile, source) {
  return {
    x: profile.width * source.x,
    y: profile.height * source.y,
    width: profile.width * source.width,
    height: profile.height * source.height
  };
}

function serializeRectangle(rect) {
  return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, Math.round(value * 1000) / 1000]));
}

function roundedRectangle(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function alphaBounds(image) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
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
  if (transparent < image.width * image.height * 0.25) {
    throw new Error("The approved wordmark must keep a real transparent background");
  }
  if (right < left || bottom < top) throw new Error("The approved wordmark has no visible pixels");
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function boardPlacement(profile, preset) {
  const base = preset.sizeBy === "width" ? profile.width : profile.height;
  return {
    left: profile.width * preset.left,
    top: profile.height * preset.top,
    size: base * preset.size,
    stageAlpha: 1,
    railAlpha: 0.94,
    railPulse: 0.50
  };
}

function drawBoardFoundation(ctx, layout) {
  const { boardRect, stageRect } = layout;
  const radius = boardRect.width * 0.055;
  ctx.save();

  const contact = ctx.createRadialGradient(
    boardRect.x + boardRect.width * 0.53,
    boardRect.y + boardRect.height * 1.02,
    boardRect.width * 0.08,
    boardRect.x + boardRect.width * 0.53,
    boardRect.y + boardRect.height * 1.02,
    boardRect.width * 0.76
  );
  contact.addColorStop(0, "rgba(19,38,33,0.19)");
  contact.addColorStop(0.48, "rgba(19,38,33,0.075)");
  contact.addColorStop(1, "rgba(19,38,33,0)");
  ctx.fillStyle = contact;
  ctx.fillRect(
    stageRect.x - boardRect.width * 0.22,
    stageRect.y + boardRect.height * 0.20,
    stageRect.width + boardRect.width * 0.44,
    stageRect.height + boardRect.height * 0.42
  );

  ctx.shadowColor = "rgba(19,38,33,0.28)";
  ctx.shadowBlur = boardRect.width * 0.090;
  ctx.shadowOffsetY = boardRect.width * 0.052;
  roundedRectangle(ctx, stageRect.x, stageRect.y, stageRect.width, stageRect.height, radius);
  ctx.fillStyle = "rgba(255,255,255,0.53)";
  ctx.fill();
  ctx.shadowColor = "transparent";

  const opaqueSurface = ctx.createLinearGradient(
    boardRect.x,
    boardRect.y,
    boardRect.x + boardRect.width,
    boardRect.y + boardRect.height
  );
  opaqueSurface.addColorStop(0, "rgba(255,255,255,0.86)");
  opaqueSurface.addColorStop(0.52, "rgba(250,248,242,0.75)");
  opaqueSurface.addColorStop(1, "rgba(224,239,231,0.64)");
  ctx.fillStyle = opaqueSurface;
  ctx.fillRect(boardRect.x, boardRect.y, boardRect.width, boardRect.height);
  ctx.restore();
}

function fitWordmark(bounds, target) {
  const scale = Math.min(target.width / bounds.width, target.height / bounds.height);
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  return {
    x: target.x + (target.width - width) / 2,
    y: target.y + (target.height - height) / 2,
    width,
    height
  };
}

function drawWordmarkGlow(ctx, drawRect, minimum) {
  const centerX = drawRect.x + drawRect.width * 0.49;
  const centerY = drawRect.y + drawRect.height * 0.53;
  const radius = Math.max(drawRect.width * 0.64, drawRect.height * 1.95);
  const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  glow.addColorStop(0, "rgba(250,248,242,0.78)");
  glow.addColorStop(0.45, "rgba(250,248,242,0.34)");
  glow.addColorStop(0.74, "rgba(199,146,68,0.055)");
  glow.addColorStop(1, "rgba(250,248,242,0)");
  ctx.save();
  ctx.fillStyle = glow;
  ctx.fillRect(
    drawRect.x - minimum * 0.075,
    drawRect.y - minimum * 0.11,
    drawRect.width + minimum * 0.15,
    drawRect.height + minimum * 0.22
  );
  ctx.restore();
}

function drawApprovedWordmark(ctx, image, bounds, target, minimum) {
  const drawRect = fitWordmark(bounds, target);
  drawWordmarkGlow(ctx, drawRect, minimum);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.shadowColor = "rgba(255,251,240,0.94)";
  ctx.shadowBlur = minimum * 0.030;
  ctx.shadowOffsetY = -minimum * 0.002;
  ctx.drawImage(
    image,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    drawRect.x,
    drawRect.y,
    drawRect.width,
    drawRect.height
  );
  ctx.shadowColor = "rgba(19,38,33,0.34)";
  ctx.shadowBlur = minimum * 0.022;
  ctx.shadowOffsetY = minimum * 0.013;
  ctx.drawImage(
    image,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    drawRect.x,
    drawRect.y,
    drawRect.width,
    drawRect.height
  );
  ctx.shadowColor = "transparent";
  ctx.drawImage(
    image,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    drawRect.x,
    drawRect.y,
    drawRect.width,
    drawRect.height
  );
  ctx.restore();
  return drawRect;
}

function trackedWidth(ctx, text, tracking) {
  const glyphs = Array.from(text);
  return glyphs.reduce((sum, glyph) => sum + ctx.measureText(glyph).width, 0) + tracking * (glyphs.length - 1);
}

function drawTrackedText(ctx, text, centerX, centerY, tracking) {
  const glyphs = Array.from(text);
  const widths = glyphs.map((glyph) => ctx.measureText(glyph).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * (glyphs.length - 1);
  let cursor = centerX - total / 2;
  glyphs.forEach((glyph, index) => {
    const x = cursor + widths[index] / 2;
    ctx.strokeText(glyph, x, centerY);
    ctx.fillText(glyph, x, centerY);
    cursor += widths[index] + tracking;
  });
}

function drawSubtitle(ctx, profile, preset) {
  const minimum = Math.min(profile.width, profile.height);
  let size = minimum * preset.size;
  const trackingRatio = 0.12;
  const text = "足迹回环";
  const maximumWidth = profile.width * (profile.id === "3x4" ? 0.74 : 0.33);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  while (size > 24) {
    ctx.font = `600 ${Math.round(size)}px "Topo Serif PV"`;
    if (trackedWidth(ctx, text, size * trackingRatio) <= maximumWidth) break;
    size -= 1;
  }
  const x = profile.width * preset.x;
  const y = profile.height * preset.y;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(250,248,242,0.90)";
  ctx.lineWidth = Math.max(5, size * 0.12);
  ctx.fillStyle = palette.inkSoft;
  ctx.shadowColor = "rgba(19,38,33,0.22)";
  ctx.shadowBlur = size * 0.18;
  ctx.shadowOffsetY = size * 0.09;
  drawTrackedText(ctx, text, x, y, size * trackingRatio);
  ctx.restore();
  return { x, y, size, maximumWidth };
}

function intersectionArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function validateFinalLayout(profile, layout) {
  const safeX = profile.width * 0.045;
  const safeY = profile.height * 0.045;
  const wordmark = layout.wordmarkDrawRect;
  if (
    wordmark.x < safeX ||
    wordmark.y < safeY ||
    wordmark.x + wordmark.width > profile.width - safeX ||
    wordmark.y + wordmark.height > profile.height - safeY
  ) throw new Error(`${profile.id}: approved wordmark exceeds the 4.5% safe frame`);

  if (profile.id === "3x4") {
    if (intersectionArea(wordmark, layout.boardRect) > 0) {
      throw new Error("3x4: the approved wordmark must not cover the board or its lower-left stone");
    }
    if (wordmark.y - (layout.boardRect.y + layout.boardRect.height) < profile.height * 0.055) {
      throw new Error("3x4: the approved wordmark needs a visible gap below the board");
    }
  }
}

function drawCover(profile, wordmark, bounds) {
  const preset = finalLayouts[profile.id];
  const placement = boardPlacement(profile, preset.board);
  const canvas = createCanvas(profile.width, profile.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  const layout = getCoverBoardLayout(profile, placement);
  drawCoverBoardBackdrop(ctx, profile, placement);
  drawBoardFoundation(ctx, layout);
  drawCoverBoard(ctx, profile, placement);

  const wordmarkTarget = rectangle(profile, preset.wordmark);
  const wordmarkDrawRect = drawApprovedWordmark(
    ctx,
    wordmark,
    bounds,
    wordmarkTarget,
    Math.min(profile.width, profile.height)
  );
  const subtitle = drawSubtitle(ctx, profile, preset.subtitle);
  const finalLayout = { ...layout, wordmarkTarget, wordmarkDrawRect, subtitle };
  validateFinalLayout(profile, finalLayout);
  return { canvas, layout: finalLayout };
}

function renderReviewSheet(entries) {
  const width = 1800;
  const height = 710;
  const cardWidth = 560;
  const cardHeight = 620;
  const gap = 30;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "600 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  entries.forEach((entry, index) => {
    const x = 30 + index * (cardWidth + gap);
    const y = 28;
    const scale = Math.min((cardWidth - 24) / entry.profile.width, (cardHeight - 50) / entry.profile.height);
    const drawWidth = entry.profile.width * scale;
    const drawHeight = entry.profile.height * scale;
    const drawX = x + (cardWidth - drawWidth) / 2;
    const drawY = y + (cardHeight - 50 - drawHeight) / 2;
    ctx.shadowColor = "rgba(19,38,33,0.20)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(entry.canvas, drawX, drawY, drawWidth, drawHeight);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = palette.ink;
    ctx.fillText(entry.profile.label, x + cardWidth / 2, y + cardHeight - 18);
  });
  return canvas;
}

function renderThumbnailProof(entries) {
  const padding = 24;
  const cardWidth = 210;
  const height = 250;
  const canvas = createCanvas(padding * 2 + cardWidth * entries.length, height);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "600 16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  entries.forEach((entry, index) => {
    const target = entry.profile.id === "16x9"
      ? { width: 160, height: 90 }
      : entry.profile.id === "4x3"
        ? { width: 160, height: 120 }
        : { width: 135, height: 180 };
    const centerX = padding + index * cardWidth + cardWidth / 2;
    const x = centerX - target.width / 2;
    const y = 22 + (180 - target.height) / 2;
    ctx.drawImage(entry.canvas, x, y, target.width, target.height);
    ctx.fillStyle = palette.ink;
    ctx.fillText(entry.profile.label, centerX, 224);
  });
  return canvas;
}

async function cleanOutputDirectory() {
  await fs.mkdir(outputDirectory, { recursive: true });
  const files = await fs.readdir(outputDirectory, { withFileTypes: true });
  await Promise.all(files.filter((entry) => entry.isFile()).map((entry) => fs.unlink(path.join(outputDirectory, entry.name))));
}

async function main() {
  registerFonts();
  const [wordmarkBuffer, wordmark, publishingCopy] = await Promise.all([
    fs.readFile(wordmarkPath),
    loadImage(wordmarkPath),
    fs.readFile(path.join(pvRoot, "publishing-copy.json"), "utf8").then(JSON.parse)
  ]);
  const bounds = alphaBounds(wordmark);
  await Promise.all([cleanOutputDirectory(), fs.mkdir(artifactDirectory, { recursive: true })]);

  const entries = [];
  const exports = [];
  for (const profile of COVER_BOARD_PROFILES) {
    const rendered = drawCover(profile, wordmark, bounds);
    const buffer = rendered.canvas.toBuffer("image/png");
    const filename = `topology-gomoku-footsteps-loop-cover-${profile.id}.png`;
    await fs.writeFile(path.join(outputDirectory, filename), buffer);
    entries.push({ profile, ...rendered });
    exports.push({
      id: profile.id,
      label: profile.label,
      file: filename,
      width: profile.width,
      height: profile.height,
      bytes: buffer.length,
      sha256: sha256(buffer),
      boardRect: serializeRectangle(rendered.layout.boardRect),
      wordmarkRect: serializeRectangle(rendered.layout.wordmarkDrawRect),
      subtitle: {
        text: "足迹回环",
        x: Math.round(rendered.layout.subtitle.x * 1000) / 1000,
        y: Math.round(rendered.layout.subtitle.y * 1000) / 1000,
        fontSize: Math.round(rendered.layout.subtitle.size * 1000) / 1000,
        underline: false
      },
      portraitWordmarkBoardOverlap: profile.id === "3x4"
        ? intersectionArea(rendered.layout.wordmarkDrawRect, rendered.layout.boardRect)
        : null,
      safeZone: "approved wordmark remains inside the inner 4.5% frame"
    });
  }

  const reviewSheet = renderReviewSheet(entries).toBuffer("image/png");
  const thumbnailProof = renderThumbnailProof(entries).toBuffer("image/png");
  await Promise.all([
    fs.writeFile(path.join(outputDirectory, "final-cover-review-sheet.png"), reviewSheet),
    fs.writeFile(path.join(outputDirectory, "final-cover-thumbnail-proof.png"), thumbnailProof),
    fs.writeFile(path.join(artifactDirectory, "qa-chapter-teaser-covers-final-v6.png"), reviewSheet),
    fs.writeFile(path.join(artifactDirectory, "qa-chapter-teaser-covers-final-v6-thumbnail.png"), thumbnailProof),
    fs.writeFile(
      path.join(outputDirectory, "publishing-copy.txt"),
      `${publishingCopy.title}\n\n${publishingCopy.descriptionLines.join("\n")}\n`,
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDirectory, "provenance.txt"),
      [
        "Approved wordmark: video/chapter-teaser/assets/cover-final/wordmark.png",
        `Approved wordmark SHA-256: ${sha256(wordmarkBuffer)}`,
        "Board art: app/assets/topology-art.js",
        "Board rules: app/assets/topology.js through render-cover-board-v5.mjs",
        "Composition: deterministic @napi-rs/canvas renderer; no generative changes to the approved wordmark"
      ].join("\n") + "\n",
      "utf8"
    )
  ]);

  const manifest = {
    schemaVersion: 2,
    deterministic: true,
    title: publishingCopy.title,
    descriptionLines: publishingCopy.descriptionLines,
    exactCoverText: ["拓扑五子棋", "足迹回环"],
    contentPolicy: "large title only; no small cover copy",
    visualSystem: "warm paper background, elevated opaque glass torus board, restrained teal and gold, layered approved wordmark",
    sourceAssets: [
      {
        file: "video/chapter-teaser/assets/cover-final/wordmark.png",
        role: "user-approved exact wordmark",
        sha256: sha256(wordmarkBuffer),
        alphaBounds: bounds
      },
      { file: "app/assets/topology-art.js", role: "live-game board art" },
      { file: "app/assets/topology.js", role: "live-game torus path rules" }
    ],
    effects: {
      boardOpacity: "raised opaque paper-glass foundation beneath the shared live-game board",
      boardDepth: "large soft cast shadow plus contact shadow",
      wordmarkDepth: "warm halo plus restrained dark cast shadow",
      subtitle: "larger Topo Serif PV title, soft ivory outline, no underline"
    },
    exports
  };
  await fs.writeFile(path.join(outputDirectory, "delivery-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Final covers written to ${outputDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

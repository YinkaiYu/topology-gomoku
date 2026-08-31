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
const temporaryRoot = path.join(repositoryRoot, ".tmp", "chapter-teaser");
const outputDirectory = path.join(temporaryRoot, "cover-imagegen-exploration");
const explorationAssetRoot = path.join(pvRoot, "assets", "cover-exploration");

const profiles = Object.freeze([
  Object.freeze({ id: "4x3", label: "4:3", width: 1600, height: 1200 }),
  Object.freeze({ id: "16x9", label: "16:9", width: 1920, height: 1080 }),
  Object.freeze({ id: "3x4", label: "3:4", width: 1080, height: 1440 })
]);

const palette = Object.freeze({
  paper: "#f2efe7",
  paperBright: "#faf8f2",
  paperDeep: "#ddd7ca",
  ink: "#132621",
  inkSoft: "#33453f",
  teal: "#3f8c87",
  gold: "#c79244",
  red: "#e44c38",
  bone: "#f4efe3"
});

const assetPaths = Object.freeze({
  logo: path.join(repositoryRoot, "app", "assets", "brand-icon.png"),
  wordmarkAtlas: path.join(explorationAssetRoot, "wordmarks", "05-game-atlas.png"),
  wordmarkInk: path.join(explorationAssetRoot, "wordmarks", "06-ink-wash.png"),
  wordmarkAnime: path.join(explorationAssetRoot, "wordmarks", "07-anime-chapter.png"),
  wordmarkRelease: path.join(explorationAssetRoot, "wordmarks", "08-footsteps-release.png"),
  wordmarkGeometric: path.join(explorationAssetRoot, "wordmarks", "09b-geometric-refined.png"),
  kleinPorcelain: path.join(explorationAssetRoot, "manifolds", "01-klein-porcelain.png"),
  mobiusLacquer: path.join(explorationAssetRoot, "manifolds", "02-mobius-lacquer.png"),
  crosscap: path.join(explorationAssetRoot, "manifolds", "03-projective-crosscap.png"),
  atlasOrnament: path.join(explorationAssetRoot, "manifolds", "04-atlas-mobius.png"),
  handdrawnHero: path.join(explorationAssetRoot, "manifolds", "05b-handdrawn-paper.png"),
  inkAnimeHero: path.join(explorationAssetRoot, "manifolds", "06b-ink-paper.png"),
  geometricHero: path.join(explorationAssetRoot, "manifolds", "07b-geometric-refined.png"),
  geometricKlein: path.join(explorationAssetRoot, "manifolds", "08-geometric-klein.png")
});

const directions = Object.freeze([
  Object.freeze({ id: "real-logo-hero", code: "A", label: "real-logo-hero", layout: "icon", hero: "logo", wordmark: null }),
  Object.freeze({ id: "footsteps-twin", code: "B", label: "footsteps-twin", layout: "twin", heroes: ["kleinPorcelain", "mobiusLacquer"], wordmark: "wordmarkRelease" }),
  Object.freeze({ id: "game-atlas", code: "C", label: "game-atlas", layout: "split", hero: "handdrawnHero", wordmark: "wordmarkAtlas", paperPlate: true }),
  Object.freeze({ id: "ink-loop", code: "D", label: "ink-loop", layout: "center", hero: "inkAnimeHero", wordmark: "wordmarkInk", paperPlate: true }),
  Object.freeze({ id: "anime-crosscap", code: "E", label: "anime-crosscap", layout: "split-reverse", hero: "crosscap", wordmark: "wordmarkAnime" }),
  Object.freeze({ id: "porcelain-monolith", code: "F", label: "porcelain-monolith", layout: "split", hero: "kleinPorcelain", wordmark: "wordmarkGeometric" }),
  Object.freeze({ id: "geometric-fold", code: "G", label: "geometric-fold", layout: "center", hero: "geometricHero", wordmark: "wordmarkGeometric" }),
  Object.freeze({ id: "atlas-fantasia", code: "H", label: "atlas-fantasia", layout: "split-reverse", hero: "atlasOrnament", wordmark: "wordmarkInk" }),
  Object.freeze({ id: "geometric-klein", code: "I", label: "geometric-klein", layout: "split-reverse", hero: "geometricKlein", wordmark: "wordmarkGeometric" }),
  Object.freeze({ id: "geometric-duality", code: "J", label: "geometric-duality", layout: "twin", heroes: ["geometricKlein", "geometricHero"], wordmark: "wordmarkGeometric" })
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

async function loadAsset(sourcePath) {
  try {
    await fs.access(sourcePath);
    const image = await loadImage(sourcePath);
    const probe = createCanvas(image.width, image.height);
    const probeContext = probe.getContext("2d");
    probeContext.drawImage(image, 0, 0);
    const pixels = probeContext.getImageData(0, 0, image.width, image.height).data;
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

function drawBackground(ctx, width, height, accent = palette.teal) {
  Art.drawAppBackdrop(ctx, width, height, { accent });
  Art.drawPaperTexture(ctx, width, height, 0.74);
  const light = ctx.createRadialGradient(width * 0.46, height * 0.38, 0, width * 0.46, height * 0.38, Math.max(width, height) * 0.64);
  light.addColorStop(0, "rgba(255,255,255,0.52)");
  light.addColorStop(0.58, "rgba(255,255,255,0.10)");
  light.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
}

function drawAsset(ctx, asset, box, options = {}) {
  if (!asset) return;
  const { image, bounds } = asset;
  const scale = Math.min(box.width / bounds.width, box.height / bounds.height) * (options.scale || 1);
  const drawWidth = bounds.width * scale;
  const drawHeight = bounds.height * scale;
  const drawX = box.x + (box.width - drawWidth) * (options.alignX ?? 0.5) + (options.offsetX || 0);
  const drawY = box.y + (box.height - drawHeight) * (options.alignY ?? 0.5) + (options.offsetY || 0);
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  if (options.shadow !== false) {
    ctx.shadowColor = options.shadowColor || "rgba(19,38,33,0.16)";
    ctx.shadowBlur = options.shadowBlur || Math.min(box.width, box.height) * 0.035;
    ctx.shadowOffsetY = options.shadowOffsetY || Math.min(box.width, box.height) * 0.018;
  }
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
}

function drawPaperPlate(ctx, asset, box) {
  if (!asset) return;
  const plate = createCanvas(Math.max(1, Math.round(box.width)), Math.max(1, Math.round(box.height)));
  const plateContext = plate.getContext("2d");
  const imageRatio = asset.image.width / asset.image.height;
  const boxRatio = plate.width / plate.height;
  const sourceWidth = imageRatio > boxRatio ? asset.image.height * boxRatio : asset.image.width;
  const sourceHeight = imageRatio > boxRatio ? asset.image.height : asset.image.width / boxRatio;
  const sourceX = (asset.image.width - sourceWidth) / 2;
  const sourceY = (asset.image.height - sourceHeight) / 2;
  plateContext.drawImage(asset.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, plate.width, plate.height);
  plateContext.globalCompositeOperation = "destination-in";
  const fade = plateContext.createRadialGradient(plate.width * 0.5, plate.height * 0.5, Math.min(plate.width, plate.height) * 0.23, plate.width * 0.5, plate.height * 0.5, Math.max(plate.width, plate.height) * 0.64);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.70, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  plateContext.fillStyle = fade;
  plateContext.fillRect(0, 0, plate.width, plate.height);
  ctx.drawImage(plate, box.x, box.y, box.width, box.height);
}

function drawTrackedText(ctx, text, x, y, tracking) {
  const glyphs = Array.from(text);
  const widths = glyphs.map((glyph) => ctx.measureText(glyph).width);
  const total = widths.reduce((sum, value) => sum + value, 0) + tracking * Math.max(0, glyphs.length - 1);
  let cursor = x - total / 2;
  for (let index = 0; index < glyphs.length; index += 1) {
    ctx.fillText(glyphs[index], cursor + widths[index] / 2, y);
    cursor += widths[index] + tracking;
  }
}

function drawFallbackWordmark(ctx, box) {
  const size = Math.min(box.height * 0.62, box.width * 0.19);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.ink;
  ctx.font = `700 ${Math.round(size)}px "Topo Serif PV"`;
  drawTrackedText(ctx, "拓扑五子棋", box.x + box.width / 2, box.y + box.height / 2, size * 0.10);
  ctx.restore();
}

function drawWordmark(ctx, asset, box) {
  if (asset) drawAsset(ctx, asset, box, { shadow: false });
  else drawFallbackWordmark(ctx, box);
}

function drawSubtitle(ctx, width, height, x, y, scale = 1) {
  const size = Math.min(width, height) * 0.077 * scale;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(19,38,33,0.84)";
  ctx.font = `600 ${Math.round(size)}px "Topo Serif PV"`;
  drawTrackedText(ctx, "足迹回环", x, y, size * 0.16);
  ctx.fillStyle = "rgba(63,140,135,0.60)";
  ctx.fillRect(x - size * 0.72, y + size * 0.92, size * 1.44, Math.max(3, size * 0.045));
  ctx.restore();
}

function drawGoldConnection(ctx, from, control, to, radius) {
  ctx.save();
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = radius * 0.21;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
  ctx.stroke();
  ctx.fillStyle = palette.red;
  ctx.shadowColor = "rgba(228,76,56,0.24)";
  ctx.shadowBlur = radius * 0.55;
  ctx.beginPath();
  ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTwinHero(ctx, first, second, box) {
  drawAsset(ctx, second, { x: box.x + box.width * 0.48, y: box.y + box.height * 0.18, width: box.width * 0.43, height: box.height * 0.54 }, { scale: 0.94, alpha: 0.92 });
  drawAsset(ctx, first, { x: box.x + box.width * 0.08, y: box.y + box.height * 0.04, width: box.width * 0.57, height: box.height * 0.87 }, { scale: 0.91 });
  drawGoldConnection(ctx,
    { x: box.x + box.width * 0.35, y: box.y + box.height * 0.62 },
    { x: box.x + box.width * 0.52, y: box.y + box.height * 0.37 },
    { x: box.x + box.width * 0.69, y: box.y + box.height * 0.55 },
    Math.min(box.width, box.height) * 0.023);
}

function drawCover(profile, direction, assets) {
  const canvas = createCanvas(profile.width, profile.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  const width = profile.width;
  const height = profile.height;
  const vertical = height > width;
  drawBackground(ctx, width, height, direction.layout === "anime-crosscap" ? "#8374a8" : palette.teal);

  if (direction.layout === "icon") {
    const heroBox = vertical
      ? { x: width * 0.12, y: height * 0.08, width: width * 0.76, height: height * 0.56 }
      : profile.id === "4x3"
        ? { x: width * 0.56, y: height * 0.13, width: width * 0.38, height: height * 0.70 }
        : { x: width * 0.45, y: height * 0.08, width: width * 0.50, height: height * 0.76 };
    drawAsset(ctx, assets[direction.hero], heroBox, { scale: 0.90, shadowBlur: Math.min(width, height) * 0.028 });
    const wordBox = vertical
      ? { x: width * 0.10, y: height * 0.65, width: width * 0.80, height: height * 0.15 }
      : { x: width * 0.07, y: height * 0.29, width: profile.id === "4x3" ? width * 0.45 : width * 0.36, height: height * 0.22 };
    drawFallbackWordmark(ctx, wordBox);
    drawSubtitle(ctx, width, height, wordBox.x + wordBox.width / 2, vertical ? height * 0.84 : height * 0.61, vertical ? 1.04 : 0.94);
    return canvas;
  }

  if (direction.layout === "center" || direction.layout === "twin") {
    const heroBox = vertical
      ? { x: width * 0.07, y: height * 0.05, width: width * 0.86, height: height * 0.60 }
      : { x: width * 0.21, y: height * 0.07, width: width * 0.58, height: height * 0.61 };
    if (direction.layout === "twin") drawTwinHero(ctx, assets[direction.heroes[0]], assets[direction.heroes[1]], heroBox);
    else if (direction.paperPlate) drawPaperPlate(ctx, assets[direction.hero], heroBox);
    else drawAsset(ctx, assets[direction.hero], heroBox, { scale: 0.93 });
    const wordBox = vertical
      ? { x: width * 0.07, y: height * 0.68, width: width * 0.86, height: height * 0.14 }
      : { x: width * 0.27, y: height * 0.66, width: width * 0.46, height: height * 0.15 };
    drawWordmark(ctx, assets[direction.wordmark], wordBox);
    drawSubtitle(ctx, width, height, width * 0.5, vertical ? height * 0.87 : height * 0.85, vertical ? 1.0 : 0.90);
    return canvas;
  }

  const reverse = direction.layout === "split-reverse";
  const heroBox = vertical
    ? { x: width * 0.08, y: height * 0.06, width: width * 0.84, height: height * 0.58 }
    : { x: reverse ? width * 0.07 : width * 0.53, y: height * 0.10, width: reverse ? width * 0.43 : width * 0.40, height: height * 0.77 };
  const wordBox = vertical
    ? { x: width * 0.07, y: height * 0.67, width: width * 0.86, height: height * 0.14 }
    : { x: reverse ? width * 0.54 : width * 0.08, y: height * 0.32, width: reverse ? width * 0.39 : width * 0.40, height: height * 0.20 };
  if (direction.paperPlate) drawPaperPlate(ctx, assets[direction.hero], heroBox);
  else drawAsset(ctx, assets[direction.hero], heroBox, { scale: 0.94 });
  drawWordmark(ctx, assets[direction.wordmark], wordBox);
  drawSubtitle(ctx, width, height, wordBox.x + wordBox.width / 2, vertical ? height * 0.86 : height * 0.64, vertical ? 1.0 : 0.92);
  return canvas;
}

function renderContactSheet(entries, profile) {
  const columns = profile.id === "3x4" ? 4 : 2;
  const rows = Math.ceil(entries.length / columns);
  const previewWidth = profile.id === "3x4" ? 270 : 720;
  const previewHeight = Math.round(previewWidth * profile.height / profile.width);
  const gutter = 28;
  const labelHeight = 44;
  const canvas = createCanvas(columns * previewWidth + (columns + 1) * gutter, rows * (previewHeight + labelHeight) + (rows + 1) * gutter);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "24px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.ink;
  entries.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gutter + column * (previewWidth + gutter);
    const y = gutter + row * (previewHeight + labelHeight + gutter);
    ctx.drawImage(entry.canvas, x, y, previewWidth, previewHeight);
    ctx.fillText(`${entry.direction.code}  ${entry.direction.label}`, x + 4, y + previewHeight + labelHeight / 2);
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
  const columns = profile.id === "3x4" ? 4 : 2;
  const rows = Math.ceil(entries.length / columns);
  const gutter = 22;
  const labelHeight = 30;
  const canvas = createCanvas(columns * size.width + (columns + 1) * gutter, rows * (size.height + labelHeight) + (rows + 1) * gutter);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.ink;
  ctx.font = "18px sans-serif";
  ctx.textBaseline = "middle";
  entries.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gutter + column * (size.width + gutter);
    const y = gutter + row * (size.height + labelHeight + gutter);
    ctx.drawImage(entry.canvas, x, y, size.width, size.height);
    ctx.fillText(`${entry.direction.code} ${entry.direction.label}`, x, y + size.height + labelHeight / 2);
  });
  return canvas;
}

function renderWordmarkCandidateSheet(assets) {
  const candidates = [
    ["05", "game-atlas", "wordmarkAtlas"],
    ["06", "ink-wash", "wordmarkInk"],
    ["07", "anime-chapter", "wordmarkAnime"],
    ["08", "footsteps-release", "wordmarkRelease"],
    ["09B", "geometric-fold-refined", "wordmarkGeometric"]
  ].filter(([, , key]) => assets[key]);
  const columns = 3;
  const rows = Math.ceil(candidates.length / columns);
  const cardWidth = 620;
  const cardHeight = 230;
  const labelHeight = 38;
  const gutter = 24;
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
    drawAsset(ctx, assets[key], { x: x + 24, y: y + 34, width: cardWidth - 48, height: cardHeight - 68 }, { shadow: false });
    ctx.fillStyle = palette.ink;
    ctx.fillText(`${code} ${label}`, x + 4, y + cardHeight + labelHeight / 2);
  });
  return canvas;
}

function renderManifoldCandidateSheet(assets) {
  const candidates = [
    ["00", "real-game-logo", "logo", false],
    ["01", "klein-porcelain", "kleinPorcelain", false],
    ["02", "mobius-lacquer", "mobiusLacquer", false],
    ["03", "projective-crosscap", "crosscap", false],
    ["04", "atlas-fantasia", "atlasOrnament", false],
    ["05", "game-atlas", "handdrawnHero", true],
    ["06", "ink-anime", "inkAnimeHero", true],
    ["07B", "geometric-atlas-refined", "geometricHero", false],
    ["08", "geometric-klein", "geometricKlein", false]
  ].filter(([, , key]) => assets[key]);
  const columns = 4;
  const rows = Math.ceil(candidates.length / columns);
  const cardSize = 360;
  const labelHeight = 38;
  const gutter = 24;
  const canvas = createCanvas(columns * cardSize + (columns + 1) * gutter, rows * (cardSize + labelHeight) + (rows + 1) * gutter);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#d8d2c7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "20px sans-serif";
  ctx.textBaseline = "middle";
  candidates.forEach(([code, label, key, paperPlate], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gutter + column * (cardSize + gutter);
    const y = gutter + row * (cardSize + labelHeight + gutter);
    ctx.fillStyle = palette.paperBright;
    ctx.fillRect(x, y, cardSize, cardSize);
    const box = { x: x + 20, y: y + 20, width: cardSize - 40, height: cardSize - 40 };
    if (paperPlate) drawPaperPlate(ctx, assets[key], box);
    else drawAsset(ctx, assets[key], box, { scale: 0.92 });
    ctx.fillStyle = palette.ink;
    ctx.fillText(`${code} ${label}`, x + 4, y + cardSize + labelHeight / 2);
  });
  return canvas;
}

async function main() {
  registerFonts();
  await fs.mkdir(outputDirectory, { recursive: true });
  const assets = {};
  for (const [key, sourcePath] of Object.entries(assetPaths)) assets[key] = await loadAsset(sourcePath);
  const activeDirections = directions.filter((direction) => {
    const heroReady = direction.heroes ? direction.heroes.every((key) => assets[key]) : assets[direction.hero];
    const wordmarkReady = direction.wordmark ? assets[direction.wordmark] : true;
    return heroReady && wordmarkReady;
  });
  if (activeDirections.length < 4) throw new Error(`Only ${activeDirections.length} cover directions have complete assets.`);

  const exports = [];
  for (const profile of profiles) {
    const entries = [];
    for (const direction of activeDirections) {
      const canvas = drawCover(profile, direction, assets);
      const buffer = canvas.toBuffer("image/png");
      const filename = `${direction.code}-${direction.id}-${profile.id}.png`;
      await fs.writeFile(path.join(outputDirectory, filename), buffer);
      exports.push({ direction: direction.id, profile: profile.id, file: filename, width: profile.width, height: profile.height, bytes: buffer.length, sha256: sha256(buffer) });
      const size = thumbnailSize(profile);
      const thumbnailCanvas = createCanvas(size.width, size.height);
      thumbnailCanvas.getContext("2d", { alpha: false }).drawImage(canvas, 0, 0, size.width, size.height);
      const thumbnailBuffer = thumbnailCanvas.toBuffer("image/png");
      const thumbnailFilename = `${direction.code}-${direction.id}-${profile.id}-thumbnail.png`;
      await fs.writeFile(path.join(outputDirectory, thumbnailFilename), thumbnailBuffer);
      exports.push({ direction: direction.id, profile: `${profile.id}-thumbnail`, file: thumbnailFilename, width: size.width, height: size.height, bytes: thumbnailBuffer.length, sha256: sha256(thumbnailBuffer) });
      entries.push({ direction, canvas });
    }
    const contact = renderContactSheet(entries, profile);
    const contactBuffer = contact.toBuffer("image/png");
    const contactFilename = `contact-sheet-${profile.id}.png`;
    await fs.writeFile(path.join(outputDirectory, contactFilename), contactBuffer);
    exports.push({ direction: "contact-sheet", profile: profile.id, file: contactFilename, width: contact.width, height: contact.height, bytes: contactBuffer.length, sha256: sha256(contactBuffer) });
    const thumbnailProof = renderThumbnailProof(entries, profile);
    const thumbnailProofBuffer = thumbnailProof.toBuffer("image/png");
    const thumbnailProofFilename = `thumbnail-proof-${profile.id}.png`;
    await fs.writeFile(path.join(outputDirectory, thumbnailProofFilename), thumbnailProofBuffer);
    exports.push({ direction: "thumbnail-proof", profile: profile.id, file: thumbnailProofFilename, width: thumbnailProof.width, height: thumbnailProof.height, bytes: thumbnailProofBuffer.length, sha256: sha256(thumbnailProofBuffer) });
  }
  for (const [filename, canvas] of [
    ["wordmark-candidates.png", renderWordmarkCandidateSheet(assets)],
    ["manifold-candidates.png", renderManifoldCandidateSheet(assets)]
  ]) {
    const buffer = canvas.toBuffer("image/png");
    await fs.writeFile(path.join(outputDirectory, filename), buffer);
    exports.push({ direction: "asset-candidates", profile: "review", file: filename, width: canvas.width, height: canvas.height, bytes: buffer.length, sha256: sha256(buffer) });
  }
  await fs.writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify({ schemaVersion: 1, exactCopy: ["拓扑五子棋", "足迹回环"], activeDirections: activeDirections.map(({ id, code, label, layout }) => ({ id, code, label, layout })), assetPaths, exports }, null, 2)}\n`, "utf8");
  process.stdout.write(`Rendered ${activeDirections.length} imagegen cover directions to ${outputDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

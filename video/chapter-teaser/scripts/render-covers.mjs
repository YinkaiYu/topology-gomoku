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
const outputDirectory = path.join(repositoryRoot, ".tmp", "chapter-teaser", "covers");

const profiles = Object.freeze([
  Object.freeze({ id: "4x3", label: "4:3", width: 1600, height: 1200 }),
  Object.freeze({ id: "16x9", label: "16:9", width: 1920, height: 1080 }),
  Object.freeze({ id: "3x4", label: "3:4", width: 1080, height: 1440 })
]);

function registerFonts() {
  for (const weight of [600, 700]) {
    const fontPath = path.join(pvRoot, "assets", "fonts", `topo-serif-pv-${weight}.ttf`);
    if (!GlobalFonts.registerFromPath(fontPath, "Topo Serif PV")) throw new Error(`Unable to register embedded font: ${fontPath}`);
  }
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

function drawHero(ctx, image, centerX, centerY, size, vertical) {
  const accent = Art.PALETTE.twist;
  ctx.save();
  const aura = ctx.createRadialGradient(centerX, centerY, size * 0.08, centerX, centerY, size * 0.65);
  aura.addColorStop(0, "rgba(63,140,135,0.095)");
  aura.addColorStop(0.58, "rgba(199,146,68,0.045)");
  aura.addColorStop(1, "rgba(242,239,231,0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size * 0.70, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(33,48,44,0.085)";
  ctx.lineWidth = Math.max(1.5, size * 0.0022);
  ctx.setLineDash([size * 0.018, size * 0.028]);
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, size * 0.53, size * 0.35, vertical ? -0.28 : -0.18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.94;
  ctx.drawImage(image, centerX - size / 2, centerY - size / 2, size, size);
  ctx.globalAlpha = 1;

  const from = { x: centerX - size * 0.31, y: centerY + size * 0.14 };
  const control = { x: centerX + size * 0.02, y: centerY - size * 0.34 };
  const to = { x: centerX + size * 0.33, y: centerY + size * 0.10 };
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(6, size * 0.016);
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(199,146,68,0.20)";
  ctx.shadowBlur = size * 0.025;
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
    ctx.shadowBlur = size * 0.018;
    ctx.shadowOffsetY = size * 0.009;
    Art.drawStoneFace(ctx, { player: 1, radius: size * 0.041, markLastMove: index === 4 });
    ctx.restore();
  });
  ctx.restore();
}

function drawCover(profile, hero) {
  const canvas = createCanvas(profile.width, profile.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  const width = profile.width;
  const height = profile.height;
  const vertical = height > width;
  const minimum = Math.min(width, height);
  Art.drawAppBackdrop(ctx, width, height, { accent: Art.PALETTE.connection });
  Art.drawPaperTexture(ctx, width, height, 0.9);

  if (vertical) {
    drawHero(ctx, hero, width * 0.5, height * 0.355, width * 0.70, true);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = Art.PALETTE.ink;
    ctx.font = `700 ${Math.round(width * 0.112)}px "Topo Serif PV"`;
    trackedText(ctx, "拓扑五子棋", width * 0.5, height * 0.70, width * 0.020);
    ctx.font = `600 ${Math.round(width * 0.077)}px "Topo Serif PV"`;
    ctx.fillStyle = "rgba(33,48,44,0.86)";
    trackedText(ctx, "足迹回环", width * 0.5, height * 0.805, width * 0.026);
    ctx.fillStyle = "rgba(63,140,135,0.62)";
    ctx.fillRect(width * 0.5 - width * 0.055, height * 0.86, width * 0.11, Math.max(3, width * 0.0024));
  } else {
    const heroSize = profile.id === "16x9" ? height * 0.74 : height * 0.66;
    const heroX = profile.id === "16x9" ? width * 0.72 : width * 0.71;
    drawHero(ctx, hero, heroX, height * 0.50, heroSize, false);
    const textX = width * 0.285;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = Art.PALETTE.ink;
    ctx.font = `700 ${Math.round(minimum * 0.105)}px "Topo Serif PV"`;
    trackedText(ctx, "拓扑五子棋", textX, height * 0.44, minimum * 0.018);
    ctx.font = `600 ${Math.round(minimum * 0.071)}px "Topo Serif PV"`;
    ctx.fillStyle = "rgba(33,48,44,0.86)";
    trackedText(ctx, "足迹回环", textX, height * 0.59, minimum * 0.024);
    ctx.fillStyle = "rgba(63,140,135,0.62)";
    ctx.fillRect(textX - minimum * 0.052, height * 0.675, minimum * 0.104, Math.max(3, minimum * 0.0024));
  }
  return canvas;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  registerFonts();
  const [hero, publishingCopy] = await Promise.all([
    loadImage(path.join(repositoryRoot, "app", "assets", "topologies", "sphere.svg")),
    fs.readFile(path.join(pvRoot, "publishing-copy.json"), "utf8").then(JSON.parse)
  ]);
  await fs.mkdir(outputDirectory, { recursive: true });
  const exports = [];
  for (const profile of profiles) {
    const canvas = drawCover(profile, hero);
    const buffer = canvas.toBuffer("image/png");
    const filename = `topology-gomoku-footsteps-loop-cover-${profile.id}.png`;
    await fs.writeFile(path.join(outputDirectory, filename), buffer);
    exports.push({
      id: profile.id,
      label: profile.label,
      file: filename,
      width: profile.width,
      height: profile.height,
      bytes: buffer.length,
      sha256: sha256(buffer),
      safeZone: "all text and hero content remain inside the inner 8% frame"
    });
  }
  await fs.writeFile(path.join(outputDirectory, "publishing-copy.txt"), `${publishingCopy.title}\n\n${publishingCopy.descriptionLines.join("\n")}\n`, "utf8");
  await fs.writeFile(path.join(outputDirectory, "delivery-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    title: publishingCopy.title,
    descriptionLines: publishingCopy.descriptionLines,
    visualSystem: "warm paper, hand-drawn topology, restrained teal and gold, five-stone path",
    contentPolicy: "large title only; no small cover copy",
    sourceAssets: ["app/assets/topologies/sphere.svg", "app/assets/topology-art.js"],
    exports
  }, null, 2)}\n`, "utf8");
  process.stdout.write(`Covers written to ${outputDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

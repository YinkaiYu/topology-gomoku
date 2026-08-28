"use strict";

const fs = require("node:fs");
const path = require("node:path");

let sharp;
try {
  sharp = require("sharp");
} catch (error) {
  throw new Error("generate-wechat-ui-assets requires the local Codex workspace sharp runtime", { cause: error });
}

const ROOT = path.resolve(__dirname, "..");
const H5_ASSETS = path.join(ROOT, "app", "assets");
const OUTPUT_ROOT = path.join(ROOT, "wechat", "assets", "ui");
const WECHAT_RASTER_DENSITY = 216;
const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function pathForButton(buttonId) {
  const escaped = buttonId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<button[^>]*id=["']${escaped}["'][\\s\\S]*?<path[^>]*d=["']([^"']+)["']`));
  if (!match) {
    throw new Error(`Unable to find authoritative icon path for #${buttonId}`);
  }
  return match[1];
}

function svgViewBox(markup, source) {
  const match = markup.match(/\bviewBox=["']([^"']+)["']/i);
  if (!match) {
    throw new Error(`Missing viewBox in ${source}`);
  }
  const values = match[1].trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) {
    throw new Error(`Invalid viewBox in ${source}`);
  }
  return { width: values[2], height: values[3] };
}

function sizedSvg(source, cssSize) {
  const markup = fs.readFileSync(source, "utf8");
  const viewBox = svgViewBox(markup, source);
  const scale = cssSize / Math.max(viewBox.width, viewBox.height);
  const width = viewBox.width * scale;
  const height = viewBox.height * scale;
  return Buffer.from(markup.replace(
    /<svg\b/,
    `<svg width="${width}" height="${height}"`,
  ));
}

async function renderSourceAssets(sourceDirectory, destinationDirectory, sizeForName) {
  ensureDirectory(destinationDirectory);
  const names = fs.readdirSync(sourceDirectory)
    .filter((name) => name.endsWith(".svg"))
    .sort();
  for (const name of names) {
    const source = path.join(sourceDirectory, name);
    const baseName = name.replace(/\.svg$/i, "");
    for (const compact of [false, true]) {
      const cssSize = sizeForName(baseName, compact);
      const suffix = compact ? "-compact" : "";
      const destination = path.join(destinationDirectory, `${baseName}${suffix}.png`);
      await sharp(sizedSvg(source, cssSize), { density: WECHAT_RASTER_DENSITY })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(destination);
    }
  }
}

function iconSvg(pathData, color) {
  return Buffer.from([
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">',
    `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    "</svg>",
  ].join(""));
}

async function renderIcons() {
  const muted = "#817f77";
  const teal = "#3f8c87";
  const spatial = "#8b7556";
  const icons = {
    back: [pathForButton("backButton"), muted],
    settings: [pathForButton("gameSettingsButton"), muted],
    undo: [pathForButton("undoButton"), muted],
    boundary: [pathForButton("boundaryDemoButton"), spatial],
    journey: [pathForButton("journeyButton"), muted],
    restart: [pathForButton("restartButton"), muted],
    "next-level": [pathForButton("nextLevelButton"), teal],
    review: [pathForButton("reviewToggleButton"), teal],
    previous: [pathForButton("reviewPreviousButton"), muted],
    next: [pathForButton("reviewNextButton"), muted],
    surface: [pathForButton("dimensionToggleButton"), spatial],
    board: ["M4 4h16v16H4zM9.33 4v16M14.67 4v16M4 9.33h16M4 14.67h16", spatial],
    check: ["m5 12 4 4L19 6", teal],
  };
  const destinationDirectory = path.join(OUTPUT_ROOT, "icons");
  ensureDirectory(destinationDirectory);
  for (const [name, [pathData, color]] of Object.entries(icons)) {
    await sharp(iconSvg(pathData, color), { density: WECHAT_RASTER_DENSITY })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(destinationDirectory, `${name}.png`));
  }
}

async function renderMysteryGroundShadow() {
  const source = Buffer.from([
    '<svg xmlns="http://www.w3.org/2000/svg" width="66" height="25" viewBox="0 0 66 25">',
    '<defs><filter id="blur" x="-40%" y="-300%" width="180%" height="700%">',
    '<feGaussianBlur stdDeviation="3"/>',
    '</filter></defs>',
    '<ellipse cx="33" cy="12.5" rx="24" ry="3.5" fill="#1e2723" fill-opacity="0.16" filter="url(#blur)"/>',
    '</svg>',
  ].join(''));
  await sharp(source, { density: WECHAT_RASTER_DENSITY })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(OUTPUT_ROOT, "mystery-ground-shadow.png"));
}

async function main() {
  await renderSourceAssets(
    path.join(H5_ASSETS, "topologies"),
    path.join(OUTPUT_ROOT, "topologies"),
    (name, compact) => (name === "sphere" ? (compact ? 62 : 94) : (compact ? 46 : 70)),
  );
  await renderSourceAssets(
    path.join(H5_ASSETS, "silhouettes"),
    path.join(OUTPUT_ROOT, "silhouettes"),
    (name, compact) => (name === "sphere" ? (compact ? 62 : 94) : (compact ? 46 : 70)),
  );
  await renderIcons();
  await renderMysteryGroundShadow();
  process.stdout.write("Generated authoritative WeChat UI raster assets.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pvRoot = path.resolve(scriptDirectory, "..");
const explorationRoot = path.join(pvRoot, "assets", "cover-exploration");
const v4Root = path.join(pvRoot, "assets", "cover-exploration-v4");
const glyphRoot = path.join(v4Root, "glyphs");
const outputRoot = path.join(v4Root, "wordmarks");

const paths = Object.freeze({
  footsteps: path.join(explorationRoot, "wordmarks", "08-footsteps-release.png"),
  geometric: path.join(explorationRoot, "wordmarks", "09b-geometric-refined.png"),
  fiveTwin: path.join(glyphRoot, "five-twin.png"),
  qiStones: path.join(glyphRoot, "qi-three-stones.png"),
  qiGeometric: path.join(glyphRoot, "qi-geometric.png"),
  footstepsCorrected: path.join(outputRoot, "08d-footsteps-corrected.png"),
  geometricCorrected: path.join(outputRoot, "09f-geometric-corrected.png")
});

const footstepsCrops = Object.freeze({
  tuo: Object.freeze({ x: 82, y: 202, width: 423, height: 425 }),
  pu: Object.freeze({ x: 500, y: 244, width: 272, height: 386 }),
  zi: Object.freeze({ x: 1170, y: 244, width: 322, height: 386 })
});

const geometricCrops = Object.freeze({
  tuo: Object.freeze({ x: 70, y: 174, width: 416, height: 422 }),
  pu: Object.freeze({ x: 480, y: 174, width: 370, height: 422 }),
  five: Object.freeze({ x: 846, y: 190, width: 322, height: 410 }),
  zi: Object.freeze({ x: 1152, y: 190, width: 316, height: 410 })
});

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function alphaBounds(canvas, threshold = 8) {
  const ctx = canvas.getContext("2d");
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[(y * canvas.width + x) * 4 + 3] <= threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function trimCanvas(source, padding = 2) {
  const bounds = alphaBounds(source);
  const x = Math.max(0, bounds.x - padding);
  const y = Math.max(0, bounds.y - padding);
  const right = Math.min(source.width, bounds.x + bounds.width + padding);
  const bottom = Math.min(source.height, bounds.y + bounds.height + padding);
  const canvas = createCanvas(Math.max(1, right - x), Math.max(1, bottom - y));
  canvas.getContext("2d").drawImage(source, x, y, right - x, bottom - y, 0, 0, right - x, bottom - y);
  return canvas;
}

function cropImage(image, crop) {
  const canvas = createCanvas(crop.width, crop.height);
  canvas.getContext("2d").drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );
  return canvas;
}

function keepDarkInkOnly(source) {
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const inkFactor = 1 - smoothstep(88, 172, luma);
    pixels[index + 3] = Math.round(pixels[index + 3] * inkFactor);
  }
  ctx.putImageData(imageData, 0, 0);
  return trimCanvas(canvas);
}

function hasUsefulAlpha(source) {
  const ctx = source.getContext("2d");
  const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
  let transparent = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 240) transparent += 1;
  }
  return transparent > source.width * source.height * 0.01;
}

function removeGeneratedCheckerboard(source) {
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  if (hasUsefulAlpha(canvas)) return trimCanvas(canvas);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const assumedBackground = 251;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const darknessAlpha = clamp((248 - luma) / 213);
    const chromaAlpha = clamp((chroma - 2) / 15);
    const foregroundScore = Math.max(darknessAlpha, chromaAlpha);
    const alpha = clamp((foregroundScore - 0.18) / 0.72);

    if (alpha <= 0.002) {
      pixels[index] = 0;
      pixels[index + 1] = 0;
      pixels[index + 2] = 0;
      pixels[index + 3] = 0;
      continue;
    }

    if (alpha < 0.995) {
      pixels[index] = Math.round(clamp((red - (1 - alpha) * assumedBackground) / alpha, 0, 255));
      pixels[index + 1] = Math.round(clamp((green - (1 - alpha) * assumedBackground) / alpha, 0, 255));
      pixels[index + 2] = Math.round(clamp((blue - (1 - alpha) * assumedBackground) / alpha, 0, 255));
    }
    pixels[index + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(imageData, 0, 0);
  return trimCanvas(canvas, 4);
}

function composeHorizontal(items, options) {
  const prepared = items.map((item) => {
    const targetHeight = options.regularHeight * (item.heightScale ?? 1);
    const scale = targetHeight / item.canvas.height;
    return {
      ...item,
      width: Math.round(item.canvas.width * scale),
      height: Math.round(targetHeight)
    };
  });
  const totalWidth = prepared.reduce((sum, item) => sum + item.width, 0)
    + options.gap * (prepared.length - 1)
    + options.paddingX * 2;
  const maximumHeight = Math.max(...prepared.map((item) => item.height));
  const canvas = createCanvas(totalWidth, maximumHeight + options.paddingY * 2);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  let x = options.paddingX;
  for (const item of prepared) {
    const y = options.paddingY + Math.round((maximumHeight - item.height) / 2 + (item.offsetY ?? 0));
    ctx.drawImage(item.canvas, x, y, item.width, item.height);
    x += item.width + options.gap;
  }
  return canvas;
}

function inspectCanvas(canvas) {
  const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let transparent = 0;
  let translucent = 0;
  let opaque = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    const alpha = pixels[index];
    if (alpha === 0) transparent += 1;
    else if (alpha === 255) opaque += 1;
    else translucent += 1;
  }
  const total = transparent + translucent + opaque;
  return {
    width: canvas.width,
    height: canvas.height,
    alpha: true,
    transparentPixelRatio: Number((transparent / total).toFixed(4)),
    translucentPixelRatio: Number((translucent / total).toFixed(4)),
    contentBounds: alphaBounds(canvas)
  };
}

async function writeCanvas(canvas, outputPath) {
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outputPath, buffer);
  return { outputPath, ...inspectCanvas(canvas) };
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  const [footsteps, geometric, fiveImage, qiStonesImage, qiGeometricImage] = await Promise.all([
    loadImage(paths.footsteps),
    loadImage(paths.geometric),
    loadImage(paths.fiveTwin),
    loadImage(paths.qiStones),
    loadImage(paths.qiGeometric)
  ]);

  const footstepsGlyphs = {
    tuo: keepDarkInkOnly(cropImage(footsteps, footstepsCrops.tuo)),
    pu: keepDarkInkOnly(cropImage(footsteps, footstepsCrops.pu)),
    zi: keepDarkInkOnly(cropImage(footsteps, footstepsCrops.zi)),
    five: removeGeneratedCheckerboard(fiveImage),
    qi: removeGeneratedCheckerboard(qiStonesImage)
  };
  const footstepsWordmark = composeHorizontal([
    { id: "拓", canvas: footstepsGlyphs.tuo },
    { id: "扑", canvas: footstepsGlyphs.pu },
    { id: "五", canvas: footstepsGlyphs.five, heightScale: 1.5 },
    { id: "子", canvas: footstepsGlyphs.zi },
    { id: "棋", canvas: footstepsGlyphs.qi }
  ], { regularHeight: 410, gap: 24, paddingX: 64, paddingY: 54 });

  const geometricGlyphs = {
    tuo: trimCanvas(cropImage(geometric, geometricCrops.tuo)),
    pu: trimCanvas(cropImage(geometric, geometricCrops.pu)),
    five: trimCanvas(cropImage(geometric, geometricCrops.five)),
    zi: trimCanvas(cropImage(geometric, geometricCrops.zi)),
    qi: removeGeneratedCheckerboard(qiGeometricImage)
  };
  const geometricWordmark = composeHorizontal([
    { id: "拓", canvas: geometricGlyphs.tuo },
    { id: "扑", canvas: geometricGlyphs.pu },
    { id: "五", canvas: geometricGlyphs.five, heightScale: 1.25 },
    { id: "子", canvas: geometricGlyphs.zi },
    { id: "棋", canvas: geometricGlyphs.qi }
  ], { regularHeight: 410, gap: 22, paddingX: 64, paddingY: 54 });

  const reports = await Promise.all([
    writeCanvas(footstepsWordmark, paths.footstepsCorrected),
    writeCanvas(geometricWordmark, paths.geometricCorrected)
  ]);
  process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
}

await main();

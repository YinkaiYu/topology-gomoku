import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const Compositor = require("../src/compositor.js");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pvRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(pvRoot, "../..");
const buildRoot = path.join(repositoryRoot, ".tmp", "chapter-teaser");

const profiles = Object.freeze({
  douyin: Object.freeze({
    width: 1080,
    height: 1920,
    label: "Douyin 9:16",
    subtitleFontSize: 52,
    subtitleOutline: 4.4,
    subtitleMarginHorizontal: 72,
    subtitleMarginVertical: 315,
    videoBitRate: "16M",
    maximumVideoBitRate: "24M"
  }),
  xiaohongshu: Object.freeze({
    width: 1080,
    height: 1440,
    label: "Xiaohongshu 3:4",
    subtitleFontSize: 52,
    subtitleOutline: 4.4,
    subtitleMarginHorizontal: 72,
    subtitleMarginVertical: 150,
    videoBitRate: "16M",
    maximumVideoBitRate: "24M"
  })
});

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function filterPath(filePath) {
  return path.resolve(filePath).replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function registerFonts() {
  for (const weight of [400, 600, 700]) {
    const fontPath = path.join(pvRoot, "assets", "fonts", `topo-serif-pv-${weight}.ttf`);
    if (!GlobalFonts.registerFromPath(fontPath, "Topo Serif PV")) throw new Error(`Unable to register embedded font: ${fontPath}`);
  }
  const subtitleFontPath = path.join(pvRoot, "assets", "fonts", "topo-sans-pv-600.ttf");
  if (!GlobalFonts.registerFromPath(subtitleFontPath, "Topo Sans PV")) throw new Error(`Unable to register embedded subtitle font: ${subtitleFontPath}`);
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} could not be read: ${error.message}`);
  }
}

async function loadProject() {
  const topologyIds = ["plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"];
  const [story, manifest, institutionLogo, gameLogo, ...topologyImages] = await Promise.all([
    readJson(path.join(pvRoot, "story.json"), "story.json"),
    readJson(path.join(pvRoot, "manifest.json"), "manifest.json"),
    loadImage(path.join(pvRoot, "assets", "iop-logo.png")),
    loadImage(path.join(repositoryRoot, "app", "assets", "brand-icon.png")),
    ...topologyIds.map((id) => loadImage(path.join(repositoryRoot, "app", "assets", "topologies", `${id}.svg`)))
  ]);
  Compositor.validateManifest(manifest, story);
  return {
    story,
    manifest,
    logos: { institution: institutionLogo, game: gameLogo },
    topologyIllustrations: Object.fromEntries(topologyIds.map((id, index) => [id, topologyImages[index]]))
  };
}

function makeComposition(project, profile) {
  return Compositor.createComposition({
    story: project.story,
    manifest: project.manifest,
    width: profile.width,
    height: profile.height,
    quality: 2.2,
    logos: project.logos,
    topologyIllustrations: project.topologyIllustrations,
    subtitlesEnabled: false,
    layout: "portrait"
  });
}

function socialAss(source, profile) {
  const events = source.split(/\r?\n/u).filter((line) => line.startsWith("Dialogue:"));
  return [
    "[Script Info]",
    "; Native portrait delivery generated from the approved integer 60 fps cue boundaries",
    "ScriptType: v4.00+",
    `PlayResX: ${profile.width}`,
    `PlayResY: ${profile.height}`,
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,Topo Sans PV,${profile.subtitleFontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0.6,0,1,${profile.subtitleOutline},0,2,${profile.subtitleMarginHorizontal},${profile.subtitleMarginHorizontal},${profile.subtitleMarginVertical},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    ""
  ].join("\n");
}

function selectedKeyframes(composition) {
  const desired = [
    ["intro-edge", 0.62], ["institution-logo", 0.52], ["intro-awakening", 0.72],
    ["chapter-card-prologue", 0.69], ["chapter-i", 0.87], ["chapter-ii", 0.87],
    ["chapter-iii", 0.87], ["chapter-iv", 0.87], ["chapter-v", 0.87],
    ["chapter-vi", 0.87], ["tableau", 0.62], ["finale", 0.72], ["end-card", 0.56]
  ];
  return desired.map(([id, progress]) => {
    const segment = composition.manifest.segments.find((item) => item.id === id);
    if (!segment) throw new Error(`Missing keyframe segment: ${id}`);
    return { id, frame: Math.min(segment.endFrame - 1, segment.startFrame + Math.floor((segment.endFrame - segment.startFrame) * progress)) };
  });
}

async function renderKeyframes(composition, profileName, outputDirectory) {
  const frames = selectedKeyframes(composition);
  const canvas = createCanvas(composition.width, composition.height);
  const context = canvas.getContext("2d", { alpha: false });
  const thumbWidth = profileName === "douyin" ? 216 : 240;
  const thumbHeight = Math.round(thumbWidth * composition.height / composition.width);
  const columns = profileName === "douyin" ? 5 : 4;
  const rows = Math.ceil(frames.length / columns);
  const sheet = createCanvas(thumbWidth * columns, thumbHeight * rows);
  const sheetContext = sheet.getContext("2d", { alpha: false });
  sheetContext.fillStyle = composition.gamePalette.paperDeep;
  sheetContext.fillRect(0, 0, sheet.width, sheet.height);
  await fs.mkdir(outputDirectory, { recursive: true });
  for (let index = 0; index < frames.length; index += 1) {
    const item = frames[index];
    composition.renderFrame(context, item.frame);
    await fs.writeFile(path.join(outputDirectory, `${String(index + 1).padStart(2, "0")}-${String(item.frame).padStart(6, "0")}-${item.id}.png`), canvas.toBuffer("image/png"));
    sheetContext.drawImage(canvas, (index % columns) * thumbWidth, Math.floor(index / columns) * thumbHeight, thumbWidth, thumbHeight);
  }
  await fs.writeFile(path.join(outputDirectory, "contact-sheet.png"), sheet.toBuffer("image/png"));
  await fs.writeFile(path.join(outputDirectory, "frames.json"), `${JSON.stringify({
    layout: "native portrait", profile: profileName, width: composition.width, height: composition.height, frames
  }, null, 2)}\n`);
  process.stdout.write(`Native portrait keyframes written to ${outputDirectory}\n`);
}

function writeFrame(stream, buffer) {
  if (stream.destroyed || stream.writableEnded) return Promise.reject(new Error("FFmpeg input closed before all frames were written"));
  if (stream.write(buffer)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => { stream.off("drain", onDrain); stream.off("error", onError); stream.off("close", onClose); };
    const onDrain = () => { cleanup(); resolve(); };
    const onError = (error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error("FFmpeg input closed before accepting the frame")); };
    stream.once("drain", onDrain);
    stream.once("error", onError);
    stream.once("close", onClose);
  });
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function renderVideo(project, composition, profile, profileName, overwrite) {
  const outputDirectory = path.join(buildRoot, "social", profileName);
  const fontDirectory = path.join(outputDirectory, "fonts");
  await fs.mkdir(fontDirectory, { recursive: true });
  const fontSource = path.join(pvRoot, "assets", "fonts", "topo-sans-pv-600.ttf");
  await fs.copyFile(fontSource, path.join(fontDirectory, "topo-sans-pv-600.ttf"));
  const captionSource = await fs.readFile(path.join(pvRoot, "captions.ass"), "utf8");
  const captions = path.join(outputDirectory, `captions-${profileName}.ass`);
  await fs.writeFile(captions, socialAss(captionSource, profile), "utf8");
  const output = path.join(outputDirectory, `topology-gomoku-${profileName}-${profile.width}x${profile.height}-60fps.mp4`);
  try {
    await fs.access(output);
    if (!overwrite) fail(`Output already exists: ${output}; pass --overwrite to replace it`);
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
  const audio = path.resolve(repositoryRoot, project.manifest.audio.masterMix);
  await fs.access(audio);
  const args = [
    overwrite ? "-y" : "-n", "-hide_banner", "-loglevel", "warning",
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${profile.width}x${profile.height}`,
    "-framerate", String(project.manifest.fps), "-i", "pipe:0", "-i", audio,
    "-map", "0:v:0", "-map", "1:a:0",
    "-vf", `subtitles=filename='${filterPath(captions)}':fontsdir='${filterPath(fontDirectory)}',scale=in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709`,
    "-c:v", "libx264", "-preset", "slow", "-b:v", profile.videoBitRate,
    "-maxrate", profile.maximumVideoBitRate, "-bufsize", "48M", "-profile:v", "high", "-level:v", "4.2",
    "-r", String(project.manifest.fps), "-fps_mode", "cfr", "-frames:v", String(project.manifest.totalFrames),
    "-t", project.manifest.durationSeconds.toFixed(6), "-g", "120", "-keyint_min", "60", "-sc_threshold", "0",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart+write_colr",
    "-metadata", `title=Topology Gomoku — ${profile.label}`, output
  ];
  const encoder = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
  const encoderExit = new Promise((resolve, reject) => {
    encoder.once("error", reject);
    encoder.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with ${code == null ? signal : `code ${code}`}`)));
  });
  const canvas = createCanvas(composition.width, composition.height);
  const context = canvas.getContext("2d", { alpha: false });
  try {
    for (let frameIndex = 0; frameIndex < composition.totalFrames; frameIndex += 1) {
      composition.renderFrame(context, frameIndex);
      await writeFrame(encoder.stdin, canvas.data());
      if (frameIndex % (composition.fps * 5) === 0 || frameIndex + 1 === composition.totalFrames) {
        process.stdout.write(`Rendered ${frameIndex + 1}/${composition.totalFrames} portrait frames (${((frameIndex + 1) / composition.totalFrames * 100).toFixed(1)}%)\n`);
      }
    }
    encoder.stdin.end();
    await encoderExit;
  } catch (error) {
    if (!encoder.killed) encoder.kill();
    await encoderExit.catch(() => {});
    throw error;
  }
  const outputHash = await sha256(output);
  const stat = await fs.stat(output);
  await fs.writeFile(`${output}.sha256`, `${outputHash} *${path.basename(output)}\n`, "utf8");
  await fs.writeFile(path.join(outputDirectory, "delivery-manifest.json"), `${JSON.stringify({
    schemaVersion: 2, delivery: profileName, file: path.basename(output), bytes: stat.size, sha256: outputHash,
    durationSeconds: project.manifest.durationSeconds, totalFrames: project.manifest.totalFrames, fps: project.manifest.fps,
    width: profile.width, height: profile.height, layout: "native portrait scene composition",
    sourceVisuals: ["app/assets/topology.js", "app/assets/topology-morph.js", "app/assets/topology-art.js", "app/assets/topologies/*.svg"],
    sourceAudio: path.relative(repositoryRoot, audio).replaceAll("\\", "/"), captions: path.basename(captions),
    encode: { encoder: "libx264", targetVideoBitRate: profile.videoBitRate, maximumVideoBitRate: profile.maximumVideoBitRate, audioTargetBitRate: 320000, fastStart: true }
  }, null, 2)}\n`, "utf8");
  process.stdout.write(`${profile.label} written to ${output}\n`);
}

async function main() {
  const profileName = process.argv[2];
  const profile = profiles[profileName];
  if (!profile) fail("Usage: node render-social.mjs douyin|xiaohongshu [--keyframes] [--overwrite]");
  const keyframesOnly = process.argv.includes("--keyframes");
  const overwrite = process.argv.includes("--overwrite");
  registerFonts();
  const project = await loadProject();
  const composition = makeComposition(project, profile);
  if (keyframesOnly) {
    await renderKeyframes(composition, profileName, path.join(buildRoot, "social", profileName, "keyframes"));
    return;
  }
  await renderVideo(project, composition, profile, profileName, overwrite);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

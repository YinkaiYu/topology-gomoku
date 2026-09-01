import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const Compositor = require("../src/compositor.js");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PV_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPOSITORY_ROOT = path.resolve(PV_ROOT, "..", "..");
const DEFAULT_MANIFEST = path.join(PV_ROOT, "manifest.json");
const DEFAULT_OUTPUT_ROOT = path.join(REPOSITORY_ROOT, ".tmp", "chapter-teaser");
const DEFAULT_CAPTIONS_ASS = path.join(PV_ROOT, "captions.ass");
const DEFAULT_SUBTITLE_FONT_SOURCE = path.join(PV_ROOT, "assets", "fonts", "topo-sans-pv-600.ttf");
const DEFAULT_SUBTITLE_FONT_DIRECTORY = path.join(DEFAULT_OUTPUT_ROOT, "render-fonts");

function parseCli(argv) {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      mode: { type: "string" },
      profile: { type: "string" },
      manifest: { type: "string" },
      output: { type: "string", short: "o" },
      frame: { type: "string" },
      "start-frame": { type: "string" },
      "end-frame": { type: "string" },
      quality: { type: "string" },
      silent: { type: "boolean", default: false },
      "no-subtitles": { type: "boolean", default: false },
      h264: { type: "boolean", default: false },
      overwrite: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });
  const positionalMode = parsed.positionals[0];
  let mode = parsed.values.mode || positionalMode || "review";
  if (mode === "preview") mode = "review";
  if (!new Set(["review", "master", "keyframes", "frame"]).has(mode)) {
    throw new Error(`Unknown render mode: ${mode}`);
  }
  let profile = parsed.values.profile || (mode === "master" || mode === "keyframes" ? "master" : "review");
  if (!new Set(["review", "master"]).has(profile)) {
    throw new Error(`Unknown render profile: ${profile}`);
  }
  return { ...parsed.values, mode, profile };
}

function usage() {
  return [
    "Usage: node video/chapter-teaser/scripts/render.mjs [review|master|keyframes|frame] [options]",
    "",
    "  --profile review|master     Override dimensions",
    "  --manifest PATH             Timeline manifest (default: video/chapter-teaser/manifest.json)",
    "  --output PATH               Video, PNG, or keyframe directory",
    "  --frame N                   Frame index for frame mode",
    "  --start-frame N             First video frame (inclusive)",
    "  --end-frame N               Final video frame (exclusive)",
    "  --silent                    Render without the manifest audio master",
    "  --no-subtitles              Do not burn captions into rendered frames",
    "  --h264                     Use high-quality H.264 even for the 4K master profile",
    "  --overwrite                 Replace an existing output file",
    "  --quality N                 Surface subdivisions per board interval"
  ].join("\n");
}

async function readJson(filePath, label) {
  let source;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`${label} is missing at ${filePath}${label === "manifest.json" ? "; run the PV audio build first" : ""}`);
    }
    throw error;
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function integerOption(value, label, fallback) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

function filterPath(filePath) {
  return path.resolve(filePath).replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function registerFonts() {
  for (const weight of [400, 600, 700]) {
    const fontPath = path.join(PV_ROOT, "assets", "fonts", `topo-serif-pv-${weight}.ttf`);
    if (!GlobalFonts.registerFromPath(fontPath, "Topo Serif PV")) {
      throw new Error(`Unable to register embedded font: ${fontPath}`);
    }
  }
  const subtitleFontPath = path.join(PV_ROOT, "assets", "fonts", "topo-sans-pv-600.ttf");
  if (!GlobalFonts.registerFromPath(subtitleFontPath, "Topo Sans PV")) {
    throw new Error(`Unable to register embedded subtitle font: ${subtitleFontPath}`);
  }
}

async function loadProject(options) {
  const manifestPath = path.resolve(REPOSITORY_ROOT, options.manifest || DEFAULT_MANIFEST);
  const topologyIds = ["plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"];
  const [story, manifest, institutionLogo, gameLogo, ...topologyImages] = await Promise.all([
    readJson(path.join(PV_ROOT, "story.json"), "story.json"),
    readJson(manifestPath, "manifest.json"),
    loadImage(path.join(PV_ROOT, "assets", "iop-logo.png")),
    loadImage(path.join(REPOSITORY_ROOT, "app", "assets", "brand-icon.png")),
    ...topologyIds.map((id) => loadImage(path.join(REPOSITORY_ROOT, "app", "assets", "topologies", `${id}.svg`)))
  ]);
  const topologyIllustrations = Object.fromEntries(topologyIds.map((id, index) => [id, topologyImages[index]]));
  Compositor.validateManifest(manifest, story);
  return {
    story,
    manifest,
    logos: { institution: institutionLogo, game: gameLogo },
    topologyIllustrations,
    manifestPath
  };
}

function makeComposition(project, profileName, quality, subtitlesEnabled = true) {
  const profile = project.story.render[profileName];
  return Compositor.createComposition({
    story: project.story,
    manifest: project.manifest,
    width: profile.width,
    height: profile.height,
    quality: quality == null ? undefined : Number(quality),
    logos: project.logos,
    topologyIllustrations: project.topologyIllustrations,
    subtitlesEnabled
  });
}

function defaultVideoOutput(profile) {
  if (profile === "master") return path.join(DEFAULT_OUTPUT_ROOT, "master", "seven-realms-master.mov");
  return path.join(DEFAULT_OUTPUT_ROOT, "review", "seven-realms-review.mp4");
}

function resolveOutput(value, fallback) {
  return path.resolve(REPOSITORY_ROOT, value || fallback);
}

async function renderSingleFrame(composition, frameIndex, outputPath) {
  const canvas = createCanvas(composition.width, composition.height);
  const context = canvas.getContext("2d", { alpha: false });
  composition.renderFrame(context, frameIndex);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, canvas.toBuffer("image/png"));
  process.stdout.write(`Rendered frame ${frameIndex}: ${outputPath}\n`);
}

function selectKeyframes(composition) {
  const selected = [];
  for (const segment of composition.manifest.segments) {
    const kind = Compositor.internals.segmentKind(segment);
    const duration = segment.endFrame - segment.startFrame;
    if (kind === "chapter-card") {
      selected.push({ frame: Math.min(segment.endFrame - 1, segment.startFrame + 72), label: `${segment.id}-act` });
      selected.push({
        frame: Math.min(
          segment.endFrame - 1,
          (Number.isInteger(segment.transformFrame)
            ? segment.transformFrame
            : segment.startFrame + composition.story.render.titleTransformFrame) + 30
        ),
        label: `${segment.id}-manifold`
      });
    } else if (kind === "chapter" || segment.chapterId) {
      selected.push({ frame: segment.startFrame + Math.floor(duration * 0.40), label: `${segment.id}-board` });
      selected.push({ frame: segment.startFrame + Math.floor(duration * 0.88), label: `${segment.id}-surface` });
    } else {
      selected.push({ frame: segment.startFrame + Math.floor(duration * 0.52), label: segment.id });
    }
  }
  const seen = new Set();
  return selected.filter((item) => {
    if (seen.has(item.frame)) return false;
    seen.add(item.frame);
    return true;
  });
}

function safeFilename(value) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "frame";
}

async function renderKeyframes(project, options) {
  const outputDirectory = resolveOutput(options.output, path.join(DEFAULT_OUTPUT_ROOT, "keyframes"));
  await fs.mkdir(outputDirectory, { recursive: true });
  const composition = makeComposition(project, options.profile, options.quality, !options["no-subtitles"]);
  const canvas = createCanvas(composition.width, composition.height);
  const context = canvas.getContext("2d", { alpha: false });
  const frames = selectKeyframes(composition);

  const thumbWidth = 480;
  const thumbHeight = 270;
  const columns = 4;
  const rows = Math.ceil(frames.length / columns);
  const sheet = createCanvas(thumbWidth * columns, thumbHeight * rows);
  const sheetContext = sheet.getContext("2d", { alpha: false });
  sheetContext.fillStyle = composition.gamePalette.paperDeep;
  sheetContext.fillRect(0, 0, sheet.width, sheet.height);

  for (let index = 0; index < frames.length; index += 1) {
    const item = frames[index];
    composition.renderFrame(context, item.frame);
    const filename = `${String(index + 1).padStart(2, "0")}-${String(item.frame).padStart(6, "0")}-${safeFilename(item.label)}.png`;
    await fs.writeFile(path.join(outputDirectory, filename), canvas.toBuffer("image/png"));
    sheetContext.drawImage(canvas, (index % columns) * thumbWidth, Math.floor(index / columns) * thumbHeight, thumbWidth, thumbHeight);
    process.stdout.write(`Rendered keyframe ${index + 1}/${frames.length}: ${item.frame}\n`);
  }
  await fs.writeFile(path.join(outputDirectory, "contact-sheet.png"), sheet.toBuffer("image/png"));
  await fs.writeFile(
    path.join(outputDirectory, "frames.json"),
    `${JSON.stringify({ profile: options.profile, width: composition.width, height: composition.height, frames }, null, 2)}\n`
  );
  process.stdout.write(`Keyframes written to ${outputDirectory}\n`);
}

function resolveAudioPath(manifest) {
  const value = manifest.audio && manifest.audio.masterMix;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("manifest.audio.masterMix is required for an audiovisual render; use --silent only for diagnostics");
  }
  return path.resolve(REPOSITORY_ROOT, value);
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function validateAudioMaster(manifest, audioPath) {
  const artifact = manifest.audio?.artifacts?.masterMix;
  const rebuild = "run the PV audio build first";
  if (!artifact || typeof artifact.path !== "string" || !Number.isInteger(artifact.bytes) || typeof artifact.sha256 !== "string") {
    throw new Error(`Audio master provenance is missing from manifest.json; ${rebuild}`);
  }
  if (path.resolve(REPOSITORY_ROOT, artifact.path) !== audioPath) {
    throw new Error(`Audio master path does not match its manifest artifact; ${rebuild}`);
  }
  const stat = await fs.stat(audioPath);
  if (stat.size !== artifact.bytes) {
    throw new Error(`Audio master byte length differs from manifest.json; ${rebuild}`);
  }
  const digest = await sha256(audioPath);
  if (digest !== artifact.sha256.toLowerCase()) {
    throw new Error(`Audio master checksum differs from manifest.json; ${rebuild}`);
  }

  const handle = await fs.open(audioPath, "r");
  const header = Buffer.alloc(44);
  try {
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length) throw new Error(`Audio master WAV header is truncated; ${rebuild}`);
  } finally {
    await handle.close();
  }
  const standardPcm = header.toString("ascii", 0, 4) === "RIFF"
    && header.toString("ascii", 8, 12) === "WAVE"
    && header.toString("ascii", 12, 16) === "fmt "
    && header.readUInt16LE(20) === 1
    && header.toString("ascii", 36, 40) === "data";
  if (!standardPcm) throw new Error(`Audio master is not the expected canonical PCM WAV; ${rebuild}`);

  const channels = header.readUInt16LE(22);
  const sampleRate = header.readUInt32LE(24);
  const bitsPerSample = header.readUInt16LE(34);
  const dataBytes = header.readUInt32LE(40);
  const samplesPerFrame = manifest.samplesPerFrame;
  const expectedSampleFrames = manifest.totalFrames * samplesPerFrame;
  const expectedDataBytes = expectedSampleFrames * channels * bitsPerSample / 8;
  if (channels !== 2 || sampleRate !== manifest.sampleRate || bitsPerSample !== 16
      || samplesPerFrame !== manifest.sampleRate / manifest.fps
      || !Number.isInteger(expectedSampleFrames)
      || dataBytes !== expectedDataBytes
      || stat.size !== 44 + dataBytes) {
    throw new Error(`Audio master does not contain exactly ${manifest.totalFrames} frame-aligned 48 kHz stereo samples; ${rebuild}`);
  }
}

function ffmpegArguments({
  composition,
  profile,
  outputPath,
  audioPath,
  subtitlePath,
  subtitleFontDirectory,
  startFrame,
  endFrame,
  h264,
  overwrite
}) {
  const count = endFrame - startFrame;
  const duration = count / composition.fps;
  const args = [
    overwrite ? "-y" : "-n",
    "-hide_banner",
    "-loglevel", "warning",
    "-f", "rawvideo",
    "-pixel_format", "rgba",
    "-video_size", `${composition.width}x${composition.height}`,
    "-framerate", String(composition.fps),
    "-i", "pipe:0"
  ];
  if (audioPath) {
    if (startFrame > 0) args.push("-ss", (startFrame / composition.fps).toFixed(6));
    args.push("-i", audioPath, "-map", "0:v:0", "-map", "1:a:0", "-af", `apad=whole_dur=${duration.toFixed(6)}`);
  } else {
    args.push("-map", "0:v:0", "-an");
  }
  const useH264 = h264 || profile !== "master";
  const outputFormat = useH264 ? "yuv420p" : "yuv422p10le";
  const videoFilters = [];
  if (subtitlePath) {
    if (startFrame > 0) videoFilters.push(`setpts=PTS+${(startFrame / composition.fps).toFixed(6)}/TB`);
    videoFilters.push(
      `subtitles=filename='${filterPath(subtitlePath)}':fontsdir='${filterPath(subtitleFontDirectory)}'`
    );
    if (startFrame > 0) videoFilters.push("setpts=PTS-STARTPTS");
  }
  videoFilters.push(
    `scale=in_range=full:out_range=limited:out_color_matrix=bt709`,
    `format=${outputFormat}`,
    "setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709"
  );
  args.push(
    "-vf", videoFilters.join(","),
    "-r", String(composition.fps),
    "-fps_mode", "cfr",
    "-frames:v", String(count),
    "-t", duration.toFixed(6),
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-colorspace", "bt709",
    "-color_range", "tv"
  );
  if (!useH264) {
    args.push("-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-bits_per_mb", "8000");
    if (audioPath) args.push("-c:a", "pcm_s24le", "-ar", "48000", "-ac", "2");
  } else {
    args.push(
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "16",
      "-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off",
      "-movflags", "+faststart+write_colr"
    );
    if (h264 && profile === "master") {
      args.push("-profile:v", "high", "-level:v", "5.2", "-g", "120", "-keyint_min", "60", "-sc_threshold", "0");
    }
    if (audioPath) args.push("-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2");
  }
  args.push(
    "-metadata", "title=Seven Realms Footsteps",
    "-metadata", "comment=Deterministic frame-index render",
    outputPath
  );
  return args;
}

async function writeFrame(stream, buffer) {
  if (stream.destroyed || stream.writableEnded) throw new Error("FFmpeg input closed before all frames were written");
  if (stream.write(buffer)) return;
  await new Promise((resolve, reject) => {
    function cleanup() {
      stream.off("drain", onDrain);
      stream.off("error", onError);
      stream.off("close", onClose);
    }
    function onDrain() {
      cleanup();
      resolve();
    }
    function onError(error) {
      cleanup();
      reject(error);
    }
    function onClose() {
      cleanup();
      reject(new Error("FFmpeg input closed before accepting the frame"));
    }
    stream.once("drain", onDrain);
    stream.once("error", onError);
    stream.once("close", onClose);
  });
}

async function renderVideo(project, options) {
  const useAssSubtitles = options.profile === "master" && !options["no-subtitles"];
  const composition = makeComposition(
    project,
    options.profile,
    options.quality,
    !options["no-subtitles"] && !useAssSubtitles
  );
  const startFrame = integerOption(options["start-frame"], "--start-frame", 0);
  const endFrame = integerOption(options["end-frame"], "--end-frame", composition.totalFrames);
  if (startFrame < 0 || startFrame >= composition.totalFrames) throw new Error("--start-frame is outside the timeline");
  if (endFrame <= startFrame || endFrame > composition.totalFrames) throw new Error("--end-frame is outside the timeline");

  const outputPath = resolveOutput(options.output, defaultVideoOutput(options.profile));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  let audioPath = null;
  if (!options.silent) {
    audioPath = resolveAudioPath(project.manifest);
    try {
      await fs.access(audioPath);
    } catch {
      throw new Error(`Audio master is missing at ${audioPath}; run the PV audio build first`);
    }
    await validateAudioMaster(project.manifest, audioPath);
  }

  let subtitlePath = null;
  let subtitleFontDirectory = null;
  if (useAssSubtitles) {
    subtitlePath = DEFAULT_CAPTIONS_ASS;
    subtitleFontDirectory = DEFAULT_SUBTITLE_FONT_DIRECTORY;
    try {
      await Promise.all([fs.access(subtitlePath), fs.access(DEFAULT_SUBTITLE_FONT_SOURCE)]);
      await fs.mkdir(subtitleFontDirectory, { recursive: true });
      await fs.copyFile(
        DEFAULT_SUBTITLE_FONT_SOURCE,
        path.join(subtitleFontDirectory, "topo-sans-pv-600.ttf")
      );
    } catch {
      throw new Error(`ASS subtitles or their bundled font are missing; run the PV audio and font builds first`);
    }
  }

  const args = ffmpegArguments({
    composition,
    profile: options.profile,
    outputPath,
    audioPath,
    subtitlePath,
    subtitleFontDirectory,
    startFrame,
    endFrame,
    h264: options.h264,
    overwrite: options.overwrite
  });
  const encoder = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
  const encoderExit = new Promise((resolve, reject) => {
    encoder.once("error", reject);
    encoder.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with ${code == null ? signal : `code ${code}`}`));
    });
  });
  let stdinFailure = null;
  encoder.stdin.on("error", (error) => { stdinFailure = error; });

  const canvas = createCanvas(composition.width, composition.height);
  const context = canvas.getContext("2d", { alpha: false });
  const total = endFrame - startFrame;
  try {
    for (let frameIndex = startFrame; frameIndex < endFrame; frameIndex += 1) {
      composition.renderFrame(context, frameIndex);
      await writeFrame(encoder.stdin, canvas.data());
      if ((frameIndex - startFrame) % (composition.fps * 5) === 0 || frameIndex + 1 === endFrame) {
        const complete = frameIndex - startFrame + 1;
        process.stdout.write(`Rendered ${complete}/${total} frames (${(complete / total * 100).toFixed(1)}%)\n`);
      }
      if (stdinFailure) throw stdinFailure;
    }
    encoder.stdin.end();
    await encoderExit;
  } catch (error) {
    if (!encoder.killed) encoder.kill();
    await encoderExit.catch(() => {});
    throw error;
  }
  process.stdout.write(`Video written to ${outputPath}\n`);
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  registerFonts();
  const project = await loadProject(options);
  if (options.mode === "keyframes") {
    await renderKeyframes(project, options);
    return;
  }
  if (options.mode === "frame") {
    const composition = makeComposition(project, options.profile, options.quality, !options["no-subtitles"]);
    const frameIndex = integerOption(options.frame, "--frame", 0);
    if (frameIndex < 0 || frameIndex >= composition.totalFrames) throw new Error("--frame is outside the timeline");
    const outputPath = resolveOutput(options.output, path.join(DEFAULT_OUTPUT_ROOT, "keyframes", `frame-${String(frameIndex).padStart(6, "0")}.png`));
    await renderSingleFrame(composition, frameIndex, outputPath);
    return;
  }
  await renderVideo(project, options);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

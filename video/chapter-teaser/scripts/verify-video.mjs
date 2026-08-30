import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const require = createRequire(import.meta.url);
const Compositor = require("../src/compositor.js");
const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PV_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPOSITORY_ROOT = path.resolve(PV_ROOT, "..", "..");
const DEFAULT_MANIFEST = path.join(PV_ROOT, "manifest.json");
const DEFAULT_OUTPUT_ROOT = path.join(REPOSITORY_ROOT, ".tmp", "chapter-teaser");

const parsed = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  strict: true,
  options: {
    input: { type: "string", short: "i" },
    manifest: { type: "string" },
    profile: { type: "string", default: "review" },
    "expected-frames": { type: "string" },
    silent: { type: "boolean", default: false },
    "manifest-only": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    ffprobe: { type: "string", default: "ffprobe" },
    help: { type: "boolean", short: "h", default: false }
  }
});

if (parsed.values.help) {
  process.stdout.write([
    "Usage: node video/chapter-teaser/scripts/verify-video.mjs [input] [options]",
    "",
    "  --profile review|master     Expected image profile",
    "  --manifest PATH             Timeline manifest",
    "  --expected-frames N         Override expected frame count for a partial render",
    "  --silent                    Allow an output without audio",
    "  --manifest-only             Validate timeline and visual contracts without video",
    "  --json                      Print the verification report as JSON"
  ].join("\n") + "\n");
  process.exit(0);
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`${label} is missing at ${filePath}${label === "manifest.json" ? "; run the PV audio build first" : ""}`);
    }
    throw new Error(`${label} cannot be read: ${error.message}`);
  }
}

function resolveFromRoot(value, fallback) {
  return path.resolve(REPOSITORY_ROOT, value || fallback);
}

function numberOption(value, label, fallback) {
  if (value == null) return fallback;
  const parsedNumber = Number(value);
  if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) throw new Error(`${label} must be a positive integer`);
  return parsedNumber;
}

function rational(value) {
  const [numerator, denominator = "1"] = String(value || "0").split("/");
  return Number(numerator) / Number(denominator);
}

function verifyTimeline(story, manifest) {
  Compositor.validateManifest(manifest, story);
  const chapterReports = [];
  for (const chapter of story.chapters) {
    const card = manifest.segments.find((segment) => segment.kind === "chapter-card" && segment.chapterId === chapter.id);
    const scene = manifest.segments.find((segment) => segment.kind === "chapter" && segment.chapterId === chapter.id);
    invariant(card, `missing chapter-card segment: ${chapter.id}`);
    invariant(scene, `missing chapter segment: ${chapter.id}`);
    invariant(card.endFrame === scene.startFrame, `chapter card and scene must be contiguous: ${chapter.id}`);
    invariant(card.act === chapter.act && card.title === chapter.chapter && card.manifold === chapter.manifold, `chapter-card text mismatch: ${chapter.id}`);
    invariant(card.narrationCueIds.length === 0, `chapter-card must remain silent: ${chapter.id}`);
    chapterReports.push({
      id: chapter.id,
      cardFrames: card.durationFrames,
      transformFrame: card.transformFrame,
      sceneFrames: scene.durationFrames
    });
  }
  const finalSegment = manifest.segments.at(-1);
  invariant(finalSegment.kind === "end-card", "the final timeline segment must be the end card");
  invariant(Array.isArray(manifest.cues), "manifest.cues must be an array");
  invariant(manifest.subtitles.length === manifest.cues.length, "subtitles and narration cues must be one-to-one");
  return chapterReports;
}

async function probeVideo(inputPath, ffprobe) {
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error",
    "-count_frames",
    "-show_streams",
    "-show_format",
    "-of", "json",
    inputPath
  ], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function streamDuration(stream) {
  const value = Number(stream && stream.duration);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function verifyMedia(probe, story, manifest, profileName, expectedFrames, silent) {
  const expectedProfile = story.render[profileName];
  invariant(expectedProfile, `unknown profile: ${profileName}`);
  const videos = probe.streams.filter((stream) => stream.codec_type === "video");
  const audios = probe.streams.filter((stream) => stream.codec_type === "audio");
  invariant(videos.length === 1, "output must contain exactly one video stream");
  invariant(silent ? audios.length === 0 : audios.length === 1, silent ? "silent output must not contain audio" : "output must contain exactly one audio stream");
  const video = videos[0];
  invariant(video.width === expectedProfile.width && video.height === expectedProfile.height, `expected ${expectedProfile.width}x${expectedProfile.height}, got ${video.width}x${video.height}`);
  invariant(Math.abs(rational(video.avg_frame_rate) - manifest.fps) < 1e-6, `average frame rate must be ${manifest.fps}`);
  invariant(Math.abs(rational(video.r_frame_rate) - manifest.fps) < 1e-6, `nominal frame rate must be ${manifest.fps}`);
  invariant(Number(video.nb_read_frames) === expectedFrames, `expected ${expectedFrames} decoded frames, got ${video.nb_read_frames}`);
  invariant(video.color_space === "bt709", `video color space must be bt709, got ${video.color_space || "unspecified"}`);
  invariant(video.color_primaries === "bt709", `video color primaries must be bt709, got ${video.color_primaries || "unspecified"}`);
  invariant(video.color_transfer === "bt709", `video transfer must be bt709, got ${video.color_transfer || "unspecified"}`);
  const expectedPixelFormat = profileName === "master" ? "yuv422p10le" : "yuv420p";
  invariant(video.pix_fmt === expectedPixelFormat, `expected ${expectedPixelFormat}, got ${video.pix_fmt}`);

  const expectedDuration = expectedFrames / manifest.fps;
  const formatDuration = Number(probe.format.duration);
  invariant(Number.isFinite(formatDuration), "container duration is missing");
  invariant(Math.abs(formatDuration - expectedDuration) <= 1 / manifest.fps + 0.002, `container duration ${formatDuration} differs from ${expectedDuration}`);

  let audioReport = null;
  if (!silent) {
    const audio = audios[0];
    invariant(Number(audio.sample_rate) === story.render.sampleRate, `audio sample rate must be ${story.render.sampleRate}`);
    invariant(audio.channels === 2, "audio must be stereo");
    const videoDuration = streamDuration(video);
    const audioDuration = streamDuration(audio);
    if (videoDuration != null && audioDuration != null) {
      invariant(Math.abs(videoDuration - audioDuration) <= 1 / manifest.fps + 1 / story.render.sampleRate + 0.002, "audio/video duration drift exceeds one frame");
    }
    audioReport = {
      codec: audio.codec_name,
      sampleRate: Number(audio.sample_rate),
      channels: audio.channels,
      duration: audioDuration
    };
  }

  return {
    width: video.width,
    height: video.height,
    fps: rational(video.avg_frame_rate),
    frames: Number(video.nb_read_frames),
    duration: formatDuration,
    pixelFormat: video.pix_fmt,
    colorSpace: video.color_space,
    audio: audioReport
  };
}

async function main() {
  if (!new Set(["review", "master"]).has(parsed.values.profile)) {
    throw new Error("--profile must be review or master");
  }
  const manifestPath = resolveFromRoot(parsed.values.manifest, DEFAULT_MANIFEST);
  const [story, manifest] = await Promise.all([
    readJson(path.join(PV_ROOT, "story.json"), "story.json"),
    readJson(manifestPath, "manifest.json")
  ]);
  const chapters = verifyTimeline(story, manifest);
  const report = {
    ok: true,
    manifest: path.relative(REPOSITORY_ROOT, manifestPath).replaceAll("\\", "/"),
    totalFrames: manifest.totalFrames,
    fps: manifest.fps,
    subtitles: manifest.subtitles.length,
    chapters
  };
  if (!parsed.values["manifest-only"]) {
    const fallback = parsed.values.profile === "master"
      ? path.join(DEFAULT_OUTPUT_ROOT, "master", "seven-realms-master.mov")
      : path.join(DEFAULT_OUTPUT_ROOT, "delivery", "topology-gomoku-chapter-teaser-final-1080p.mp4");
    const inputPath = resolveFromRoot(parsed.values.input || parsed.positionals[0], fallback);
    try {
      await fs.access(inputPath);
    } catch {
      throw new Error(`video output is missing at ${inputPath}`);
    }
    const expectedFrames = numberOption(parsed.values["expected-frames"], "--expected-frames", manifest.totalFrames);
    const probe = await probeVideo(inputPath, parsed.values.ffprobe);
    report.video = verifyMedia(probe, story, manifest, parsed.values.profile, expectedFrames, parsed.values.silent);
    report.input = path.relative(REPOSITORY_ROOT, inputPath).replaceAll("\\", "/");
  }
  if (parsed.values.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`PV verification passed: ${report.totalFrames} frames, ${report.subtitles} subtitle cues, ${report.chapters.length} chapters\n`);
    if (report.video) {
      process.stdout.write(`Video: ${report.video.width}x${report.video.height} ${report.video.fps}fps ${report.video.colorSpace} ${report.video.pixelFormat}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

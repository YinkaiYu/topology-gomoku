import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pvRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(pvRoot, "..", "..");
const buildRoot = path.join(repositoryRoot, ".tmp", "chapter-teaser");
const defaultOutputRoot = path.join(buildRoot, "final-deliveries");

const profiles = Object.freeze([
  Object.freeze({
    id: "bilibili",
    label: "Bilibili 4K upload",
    width: 3840,
    height: 2160,
    source: path.join(buildRoot, "bilibili", "seven-realms-bilibili-4k60.mp4"),
    output: "topology-gomoku-footsteps-loop-bilibili-4k60.mp4"
  }),
  Object.freeze({
    id: "douyin",
    label: "Douyin native portrait upload",
    width: 1080,
    height: 1920,
    source: path.join(buildRoot, "social", "douyin", "topology-gomoku-douyin-1080x1920-60fps.mp4"),
    output: "topology-gomoku-footsteps-loop-douyin-1080x1920-60fps.mp4"
  }),
  Object.freeze({
    id: "xiaohongshu",
    label: "Xiaohongshu native portrait upload",
    width: 1080,
    height: 1440,
    source: path.join(buildRoot, "social", "xiaohongshu", "topology-gomoku-xiaohongshu-1080x1440-60fps.mp4"),
    output: "topology-gomoku-footsteps-loop-xiaohongshu-1080x1440-60fps.mp4"
  })
]);

function runChecked(executable, args, label, timeout = 1200000) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    windowsHide: true,
    encoding: "utf8",
    timeout,
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} exited with status ${result.status}${detail ? `\n${detail}` : ""}`);
  }
  return result.stdout;
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(8 * 1024 * 1024);
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function probe(ffprobe, filePath) {
  return JSON.parse(runChecked(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration:stream=index,codec_type,codec_name,profile,level,width,height,pix_fmt,color_range,color_space,color_transfer,color_primaries,r_frame_rate,nb_frames,sample_rate,channels,bit_rate",
    "-of", "json", filePath
  ], `Probe ${path.basename(filePath)}`, 60000));
}

function videoStreamHash(ffmpeg, filePath) {
  const output = runChecked(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-i", filePath,
    "-map", "0:v:0", "-c:v", "copy", "-f", "hash", "-hash", "sha256", "-"
  ], `Video bitstream hash ${path.basename(filePath)}`, 300000);
  const match = output.match(/SHA256=([a-f0-9]{64})/iu);
  if (!match) throw new Error(`Unable to parse video bitstream hash for ${filePath}`);
  return match[1].toLowerCase();
}

function validateProbe(probeResult, profile, timeline) {
  const video = probeResult.streams?.find((stream) => stream.codec_type === "video");
  const audio = probeResult.streams?.find((stream) => stream.codec_type === "audio");
  if (!video || video.codec_name !== "h264" || video.width !== profile.width || video.height !== profile.height) {
    throw new Error(`${profile.label} video stream does not match its delivery profile`);
  }
  const [numerator, denominator] = String(video.r_frame_rate).split("/").map(Number);
  if (numerator / denominator !== timeline.fps || Number(video.nb_frames) !== timeline.totalFrames) {
    throw new Error(`${profile.label} must contain exactly ${timeline.totalFrames} frames at ${timeline.fps} fps`);
  }
  if (!audio || audio.codec_name !== "aac" || Number(audio.sample_rate) !== timeline.sampleRate || audio.channels !== 2) {
    throw new Error(`${profile.label} audio must be 48 kHz stereo AAC`);
  }
  if (Math.abs(Number(probeResult.format?.duration) - timeline.durationSeconds) > 1 / timeline.fps + 0.02) {
    throw new Error(`${profile.label} duration does not match the narration timeline`);
  }
}

function renderDelivery({ ffmpeg, ffprobe, profile, sourcePath, outputRoot, audioPath, timeline, overwrite }) {
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing approved platform picture source: ${sourcePath}`);
  const outputDirectory = path.join(outputRoot, profile.id);
  const outputPath = path.join(outputDirectory, profile.output);
  fs.mkdirSync(outputDirectory, { recursive: true });
  if (fs.existsSync(outputPath) && !overwrite) {
    throw new Error(`Output already exists: ${outputPath}; pass --overwrite to replace it`);
  }
  const temporaryPath = path.join(outputDirectory, `.${profile.output}.partial.mp4`);
  if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });

  const sourceProbe = probe(ffprobe, sourcePath);
  validateProbe(sourceProbe, profile, timeline);
  const sourceVideoHash = videoStreamHash(ffmpeg, sourcePath);
  try {
    runChecked(ffmpeg, [
      "-hide_banner", "-loglevel", "warning", "-y",
      "-i", sourcePath, "-i", audioPath,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "320k", "-ar", String(timeline.sampleRate), "-ac", "2",
      "-t", timeline.durationSeconds.toFixed(6),
      "-movflags", "+faststart+write_colr",
      "-metadata", `title=Topology Gomoku — ${profile.label}`,
      temporaryPath
    ], `Package ${profile.label}`, 1200000);

    const outputProbe = probe(ffprobe, temporaryPath);
    validateProbe(outputProbe, profile, timeline);
    const outputVideoHash = videoStreamHash(ffmpeg, temporaryPath);
    if (outputVideoHash !== sourceVideoHash) {
      throw new Error(`${profile.label} video bitstream changed while replacing audio`);
    }
    runChecked(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-xerror", "-i", temporaryPath,
      "-map", "0:v:0", "-map", "0:a:0",
      "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"
    ], `Decode ${profile.label}`, 600000);

    if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });
    fs.renameSync(temporaryPath, outputPath);
    const outputHash = sha256(outputPath);
    const sourceHash = sha256(sourcePath);
    fs.writeFileSync(`${outputPath}.sha256`, `${outputHash} *${path.basename(outputPath)}\n`, "utf8");
    const deliveryManifest = {
      schemaVersion: 3,
      delivery: profile.id,
      file: path.basename(outputPath),
      bytes: fs.statSync(outputPath).size,
      sha256: outputHash,
      width: profile.width,
      height: profile.height,
      fps: timeline.fps,
      totalFrames: timeline.totalFrames,
      durationSeconds: timeline.durationSeconds,
      sourcePicture: {
        file: path.relative(repositoryRoot, sourcePath).replaceAll("\\", "/"),
        sha256: sourceHash,
        videoBitstreamSha256: sourceVideoHash,
        policy: "approved platform-native picture stream copied bit-for-bit; only the final audio was replaced"
      },
      audio: {
        file: path.relative(repositoryRoot, audioPath).replaceAll("\\", "/"),
        sha256: timeline.audio.artifacts.masterMix.sha256,
        codec: "aac",
        targetBitRate: 320000,
        sampleRate: timeline.sampleRate,
        channels: 2,
        cadenceTailFrames: timeline.music.clips.at(-1).targetEndFrame - timeline.segments.find((segment) => segment.kind === "end-card").startFrame,
        digitalSilenceFromFrame: timeline.music.clips.at(-1).targetEndFrame
      },
      probe: outputProbe,
      qa: {
        videoBitstreamPreserved: true,
        fullDecodePassed: true,
        large4kMasterGenerated: false
      }
    };
    fs.writeFileSync(path.join(outputDirectory, "delivery-manifest.json"), `${JSON.stringify(deliveryManifest, null, 2)}\n`, "utf8");
    process.stdout.write(`${profile.label} written to ${outputPath}\n`);
    return deliveryManifest;
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

const parsed = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    "output-root": { type: "string", default: defaultOutputRoot },
    "bilibili-source": { type: "string" },
    "douyin-source": { type: "string" },
    "xiaohongshu-source": { type: "string" },
    overwrite: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false }
  }
});

if (parsed.values.help) {
  process.stdout.write([
    "Usage: node video/chapter-teaser/scripts/package-platform-deliveries.mjs [options]",
    "",
    "Replaces only the audio of the approved platform-native videos and writes final upload files.",
    "No ProRes or other large 4K master is generated.",
    "",
    "  --output-root PATH",
    "  --bilibili-source PATH",
    "  --douyin-source PATH",
    "  --xiaohongshu-source PATH",
    "  --overwrite"
  ].join("\n") + "\n");
  process.exit(0);
}

const timeline = JSON.parse(fs.readFileSync(path.join(pvRoot, "manifest.json"), "utf8"));
const audioPath = path.resolve(repositoryRoot, timeline.audio?.masterMix || "__missing__");
const audioArtifact = timeline.audio?.artifacts?.masterMix;
if (!audioArtifact || !fs.existsSync(audioPath) || sha256(audioPath) !== audioArtifact.sha256) {
  throw new Error("The frame-aligned master audio is missing or stale; run npm run pv:audio first");
}
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const outputRoot = path.resolve(repositoryRoot, parsed.values["output-root"]);
const sourceOverrides = {
  bilibili: parsed.values["bilibili-source"],
  douyin: parsed.values["douyin-source"],
  xiaohongshu: parsed.values["xiaohongshu-source"]
};
const deliveries = profiles.map((profile) => renderDelivery({
  ffmpeg,
  ffprobe,
  profile,
  sourcePath: path.resolve(repositoryRoot, sourceOverrides[profile.id] || profile.source),
  outputRoot,
  audioPath,
  timeline,
  overwrite: parsed.values.overwrite
}));
fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, "delivery-manifest.json"), `${JSON.stringify({
  schemaVersion: 3,
  title: "《拓扑五子棋》章节预告PV-「足迹回环」",
  generatedLarge4kMaster: false,
  deliveries: deliveries.map((delivery) => ({
    delivery: delivery.delivery,
    file: `${delivery.delivery}/${delivery.file}`,
    bytes: delivery.bytes,
    sha256: delivery.sha256
  }))
}, null, 2)}\n`, "utf8");
process.stdout.write(`Platform delivery set written to ${outputRoot}\n`);

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pvRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(pvRoot, "../..");
const defaultBuildRoot = path.join(repositoryRoot, ".tmp", "chapter-teaser");

function runChecked(executable, args, label, timeout = 600000) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    windowsHide: true,
    encoding: "utf8",
    timeout,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} exited with status ${result.status}${detail ? `\n${detail}` : ""}`);
  }
  return result.stdout;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function artifact(filePath) {
  return { file: path.basename(filePath), bytes: fs.statSync(filePath).size, sha256: sha256(filePath) };
}

function copyRequired(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`Missing deliverable source: ${source}`);
  fs.copyFileSync(source, destination);
}

function verifyArtifact(filePath, expected, label) {
  if (!expected) throw new Error(`Missing manifest artifact entry: ${label}`);
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
  const actualBytes = fs.statSync(filePath).size;
  const actualSha256 = sha256(filePath);
  if (actualBytes !== expected.bytes || actualSha256 !== expected.sha256) {
    throw new Error(
      `${label} no longer matches manifest: ${actualBytes}/${actualSha256} ` +
      `!= ${expected.bytes}/${expected.sha256}`
    );
  }
}

function copyManifestArtifact(manifest, key, destination) {
  const expected = manifest.audio?.artifacts?.[key];
  const source = path.resolve(repositoryRoot, expected?.path || "__missing__");
  verifyArtifact(source, expected, key);
  copyRequired(source, destination);
  verifyArtifact(destination, expected, `${key} delivery copy`);
}

function filterPath(filePath) {
  return path.resolve(filePath).replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function probe(ffprobe, filePath) {
  return JSON.parse(runChecked(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels",
    "-of", "json",
    filePath
  ], `Probe ${path.basename(filePath)}`, 30000));
}

const parsed = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    "build-root": { type: "string", default: defaultBuildRoot },
    "clean-video": { type: "string" },
    output: { type: "string" },
    help: { type: "boolean", short: "h", default: false }
  }
});

if (parsed.values.help) {
  process.stdout.write([
    "Usage: node video/chapter-teaser/scripts/package-deliverables.mjs [options]",
    "",
    "  --build-root PATH          Audio/render build root",
    "  --clean-video PATH         No-caption/no-audio review video",
    "  --output PATH              Delivery directory"
  ].join("\n") + "\n");
  process.exit(0);
}

const buildRoot = path.resolve(parsed.values["build-root"]);
const cleanSource = path.resolve(parsed.values["clean-video"] || path.join(buildRoot, "review", "chapter-teaser-clean.mp4"));
const deliveryRoot = path.resolve(parsed.values.output || path.join(buildRoot, "delivery"));
const manifest = JSON.parse(fs.readFileSync(path.join(pvRoot, "manifest.json"), "utf8"));
if (!manifest.audio?.rendered) throw new Error("Audio stems are not rendered; run npm run pv:audio first");

fs.mkdirSync(deliveryRoot, { recursive: true });
const files = {
  finalVideo: path.join(deliveryRoot, "topology-gomoku-chapter-teaser-final-1080p.mp4"),
  cleanVideo: path.join(deliveryRoot, "topology-gomoku-chapter-teaser-clean-1080p.mp4"),
  captionsSrt: path.join(deliveryRoot, "topology-gomoku-chapter-teaser.zh-CN.srt"),
  captionsAss: path.join(deliveryRoot, "topology-gomoku-chapter-teaser.zh-CN.ass"),
  subtitleFont: path.join(deliveryRoot, "topo-sans-pv-600.ttf"),
  music: path.join(deliveryRoot, "topology-gomoku-chapter-teaser-music.wav"),
  musicAndSfx: path.join(deliveryRoot, "topology-gomoku-chapter-teaser-music-and-sfx.wav"),
  sfx: path.join(deliveryRoot, "topology-gomoku-chapter-teaser-sfx.wav"),
  narrationOriginal: path.join(deliveryRoot, "余荫铠旁白配音-original.mp3"),
  narrationPcm: path.join(deliveryRoot, "余荫铠旁白配音-48k.wav"),
  masterAudio: path.join(deliveryRoot, "topology-gomoku-chapter-teaser-master.wav")
};

copyRequired(cleanSource, files.cleanVideo);
copyRequired(path.join(pvRoot, "captions.srt"), files.captionsSrt);
copyRequired(path.join(pvRoot, "captions.ass"), files.captionsAss);
copyRequired(path.join(pvRoot, "assets", "fonts", "topo-sans-pv-600.ttf"), files.subtitleFont);
copyManifestArtifact(manifest, "musicStem", files.music);
copyManifestArtifact(manifest, "scoreMix", files.musicAndSfx);
copyManifestArtifact(manifest, "sfxStem", files.sfx);
copyManifestArtifact(manifest, "originalVoice", files.narrationOriginal);
copyManifestArtifact(manifest, "voiceStem", files.narrationPcm);
copyManifestArtifact(manifest, "masterMix", files.masterAudio);

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const cleanProbe = probe(ffprobe, files.cleanVideo);
if (cleanProbe.streams.some((stream) => stream.codec_type === "audio")) {
  throw new Error("Clean video unexpectedly contains an audio stream");
}
const cleanVideoStream = cleanProbe.streams.find((stream) => stream.codec_type === "video");
if (!cleanVideoStream || cleanVideoStream.width !== 1920 || cleanVideoStream.height !== 1080) {
  throw new Error("Clean review video must be 1920x1080");
}
const [rateNumerator, rateDenominator] = String(cleanVideoStream.r_frame_rate).split("/").map(Number);
const cleanFrameRate = rateNumerator / rateDenominator;
if (Math.abs(cleanFrameRate - manifest.fps) > 0.001) {
  throw new Error(`Clean review frame rate mismatch: ${cleanFrameRate} vs ${manifest.fps}`);
}
if (Number(cleanVideoStream.nb_frames) !== manifest.totalFrames) {
  throw new Error(`Clean review frame count mismatch: ${cleanVideoStream.nb_frames} vs ${manifest.totalFrames}`);
}
if (Math.abs(Number(cleanProbe.format.duration) - manifest.durationSeconds) > 1 / manifest.fps + 0.002) {
  throw new Error(`Clean review duration mismatch: ${cleanProbe.format.duration} vs ${manifest.durationSeconds}`);
}

const subtitleFontRoot = path.join(buildRoot, "subtitle-fonts");
fs.mkdirSync(subtitleFontRoot, { recursive: true });
copyRequired(files.subtitleFont, path.join(subtitleFontRoot, path.basename(files.subtitleFont)));
const subtitleFilter = `subtitles=filename='${filterPath(files.captionsAss)}':fontsdir='${filterPath(subtitleFontRoot)}'`;
runChecked(ffmpeg, [
  "-hide_banner", "-loglevel", "warning", "-y",
  "-i", files.cleanVideo,
  "-i", files.masterAudio,
  "-map", "0:v:0", "-map", "1:a:0",
  "-vf", subtitleFilter,
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
  "-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off",
  "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
  "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2",
  "-t", manifest.durationSeconds.toFixed(6),
  "-movflags", "+faststart+write_colr",
  "-metadata", "title=Topology Gomoku — Seven Realms Chapter Teaser",
  files.finalVideo
], "Final caption burn and master mux", 1200000);

const finalProbe = probe(ffprobe, files.finalVideo);
const expectedDuration = manifest.durationSeconds;
for (const [key, filePath] of Object.entries(files)) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) throw new Error(`Empty delivery file: ${key}`);
}
const finalDuration = Number(finalProbe.format.duration);
if (Math.abs(finalDuration - expectedDuration) > 1 / manifest.fps + 0.02) {
  throw new Error(`Final duration mismatch: ${finalDuration} vs ${expectedDuration}`);
}

const deliveryManifest = {
  schemaVersion: 1,
  title: "拓扑五子棋章节预告PV",
  profile: "1080p review",
  fps: manifest.fps,
  durationSeconds: expectedDuration,
  note: "4K master remains gated on explicit visual review confirmation",
  files: Object.fromEntries(Object.entries(files).map(([key, filePath]) => [key, artifact(filePath)])),
  probes: { cleanVideo: cleanProbe, finalVideo: finalProbe }
};
fs.writeFileSync(path.join(deliveryRoot, "delivery-manifest.json"), `${JSON.stringify(deliveryManifest, null, 2)}\n`, "utf8");
process.stdout.write(`Delivery package written to ${deliveryRoot}\n`);

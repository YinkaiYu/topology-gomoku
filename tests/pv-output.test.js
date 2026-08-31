"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "footsteps-return");
const OUTPUT_PATH = path.join(PV_ROOT, "renders", "footsteps-return-4k.mp4");
const OUTPUT_MANIFEST_PATH = path.join(PV_ROOT, "renders", "footsteps-return-4k.manifest.json");
const EVIDENCE_PATH = path.join(ROOT, "artifacts", "pv-footsteps-return-task11-evidence.json");
const CONTACT_SHEET_PATH = path.join(ROOT, "artifacts", "pv-footsteps-return-task11-contact-sheet.png");
const ANIMATION_MAP_PATH = path.join(ROOT, "artifacts", "pv-footsteps-return-task11-animation-map.svg");
const LOGICAL_DURATION_SECONDS = 214.04;
const FPS = 60;
const EXPECTED_FRAMES = Math.ceil(LOGICAL_DURATION_SECONDS * FPS);
const PICTURE_DURATION_SECONDS = EXPECTED_FRAMES / FPS;
const FRAME_SECONDS = 1 / FPS;
const REQUIRE_REAL_OUTPUT = process.env.REQUIRE_PV_FINAL_OUTPUT === "1";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function sha256Stream(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function resolveMediaTools() {
  const doctorPath = path.join(PV_ROOT, "scripts", "doctor.mjs");
  const result = spawnSync(process.execPath, [doctorPath, "--score-tools-json"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const ffmpeg = JSON.parse(result.stdout.trim()).ffmpeg;
  const ffprobe = path.join(path.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  assert.ok(fs.existsSync(ffmpeg), `FFmpeg must exist at ${ffmpeg}`);
  assert.ok(fs.existsSync(ffprobe), `FFprobe must exist at ${ffprobe}`);
  return { ffmpeg, ffprobe };
}

function run(executable, args, { encoding = "utf8", maxBuffer = 64 * 1024 * 1024 } = {}) {
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    encoding,
    maxBuffer,
    timeout: 30 * 60 * 1000,
    windowsHide: true
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return result;
}

function pngDimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", `${filePath} must be PNG`);
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR", `${filePath} must contain IHDR first`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function probeOutput(ffprobe) {
  const result = run(ffprobe, [
    "-v", "error",
    "-count_frames",
    "-show_entries",
    "stream=index,codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,sample_rate,channels,channel_layout,start_time,duration:format=format_name,start_time,duration:format_tags=title",
    "-of", "json",
    OUTPUT_PATH
  ]);
  return JSON.parse(result.stdout);
}

function analyzeLoudness(ffmpeg) {
  const result = run(ffmpeg, [
    "-hide_banner", "-nostats", "-nostdin", "-i", OUTPUT_PATH,
    "-map", "0:a:0",
    "-af", "loudnorm=I=-14:LRA=11:TP=-1.2:print_format=json",
    "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"
  ]);
  const block = result.stderr.match(/\{\s*"input_i"[\s\S]*?"target_offset"\s*:\s*"[^"]+"\s*\}/);
  assert.ok(block, `FFmpeg loudnorm JSON missing:\n${result.stderr}`);
  return JSON.parse(block[0]);
}

function analyzeDeliverySimilarity(ffmpeg) {
  const mix = readJson(path.join(PV_ROOT, "audio", "mix.json"));
  const sourceMaster = path.join(ROOT, ...mix.composition.outputFile.split("/"));
  const result = run(ffmpeg, [
    "-hide_banner", "-nostdin",
    "-i", OUTPUT_PATH,
    "-i", sourceMaster,
    "-filter_complex", "[1:a]volume=-0.35dB,apad,atrim=duration=214.05[ref];[0:a][ref]asisdr",
    "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"
  ]);
  const channels = new Map(
    [...result.stderr.matchAll(/SI-SDR ch(\d+):\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/g)]
      .map((match) => [Number(match[1]), Number(match[2])])
  );
  assert.deepEqual([...channels.keys()].sort(), [0, 1], `FFmpeg asisdr must report both stereo channels:\n${result.stderr}`);
  return [channels.get(0), channels.get(1)];
}

function decodeTail(ffmpeg) {
  const tailStart = 210.04;
  const result = run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-ss", String(tailStart), "-i", OUTPUT_PATH,
    "-map", "0:a:0", "-t", String(PICTURE_DURATION_SECONDS - tailStart),
    "-ar", "48000", "-ac", "2", "-f", "f32le", "pipe:1"
  ], { encoding: null, maxBuffer: 8 * 1024 * 1024 });
  return { buffer: result.stdout, sampleRate: 48_000, channels: 2, start: tailStart };
}

function rmsDbfs(decoded, startSeconds, endSeconds) {
  const first = Math.max(0, Math.floor((startSeconds - decoded.start) * decoded.sampleRate));
  const last = Math.min(decoded.buffer.length / (decoded.channels * 4), Math.ceil((endSeconds - decoded.start) * decoded.sampleRate));
  let sumSquares = 0;
  let sampleCount = 0;
  for (let frame = first; frame < last; frame += 1) {
    for (let channel = 0; channel < decoded.channels; channel += 1) {
      const sample = decoded.buffer.readFloatLE((frame * decoded.channels + channel) * 4);
      sumSquares += sample * sample;
      sampleCount += 1;
    }
  }
  if (sampleCount === 0 || sumSquares === 0) return -Infinity;
  return 20 * Math.log10(Math.sqrt(sumSquares / sampleCount));
}

function parseDetectedIntervals(stderr, prefix) {
  const intervals = [];
  const regex = prefix === "black"
    ? /black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g
    : /lavfi\.freezedetect\.freeze_start:\s*([\d.]+)[\s\S]*?lavfi\.freezedetect\.freeze_(?:end|duration):\s*([\d.]+)/g;
  for (const match of stderr.matchAll(regex)) {
    if (prefix === "black") intervals.push({ start: Number(match[1]), end: Number(match[2]), duration: Number(match[3]) });
    else intervals.push({ start: Number(match[1]), durationOrEnd: Number(match[2]) });
  }
  return intervals;
}

test("Task 11 source contract keeps the sole delivery path native 4K/60", async () => {
  const packageJson = readJson(path.join(ROOT, "package.json"));
  const config = readJson(path.join(PV_ROOT, "hyperframes.config.json"));
  const indexHtml = fs.readFileSync(path.join(PV_ROOT, "index.html"), "utf8");
  const audioLicenses = readJson(path.join(PV_ROOT, "assets", "audio-licenses.json"));
  const deliveryScriptPath = path.join(PV_ROOT, "scripts", "render-final.ps1");
  const acceptedTitle = "《拓扑五子棋》章节预告 PV—「足迹回环」";
  assert.match(indexHtml, new RegExp(`<title>${acceptedTitle}</title>`));
  assert.equal(audioLicenses.project, acceptedTitle);
  assert.deepEqual({ width: config.width, height: config.height, fps: config.fps }, { width: 3840, height: 2160, fps: FPS });
  assert.match(packageJson.scripts["pv:render:4k"], /render-final\.ps1/);
  assert.doesNotMatch(packageJson.scripts["pv:render:4k"], /1080|1920|scale=/i);
  assert.equal(packageJson.scripts["pv:render:1080"], undefined);
  assert.ok(fs.existsSync(deliveryScriptPath), "Task 11 must own the strict native-4K render and controlled final mux");
  const deliveryScript = fs.readFileSync(deliveryScriptPath, "utf8");
  assert.doesNotMatch(deliveryScript, /[^\x00-\x7f]/, "Windows PowerShell 5.1 delivery script must remain ASCII and load UTF-8 metadata from JSON");
  assert.match(deliveryScript, /--fps["']?,?\s*["']?60/);
  assert.match(deliveryScript, /--resolution["']?,?\s*["']?landscape-4k/);
  assert.match(deliveryScript, /\$env:PRODUCER_FORCE_SCREENSHOT\s*=\s*["']true["']/);
  assert.match(deliveryScript, /--experimental-fast-capture=false/);
  assert.match(deliveryScript, /--workers["']?,?\s*["']?2/);
  assert.doesNotMatch(deliveryScript, /--workers["']?,?\s*["']?1/);
  assert.match(deliveryScript, /--gpu/);
  assert.match(deliveryScript, /--browser-gpu/);
  assert.match(deliveryScript, /--no-best-effort/);
  assert.match(deliveryScript, /--strict/);
  assert.match(deliveryScript, /@\("sha256", "bytes", "renderContractSha256"\)/);
  assert.match(deliveryScript, /Get-Sha256 -LiteralPath \$sourceAudioPath/);
  assert.match(deliveryScript, /\$finalAuthentication\s*=\s*Assert-AuthenticatedMaster[\s\S]*?\$muxArguments/);
  assert.doesNotMatch(deliveryScript, /Remove-Item[^\r\n]*intermediatePath/);
  assert.match(deliveryScript, /footsteps-return-4k\.muxing\.mp4/);
  assert.match(deliveryScript, /footsteps-return-4k\.manifest\.json/);
  assert.match(deliveryScript, /\[System\.IO\.File\]::Replace\(\$TempPath, \$DestinationPath, \$null\)/);
  assert.match(deliveryScript, /\[System\.IO\.File\]::Move\(\$TempPath, \$DestinationPath\)/);
  assert.match(deliveryScript, /Publish-AtomicFile -TempPath \$muxedOutputPath -DestinationPath \$outputPath/);
  assert.match(deliveryScript, /Publish-AtomicFile -TempPath \$outputManifestTempPath -DestinationPath \$outputManifestPath/);
  assert.match(deliveryScript, /\$initialVisualContract\s*=\s*Get-CurrentVisualContract[\s\S]*?Strict native-4K HyperFrames render/);
  assert.match(deliveryScript, /\$finalVisualContract\s*=\s*Get-CurrentVisualContract/);
  assert.match(deliveryScript, /visual sources changed during final rendering/);
  assert.match(deliveryScript, /\$initialEvidenceToolContract\s*=\s*Get-CurrentEvidenceToolContract/);
  assert.match(deliveryScript, /\$finalEvidenceToolContract\s*=\s*Get-CurrentEvidenceToolContract/);
  assert.match(deliveryScript, /evidence tooling changed during final rendering/);
  assert.match(deliveryScript, /OutputSha256/);
  assert.match(deliveryScript, /volume=-0\.35dB,apad,atrim=duration=214\.05/);
  assert.match(deliveryScript, /-c:v["']?,?\s*["']?copy/);
  assert.match(deliveryScript, /-c:a["']?,?\s*["']?aac/);
  assert.match(deliveryScript, /assets\\audio-licenses\.json/);
  assert.match(deliveryScript, /"title=\$acceptedTitle"/);
  assert.match(deliveryScript, /title\s*=\s*\$acceptedTitle/);
  assert.doesNotMatch(deliveryScript, /1080|1920|scale=/i);

  const generatorPath = path.join(PV_ROOT, "scripts", "render-contact-sheet.mjs");
  assert.ok(fs.existsSync(generatorPath), "Task 11 evidence generator must exist before final render");
  const generator = await import(new URL(`../video/footsteps-return/scripts/render-contact-sheet.mjs`, `file://${__filename}`).href);
  assert.equal(generator.task11CapturePlan.length, 24);
  assert.deepEqual(
    Object.fromEntries([...new Set(generator.task11CapturePlan.map(({ group }) => group))].map((group) => [group, generator.task11CapturePlan.filter((item) => item.group === group).length])),
    { intro: 1, "chapter-card": 7, "chapter-evidence": 7, "chapter-morph": 7, gallery: 1, "end-card": 1 }
  );
});

test("the Task 11 animation map and contact sheet bind 24 current native-4K semantic frames", async () => {
  assert.ok(fs.existsSync(EVIDENCE_PATH), "Task 11 evidence manifest must be generated");
  assert.ok(fs.existsSync(CONTACT_SHEET_PATH), "Task 11 contact sheet must be generated");
  assert.ok(fs.existsSync(ANIMATION_MAP_PATH), "Task 11 animation map must be generated");
  const evidence = readJson(EVIDENCE_PATH);
  const mix = readJson(path.join(PV_ROOT, "audio", "mix.json"));
  const generator = await import(new URL(`../video/footsteps-return/scripts/render-contact-sheet.mjs`, `file://${__filename}`).href);
  const currentVisualContract = await generator.buildTask11VisualContract({ projectRoot: PV_ROOT });
  const currentEvidenceToolContract = await generator.buildTask11EvidenceToolContract({ projectRoot: PV_ROOT });
  assert.equal(evidence.task, "task11-output");
  assert.equal(evidence.title, "《拓扑五子棋》章节预告 PV—「足迹回环」");
  assert.match(fs.readFileSync(ANIMATION_MAP_PATH, "utf8"), /<title id="title">《拓扑五子棋》章节预告 PV—「足迹回环」<\/title>/);
  assert.deepEqual(evidence.viewport, { width: 3840, height: 2160, deviceScaleFactor: 1 });
  assert.deepEqual(evidence.frameStrategy, {
    logicalDurationSeconds: LOGICAL_DURATION_SECONDS,
    fps: FPS,
    totalFrames: EXPECTED_FRAMES,
    pictureDurationSeconds: PICTURE_DURATION_SECONDS,
    preservedAudioSeconds: LOGICAL_DURATION_SECONDS,
    appendedSilenceSeconds: PICTURE_DURATION_SECONDS - LOGICAL_DURATION_SECONDS
  });
  assert.equal(evidence.sourceAudio.sha256, mix.output.sha256);
  assert.equal(evidence.sourceAudio.bytes, mix.output.bytes);
  assert.equal(evidence.sourceAudio.renderContractSha256, mix.output.renderContractSha256);
  assert.deepEqual(evidence.visualContract, currentVisualContract);
  assert.deepEqual(evidence.evidenceToolContract, currentEvidenceToolContract);
  assert.deepEqual(evidence.captions, { count: 46, singleLine: true, unicodePunctuationCount: 0 });
  assert.equal(evidence.frames.length, 24);
  assert.equal(new Set(evidence.frames.map(({ id }) => id)).size, 24);
  assert.ok(evidence.frames.every(({ frameIndex, seekSeconds }) => Number.isInteger(frameIndex) && Math.abs(frameIndex / FPS - seekSeconds) < 1e-9));
  assert.ok(evidence.frames.every(({ observation }) => observation.renderReady === true && observation.width === 3840 && observation.height === 2160));
  evidence.frames.forEach((frame) => {
    assert.ok(frame.observation.visibleSceneIds.includes(frame.sceneId), `${frame.id} must visibly contain ${frame.sceneId}`);
    assert.ok(frame.observation.captions.length <= 1, `${frame.id} must contain at most one caption`);
    assert.ok(frame.observation.captions.every(({ punctuationFree, height, lineHeight }) => punctuationFree && height <= lineHeight * 1.25), `${frame.id} caption must stay single-line and punctuation-free`);
    if (frame.group === "intro") {
      assert.deepEqual(frame.observation.intro, { gameTitleCount: 0, iopCount: 0 });
    } else if (frame.group === "chapter-card") {
      assert.ok(frame.observation.card, `${frame.id} must expose chapter-card evidence`);
      assert.ok(frame.observation.card.actOpacity <= 0.01 && frame.observation.card.chapterOpacity >= 0.99 && frame.observation.card.topologyOpacity >= 0.99, `${frame.id} must show phase B hierarchy`);
    } else if (frame.group === "chapter-evidence" || frame.group === "chapter-morph") {
      assert.ok(frame.observation.chapter, `${frame.id} must expose chapter runtime evidence`);
      assert.equal(frame.observation.chapter.phase, frame.expectedPhase, `${frame.id} semantic phase drifted`);
      assert.equal(frame.observation.chapter.demo, frame.demo, `${frame.id} semantic demo drifted`);
      assert.equal(frame.observation.chapter.canvasCount, 1, `${frame.id} must use one real-game iframe/Canvas`);
      assert.equal(frame.observation.chapter.webglContextReady, true, `${frame.id} topology surface must be ready`);
    } else if (frame.group === "gallery") {
      assert.deepEqual(frame.observation.gallery, { shapeCount: 7, readyCanvasCount: 7, cameraPosition: "withdrawn-center" });
    } else if (frame.group === "end-card") {
      assert.deepEqual(frame.observation.endCard, { titleCount: 1, iopCount: 1, titleOpacity: 1, iopOpacity: 1 });
    }
  });
  assert.deepEqual(pngDimensions(CONTACT_SHEET_PATH), { width: 3840, height: 2160 });
  assert.equal(evidence.artifacts.contactSheet.sha256, sha256(CONTACT_SHEET_PATH));
  assert.equal(evidence.artifacts.animationMap.sha256, sha256(ANIMATION_MAP_PATH));
});

test("the final master is an authenticated 12,843-frame native-4K delivery with one 48 kHz stereo audio stream", { skip: !(REQUIRE_REAL_OUTPUT || fs.existsSync(OUTPUT_PATH)) }, async () => {
  assert.ok(fs.existsSync(OUTPUT_PATH), `required final output is missing: ${OUTPUT_PATH}`);
  assert.ok(fs.existsSync(OUTPUT_MANIFEST_PATH), `required final output manifest is missing: ${OUTPUT_MANIFEST_PATH}`);
  const outputManifest = readJson(OUTPUT_MANIFEST_PATH);
  const mix = readJson(path.join(PV_ROOT, "audio", "mix.json"));
  const evidence = readJson(EVIDENCE_PATH);
  assert.equal(outputManifest.schemaVersion, 1);
  assert.equal(outputManifest.title, "《拓扑五子棋》章节预告 PV—「足迹回环」");
  assert.equal(outputManifest.output.path, "video/footsteps-return/renders/footsteps-return-4k.mp4");
  assert.equal(outputManifest.output.bytes, fs.statSync(OUTPUT_PATH).size);
  assert.equal(outputManifest.output.sha256, await sha256Stream(OUTPUT_PATH));
  assert.deepEqual(outputManifest.sourceAudio, {
    sha256: mix.output.sha256,
    bytes: mix.output.bytes,
    renderContractSha256: mix.output.renderContractSha256
  });
  assert.deepEqual(outputManifest.visualContract, evidence.visualContract);
  assert.deepEqual(outputManifest.evidenceToolContract, evidence.evidenceToolContract);
  assert.deepEqual(outputManifest.frameEnvelope, { fps: FPS, totalFrames: EXPECTED_FRAMES, logicalDurationSeconds: LOGICAL_DURATION_SECONDS, pictureDurationSeconds: PICTURE_DURATION_SECONDS });
  const { ffprobe } = resolveMediaTools();
  const probe = probeOutput(ffprobe);
  const videoStreams = probe.streams.filter(({ codec_type }) => codec_type === "video");
  const audioStreams = probe.streams.filter(({ codec_type }) => codec_type === "audio");
  assert.equal(probe.streams.length, 2, "the master must contain only the required video and audio streams");
  assert.ok(probe.format.format_name.split(",").includes("mp4"), `delivery container must be MP4-family: ${probe.format.format_name}`);
  assert.equal(probe.format.tags?.title, "《拓扑五子棋》章节预告 PV—「足迹回环」");
  assert.equal(videoStreams.length, 1);
  assert.equal(audioStreams.length, 1);
  const [video] = videoStreams;
  const [audio] = audioStreams;
  assert.equal(video.codec_name, "h264");
  assert.deepEqual({ width: video.width, height: video.height }, { width: 3840, height: 2160 });
  assert.equal(video.r_frame_rate, "60/1");
  assert.equal(video.avg_frame_rate, "60/1");
  assert.equal(Number(video.nb_frames), EXPECTED_FRAMES);
  assert.equal(Number(video.nb_read_frames), EXPECTED_FRAMES);
  assert.doesNotMatch(video.pix_fmt, /a|rgba|yuva/i, `opaque MP4 must not retain an alpha pixel format: ${video.pix_fmt}`);
  assert.ok(Math.abs(Number(video.start_time)) <= 1e-6, `video must start at zero for deterministic timeline sync: ${video.start_time}`);
  assert.ok(Math.abs(Number(video.duration) - PICTURE_DURATION_SECONDS) <= 1e-6);
  assert.equal(audio.codec_name, "aac");
  assert.equal(Number(audio.sample_rate), 48_000);
  assert.equal(audio.channels, 2);
  assert.equal(audio.channel_layout, "stereo");
  const videoStart = Number(video.start_time);
  const videoEnd = videoStart + Number(video.duration);
  const audioStart = Number(audio.start_time);
  const audioEnd = audioStart + Number(audio.duration);
  assert.ok(Math.abs(audioStart - videoStart) <= FRAME_SECONDS, `audio must start with the picture within one frame: ${audio.start_time}`);
  assert.ok(Number(audio.duration) >= LOGICAL_DURATION_SECONDS, `audio duration ${audio.duration} trimmed the authenticated 214.040-second source`);
  assert.ok(audioEnd >= LOGICAL_DURATION_SECONDS, `audio end ${audioEnd} trimmed the authenticated 214.040-second source`);
  assert.ok(Math.abs(videoEnd - audioEnd) < FRAME_SECONDS, `audio/picture end delta ${videoEnd - audioEnd} must remain below one frame`);
  assert.ok(Math.abs(Number(probe.format.duration) - PICTURE_DURATION_SECONDS) <= FRAME_SECONDS);
});

test("every final video frame decodes and black/freeze detection finds no unintended long hold", { skip: !(REQUIRE_REAL_OUTPUT || fs.existsSync(OUTPUT_PATH)) }, () => {
  assert.ok(fs.existsSync(OUTPUT_PATH), `required final output is missing: ${OUTPUT_PATH}`);
  const { ffmpeg } = resolveMediaTools();
  const result = run(ffmpeg, [
    "-hide_banner", "-nostdin", "-i", OUTPUT_PATH,
    "-map", "0:v:0",
    "-vf", "blackdetect=d=0.08:pix_th=0.02,freezedetect=n=-55dB:d=1.5",
    "-an", "-progress", "pipe:1", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"
  ]);
  const decodedFrame = [...result.stdout.matchAll(/^frame=(\d+)$/gm)].map((match) => Number(match[1])).at(-1);
  assert.equal(decodedFrame, EXPECTED_FRAMES, "FFmpeg must decode every CFR frame");
  const blackIntervals = parseDetectedIntervals(result.stderr, "black");
  assert.ok(blackIntervals.every(({ duration }) => duration <= 1.0), `unexpected long black interval: ${JSON.stringify(blackIntervals)}`);
  const freezeIntervals = parseDetectedIntervals(result.stderr, "freeze");
  assert.ok(freezeIntervals.every(({ start }) => start >= 210.04), `unexpected pre-end-card freeze: ${JSON.stringify(freezeIntervals)}`);
});

test("the encoded audio remains distribution-safe and preserves the complete decaying end-card tail", { skip: !(REQUIRE_REAL_OUTPUT || fs.existsSync(OUTPUT_PATH)) }, () => {
  assert.ok(fs.existsSync(OUTPUT_PATH), `required final output is missing: ${OUTPUT_PATH}`);
  const { ffmpeg } = resolveMediaTools();
  const loudness = analyzeLoudness(ffmpeg);
  assert.ok(Math.abs(Number(loudness.input_i) - -14) <= 0.5, `encoded master is ${loudness.input_i} LUFS`);
  assert.ok(Number(loudness.input_tp) <= -1 + 0.05, `encoded master true peak is ${loudness.input_tp} dBTP`);
  const similarity = analyzeDeliverySimilarity(ffmpeg);
  similarity.forEach((value, channel) => assert.ok(Number.isFinite(value) && value > 25, `encoded channel ${channel} is not the authenticated trimmed PCM master: SI-SDR ${value} dB`));

  const tail = decodeTail(ffmpeg);
  const decodedTailFrames = tail.buffer.length / (tail.channels * 4);
  assert.ok(decodedTailFrames >= Math.ceil((LOGICAL_DURATION_SECONDS - tail.start) * tail.sampleRate), `decoded tail stops before 214.040 seconds: ${decodedTailFrames} frames`);
  const windows = [
    [210.04, 211.682],
    [211.682, 212.182],
    [212.182, 212.682],
    [212.682, 213.182],
    [213.54, 214.04]
  ];
  const levels = windows.map(([start, end]) => rmsDbfs(tail, start, end));
  levels.forEach((level, index) => assert.ok(Number.isFinite(level), `encoded tail window ${index + 1} was trimmed or hard-muted`));
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(levels[index] < levels[index - 1], `encoded tail must decay progressively: ${levels.map((value) => value.toFixed(2)).join(" / ")} dBFS`);
  }
  assert.ok(levels[0] - levels.at(-1) > 25, "encoded end-card tail must retain at least 25 dB of release decay");
  assert.ok(levels.at(-1) < -70, `encoded end-card tail must reach a quiet hold: ${levels.at(-1).toFixed(2)} dBFS`);
});

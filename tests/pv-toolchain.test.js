"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "footsteps-return");
const toImportUrl = (relativePath) => new URL(`../${relativePath}`, `file://${__filename}`).href;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("PV 工具链锁定所需的精确 npm 依赖与仓库命令", () => {
  const packageJson = JSON.parse(read("package.json"));
  const expectedDependencies = {
    hyperframes: "0.8.18",
    "@hyperframes/shader-transitions": "0.8.18",
    playwright: "1.62.1",
    three: "0.185.1",
    tone: "15.1.22",
    "@tonejs/midi": "2.0.28",
    gsap: "3.14.2"
  };

  assert.deepEqual(packageJson.dependencies, expectedDependencies);
  assert.equal(packageJson.engines.node, ">=22");
  const lockfile = JSON.parse(read("package-lock.json"));
  assert.deepEqual(lockfile.packages[""].dependencies, expectedDependencies);
  assert.equal(lockfile.packages[""].engines.node, ">=22");
  assert.equal(lockfile.packages["node_modules/gsap"].version, "3.14.2");
  [
    "pv:doctor", "pv:lint", "pv:validate", "pv:inspect", "pv:preview",
    "pv:capture", "pv:voice", "pv:score", "pv:render:draft", "pv:render:4k"
  ].forEach((scriptName) => {
    assert.equal(typeof packageJson.scripts[scriptName], "string", `${scriptName} must be a repository command`);
  });
  assert.match(packageJson.scripts["pv:validate"], /^node \.\/video\/footsteps-return\/scripts\/validate-manifest\.mjs && hyperframes check /);
  assert.match(packageJson.scripts["pv:inspect"], /^hyperframes check /);
  assert.match(packageJson.scripts["pv:capture"], /capture\.mjs$/);
  assert.match(packageJson.scripts["pv:voice"], /voice\.mjs$/);
  assert.equal(packageJson.scripts["pv:render:1080"], undefined, "1080p delivery must remain absent");
});

test("PV 合成底座固定为 4K 60fps，并先具有视觉设计契约", () => {
  const requiredFiles = [
    "DESIGN.md",
    "index.html",
    path.join("src", "bootstrap.js"),
    path.join("src", "styles.css"),
    "hyperframes.config.json",
    path.join("scripts", "doctor.mjs")
  ];
  requiredFiles.forEach((relativePath) => {
    assert.ok(fs.existsSync(path.join(PV_ROOT, relativePath)), `${relativePath} must exist`);
  });

  const config = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "hyperframes.config.json"), "utf8"));
  assert.equal(config.width, 3840);
  assert.equal(config.height, 2160);
  assert.equal(config.fps, 60);
  assert.match(fs.readFileSync(path.join(PV_ROOT, "DESIGN.md"), "utf8"), /visual-language\.md/);
});

test("PV 生成媒体与帧序列不进入 Git", () => {
  const gitignore = read(".gitignore");
  [
    "video/footsteps-return/captures/",
    "video/footsteps-return/renders/",
    "video/footsteps-return/.hyperframes/",
    "video/footsteps-return/**/*.wav",
    "video/footsteps-return/**/*.png"
  ].forEach((pattern) => {
    assert.ok(gitignore.split(/\r?\n/).includes(pattern), `${pattern} must be ignored`);
  });
});

test("PV doctor 以 FFmpeg 的可执行版本参数探测工具", async () => {
  const doctor = await import(toImportUrl("video/footsteps-return/scripts/doctor.mjs"));
  let invocation;
  const command = doctor.findFfmpeg((candidate, args) => {
    invocation = { candidate, args };
    return { status: 0 };
  });

  assert.equal(command, "ffmpeg");
  assert.deepEqual(invocation, { candidate: "ffmpeg", args: ["-version"] });
});

test("PV 合成从锁定的本地 GSAP 副本加载，不依赖 CDN", () => {
  const index = fs.readFileSync(path.join(PV_ROOT, "index.html"), "utf8");
  const localGsap = path.join(PV_ROOT, "src", "vendor", "gsap.min.js");
  assert.match(index, /src="\.\/src\/vendor\/gsap\.min\.js"/);
  assert.doesNotMatch(index, /https?:\/\//);
  assert.match(fs.readFileSync(localGsap, "utf8"), /GSAP 3\.14\.2/);
});

test("PV 媒体包装器强制将采集与配音输出写入忽略目录", async () => {
  const capture = await import(toImportUrl("video/footsteps-return/scripts/capture.mjs"));
  const voice = await import(toImportUrl("video/footsteps-return/scripts/voice.mjs"));

  assert.deepEqual(capture.buildCaptureArgs(["https://example.test"]), [
    "capture", "https://example.test", "--output", "video/footsteps-return/captures/website"
  ]);
  assert.deepEqual(voice.buildVoiceArgs(["拓扑五子棋"]), [
    "tts", "拓扑五子棋", "--output", "video/footsteps-return/captures/narration.wav"
  ]);
  assert.throws(() => capture.buildCaptureArgs(["https://example.test", "--output", "outside"]), /output/);
  assert.throws(() => voice.buildVoiceArgs(["拓扑五子棋", "--output=outside.wav"]), /output/);
  assert.throws(() => capture.buildCaptureArgs(["https://example.test", "--"]), /--/);
  assert.throws(() => voice.buildVoiceArgs(["拓扑五子棋", "--"]), /--/);
});

test("PV doctor 拒绝 MuseScore 3，并接受注入的 MuseScore 4 探测结果", async () => {
  const doctor = await import(toImportUrl("video/footsteps-return/scripts/doctor.mjs"));
  const candidates = ["musescore-fixture"];
  const museScore3 = doctor.findMuseScore({
    candidates,
    probe: () => ({ status: 0, stdout: "MuseScore 3.6.2\n", stderr: "" })
  });
  const museScore4 = doctor.findMuseScore({
    candidates,
    probe: () => ({ status: 0, stdout: "MuseScore Studio 4.7.4\n", stderr: "" })
  });

  assert.equal(museScore3, undefined);
  assert.equal(museScore4, "musescore-fixture");
});

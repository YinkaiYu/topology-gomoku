"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "footsteps-return");

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
    "@tonejs/midi": "2.0.28"
  };

  assert.deepEqual(packageJson.dependencies, expectedDependencies);
  [
    "pv:doctor", "pv:lint", "pv:validate", "pv:inspect", "pv:preview",
    "pv:capture", "pv:voice", "pv:score", "pv:render:draft",
    "pv:render:4k", "pv:render:1080"
  ].forEach((scriptName) => {
    assert.equal(typeof packageJson.scripts[scriptName], "string", `${scriptName} must be a repository command`);
  });
  assert.match(packageJson.scripts["pv:validate"], /^hyperframes check /);
  assert.match(packageJson.scripts["pv:inspect"], /^hyperframes check /);
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

test("PV doctor 探测命令时不经 Windows shell 拼接参数", () => {
  const doctor = fs.readFileSync(path.join(PV_ROOT, "scripts", "doctor.mjs"), "utf8");
  assert.doesNotMatch(doctor, /shell\s*:/);
  assert.match(doctor, /findCallable\(\[\s*"ffmpeg"[\s\S]*?\], \["-version"\]\)/);
});

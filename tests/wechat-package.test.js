"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = ".topology-gomoku-manifest.json";
const OFFICIAL_GAME_JS = "import Main from './js/main';\n\nnew Main();\n";
const OFFICIAL_GAME_JSON = '{\n  "deviceOrientation": "portrait"\n}\n';
const OFFICIAL_SAMPLE_PATHS = [
  "audio/bgm.mp3",
  "audio/boom.mp3",
  "audio/bullet.mp3",
  "images/bg.jpg",
  "images/bullet.png",
  "images/Common.png",
  "images/enemy.png",
  ...Array.from({ length: 19 }, (_, index) => `images/explosion${index + 1}.png`),
  "images/hero.png",
  "js/databus.js",
  "js/main.js",
  "js/render.js",
  "js/base/animation.js",
  "js/base/pool.js",
  "js/base/sprite.js",
  "js/libs/tinyemitter.js",
  "js/npc/enemy.js",
  "js/player/bullet.js",
  "js/player/index.js",
  "js/runtime/background.js",
  "js/runtime/gameinfo.js",
  "js/runtime/music.js",
];
const AUTHORITATIVE_COPIES = [
  ["topology.js", "js/shared/topology.js"],
  ["topology-morph.js", "js/shared/topology-morph.js"],
  ["game-replay.js", "js/shared/game-replay.js"],
  ["level-config.js", "js/shared/level-config.js"],
  ["game-controller.js", "js/shared/game-controller.js"],
  ["board-art.js", "js/shared/board-art.js"],
  ["brand-icon.png", "assets/brand-icon.png"],
];
const PLATFORM_FONT_PATHS = [400, 600, 700]
  .map((weight) => `assets/fonts/noto-serif-sc-${weight}.woff2`);
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function makeTempRoot(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "topology-wechat-test-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  return tempRoot;
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function writeJson(root, relativePath, value) {
  return writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function pngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.deepEqual(buffer.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function snapshotFiles(root) {
  const snapshot = {};
  function visit(directory, prefix = "") {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, relativePath);
      } else {
        snapshot[relativePath] = sha256(fullPath);
      }
    }
  }
  visit(root);
  return snapshot;
}

function runScript(scriptName, args = [], options = {}) {
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(ROOT, "scripts", scriptName),
      ...args,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, ...(options.env || {}) },
      windowsHide: true,
    },
  );
  result.combinedOutput = `${result.stdout || ""}${result.stderr || ""}`;
  return result;
}

function listSyncBackupDirectories() {
  return fs.readdirSync(os.tmpdir())
    .filter((name) => name.startsWith("topology-gomoku-wechat-sync-"))
    .sort();
}

function assertScriptPassed(result) {
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.combinedOutput);
}

function createNativeSource(root) {
  writeFile(root, "game.js", '"use strict";\nrequire("./js/main.js");\n');
  writeJson(root, "game.json", { deviceOrientation: "portrait", showStatusBar: false });
  writeJson(root, "project.config.json", {
    description: "拓扑五子棋微信小游戏",
    compileType: "game",
    projectname: "topology-gomoku",
    appid: "source-placeholder",
  });
  writeJson(root, "project.private.config.json", { appid: "private-source-value" });
  writeFile(root, "js/main.js", '"use strict";\nwx.createCanvas();\n');
  writeFile(root, "assets/board.bin", Buffer.from([0, 1, 2, 3, 4, 5]));
  for (const fontPath of PLATFORM_FONT_PATHS) {
    writeFile(root, fontPath, Buffer.from(`platform font fixture: ${fontPath}\n`));
  }
  writeFile(root, "README.md", "# 拓扑五子棋微信小游戏\n");
}

function createAuthoritativeAssets(root) {
  for (const [sourcePath] of AUTHORITATIVE_COPIES) {
    const content = sourcePath === "brand-icon.png"
      ? ONE_PIXEL_PNG
      : (sourcePath.endsWith(".js")
          ? `"use strict";\nmodule.exports = ${JSON.stringify(sourcePath)};\n`
          : Buffer.from(`authoritative bytes: ${sourcePath}\n`));
    writeFile(root, sourcePath, content);
  }
}

function createOfficialTemplate(root, overrides = {}) {
  const projectConfig = {
    description: "项目配置文件",
    compileType: "game",
    libVersion: "latest",
    appid: "target-appid-must-survive",
    projectname: "quickstart",
    ...overrides,
  };
  writeJson(root, "project.config.json", projectConfig);
  writeJson(root, "project.private.config.json", { appid: "private-target-value" });
  writeFile(root, "game.js", OFFICIAL_GAME_JS);
  writeFile(root, "game.json", OFFICIAL_GAME_JSON);
  writeFile(root, "README.md", "# 示例游戏\n\n示例相关说明查阅新手教程。\n");
  for (const relativePath of OFFICIAL_SAMPLE_PATHS) {
    writeFile(root, relativePath, `official sample: ${relativePath}\n`);
  }
  writeFile(root, ".eslintrc.js", "module.exports = { root: true };\n");
  writeFile(root, "notes.txt", "unmanaged root note\n");
  writeFile(root, "images/custom-user.png", "unmanaged image\n");
}

test("package.json 暴露完整微信门禁且同步脚本不递归清空目标", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  for (const command of ["validate:wechat", "check:wechat", "build:wechat", "sync:wechat"]) {
    assert.equal(typeof packageJson.scripts[command], "string", `缺少 npm 命令 ${command}`);
  }
  const syncScript = fs.readFileSync(path.join(ROOT, "scripts", "sync-wechat.ps1"), "utf8");
  assert.match(syncScript, /\$env:USERPROFILE/);
  assert.match(syncScript, /Documents\\Codex\\miniprograms\\topology-gomoku/);
  const recursiveRemovals = syncScript.match(/Remove-Item[^\r\n]*-Recurse[^\r\n]*/g) || [];
  assert.deepEqual(recursiveRemovals, ["Remove-Item -LiteralPath $resolvedBackupRoot -Recurse -Force"]);
  assert.doesNotMatch(syncScript, /C:\\Users\\/i);
});

test("微信构建确定、排除私有配置并用 manifest 校验全部文件", (t) => {
  const tempRoot = makeTempRoot(t);
  const sourceRoot = path.join(tempRoot, "source");
  const outputRoot = path.join(tempRoot, "output");
  const sharedAssetsRoot = path.join(tempRoot, "shared-assets");
  createNativeSource(sourceRoot);
  createAuthoritativeAssets(sharedAssetsRoot);

  const args = [
    "-SourceRoot",
    sourceRoot,
    "-OutputRoot",
    outputRoot,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
  ];
  const firstBuild = runScript("build-wechat.ps1", args);
  assertScriptPassed(firstBuild);
  assert.equal(fs.existsSync(path.join(outputRoot, "project.private.config.json")), false);

  const firstManifestText = fs.readFileSync(path.join(outputRoot, MANIFEST), "utf8");
  const firstSnapshot = snapshotFiles(outputRoot);
  const manifest = JSON.parse(firstManifestText);
  const manifestPaths = manifest.files.map((entry) => entry.path);
  assert.deepEqual(manifestPaths, [...manifestPaths].sort());
  assert.equal(manifest.packageVersion, JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"))).version);
  for (const entry of manifest.files) {
    assert.equal(sha256(path.join(outputRoot, ...entry.path.split("/"))), entry.sha256);
  }
  for (const [sourcePath, destinationPath] of AUTHORITATIVE_COPIES) {
    const builtPath = path.join(outputRoot, ...destinationPath.split("/"));
    if (sourcePath === "brand-icon.png") {
      assert.deepEqual(pngDimensions(builtPath), { width: 256, height: 256 });
    } else {
      assert.equal(sha256(builtPath), sha256(path.join(sharedAssetsRoot, ...sourcePath.split("/"))));
    }
  }
  for (const fontPath of PLATFORM_FONT_PATHS) {
    assert.equal(
      sha256(path.join(outputRoot, ...fontPath.split("/"))),
      sha256(path.join(sourceRoot, ...fontPath.split("/"))),
    );
  }

  const secondBuild = runScript("build-wechat.ps1", args);
  assertScriptPassed(secondBuild);
  assert.equal(fs.readFileSync(path.join(outputRoot, MANIFEST), "utf8"), firstManifestText);
  assert.deepEqual(snapshotFiles(outputRoot), firstSnapshot);

  const foreignOutputRoot = path.join(tempRoot, "foreign-output");
  writeFile(foreignOutputRoot, "user-note.txt", "must survive\n");
  const unsafeBuild = runScript("build-wechat.ps1", [
    "-SourceRoot",
    sourceRoot,
    "-OutputRoot",
    foreignOutputRoot,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
  ]);
  assert.notEqual(unsafeBuild.status, 0);
  assert.match(unsafeBuild.combinedOutput, /unrecognized WeChat build directory without a manifest/);
  assert.equal(fs.readFileSync(path.join(foreignOutputRoot, "user-note.txt"), "utf8"), "must survive\n");

  writeFile(outputRoot, "js/shared/topology.js", "tampered authoritative core\n");
  const tamperedValidation = runScript("validate-wechat.ps1", [
    "-Root",
    outputRoot,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
    "-RequireManifest",
  ]);
  assert.notEqual(tamperedValidation.status, 0);
  assert.match(tamperedValidation.combinedOutput, /Authoritative source hash mismatch: topology\.js -> js\/shared\/topology\.js/);
  assert.match(tamperedValidation.combinedOutput, /Manifest hash mismatch: js\/shared\/topology\.js/);
});

test("微信校验拒绝外部网络能力", (t) => {
  const tempRoot = makeTempRoot(t);
  const sourceRoot = path.join(tempRoot, "source");
  createNativeSource(sourceRoot);
  writeFile(sourceRoot, "js/main.js", 'wx.request({ url: "https://example.com/data" });\n');

  const validation = runScript("validate-wechat.ps1", ["-Root", sourceRoot]);
  assert.notEqual(validation.status, 0);
  assert.match(validation.combinedOutput, /Forbidden network capability/);
  assert.match(validation.combinedOutput, /js\/main\.js/);
});

test("微信校验以 ESM 语法解析全部 JavaScript", (t) => {
  const tempRoot = makeTempRoot(t);
  const sourceRoot = path.join(tempRoot, "source");
  createNativeSource(sourceRoot);
  writeFile(sourceRoot, "js/main.js", "export default class Broken {\n");

  const validation = runScript("validate-wechat.ps1", ["-Root", sourceRoot]);
  assert.notEqual(validation.status, 0);
  assert.match(validation.combinedOutput, /Invalid JavaScript syntax in js\/main\.js/);
});

test("微信校验拒绝错误入口大小写与无效 JSON", (t) => {
  const tempRoot = makeTempRoot(t);
  const sourceRoot = path.join(tempRoot, "source");
  createNativeSource(sourceRoot);
  fs.rmSync(path.join(sourceRoot, "game.js"));
  writeFile(sourceRoot, "Game.js", 'require("./js/main.js");\n');
  writeFile(sourceRoot, "game.json", "{ invalid json\n");

  const validation = runScript("validate-wechat.ps1", ["-Root", sourceRoot]);
  assert.notEqual(validation.status, 0);
  assert.match(validation.combinedOutput, /Missing required WeChat game entry with exact casing: game\.js/);
  assert.match(validation.combinedOutput, /Invalid JSON file/);
});

test("微信构建校验拒绝缺失的本地模块", (t) => {
  const tempRoot = makeTempRoot(t);
  const sourceRoot = path.join(tempRoot, "source");
  const outputRoot = path.join(tempRoot, "output");
  const sharedAssetsRoot = path.join(tempRoot, "shared-assets");
  createNativeSource(sourceRoot);
  createAuthoritativeAssets(sharedAssetsRoot);
  writeFile(sourceRoot, "game.js", 'require("./js/missing-module");\n');

  const build = runScript("build-wechat.ps1", [
    "-SourceRoot",
    sourceRoot,
    "-OutputRoot",
    outputRoot,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
  ]);
  assert.notEqual(build.status, 0);
  assert.match(build.combinedOutput, /Missing local module with exact casing: game\.js -> \.\/js\/missing-module/);
});

test("微信同步保留私有与未管理文件、清理官方样例并按 manifest 删除陈旧文件", (t) => {
  const tempRoot = makeTempRoot(t);
  const sourceRoot = path.join(tempRoot, "source");
  const outputRoot = path.join(tempRoot, "output");
  const targetRoot = path.join(tempRoot, "target");
  const sharedAssetsRoot = path.join(tempRoot, "shared-assets");
  createNativeSource(sourceRoot);
  createAuthoritativeAssets(sharedAssetsRoot);
  createOfficialTemplate(targetRoot);

  const protectedBefore = {
    project: fs.readFileSync(path.join(targetRoot, "project.config.json")),
    private: fs.readFileSync(path.join(targetRoot, "project.private.config.json")),
    eslint: fs.readFileSync(path.join(targetRoot, ".eslintrc.js")),
    note: fs.readFileSync(path.join(targetRoot, "notes.txt")),
    customImage: fs.readFileSync(path.join(targetRoot, "images", "custom-user.png")),
  };
  const syncArgs = [
    "-SourceRoot",
    sourceRoot,
    "-OutputRoot",
    outputRoot,
    "-TargetRoot",
    targetRoot,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
  ];
  const firstSync = runScript("sync-wechat.ps1", syncArgs);
  assertScriptPassed(firstSync);

  assert.deepEqual(fs.readFileSync(path.join(targetRoot, "project.config.json")), protectedBefore.project);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, "project.private.config.json")), protectedBefore.private);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, ".eslintrc.js")), protectedBefore.eslint);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, "notes.txt")), protectedBefore.note);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, "images", "custom-user.png")), protectedBefore.customImage);
  assert.equal(fs.existsSync(path.join(targetRoot, "audio", "bgm.mp3")), false);
  assert.equal(fs.existsSync(path.join(targetRoot, "images", "bg.jpg")), false);
  assert.equal(fs.existsSync(path.join(targetRoot, "js", "databus.js")), false);
  assert.equal(fs.readFileSync(path.join(targetRoot, "game.js"), "utf8"), fs.readFileSync(path.join(sourceRoot, "game.js"), "utf8"));

  const targetManifest = JSON.parse(fs.readFileSync(path.join(targetRoot, MANIFEST), "utf8"));
  assert.equal(targetManifest.files.some((entry) => entry.path === "project.config.json"), false);
  assert.equal(targetManifest.files.some((entry) => entry.path === "project.private.config.json"), false);
  for (const entry of targetManifest.files) {
    assert.equal(sha256(path.join(targetRoot, ...entry.path.split("/"))), entry.sha256);
  }

  fs.rmSync(path.join(sourceRoot, "assets", "board.bin"));
  writeFile(sourceRoot, "assets/new-board.bin", Buffer.from([9, 8, 7]));
  writeFile(sourceRoot, "js/main.js", '"use strict";\nwx.createCanvas();\nwx.setStorageSync("ready", true);\n');
  const secondSync = runScript("sync-wechat.ps1", syncArgs);
  assertScriptPassed(secondSync);
  assert.equal(fs.existsSync(path.join(targetRoot, "assets", "board.bin")), false);
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, "assets", "new-board.bin")), Buffer.from([9, 8, 7]));
  assert.deepEqual(fs.readFileSync(path.join(targetRoot, "images", "custom-user.png")), protectedBefore.customImage);

  writeFile(targetRoot, "js/main.js", "manual target edit\n");
  writeFile(sourceRoot, "js/main.js", '"use strict";\nwx.createCanvas();\nwx.setStorageSync("fresh-build", true);\n');
  const conflictedSync = runScript("sync-wechat.ps1", syncArgs);
  assert.notEqual(conflictedSync.status, 0);
  assert.match(conflictedSync.combinedOutput, /managed file was modified outside the sync workflow: js\/main\.js/);
  assert.equal(
    fs.readFileSync(path.join(outputRoot, "js", "main.js"), "utf8"),
    fs.readFileSync(path.join(sourceRoot, "js", "main.js"), "utf8"),
    "冲突检测前仍应完成 fresh build",
  );
});

test("微信同步 DryRun 只构建和检查，不写目标", (t) => {
  const tempRoot = makeTempRoot(t);
  const sourceRoot = path.join(tempRoot, "source");
  const outputRoot = path.join(tempRoot, "output");
  const targetRoot = path.join(tempRoot, "target");
  const sharedAssetsRoot = path.join(tempRoot, "shared-assets");
  createNativeSource(sourceRoot);
  createAuthoritativeAssets(sharedAssetsRoot);
  createOfficialTemplate(targetRoot);
  const before = snapshotFiles(targetRoot);

  const dryRun = runScript("sync-wechat.ps1", [
    "-SourceRoot",
    sourceRoot,
    "-OutputRoot",
    outputRoot,
    "-TargetRoot",
    targetRoot,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
    "-DryRun",
  ]);
  assertScriptPassed(dryRun);
  assert.match(dryRun.combinedOutput, /Dry run complete/);
  assert.deepEqual(snapshotFiles(targetRoot), before);
  assert.equal(fs.existsSync(path.join(targetRoot, MANIFEST)), false);
  assert.equal(fs.existsSync(path.join(outputRoot, MANIFEST)), true);
});

test("微信同步任一写入阶段失败都会完整回滚受管快照与 manifest", (t) => {
  const tempRoot = makeTempRoot(t);
  const sourceRoot = path.join(tempRoot, "source");
  const outputRoot = path.join(tempRoot, "output");
  const targetRoot = path.join(tempRoot, "target");
  const sharedAssetsRoot = path.join(tempRoot, "shared-assets");
  createNativeSource(sourceRoot);
  createAuthoritativeAssets(sharedAssetsRoot);
  createOfficialTemplate(targetRoot);
  const syncArgs = [
    "-SourceRoot",
    sourceRoot,
    "-OutputRoot",
    outputRoot,
    "-TargetRoot",
    targetRoot,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
  ];
  assertScriptPassed(runScript("sync-wechat.ps1", syncArgs));

  const targetBefore = snapshotFiles(targetRoot);
  const backupDirectoriesBefore = listSyncBackupDirectories();
  fs.rmSync(path.join(sourceRoot, "assets", "board.bin"));
  writeFile(sourceRoot, "new-runtime/deep/transaction.bin", Buffer.from([7, 6, 5, 4]));
  writeFile(sourceRoot, "js/main.js", '"use strict";\nwx.createCanvas();\nwx.setStorageSync("transaction", true);\n');

  for (const failurePoint of ["AfterDelete", "AfterFirstCopy", "AfterManifest", "CorruptBeforeVerify"]) {
    const failedSync = runScript(
      "sync-wechat.ps1",
      [...syncArgs, "-TestFailurePoint", failurePoint],
      { env: { TOPO_WECHAT_TEST_FAILURE_INJECTION: "1" } },
    );
    assert.notEqual(failedSync.status, 0, `${failurePoint} 应注入失败`);
    assert.match(failedSync.combinedOutput, /managed target snapshot was restored/);
    if (failurePoint === "CorruptBeforeVerify") {
      assert.match(failedSync.combinedOutput, /Post-sync hash verification failed/);
    } else {
      assert.match(failedSync.combinedOutput, /Injected WeChat sync failure/);
    }
    assert.deepEqual(snapshotFiles(targetRoot), targetBefore, `${failurePoint} 后目标文件快照必须完全恢复`);
    assert.equal(fs.existsSync(path.join(targetRoot, "new-runtime")), false, "回滚应清理本次新增的空目录");
    assert.deepEqual(listSyncBackupDirectories(), backupDirectoriesBefore, "临时事务备份必须被清理");
  }
});

test("微信同步回滚自身失败时保留可人工恢复的事务备份", (t) => {
  const tempRoot = makeTempRoot(t);
  const sourceRoot = path.join(tempRoot, "source");
  const outputRoot = path.join(tempRoot, "output");
  const targetRoot = path.join(tempRoot, "target");
  const sharedAssetsRoot = path.join(tempRoot, "shared-assets");
  createNativeSource(sourceRoot);
  createAuthoritativeAssets(sharedAssetsRoot);
  createOfficialTemplate(targetRoot);
  const syncArgs = [
    "-SourceRoot",
    sourceRoot,
    "-OutputRoot",
    outputRoot,
    "-TargetRoot",
    targetRoot,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
  ];
  assertScriptPassed(runScript("sync-wechat.ps1", syncArgs));

  writeFile(sourceRoot, "js/main.js", '"use strict";\nwx.createCanvas();\nwx.setStorageSync("rollback", true);\n');
  const backupDirectoriesBefore = new Set(listSyncBackupDirectories());
  const failedSync = runScript(
    "sync-wechat.ps1",
    [...syncArgs, "-TestFailurePoint", "RollbackFailure"],
    { env: { TOPO_WECHAT_TEST_FAILURE_INJECTION: "1" } },
  );
  assert.notEqual(failedSync.status, 0);
  assert.match(failedSync.combinedOutput, /rollback also failed/);
  assert.match(failedSync.combinedOutput, /Backup preserved at/);
  const newBackupDirectories = listSyncBackupDirectories()
    .filter((name) => !backupDirectoriesBefore.has(name));
  assert.equal(newBackupDirectories.length, 1, failedSync.combinedOutput);
  const backupRoot = path.join(os.tmpdir(), newBackupDirectories[0]);
  assert.equal(fs.existsSync(path.join(backupRoot, "transaction.json")), true);
  assert.equal(fs.existsSync(path.join(backupRoot, "files")), true);
  assert.equal(backupDirectoriesBefore.has(path.basename(backupRoot)), false);
  fs.rmSync(backupRoot, { recursive: true, force: true });
});

test("微信同步拒绝错误目标和未管理路径碰撞", (t) => {
  const tempRoot = makeTempRoot(t);
  const sourceRoot = path.join(tempRoot, "source");
  const sharedAssetsRoot = path.join(tempRoot, "shared-assets");
  createNativeSource(sourceRoot);
  createAuthoritativeAssets(sharedAssetsRoot);

  const wrongCompileTarget = path.join(tempRoot, "wrong-compile");
  writeJson(wrongCompileTarget, "project.config.json", { compileType: "miniprogram" });
  const wrongCompile = runScript("sync-wechat.ps1", [
    "-SourceRoot",
    sourceRoot,
    "-OutputRoot",
    path.join(tempRoot, "wrong-output"),
    "-TargetRoot",
    wrongCompileTarget,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
  ]);
  assert.notEqual(wrongCompile.status, 0);
  assert.match(wrongCompile.combinedOutput, /compileType must be 'game'/);
  assert.equal(fs.existsSync(path.join(wrongCompileTarget, MANIFEST)), false);

  const unknownGameTarget = path.join(tempRoot, "unknown-game");
  writeJson(unknownGameTarget, "project.config.json", { compileType: "game", projectname: "unknown" });
  const unknownGame = runScript("sync-wechat.ps1", [
    "-SourceRoot",
    sourceRoot,
    "-OutputRoot",
    path.join(tempRoot, "unknown-output"),
    "-TargetRoot",
    unknownGameTarget,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
  ]);
  assert.notEqual(unknownGame.status, 0);
  assert.match(unknownGame.combinedOutput, /exactly recognized official WeChat example airplane-game template/);

  const collisionTarget = path.join(tempRoot, "collision-target");
  createOfficialTemplate(collisionTarget);
  writeFile(sourceRoot, ".eslintrc.js", "module.exports = { root: false };\n");
  const collision = runScript("sync-wechat.ps1", [
    "-SourceRoot",
    sourceRoot,
    "-OutputRoot",
    path.join(tempRoot, "collision-output"),
    "-TargetRoot",
    collisionTarget,
    "-SharedAssetsRoot",
    sharedAssetsRoot,
  ]);
  assert.notEqual(collision.status, 0);
  assert.match(collision.combinedOutput, /new managed path would overwrite an unmanaged target path: \.eslintrc\.js/);
  assert.equal(fs.readFileSync(path.join(collisionTarget, ".eslintrc.js"), "utf8"), "module.exports = { root: true };\n");
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

test("构建脚本显式使用正斜杠创建并校验 ZIP 条目", () => {
  const build = fs.readFileSync(path.join(ROOT, "scripts", "build.ps1"), "utf8");
  assert.match(build, /\.FullName\.Substring\(\$appRootPrefix\.Length\)\.Replace\('\\', '\/'\)/);
  assert.match(build, /CreateEntryFromFile\(/);
  assert.match(build, /\$_\.Contains\('\\'\)/);
  assert.doesNotMatch(build, /CreateFromDirectory\(/);
});

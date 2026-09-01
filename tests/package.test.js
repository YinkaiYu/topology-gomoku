"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

test("离线包内资源 URL 不携带查询参数或片段", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  const htmlResources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  const cssResources = [...style.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)].map((match) => match[1].trim());
  const packageResources = [...htmlResources, ...cssResources].filter(
    (resource) => !/^(?:#|data:|blob:)/.test(resource),
  );

  assert.ok(packageResources.length > 0, "应至少发现一个包内资源引用");
  packageResources.forEach((resource) => {
    assert.doesNotMatch(resource, /[?#]/, `离线资源必须按真实文件名引用：${resource}`);
  });
});

test("构建脚本显式使用正斜杠创建并校验 ZIP 条目", () => {
  const build = fs.readFileSync(path.join(ROOT, "scripts", "build.ps1"), "utf8");
  assert.match(build, /\.FullName\.Substring\(\$appRootPrefix\.Length\)\.Replace\('\\', '\/'\)/);
  assert.match(build, /CreateEntryFromFile\(/);
  assert.match(build, /\$_\.Contains\('\\'\)/);
  assert.doesNotMatch(build, /CreateFromDirectory\(/);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const PLUGIN_DIR = path.join(ROOT, "dsh");

test("the DSH plugin is a complete bundle with a host half and a client half", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "package.json"), "utf8"));
  assert.equal(manifest.type, "module");
  assert.equal(manifest.exports["."], "./host.js");
  assert.equal(manifest.exports["./client"], "./client.js");
  assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(manifest.dsh.client.platform, "web");
  for (const file of ["host.js", "client.js", "cordis.patch.yml", "icon.svg", "locale/en.json", "locale/zh.json", "README.md"]) {
    assert.ok(fs.existsSync(path.join(PLUGIN_DIR, file)), `${file} is part of the package`);
  }
});

test("the default patch is machine independent and inserts its own row", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "package.json"), "utf8"));
  const patch = fs.readFileSync(path.join(PLUGIN_DIR, "cordis.patch.yml"), "utf8");
  assert.match(patch, /id:\s*topology-arena-native/);
  assert.ok(patch.includes(manifest.name), "the row names this package");
  assert.doesNotMatch(patch, /[A-Za-z]:[\\/]/, "the committed patch must not contain an absolute Windows path");
});

test("the client factory registers under the package name", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "package.json"), "utf8"));
  const client = fs.readFileSync(path.join(PLUGIN_DIR, "client.js"), "utf8");
  assert.ok(client.includes(`id: '${manifest.name}'`), "the browser factory id equals the package name");
});

test("both plugin halves parse as JavaScript", () => {
  for (const file of ["host.js", "client.js"]) {
    execFileSync(process.execPath, ["--check", path.join(PLUGIN_DIR, file)], { stdio: "pipe" });
  }
});

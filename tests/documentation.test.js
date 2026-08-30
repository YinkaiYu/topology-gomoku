"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

test("documentation validator never descends into ignored dependency and cache directories", () => {
  const fixture = path.join(ROOT, ".tmp", `docs-validator-${process.pid}`);
  fs.mkdirSync(path.join(fixture, "docs"), { recursive: true });
  fs.mkdirSync(path.join(fixture, ".venv", "nested"), { recursive: true });
  fs.mkdirSync(path.join(fixture, "node_modules", "nested"), { recursive: true });
  fs.writeFileSync(path.join(fixture, "README.md"), "# Fixture\n", "utf8");
  fs.writeFileSync(path.join(fixture, "docs", "README.md"), "[Guide](guide.md)\n", "utf8");
  fs.writeFileSync(path.join(fixture, "docs", "guide.md"), "# Guide\n", "utf8");
  fs.writeFileSync(path.join(fixture, ".venv", "nested", "ignored.md"), "[broken](missing.md) C:\\Users\\Private\\file\n", "utf8");
  fs.writeFileSync(path.join(fixture, "node_modules", "nested", "ignored.md"), "[broken](missing.md) C:\\Users\\Private\\file\n", "utf8");

  try {
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(ROOT, "scripts", "validate-docs.ps1"), "-ProjectRoot", fixture],
      { cwd: ROOT, encoding: "utf8" }
    );
    assert.equal(result.status, 0, `documentation fixture failed\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Documentation validation passed: 3 Markdown files\./);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

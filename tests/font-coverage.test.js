"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { assertFontCoverage, readCmap } = require("./helpers/font-coverage.js");

const ROOT = path.resolve(__dirname, "..");
const APP_ROOT = path.join(ROOT, "app");
const FONT_ROOT = path.join(APP_ROOT, "assets", "fonts");
const FONT_WEIGHTS = ["400", "600", "700"];

function syntheticTtfWithFormat12(codepoint) {
  const cmap = Buffer.alloc(40);
  cmap.writeUInt16BE(0, 0);
  cmap.writeUInt16BE(1, 2);
  cmap.writeUInt16BE(3, 4);
  cmap.writeUInt16BE(10, 6);
  cmap.writeUInt32BE(12, 8);
  cmap.writeUInt16BE(12, 12);
  cmap.writeUInt16BE(0, 14);
  cmap.writeUInt32BE(28, 16);
  cmap.writeUInt32BE(0, 20);
  cmap.writeUInt32BE(1, 24);
  cmap.writeUInt32BE(codepoint, 28);
  cmap.writeUInt32BE(codepoint, 32);
  cmap.writeUInt32BE(1, 36);

  const font = Buffer.alloc(28 + cmap.length);
  font.writeUInt32BE(0x00010000, 0);
  font.writeUInt16BE(1, 4);
  font.write("cmap", 12, 4, "ascii");
  font.writeUInt32BE(28, 20);
  font.writeUInt32BE(cmap.length, 24);
  cmap.copy(font, 28);
  return font;
}

test("所有应用文本都由三个内嵌字体字重完整覆盖", () => {
  assertFontCoverage({
    textRoots: [APP_ROOT],
    fontPaths: FONT_WEIGHTS.map((weight) => (
      path.join(FONT_ROOT, `noto-serif-sc-${weight}.woff2`)
    )),
    minimumCodepoints: 200
  });
});

test("字体覆盖 helper 可读取平台 TTF 的 cmap", () => {
  const codepoint = "棋".codePointAt(0);
  const cmap = readCmap(syntheticTtfWithFormat12(codepoint));

  assert.equal(cmap.has(codepoint), true);
});

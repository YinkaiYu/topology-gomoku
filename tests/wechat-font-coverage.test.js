"use strict";

const test = require("node:test");
const path = require("node:path");

const { assertFontCoverage } = require("./helpers/font-coverage.js");

const ROOT = path.resolve(__dirname, "..");
const WEIGHTS = [400, 600, 700];

test("微信小游戏本地 TTF 覆盖共享与原生 Canvas 文案", () => {
  assertFontCoverage({
    textRoots: [path.join(ROOT, "app"), path.join(ROOT, "wechat")],
    fontPaths: WEIGHTS.map((weight) => (
      path.join(ROOT, "wechat", "assets", "fonts", `noto-serif-sc-${weight}.ttf`)
    )),
    minimumCodepoints: 250,
  });
});

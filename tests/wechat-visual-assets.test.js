"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const UI_ROOT = path.join(ROOT, "wechat", "assets", "ui");
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const EXPECTED = {
  topologies: ["plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"],
  silhouettes: ["cylinder", "torus", "mobius", "klein", "projective", "sphere"],
  icons: [
    "back",
    "settings",
    "undo",
    "boundary",
    "journey",
    "restart",
    "next-level",
    "review",
    "previous",
    "next",
    "surface",
    "board",
    "check",
  ],
};

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, ...relativePath.split("/")), "utf8");
}

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${file} is not a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function declaredStrings(source, declaration) {
  const match = source.match(new RegExp(`const ${declaration} = \\[([\\s\\S]*?)\\];`));
  assert.ok(match, `missing ${declaration}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function responsiveFiles(names) {
  return names.flatMap((name) => [`${name}.png`, `${name}-compact.png`]).sort();
}

function svgAspectSize(group, fileName) {
  const compact = fileName.includes("-compact.png");
  const baseName = fileName.replace(/-compact\.png$|\.png$/g, "");
  const cssSize = baseName === "sphere" ? (compact ? 62 : 94) : (compact ? 46 : 70);
  const source = fs.readFileSync(path.join(ROOT, "app", "assets", group, `${baseName}.svg`), "utf8");
  const match = source.match(/\bviewBox=["']([^"']+)["']/i);
  assert.ok(match, `missing viewBox for ${group}/${baseName}.svg`);
  const [, , width, height] = match[1].trim().split(/[\s,]+/).map(Number);
  const scale = cssSize * 3 / Math.max(width, height);
  return {
    width: width * scale,
    height: height * scale,
    longSide: cssSize * 3,
  };
}

test("微信 UI 权威拓扑、剪影与图标栅格资源完整且可解码", () => {
  for (const [group, names] of Object.entries(EXPECTED)) {
    const directory = path.join(UI_ROOT, group);
    const files = fs.readdirSync(directory).filter((name) => name.endsWith(".png")).sort();
    const expectedFiles = group === "icons"
      ? names.map((name) => `${name}.png`).sort()
      : responsiveFiles(names);
    assert.deepEqual(files, expectedFiles);
    for (const fileName of files) {
      const size = pngSize(path.join(directory, fileName));
      if (group === "topologies" || group === "silhouettes") {
        const expected = svgAspectSize(group, fileName);
        assert.ok(Math.abs(size.width - expected.width) <= 1, `${fileName} width preserves viewBox aspect`);
        assert.ok(Math.abs(size.height - expected.height) <= 1, `${fileName} height preserves viewBox aspect`);
        assert.equal(Math.max(size.width, size.height), expected.longSide, `${fileName} long side is 3x`);
      } else {
        assert.deepEqual(size, { width: 60, height: 60 });
      }
    }
  }
  assert.deepEqual(pngSize(path.join(UI_ROOT, "mystery-ground-shadow.png")), { width: 198, height: 75 });
});

test("微信宿主预加载全部权威资源，渲染器只在加载失败时回退", () => {
  const host = read("wechat/js/platform/wechat-host.js");
  const renderer = read("wechat/js/ui/scene-renderer.js");
  assert.deepEqual(declaredStrings(host, "TOPOLOGY_NAMES"), EXPECTED.topologies);
  assert.deepEqual(declaredStrings(host, "ICON_NAMES"), EXPECTED.icons);
  assert.match(host, /const SILHOUETTE_NAMES = TOPOLOGY_NAMES\.filter\(\(name\) => name !== 'plane'\)/);
  assert.match(host, /const SIZE_VARIANTS = \['', '-compact'\]/);
  assert.match(host, /path: `assets\/ui\/topologies\/\$\{name\}\$\{suffix\}\.png`/);
  assert.match(host, /path: `assets\/ui\/silhouettes\/\$\{name\}\$\{suffix\}\.png`/);
  assert.match(host, /path: `assets\/ui\/icons\/\$\{name\}\.png`/);
  assert.match(host, /path: 'assets\/ui\/mystery-ground-shadow\.png'/);
  assert.match(host, /const image = wx\.createImage\(\)/);
  assert.match(renderer, /if \(!drawImageContain\(ctx, this\.topologyImage\(level\.topology, compact\), glyphRect\)\) \{/);
  assert.match(renderer, /if \(!drawImageContain\(ctx, this\.silhouetteImage\(level\.topology, compact\), glyphRect\)\) \{/);
  assert.match(renderer, /if \(!drawIconAsset\(ctx, this\.iconImage\(name\), x, y, size\)\) \{/);
});

test("微信 UI 栅格由 H5 权威 SVG 与按钮路径生成", () => {
  const generator = read("scripts/generate-wechat-ui-assets.cjs");
  assert.match(generator, /const H5_ASSETS = path\.join\(ROOT, "app", "assets"\)/);
  assert.match(generator, /const WECHAT_RASTER_DENSITY = 216/);
  assert.match(generator, /const scale = cssSize \/ Math\.max\(viewBox\.width, viewBox\.height\)/);
  assert.match(generator, /<ellipse cx="33" cy="12\.5" rx="24" ry="3\.5"/);
  assert.match(generator, /path\.join\(H5_ASSETS, "topologies"\)/);
  assert.match(generator, /path\.join\(H5_ASSETS, "silhouettes"\)/);
  for (const button of [
    "backButton",
    "gameSettingsButton",
    "undoButton",
    "boundaryDemoButton",
    "journeyButton",
    "restartButton",
    "nextLevelButton",
    "reviewToggleButton",
    "reviewPreviousButton",
    "reviewNextButton",
    "dimensionToggleButton",
  ]) {
    assert.match(generator, new RegExp(`pathForButton\\("${button}"\\)`));
  }
});

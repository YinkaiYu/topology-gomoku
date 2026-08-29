"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const PROJECT = path.join(ROOT, "video", "footsteps-return");
const expectedAssets = [
  {
    id: "topology-gomoku-brand",
    originalFilename: "brand-icon.png",
    destination: "video/footsteps-return/assets/brand/topology-gomoku.png"
  },
  {
    id: "iop-logo",
    originalFilename: "iop-logo.png",
    destination: "video/footsteps-return/assets/brand/iop-logo.png"
  }
];

const digest = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

let browser;
let page;
let server;

test.before(async () => {
  const { startStaticServer } = await import("../video/footsteps-return/scripts/serve-app.mjs");
  server = await startStaticServer({ root: PROJECT });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.__renderReady);
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

test("the opening uses only a real board edge and a reversible hidden-adjacency reveal", async () => {
  const result = await page.evaluate(async () => {
    const { introTiming } = await import("/compositions/intro.js");
    const scene = document.querySelector('[data-scene-id="intro"]');
    const timeline = window.__timelines["footsteps-return"];
    const sample = (time) => {
      timeline.time(time, false).pause();
      const path = scene.querySelector("[data-intro-hidden-adjacency]");
      return {
        pathOpacity: Number(getComputedStyle(path).opacity),
        edgeOpacity: Number(getComputedStyle(scene.querySelector("[data-intro-board-edge]")).opacity)
      };
    };
    const hidden = sample(introTiming.hiddenHeroAt);
    const revealed = sample(introTiming.revealHeroAt);
    const hiddenAgain = sample(introTiming.hiddenHeroAt);
    return {
      boardSource: scene.querySelector("[data-intro-board-edge]")?.dataset.boardSource,
      boardEdges: scene.querySelectorAll("[data-intro-board-edge]").length,
      hiddenPaths: scene.querySelectorAll("[data-intro-hidden-adjacency]").length,
      marks: scene.querySelectorAll("img, [data-game-title-mark], [data-iop-mark]").length,
      visibleText: scene.innerText.trim(),
      paused: timeline.paused(),
      hidden,
      revealed,
      hiddenAgain
    };
  });

  assert.equal(result.boardSource, "real-html-board");
  assert.equal(result.boardEdges, 1);
  assert.equal(result.hiddenPaths, 1);
  assert.equal(result.marks, 0);
  assert.equal(result.visibleText, "");
  assert.equal(result.paused, true);
  assert.ok(result.hidden.pathOpacity < 0.05, "auxiliary adjacency must genuinely disappear");
  assert.ok(result.revealed.pathOpacity > 0.7, "hidden adjacency must slowly return");
  assert.ok(result.revealed.edgeOpacity > 0.7, "the real board edge must anchor the reveal");
  assert.deepEqual(result.hiddenAgain, result.hidden, "backward seek must reconstruct the same hidden state");
});

test("the final card has one text title and one substantial IOP mark without extra commerce or platform marks", async () => {
  const result = await page.evaluate(async () => {
    const { endCardTiming } = await import("/compositions/end-card.js");
    const scene = document.querySelector('[data-scene-id="end-card"]');
    const timeline = window.__timelines["footsteps-return"];
    timeline.time(Number(scene.dataset.sceneStart) + endCardTiming.heroAt, false).pause();
    const logo = scene.querySelector("[data-iop-mark]");
    const title = scene.querySelector("[data-game-title-mark]");
    const logoRect = logo.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      titles: [...scene.querySelectorAll("[data-game-title-mark]")].map((node) => node.textContent.trim()),
      subtitles: [...scene.querySelectorAll("[data-end-card-subtitle]")].map((node) => node.textContent.trim()),
      iopCount: scene.querySelectorAll("img[data-iop-mark]").length,
      iopSrc: logo.getAttribute("src"),
      iopAlt: logo.getAttribute("alt"),
      gameGraphicCount: scene.querySelectorAll('img[src*="topology-gomoku"]').length,
      forbiddenCopy: /二维码|商店|小红书|哔哩哔哩|微信|版本|v\d/i.test(scene.innerText),
      titleOpacity: Number(getComputedStyle(title).opacity),
      logoOpacity: Number(getComputedStyle(logo).opacity),
      logoWidth: logoRect.width,
      titleWidth: titleRect.width
    };
  });

  assert.deepEqual(result.titles, ["拓扑五子棋"]);
  assert.deepEqual(result.subtitles, ["章节预告 PV—「足迹回环」"]);
  assert.equal(result.iopCount, 1);
  assert.equal(result.iopSrc, "/assets/brand/iop-logo.png");
  assert.match(result.iopAlt, /中国科学院物理研究所/);
  assert.equal(result.gameGraphicCount, 0);
  assert.equal(result.forbiddenCopy, false);
  assert.ok(result.titleOpacity > 0.99 && result.logoOpacity > 0.99, "title and institute mark must be fully resolved at the hero frame");
  assert.ok(result.logoWidth >= 360, "IOP mark must have enough visual weight at 4K");
  assert.ok(result.logoWidth < result.titleWidth, "IOP mark must remain subordinate to the game title");
});

test("copied brand assets are byte-identical and have portable provenance", () => {
  const provenancePath = path.join(PROJECT, "assets", "provenance.json");
  assert.equal(fs.existsSync(provenancePath), true, "brand provenance must exist");
  const provenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
  assert.deepEqual(provenance.map(({ id, originalFilename, destination }) => ({ id, originalFilename, destination })), expectedAssets);

  for (const entry of provenance) {
    assert.ok(["repository-copy", "user-provided"].includes(entry.sourceType));
    assert.match(entry.rightsBasis, /\S/);
    assert.match(entry.copiedDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.equal(path.isAbsolute(entry.destination), false);
    assert.equal(entry.destination.includes("\\"), false);
    assert.equal(digest(fs.readFileSync(path.join(ROOT, entry.destination))), entry.sha256);
    assert.doesNotMatch(JSON.stringify(entry), /[A-Za-z]:[\\/]|Users[\\/]/);
  }

  const gameCopy = fs.readFileSync(path.join(PROJECT, "assets", "brand", "topology-gomoku.png"));
  const gameSource = fs.readFileSync(path.join(ROOT, "app", "assets", "brand-icon.png"));
  assert.deepEqual(gameCopy, gameSource);
  assert.equal(provenance.find(({ id }) => id === "iop-logo").sourceDescription, "用户提供的 IOP.pdf 派生资产");
});

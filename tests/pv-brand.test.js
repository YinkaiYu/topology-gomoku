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
    originalFilename: "IOP.pdf",
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

test("the opening is sourced from one ready, frozen plane GameRenderAdapter canvas", async () => {
  const result = await page.evaluate(async () => {
    const { introTiming } = await import("/compositions/intro.js");
    const scene = document.querySelector('[data-scene-id="intro"]');
    const timeline = window.__timelines["footsteps-return"];
    const frame = scene.querySelector("iframe[data-intro-game-render]");
    const adapter = frame?.contentWindow?.gameRender;
    const canvas = adapter?.frame?.contentDocument?.querySelector("#boardCanvas");
    if (!frame || !adapter || !canvas) {
      return {
        frameCount: scene.querySelectorAll("iframe[data-intro-game-render]").length,
        adapterReady: false
      };
    }
    const hashCanvas = () => {
      const bytes = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (let index = 0; index < bytes.length; index += 1) {
        hash ^= bytes[index];
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };
    const sample = (time) => {
      timeline.time(time, false).pause();
      const veil = scene.querySelector("[data-intro-hidden-adjacency]");
      return {
        veilOpacity: Number(getComputedStyle(veil).opacity),
        edgeOpacity: Number(getComputedStyle(scene.querySelector("[data-intro-board-edge]")).opacity),
        canvasHash: hashCanvas()
      };
    };
    const hidden = sample(introTiming.hiddenHeroAt);
    const revealed = sample(introTiming.revealHeroAt);
    const hiddenAgain = sample(introTiming.hiddenHeroAt);
    return {
      frameCount: scene.querySelectorAll("iframe[data-intro-game-render]").length,
      frameSource: frame.getAttribute("src"),
      framePath: new URL(frame.src).pathname,
      topology: adapter.definition?.id,
      renderReady: adapter.renderReady(),
      canvasSize: [canvas.width, canvas.height],
      boardEdges: scene.querySelectorAll("[data-intro-board-edge]").length,
      hiddenPaths: scene.querySelectorAll("[data-intro-hidden-adjacency]").length,
      syntheticBoardParts: scene.querySelectorAll(".intro-board-edge__surface, .intro-board-edge__stone").length,
      marks: scene.querySelectorAll("img, [data-game-title-mark], [data-iop-mark]").length,
      visibleText: scene.innerText.trim(),
      remoteResources: performance.getEntriesByType("resource")
        .map(({ name }) => new URL(name))
        .filter((url) => url.origin !== location.origin)
        .map((url) => url.href),
      gameSourceRequests: frame.contentWindow.performance.getEntriesByType("resource")
        .map(({ name }) => new URL(name).pathname)
        .filter((pathname) => pathname.includes("/assets/game-source/")),
      paused: timeline.paused(),
      hidden,
      revealed,
      hiddenAgain
    };
  });

  assert.equal(result.frameCount, 1);
  assert.notEqual(result.adapterReady, false);
  assert.equal(result.frameSource, "./render-game.html?sourceRoot=./assets/game-source");
  assert.equal(result.framePath, "/render-game.html");
  assert.equal(result.topology, "plane");
  assert.equal(result.renderReady.ready, true);
  assert.equal(result.renderReady.status.lessonStep, 5);
  assert.ok(result.renderReady.status.queueSize <= 1);
  assert.ok(result.canvasSize.every((size) => size >= 640));
  assert.equal(result.boardEdges, 1);
  assert.equal(result.hiddenPaths, 1);
  assert.equal(result.syntheticBoardParts, 0);
  assert.equal(result.marks, 0);
  assert.equal(result.visibleText, "");
  assert.deepEqual(result.remoteResources, []);
  assert.ok(result.gameSourceRequests.some((pathname) => pathname.endsWith("/assets/game-source/index.html")));
  assert.ok(result.gameSourceRequests.some((pathname) => pathname.endsWith("/assets/game-source/assets/game.js")));
  assert.equal(result.gameSourceRequests.some((pathname) => pathname.startsWith("/app/")), false);
  assert.equal(result.paused, true);
  assert.ok(result.hidden.veilOpacity > 0.8, "the real canvas path must be obscured at the hidden hero frame");
  assert.ok(result.revealed.veilOpacity < 0.1, "the real canvas path must slowly return as the veil clears");
  assert.ok(result.revealed.edgeOpacity > 0.7, "the real board edge must anchor the reveal");
  assert.deepEqual(result.hiddenAgain, result.hidden, "backward seek must reconstruct the same hidden state");
  assert.equal(result.hidden.canvasHash, result.revealed.canvasHash, "GSAP seek must not advance real game pixels");
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
      iopSrc: new URL(logo.src).pathname,
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

test("the final identity stays authored-hidden through pre-roll and reveals reversibly in sequence", async () => {
  const samples = await page.evaluate(() => {
    const timeline = window.__timelines["footsteps-return"];
    const scene = document.querySelector('[data-scene-id="end-card"]');
    const sceneStart = Number(scene.dataset.sceneStart);
    const read = (time) => {
      timeline.time(time, false).pause();
      const opacity = (selector) => Number(getComputedStyle(scene.querySelector(selector)).opacity);
      return {
        time,
        scene: Number(getComputedStyle(scene).opacity),
        rule: opacity("[data-end-card-rule]"),
        title: opacity("[data-game-title-mark]"),
        subtitle: opacity("[data-end-card-subtitle]"),
        logo: opacity("[data-iop-mark]")
      };
    };
    const forward = [sceneStart - 0.5, sceneStart, sceneStart + 0.17, sceneStart + 0.55, sceneStart + 1.1, sceneStart + 3.8].map(read);
    const rewind = read(sceneStart - 0.5);
    return { forward, rewind };
  });

  const [preRoll, start, beforeFirstReveal, titleBuild, sequenceBuild, resolved] = samples.forward;
  for (const sample of [preRoll, start, beforeFirstReveal, samples.rewind]) {
    assert.deepEqual(
      { rule: sample.rule, title: sample.title, subtitle: sample.subtitle, logo: sample.logo },
      { rule: 0, title: 0, subtitle: 0, logo: 0 },
      `identity content must stay hidden at ${sample.time}s`
    );
  }
  assert.ok(preRoll.scene > 0 && preRoll.scene < 1, "the parent scene should be crossfading during pre-roll");
  assert.ok(titleBuild.rule > 0 && titleBuild.title > 0, "rule and title should begin the formal sequence first");
  assert.equal(titleBuild.subtitle, 0);
  assert.equal(titleBuild.logo, 0);
  assert.ok(sequenceBuild.title > sequenceBuild.subtitle && sequenceBuild.subtitle > sequenceBuild.logo, "copy and logo must reveal in hierarchy order");
  assert.deepEqual(
    { rule: resolved.rule, title: resolved.title, subtitle: resolved.subtitle, logo: resolved.logo },
    { rule: 1, title: 1, subtitle: 1, logo: 1 }
  );
  assert.deepEqual(samples.rewind, preRoll, "rewinding from the resolved card must restore the exact pre-roll state");
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
  const iop = provenance.find(({ id }) => id === "iop-logo");
  assert.equal(iop.sourceDocument, "IOP.pdf");
  assert.equal(iop.derivedFilename, "iop-logo.png");
  assert.equal(iop.sourceDescription, "用户提供的 IOP.pdf 派生资产");
});

test("both copied brand files are registered in the unified PV asset manifest", async () => {
  const { assets } = await import("../video/footsteps-return/src/data/assets.js");
  assert.deepEqual(
    assets.filter(({ id }) => ["brand-topology-gomoku", "brand-iop-logo"].includes(id)),
    [
      {
        id: "brand-topology-gomoku",
        path: "video/footsteps-return/assets/brand/topology-gomoku.png",
        provenance: { type: "repository-copy", source: "app/assets/brand-icon.png" }
      },
      {
        id: "brand-iop-logo",
        path: "video/footsteps-return/assets/brand/iop-logo.png",
        provenance: { type: "user-provided", source: "video/footsteps-return/assets/provenance.json" }
      }
    ]
  );
});

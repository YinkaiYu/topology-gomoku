"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const expectedSceneIds = [
  "intro",
  "chapter-card-plane",
  "chapter-plane",
  "chapter-card-cylinder",
  "chapter-cylinder",
  "chapter-card-torus",
  "chapter-torus",
  "chapter-card-mobius",
  "chapter-mobius",
  "chapter-card-klein",
  "chapter-klein",
  "chapter-card-projective",
  "chapter-projective",
  "chapter-card-sphere",
  "chapter-sphere",
  "seven-world-gallery",
  "outro",
  "end-card"
];
const expectedChapterCards = [
  { id: "plane", act: "ACT. PROLOGUE", chapter: "方庭", topology: "平面" },
  { id: "cylinder", act: "ACT. I", chapter: "回廊", topology: "圆柱面" },
  { id: "torus", act: "ACT. II", chapter: "环游", topology: "环面" },
  { id: "mobius", act: "ACT. III", chapter: "扭带", topology: "莫比乌斯环" },
  { id: "klein", act: "ACT. IV", chapter: "瓶界", topology: "克莱因瓶" },
  { id: "projective", act: "ACT. V", chapter: "双生", topology: "实射影平面" },
  { id: "sphere", act: "ACT. VI", chapter: "归圆", topology: "球面" }
];

let browser;
let page;
let server;

test.before(async () => {
  const { startStaticServer } = await import("../video/footsteps-return/scripts/serve-app.mjs");
  server = await startStaticServer({ root: path.join(ROOT, "video/footsteps-return") });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

test("4K master stage synchronously registers every scene on one paused timeline", async () => {
  const contract = await page.evaluate(() => {
    const root = document.querySelector('[data-composition-id="footsteps-return"]');
    const timeline = window.__timelines?.["footsteps-return"];
    const tweenCount = timeline?.getChildren(true, true, true).length ?? -1;
    return {
      rootCount: document.querySelectorAll('[data-composition-id="footsteps-return"]').length,
      stageCount: document.querySelectorAll("[data-master-stage]").length,
      width: root?.dataset.width,
      height: root?.dataset.height,
      fps: root?.dataset.fps,
      duration: root?.dataset.duration,
      paused: timeline?.paused(),
      registryIds: Object.keys(window.__pvSceneRegistry ?? {}),
      domSceneIds: [...document.querySelectorAll("[data-scene-id]")].map((node) => node.dataset.sceneId),
      hasInfiniteRepeat: timeline?.getChildren(true, true, true).some((child) => child.repeat?.() === -1),
      tweenCount
    };
  });

  assert.deepEqual(contract, {
    rootCount: 1,
    stageCount: 1,
    width: "3840",
    height: "2160",
    fps: "60",
    duration: "165",
    paused: true,
    registryIds: expectedSceneIds,
    domSceneIds: expectedSceneIds,
    hasInfiniteRepeat: false,
    tweenCount: contract.tweenCount
  });
  assert.ok(contract.tweenCount > expectedSceneIds.length, "master timeline should choreograph scenes, not only register them");

  const readyExists = await page.evaluate(() => window.__renderReady instanceof Promise);
  assert.equal(readyExists, true);
  await page.evaluate(() => window.__renderReady);
  const tweenCountAfterFonts = await page.evaluate(() => window.__timelines["footsteps-return"].getChildren(true, true, true).length);
  assert.equal(tweenCountAfterFonts, contract.tweenCount, "font readiness must not mutate the timeline asynchronously");
});

test("safe-area tokens and caption layer keep one visible caption group", async () => {
  const contract = await page.evaluate(() => {
    const root = document.querySelector('[data-composition-id="footsteps-return"]');
    const styles = getComputedStyle(root);
    const captionGroups = [...document.querySelectorAll("[data-caption-group]")];
    return {
      safeArea: ["--safe-left", "--safe-right", "--safe-top", "--safe-bottom"].map((token) => styles.getPropertyValue(token).trim()),
      captionCount: captionGroups.length,
      visibleCaptionCount: captionGroups.filter((node) => {
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
      }).length
    };
  });

  assert.deepEqual(contract, {
    safeArea: ["192px", "192px", "144px", "180px"],
    captionCount: 1,
    visibleCaptionCount: 1
  });
});

test("render readiness waits for all three local Topo Serif weights", async () => {
  const result = await page.evaluate(async () => {
    await window.__renderReady;
    const faces = [...document.fonts]
      .filter((face) => face.family.replaceAll('"', "") === "Topo Serif")
      .map((face) => ({ weight: face.weight, status: face.status }))
      .sort((a, b) => Number(a.weight) - Number(b.weight));
    return {
      ready: document.documentElement.dataset.renderReady,
      fontStatus: document.fonts.status,
      faces,
      remoteResources: performance.getEntriesByType("resource")
        .map(({ name }) => new URL(name))
        .filter((url) => url.origin !== location.origin)
        .map((url) => url.href)
    };
  });

  assert.equal(result.ready, "true");
  assert.equal(result.fontStatus, "loaded");
  assert.deepEqual(result.faces, [
    { weight: "400", status: "loaded" },
    { weight: "600", status: "loaded" },
    { weight: "700", status: "loaded" }
  ]);
  assert.deepEqual(result.remoteResources, []);
});

test("seven chapter cards preserve the approved title triples", async () => {
  const snapshots = await page.evaluate(() => [...document.querySelectorAll("[data-chapter-card]")].map((card) => ({
    id: card.dataset.chapterCard,
    act: card.querySelector("[data-chapter-act]")?.textContent.trim(),
    chapter: card.querySelector("[data-chapter-name]")?.textContent.trim(),
    topology: card.querySelector("[data-topology-name]")?.textContent.trim()
  })));

  assert.deepEqual(snapshots, expectedChapterCards);
});

test("every ACT line remains a single unclipped line at the sole 4K target", async () => {
  const measurements = await page.evaluate(() => [...document.querySelectorAll("[data-chapter-act]")].map((act) => {
    const style = getComputedStyle(act);
    return {
      text: act.textContent.trim(),
      whiteSpace: style.whiteSpace,
      lineHeight: Number.parseFloat(style.lineHeight),
      height: act.getBoundingClientRect().height,
      fitsWidth: act.scrollWidth <= act.clientWidth
    };
  }));

  assert.equal(measurements.length, 7);
  measurements.forEach((measurement) => {
    assert.equal(measurement.whiteSpace, "nowrap", `${measurement.text} must not wrap`);
    assert.ok(measurement.height <= measurement.lineHeight + 1, `${measurement.text} must occupy one line`);
    assert.equal(measurement.fitsWidth, true, `${measurement.text} must fit its title column`);
  });
});

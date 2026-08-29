"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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
  { id: "plane", act: "ACT. PROLOGUE", chapter: "方庭", topology: "平面", light: "#21302c" },
  { id: "cylinder", act: "ACT. I", chapter: "回廊", topology: "圆柱面", light: "#3f8c87" },
  { id: "torus", act: "ACT. II", chapter: "环游", topology: "环面", light: "#3f8c87" },
  { id: "mobius", act: "ACT. III", chapter: "扭带", topology: "莫比乌斯环", light: "#d95b4f" },
  { id: "klein", act: "ACT. IV", chapter: "瓶界", topology: "克莱因瓶", light: "#7f6ca8" },
  { id: "projective", act: "ACT. V", chapter: "双生", topology: "实射影平面", light: "#8b7556" },
  { id: "sphere", act: "ACT. VI", chapter: "归圆", topology: "球面", light: "#c79244" }
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
      timelineDuration: timeline?.duration(),
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
    timelineDuration: 165,
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
    topology: card.querySelector("[data-topology-name]")?.textContent.trim(),
    light: getComputedStyle(card).getPropertyValue("--chapter-light").trim()
  })));

  assert.deepEqual(snapshots, expectedChapterCards);
});

test("chapter-card children stay hidden before reveal and resolve visibly without flashing", async () => {
  const samples = await page.evaluate(() => {
    const timeline = window.__timelines["footsteps-return"];
    const cards = [...document.querySelectorAll("[data-chapter-card]")];
    const selectors = [
      "[data-chapter-volume]",
      "[data-chapter-silhouette]",
      "[data-chapter-act]",
      "[data-chapter-name]",
      "[data-topology-name]"
    ];
    return cards.map((card) => {
      const scene = card.closest("[data-scene-id]");
      const start = Number(scene.dataset.sceneStart);
      const sampleAt = (time) => {
        timeline.time(time, false).pause();
        return selectors.map((selector) => Number(getComputedStyle(card.querySelector(selector)).opacity));
      };
      return {
        id: card.dataset.chapterCard,
        before: sampleAt(start - 0.01),
        start: sampleAt(start),
        during: sampleAt(start + 0.72),
        after: sampleAt(start + 1.45)
      };
    });
  });

  samples.forEach(({ id, before, start, during, after }) => {
    assert.deepEqual(before, [0, 0, 0, 0, 0], `${id} children must be authored hidden before reveal`);
    assert.deepEqual(start, [0, 0, 0, 0, 0], `${id} children must remain hidden at chapter start`);
    during.forEach((opacity) => assert.ok(opacity > 0, `${id} child should be visible during reveal`));
    after.forEach((opacity) => assert.ok(opacity > 0, `${id} child should remain visible after reveal`));
  });
});

test("master scene factories can inject a real chapter renderer", async () => {
  const result = await page.evaluate(async () => {
    const { buildMasterTimeline } = await import("/src/runtime/master-timeline.js");
    const stage = document.createElement("div");
    const runtime = buildMasterTimeline({
      document,
      gsap: window.gsap,
      stage,
      sceneFactories: {
        chapter({ document: documentRef, definition }) {
          const scene = documentRef.createElement("section");
          scene.dataset.sceneId = definition.id;
          scene.dataset.sceneKind = definition.kind;
          scene.dataset.injectedRenderer = "true";
          return scene;
        }
      }
    });
    const chapters = Object.values(runtime.registry).filter((scene) => scene.dataset.sceneKind === "chapter");
    runtime.timeline.kill();
    return { count: chapters.length, injected: chapters.every((scene) => scene.dataset.injectedRenderer === "true") };
  });

  assert.deepEqual(result, { count: 7, injected: true });
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

test("project-local chapter assets preserve repository provenance", async () => {
  const { assets } = await import("../video/footsteps-return/src/data/assets.js");
  const copies = assets.filter(({ provenance }) => provenance.type === "repository-copy");
  assert.deepEqual(copies.map(({ path: assetPath, provenance }) => [assetPath, provenance.source]), [
    ["video/footsteps-return/assets/fonts/noto-serif-sc-400.woff2", "app/assets/fonts/noto-serif-sc-400.woff2"],
    ["video/footsteps-return/assets/fonts/noto-serif-sc-600.woff2", "app/assets/fonts/noto-serif-sc-600.woff2"],
    ["video/footsteps-return/assets/fonts/noto-serif-sc-700.woff2", "app/assets/fonts/noto-serif-sc-700.woff2"],
    ["video/footsteps-return/assets/topologies/plane.svg", "app/assets/topologies/plane.svg"],
    ["video/footsteps-return/assets/topologies/cylinder.svg", "app/assets/silhouettes/cylinder.svg"],
    ["video/footsteps-return/assets/topologies/torus.svg", "app/assets/silhouettes/torus.svg"],
    ["video/footsteps-return/assets/topologies/mobius.svg", "app/assets/silhouettes/mobius.svg"],
    ["video/footsteps-return/assets/topologies/klein.svg", "app/assets/silhouettes/klein.svg"],
    ["video/footsteps-return/assets/topologies/projective.svg", "app/assets/silhouettes/projective.svg"],
    ["video/footsteps-return/assets/topologies/sphere.svg", "app/assets/silhouettes/sphere.svg"]
  ]);

  copies.forEach(({ path: assetPath, provenance }) => {
    const copied = fs.readFileSync(path.join(ROOT, assetPath));
    const source = fs.readFileSync(path.join(ROOT, provenance.source));
    if (assetPath.endsWith(".woff2")) {
      assert.deepEqual(copied, source, `${assetPath} must be a byte-identical font copy`);
      return;
    }
    const markup = copied.toString("utf8");
    assert.match(markup, new RegExp(`data-source-href="${provenance.source.replaceAll("/", "\\/")}"`));
    const withoutSource = (value) => value.toString("utf8").replace(/\sdata-source-href="[^"]*"/, "");
    assert.equal(withoutSource(copied), withoutSource(source), `${assetPath} may only change source metadata`);
  });
});

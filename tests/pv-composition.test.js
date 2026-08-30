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
  { id: "torus", act: "ACT. II", chapter: "环游", topology: "环面", light: "#385f78" },
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
  server = await startStaticServer({ root: path.join(ROOT, "video", "footsteps-return") });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

test("4K master stage synchronously registers every scene on one paused timeline", async () => {
  const { masterTimeline } = await import("../video/footsteps-return/src/data/timeline.js");
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
    duration: String(masterTimeline.duration),
    paused: true,
    timelineDuration: masterTimeline.duration,
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

test("seven chapter cards preserve the approved copy in one swapping top slot and one anchored title", async () => {
  const snapshots = await page.evaluate(() => [...document.querySelectorAll("[data-chapter-card]")].map((card) => ({
    id: card.dataset.chapterCard,
    act: card.querySelector("[data-chapter-act]")?.textContent.trim(),
    chapter: card.querySelector("[data-chapter-name]")?.textContent.trim(),
    topology: card.querySelector("[data-topology-name]")?.textContent.trim(),
    light: getComputedStyle(card).getPropertyValue("--chapter-light").trim(),
    topSlotShared: card.querySelector("[data-chapter-act]")?.parentElement === card.querySelector("[data-topology-name]")?.parentElement,
    topSlotMarked: card.querySelector("[data-chapter-act]")?.parentElement?.hasAttribute("data-chapter-top-slot") ?? false,
    copyLevels: [...card.querySelector(".chapter-card__copy").children].map((node) => node.hasAttribute("data-chapter-top-slot") ? "top-slot" : node.hasAttribute("data-chapter-name") ? "chapter" : "unexpected")
  })));

  assert.deepEqual(snapshots, expectedChapterCards.map((card) => ({
    ...card,
    topSlotShared: true,
    topSlotMarked: true,
    copyLevels: ["top-slot", "chapter"]
  })));
});

test("chapter-card timing data reserves readable phase A, swap, and phase B windows", async () => {
  const timing = await page.evaluate(async () => {
    const module = await import("/compositions/chapter-titles.js");
    return module.chapterTitleTiming ?? null;
  });

  assert.ok(timing, "chapter-card timing must be exported as editable data");
  assert.deepEqual(Object.keys(timing), ["ambient", "phaseA", "swap", "phaseB"]);
  for (const [section, values] of Object.entries(timing)) {
    for (const [name, value] of Object.entries(values)) {
      assert.ok(Number.isFinite(value), `${section}.${name} must be finite timing data`);
    }
  }
  const phaseAReady = Math.max(
    timing.phaseA.actAt + timing.phaseA.actDuration,
    timing.phaseA.chapterAt + timing.phaseA.chapterDuration
  );
  assert.ok(timing.phaseA.heroAt >= phaseAReady && timing.phaseA.heroAt < timing.swap.at, "phase A hero must land inside its readable hold");
  assert.ok(timing.swap.at - phaseAReady >= 0.45, "phase A needs at least 450 ms fully readable");
  assert.ok(timing.swap.duration >= 0.3, "the top-slot crossfade needs a readable focus transition");
  assert.ok(timing.phaseB.heroAt >= timing.swap.at + timing.swap.duration && timing.phaseB.heroAt < timing.phaseB.readableUntil, "phase B hero must land inside its readable hold");
  assert.ok(timing.phaseB.readableUntil - (timing.swap.at + timing.swap.duration) >= 0.65, "phase B needs at least 650 ms fully readable");
});

test("seven chapter cards reveal ACT plus title, crossfade the top slot, then hold topology plus title", async () => {
  const samples = await page.evaluate(async () => {
    const { chapterTitleTiming: timing } = await import("/compositions/chapter-titles.js");
    const timeline = window.__timelines["footsteps-return"];
    const cards = [...document.querySelectorAll("[data-chapter-card]")];
    const opacity = (node) => Number(getComputedStyle(node).opacity);
    const bounds = (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return cards.map((card) => {
      const scene = card.closest("[data-scene-id]");
      const start = Number(scene.dataset.sceneStart);
      const act = card.querySelector("[data-chapter-act]");
      const chapter = card.querySelector("[data-chapter-name]");
      const topology = card.querySelector("[data-topology-name]");
      const sampleAt = (offset) => {
        timeline.time(start + offset, false).pause();
        return {
          act: opacity(act),
          chapter: opacity(chapter),
          topology: opacity(topology),
          chapterBounds: bounds(chapter)
        };
      };
      return {
        id: card.dataset.chapterCard,
        before: sampleAt(-0.01),
        start: sampleAt(0),
        phaseA: sampleAt(timing.phaseA.heroAt),
        swap: Array.from({ length: Math.ceil(timing.swap.duration * 60) + 1 }, (_, index) => sampleAt(timing.swap.at + Math.min(index / 60, timing.swap.duration))),
        phaseB: sampleAt(timing.phaseB.heroAt)
      };
    });
  });

  samples.forEach(({ id, before, start, phaseA, swap, phaseB }) => {
    for (const [label, sample] of [["before reveal", before], ["at chapter start", start]]) {
      assert.equal(sample.act, 0, `${id} ACT must be hidden ${label}`);
      assert.equal(sample.chapter, 0, `${id} title must be hidden ${label}`);
      assert.equal(sample.topology, 0, `${id} topology must be hidden ${label}`);
    }
    assert.ok(phaseA.act > 0.99, `${id} phase A must show ACT`);
    assert.ok(phaseA.chapter > 0.99, `${id} phase A must show the chapter title`);
    assert.ok(phaseA.topology < 0.01, `${id} phase A must hide topology`);
    assert.ok(phaseB.act < 0.01, `${id} phase B must hide ACT`);
    assert.ok(phaseB.chapter > 0.99, `${id} phase B must keep the chapter title`);
    assert.ok(phaseB.topology > 0.99, `${id} phase B must show topology`);
    assert.deepEqual(phaseB.chapterBounds, phaseA.chapterBounds, `${id} lower title must not move during the top-slot swap`);
    assert.equal(phaseB.chapter, phaseA.chapter, `${id} lower title opacity must remain stable across phases`);
    swap.forEach((sample, index) => {
      assert.ok(Math.min(sample.act, sample.topology) < 0.99, `${id} ACT and topology cannot both be fully visible at swap sample ${index}`);
      assert.ok(Math.max(sample.act, sample.topology) > 0.45, `${id} top slot cannot disappear during swap sample ${index}`);
      assert.deepEqual(sample.chapterBounds, phaseA.chapterBounds, `${id} lower title must stay fixed during swap sample ${index}`);
      assert.equal(sample.chapter, phaseA.chapter, `${id} lower title opacity must stay fixed during swap sample ${index}`);
    });
  });
});

test("both chapter-card rows stay centered on the 4K stage through phase A, swap, and phase B", async () => {
  const samples = await page.evaluate(async () => {
    const { chapterTitleTiming: timing } = await import("/compositions/chapter-titles.js");
    const timeline = window.__timelines["footsteps-return"];
    const stageRect = document.querySelector("[data-master-stage]").getBoundingClientRect();
    const stageCenter = stageRect.x + stageRect.width / 2;
    const centerX = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.x + rect.width / 2;
    };
    return [...document.querySelectorAll("[data-chapter-card]")].map((card) => {
      const scene = card.closest("[data-scene-id]");
      const start = Number(scene.dataset.sceneStart);
      const topSlot = card.querySelector("[data-chapter-top-slot]");
      const act = card.querySelector("[data-chapter-act]");
      const chapter = card.querySelector("[data-chapter-name]");
      const topology = card.querySelector("[data-topology-name]");
      const sampleAt = (offset) => {
        timeline.time(start + offset, false).pause();
        return {
          stageCenter,
          topSlotCenter: centerX(topSlot),
          actCenter: centerX(act),
          chapterCenter: centerX(chapter),
          topologyCenter: centerX(topology),
          align: [act, chapter, topology].map((node) => getComputedStyle(node).textAlign)
        };
      };
      return {
        id: card.dataset.chapterCard,
        phaseA: sampleAt(timing.phaseA.heroAt),
        swap: Array.from({ length: Math.ceil(timing.swap.duration * 60) + 1 }, (_, index) => sampleAt(timing.swap.at + Math.min(index / 60, timing.swap.duration))),
        phaseB: sampleAt(timing.phaseB.heroAt)
      };
    });
  });

  const assertCentered = (id, label, sample) => {
    for (const [row, center] of [["top slot", sample.topSlotCenter], ["ACT", sample.actCenter], ["chapter", sample.chapterCenter], ["topology", sample.topologyCenter]]) {
      assert.ok(Math.abs(center - sample.stageCenter) <= 1, `${id} ${row} must stay within 1px of the stage center during ${label}`);
    }
    assert.deepEqual(sample.align, ["center", "center", "center"], `${id} both visible rows must use centered text during ${label}`);
  };

  samples.forEach(({ id, phaseA, swap, phaseB }) => {
    assertCentered(id, "phase A", phaseA);
    swap.forEach((sample, index) => assertCentered(id, `swap sample ${index}`, sample));
    assertCentered(id, "phase B", phaseB);
  });
});

test("master scene factories can inject a real chapter renderer", async () => {
  const result = await page.evaluate(async () => {
    const { buildMasterTimeline } = await import("/src/runtime/master-timeline.js");
    const { createChapterScene } = await import("/compositions/chapters/index.js");
    const stage = document.createElement("div");
    const runtime = buildMasterTimeline({
      document,
      gsap: window.gsap,
      stage,
      sceneFactories: {
        chapter({ document: documentRef, definition }) {
          const scene = createChapterScene(documentRef, definition);
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
    ["video/footsteps-return/assets/topology/plane.svg", "app/assets/topologies/plane.svg"],
    ["video/footsteps-return/assets/topology/cylinder.svg", "app/assets/topologies/cylinder.svg"],
    ["video/footsteps-return/assets/topology/torus.svg", "app/assets/topologies/torus.svg"],
    ["video/footsteps-return/assets/topology/mobius.svg", "app/assets/topologies/mobius.svg"],
    ["video/footsteps-return/assets/topology/klein.svg", "app/assets/topologies/klein.svg"],
    ["video/footsteps-return/assets/topology/projective.svg", "app/assets/topologies/projective.svg"],
    ["video/footsteps-return/assets/topology/sphere.svg", "app/assets/topologies/sphere.svg"],
    ["video/footsteps-return/assets/topologies/cylinder.svg", "app/assets/silhouettes/cylinder.svg"],
    ["video/footsteps-return/assets/topologies/torus.svg", "app/assets/silhouettes/torus.svg"],
    ["video/footsteps-return/assets/topologies/mobius.svg", "app/assets/silhouettes/mobius.svg"],
    ["video/footsteps-return/assets/topologies/klein.svg", "app/assets/silhouettes/klein.svg"],
    ["video/footsteps-return/assets/topologies/projective.svg", "app/assets/silhouettes/projective.svg"],
    ["video/footsteps-return/assets/topologies/sphere.svg", "app/assets/silhouettes/sphere.svg"],
    ["video/footsteps-return/assets/brand/topology-gomoku.png", "app/assets/brand-icon.png"],
    ["video/footsteps-return/assets/game-source/index.html", "app/index.html"],
    ["video/footsteps-return/assets/game-source/assets/style.css", "app/assets/style.css"],
    ["video/footsteps-return/assets/game-source/assets/topology.js", "app/assets/topology.js"],
    ["video/footsteps-return/assets/game-source/assets/topology-morph.js", "app/assets/topology-morph.js"],
    ["video/footsteps-return/assets/game-source/assets/game-replay.js", "app/assets/game-replay.js"],
    ["video/footsteps-return/assets/game-source/assets/game.js", "app/assets/game.js"],
    ["video/footsteps-return/assets/game-source/assets/fonts/noto-serif-sc-400.woff2", "app/assets/fonts/noto-serif-sc-400.woff2"],
    ["video/footsteps-return/assets/game-source/assets/fonts/noto-serif-sc-600.woff2", "app/assets/fonts/noto-serif-sc-600.woff2"],
    ["video/footsteps-return/assets/game-source/assets/fonts/noto-serif-sc-700.woff2", "app/assets/fonts/noto-serif-sc-700.woff2"],
    ["video/footsteps-return/assets/game-source/assets/brand-icon.png", "app/assets/brand-icon.png"],
    ["video/footsteps-return/assets/game-source/assets/topologies/plane.svg", "app/assets/topologies/plane.svg"],
    ["video/footsteps-return/assets/game-source/assets/topologies/cylinder.svg", "app/assets/topologies/cylinder.svg"],
    ["video/footsteps-return/assets/game-source/assets/topologies/torus.svg", "app/assets/topologies/torus.svg"],
    ["video/footsteps-return/assets/game-source/assets/topologies/mobius.svg", "app/assets/topologies/mobius.svg"],
    ["video/footsteps-return/assets/game-source/assets/topologies/klein.svg", "app/assets/topologies/klein.svg"],
    ["video/footsteps-return/assets/game-source/assets/topologies/projective.svg", "app/assets/topologies/projective.svg"],
    ["video/footsteps-return/assets/game-source/assets/topologies/sphere.svg", "app/assets/topologies/sphere.svg"],
    ["video/footsteps-return/assets/game-source/assets/silhouettes/cylinder.svg", "app/assets/silhouettes/cylinder.svg"],
    ["video/footsteps-return/assets/game-source/assets/silhouettes/torus.svg", "app/assets/silhouettes/torus.svg"],
    ["video/footsteps-return/assets/game-source/assets/silhouettes/mobius.svg", "app/assets/silhouettes/mobius.svg"],
    ["video/footsteps-return/assets/game-source/assets/silhouettes/klein.svg", "app/assets/silhouettes/klein.svg"],
    ["video/footsteps-return/assets/game-source/assets/silhouettes/projective.svg", "app/assets/silhouettes/projective.svg"],
    ["video/footsteps-return/assets/game-source/assets/silhouettes/sphere.svg", "app/assets/silhouettes/sphere.svg"]
  ]);

  copies.forEach(({ path: assetPath, provenance }) => {
    const copied = fs.readFileSync(path.join(ROOT, assetPath));
    const source = fs.readFileSync(path.join(ROOT, provenance.source));
    if (!assetPath.endsWith(".svg") || copied.equals(source)) {
      assert.deepEqual(copied, source, `${assetPath} must be a byte-identical repository copy`);
      return;
    }
    const markup = copied.toString("utf8");
    assert.match(markup, new RegExp(`data-source-href="${provenance.source.replaceAll("/", "\\/")}"`));
    const withoutSource = (value) => value.toString("utf8").replace(/\sdata-source-href="[^"]*"/, "");
    assert.equal(withoutSource(copied), withoutSource(source), `${assetPath} may only change source metadata`);
  });
});

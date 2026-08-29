"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "footsteps-return");
const EXPECTED_SHAPES = ["plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const EXPECTED_PATH_IDS = [
  "plane:ordinary-five",
  "cylinder:horizontal-wrap",
  "torus:two-seam-diagonal",
  "mobius:reflected-crossing",
  "klein:preserved-crossing",
  "klein:reflected-crossing",
  "projective:mirrored-crossings",
  "sphere:adjacent-edge-turn"
];
const PROHIBITED_TERMS = /wipe|slide|connector[- ]?line|page[- ]?movement|page[- ]?transition/i;

let browser;
let page;
let server;

test.before(async () => {
  const { startStaticServer } = await import("../video/footsteps-return/scripts/serve-app.mjs");
  server = await startStaticServer({ root: PV_ROOT });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.__renderReady);
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

test("every adjacent scene pair resolves to one cinematic transition contract", async () => {
  const [{ masterTimeline }, transitions] = await Promise.all([
    import("../video/footsteps-return/src/data/timeline.js"),
    import("../video/footsteps-return/src/runtime/transitions.js")
  ]);
  const { transitionContracts, CINEMATIC_TRANSITION_STAGES, getTransitionContract } = transitions;
  assert.equal(transitionContracts.length, masterTimeline.scenes.length - 1);
  masterTimeline.scenes.slice(0, -1).forEach((scene, index) => {
    const next = masterTimeline.scenes[index + 1];
    assert.equal(scene.transition.target, next.id, `${scene.id} must target the next scene`);
    const contract = getTransitionContract(scene.id, next.id);
    assert.equal(contract.from, scene.id);
    assert.equal(contract.to, next.id);
    assert.equal(contract.family, "cinematic-spatial-match");
    assert.deepEqual(contract.stages, CINEMATIC_TRANSITION_STAGES);
    assert.equal(PROHIBITED_TERMS.test(JSON.stringify(contract)), false, `${scene.id} -> ${next.id} uses a prohibited transition`);
    assert.deepEqual(contract.animatedProperties, ["opacity", "filter", "scale"]);
  });
});

test("gallery contains seven unique surfaces and only real Task 3/6 path IDs", async () => {
  const gallery = await page.evaluate(() => {
    const scene = document.querySelector('[data-scene-id="seven-world-gallery"]');
    return {
      shapeIds: [...scene.querySelectorAll("[data-gallery-shape]")].map((node) => node.dataset.galleryShape),
      pathIds: [...scene.querySelectorAll("[data-gallery-path]")].map((node) => node.dataset.galleryPath),
      pathSources: [...scene.querySelectorAll("[data-gallery-path]")].map((node) => ({
        id: node.dataset.galleryPath,
        sourcePathIndex: node.dataset.sourcePathIndex,
        sourceModule: node.dataset.pathSource
      })),
      text: scene.textContent.trim(),
      chapterCards: scene.querySelectorAll("[data-chapter-card]").length,
      extraLabels: scene.querySelectorAll("[data-gallery-title], [data-gallery-summary], [data-seven-worlds-title]").length
    };
  });
  assert.deepEqual(gallery.shapeIds, EXPECTED_SHAPES);
  assert.equal(new Set(gallery.shapeIds).size, EXPECTED_SHAPES.length);
  assert.deepEqual(gallery.pathIds, EXPECTED_PATH_IDS);
  assert.equal(gallery.pathSources.every(({ sourcePathIndex, sourceModule }) => /^\d+$/.test(sourcePathIndex) && sourceModule === "src/data/game-render-shots.js"), true);
  assert.equal(gallery.text, "");
  assert.equal(gallery.chapterCards, 0);
  assert.equal(gallery.extraLabels, 0);
});

test("transition boundaries hold coverage without page movement and seek reversibly", async () => {
  const observations = await page.evaluate(() => {
    const timeline = window.__timelines["footsteps-return"];
    const scenes = [...document.querySelectorAll("[data-scene-id]")];
    const transitionLayers = [...document.querySelectorAll("[data-pv-transition-layer]")];
    const opacity = (node) => Number(getComputedStyle(node).opacity);
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return [value.x, value.y, value.width, value.height];
    };
    const contracts = scenes.slice(0, -1).map((scene, index) => {
      const next = scenes[index + 1];
      const start = Number(next.dataset.sceneStart);
      const sample = (time) => {
        timeline.time(time, false).pause();
        const veil = transitionLayers[index];
        return {
          from: opacity(scene),
          to: opacity(next),
          veil: opacity(veil),
          fromRect: rect(scene),
          toRect: rect(next),
          veilTransform: getComputedStyle(veil).transform,
          sceneTransform: getComputedStyle(scene).transform
        };
      };
      const before = sample(Math.max(0, start - 0.63));
      const middle = sample(start - 0.31);
      const after = sample(start + 0.01);
      return { id: `${scene.dataset.sceneId}->${next.dataset.sceneId}`, before, middle, after };
    });
    const galleryStart = Number(document.querySelector('[data-scene-id="seven-world-gallery"]').dataset.sceneStart);
    const seek = (time) => {
      timeline.time(time, false).pause();
      const gallery = document.querySelector('[data-scene-id="seven-world-gallery"]');
      return {
        camera: getComputedStyle(gallery.querySelector("[data-gallery-camera]")).transform,
        shapes: [...gallery.querySelectorAll("[data-gallery-shape]")].map((node) => [node.dataset.galleryShape, opacity(node)])
      };
    };
    const first = seek(galleryStart + 1.2);
    seek(galleryStart + 0.1);
    const replay = seek(galleryStart + 1.2);
    return { contracts, reversible: JSON.stringify(first) === JSON.stringify(replay) };
  });

  observations.contracts.forEach(({ id, before, middle, after }) => {
    assert.ok(before.from > 0.9, `${id} source must still cover the pre-boundary frame`);
    assert.ok(after.to > 0.9, `${id} target must cover the post-boundary frame`);
    assert.ok(middle.from + middle.to + middle.veil > 0.82, `${id} must not flash uncovered at the dip`);
    assert.deepEqual(middle.fromRect, before.fromRect, `${id} source scene must not slide`);
    assert.deepEqual(middle.toRect, before.toRect, `${id} target scene must not slide`);
    assert.equal(/translate(?:X|Y)\(/i.test(middle.veilTransform), false, `${id} veil must not move as a page`);
    assert.equal(/translate(?:X|Y)\(/i.test(middle.sceneTransform), false, `${id} scene must not move as a page`);
  });
  assert.equal(observations.reversible, true, "gallery seeking must be deterministic and reversible");
});

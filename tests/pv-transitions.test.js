"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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
    const items = [...scene.querySelectorAll("[data-gallery-shape]")];
    const controllers = Object.values(window.__pvGalleryControllers ?? {});
    return {
      shapeIds: items.map((node) => node.dataset.galleryShape),
      pathIds: items.map((node) => node.dataset.galleryPathId),
      adapters: controllers.map((controller) => {
        const canvas = controller.canvas;
        return {
          id: controller.id,
          adapter: controller.adapter?.constructor?.name,
          instanceId: controller.instanceId,
          topology: controller.definition?.id,
          demo: controller.demo?.id,
          pathId: canvas?.dataset.galleryPathId,
          sourcePathIndex: canvas?.dataset.sourcePathIndex,
          liveCells: JSON.parse(canvas?.dataset.galleryLiveCells || "[]"),
          seams: JSON.parse(canvas?.dataset.gallerySeams || "[]"),
          canvasReady: canvas?.dataset.galleryCanvasReady === "true",
          alpha: canvas?.dataset.galleryAlpha === "true",
          mappedCompletion: canvas?.dataset.galleryMappedCompletion === "true",
          width: canvas?.width,
          height: canvas?.height
        };
      }),
      text: scene.textContent.trim(),
      chapterCards: scene.querySelectorAll("[data-chapter-card]").length,
      extraLabels: scene.querySelectorAll("[data-gallery-title], [data-gallery-summary], [data-seven-worlds-title]").length,
      overlayCount: scene.querySelectorAll("svg, polyline, [data-gallery-path]").length,
      iframeCount: scene.querySelectorAll("iframe[data-gallery-game-render]").length,
      canvasCount: scene.querySelectorAll("canvas[data-gallery-canvas]").length
    };
  });
  assert.deepEqual(gallery.shapeIds, EXPECTED_SHAPES);
  assert.equal(new Set(gallery.shapeIds).size, EXPECTED_SHAPES.length);
  assert.deepEqual(gallery.pathIds, EXPECTED_PATH_IDS);
  assert.equal(gallery.adapters.length, EXPECTED_SHAPES.length);
  assert.equal(new Set(gallery.adapters.map(({ instanceId }) => instanceId)).size, EXPECTED_SHAPES.length);
  gallery.adapters.forEach((item) => {
    assert.equal(item.adapter, "GameRenderAdapter");
    assert.equal(item.id, item.topology);
    assert.equal(item.pathId, `${item.topology}:${item.demo}`);
    assert.match(item.sourcePathIndex, /^\d+$/);
    assert.equal(item.liveCells.length, 5);
    assert.equal(item.seams.length, 4);
    assert.equal(item.canvasReady, true);
    assert.equal(item.alpha, true);
    assert.equal(item.mappedCompletion, true);
    assert.ok(item.width > 0 && item.height > 0);
  });
  assert.equal(gallery.text, "");
  assert.equal(gallery.chapterCards, 0);
  assert.equal(gallery.extraLabels, 0);
  assert.equal(gallery.overlayCount, 0);
  assert.equal(gallery.iframeCount, EXPECTED_SHAPES.length);
  assert.equal(gallery.canvasCount, EXPECTED_SHAPES.length);
});

test("transition boundaries consume real geometry masks and seek reversibly", async () => {
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
        const contract = {
          from: veil.dataset.transitionFrom,
          to: veil.dataset.transitionTo,
          occlusion: veil.dataset.transitionOcclusion,
          occlusionSelector: veil.dataset.occlusionSelector,
          occlusionConsumed: veil.dataset.occlusionConsumed === "true",
          occlusionGeometry: veil.dataset.transitionOcclusionGeometry,
          occlusionShape: veil.dataset.transitionOcclusionShape,
          occlusionNode: veil.dataset.transitionOcclusionNode,
          occlusionBbox: (() => {
            const node = scene.querySelector(`[data-transition-occlusion-contract="${veil.dataset.transitionOcclusion}"]`);
            const value = node?.getBoundingClientRect();
            return value ? [value.x, value.y, value.width, value.height] : null;
          })(),
          occlusionClip: (() => {
            const node = scene.querySelector(`[data-transition-occlusion-contract="${veil.dataset.transitionOcclusion}"]`);
            const style = node && getComputedStyle(node);
            return style ? `${style.clipPath}|${style.maskImage}|${style.webkitMaskImage}` : "";
          })(),
          occlusionOpacity: (() => {
            const node = scene.querySelector(`[data-transition-occlusion-contract="${veil.dataset.transitionOcclusion}"]`);
            return node ? opacity(node) : -1;
          })(),
          occlusionFallback: Boolean(scene.querySelector(".pv-transition-geometry--fallback")),
          matchId: veil.dataset.transitionMatch,
          geometry: veil.dataset.transitionGeometry,
          shape: veil.dataset.transitionShape,
          source: veil.dataset.transitionSource,
          target: veil.dataset.transitionTarget,
          sourceBbox: (() => {
            const node = scene.querySelector(`[data-match-shape="${veil.dataset.transitionSource}"]`);
            const value = node?.getBoundingClientRect();
            return value ? [value.x, value.y, value.width, value.height] : null;
          })(),
          targetBbox: (() => {
            const node = next.querySelector(`[data-match-shape="${veil.dataset.transitionTarget}"]`);
            const value = node?.getBoundingClientRect();
            return value ? [value.x, value.y, value.width, value.height] : null;
          })(),
          sourceClip: (() => {
            const node = scene.querySelector(`[data-match-shape="${veil.dataset.transitionSource}"]`);
            const style = node && getComputedStyle(node);
            return style ? `${style.clipPath}|${style.maskImage}|${style.webkitMaskImage}` : "";
          })(),
          targetClip: (() => {
            const node = next.querySelector(`[data-match-shape="${veil.dataset.transitionTarget}"]`);
            const style = node && getComputedStyle(node);
            return style ? `${style.clipPath}|${style.maskImage}|${style.webkitMaskImage}` : "";
          })(),
          sourceOpacity: (() => {
            const node = scene.querySelector(`[data-match-shape="${veil.dataset.transitionSource}"]`);
            return node ? opacity(node) : -1;
          })(),
          targetOpacity: (() => {
            const node = next.querySelector(`[data-match-shape="${veil.dataset.transitionTarget}"]`);
            return node ? opacity(node) : -1;
          })()
        };
        return {
          from: opacity(scene),
          to: opacity(next),
          veil: opacity(veil),
          fromRect: rect(scene),
          toRect: rect(next),
          veilTransform: getComputedStyle(veil).transform,
          sceneTransform: getComputedStyle(scene).transform,
          contract
        };
      };
      const before = sample(Math.max(0, start - 0.63));
      const middle = sample(start - 0.31);
      const after = sample(start + 0.01);
      return { id: `${scene.dataset.sceneId}->${next.dataset.sceneId}`, before, middle, after };
    });
    const gallery = document.querySelector('[data-scene-id="seven-world-gallery"]');
    const cameraSample = (time) => {
      timeline.time(time, false).pause();
      const style = getComputedStyle(gallery.querySelector("[data-gallery-camera]"));
      const transform = style.transform;
      const scale = Number(transform.match(/matrix\(([^,]+)/)?.[1] || 1);
      return { transform, scale };
    };
    const cameraBefore = cameraSample(146.9);
    const cameraAfter = cameraSample(148.4);
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
    return { contracts, reversible: JSON.stringify(first) === JSON.stringify(replay), galleryCamera: { before: cameraBefore.transform, after: cameraAfter.transform, beforeScale: cameraBefore.scale, afterScale: cameraAfter.scale } };
  });

  observations.contracts.forEach(({ id, before, middle, after }) => {
    assert.ok(before.from > 0.9, `${id} source must still cover the pre-boundary frame`);
    assert.ok(after.to > 0.9, `${id} target must cover the post-boundary frame`);
    assert.ok(middle.from + middle.to + middle.veil > 0.82, `${id} must not flash uncovered at the dip`);
    assert.deepEqual(middle.fromRect, before.fromRect, `${id} source scene must not slide`);
    assert.deepEqual(middle.toRect, before.toRect, `${id} target scene must not slide`);
    assert.equal(/translate(?:X|Y)\(/i.test(middle.veilTransform), false, `${id} veil must not move as a page`);
    assert.equal(/translate(?:X|Y)\(/i.test(middle.sceneTransform), false, `${id} scene must not move as a page`);
    assert.equal(middle.contract.occlusionConsumed, true, `${id} must consume its occlusion contract`);
    assert.ok(middle.contract.occlusionSelector.includes(middle.contract.occlusion), `${id} must expose its occlusion selector`);
    assert.ok(middle.contract.occlusionGeometry, `${id} must resolve an occlusion geometry profile`);
    assert.ok(middle.contract.occlusionShape, `${id} must resolve a topology-specific occlusion shape`);
    assert.ok(middle.contract.occlusionNode, `${id} must identify the consumed occlusion node`);
    assert.ok(middle.contract.occlusionBbox?.[2] > 0 && middle.contract.occlusionBbox?.[3] > 0, `${id} needs a visible occlusion geometry`);
    assert.notEqual(middle.contract.occlusionClip, "", `${id} occlusion must expose a clip or mask`);
    assert.ok(middle.contract.occlusionOpacity > 0, `${id} occlusion must be visible during match`);
    assert.equal(middle.contract.occlusionFallback, false, `${id} must not synthesize a fallback occluder`);
    assert.ok(middle.contract.sourceBbox?.[2] > 0 && middle.contract.sourceBbox?.[3] > 0, `${id} needs an outgoing match geometry`);
    assert.ok(middle.contract.targetBbox?.[2] > 0 && middle.contract.targetBbox?.[3] > 0, `${id} needs an incoming match geometry`);
    assert.notEqual(middle.contract.sourceClip, "", `${id} outgoing geometry must expose a mask`);
    assert.notEqual(middle.contract.targetClip, "", `${id} incoming geometry must expose a mask`);
    assert.ok(middle.contract.sourceOpacity > 0, `${id} outgoing geometry must be visible during match`);
    assert.ok(middle.contract.targetOpacity > 0, `${id} incoming geometry must be visible during match`);
  });
  assert.ok(new Set(observations.contracts.map(({ middle }) => middle.contract.shape)).size >= 5, "topology-specific matches must use different shape parameters");
  assert.equal(observations.reversible, true, "gallery seeking must be deterministic and reversible");
  assert.notEqual(observations.galleryCamera.before, observations.galleryCamera.after, "gallery withdrawal must cross the first outro narration");
  assert.notEqual(observations.galleryCamera.beforeScale, observations.galleryCamera.afterScale, "gallery camera scale must change across 147s");
});

test("transition evidence capture plan is native 4K and reproducible", async () => {
  const { transitionCapturePlan } = await import("../video/footsteps-return/scripts/capture-transition-evidence.mjs");
  assert.equal(transitionCapturePlan.length, 7);
  assert.deepEqual(transitionCapturePlan.map(({ id }) => id), [
    "cylinder-to-torus-pre",
    "cylinder-to-torus-mid",
    "cylinder-to-torus-post",
    "torus-to-mobius-mid",
    "mobius-to-klein-mid",
    "gallery-withdrawal-before-outro",
    "gallery-withdrawal-during-outro"
  ]);
  transitionCapturePlan.forEach((frame) => {
    const artifact = fs.readFileSync(path.join(ROOT, frame.path));
    assert.deepEqual([...artifact.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(artifact.readUInt32BE(16), 3840);
    assert.equal(artifact.readUInt32BE(20), 2160);
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/pv-transition-scenes-task7-manifest.json"), "utf8"));
  assert.deepEqual(manifest.viewport, { width: 3840, height: 2160, deviceScaleFactor: 1 });
  assert.equal(manifest.native4k, true);
  assert.equal(fs.existsSync(path.join(ROOT, "artifacts/pv-transition-scenes-task7-contact-sheet.png")), true);
});

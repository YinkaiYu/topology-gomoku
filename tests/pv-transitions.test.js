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
const BACKGROUND_CHANNELS = ["red", "green", "blue"];
const TRANSITION_GEOMETRY_SIDES = ["occlusion", "outgoing-match", "incoming-match"];
const BBOX_FIELDS = ["x", "y", "width", "height"];

async function pixelMetrics(png) {
  return page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 270;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixelCount = canvas.width * canvas.height;
    let luminanceSum = 0;
    let luminanceSquareSum = 0;
    let nonPureColorPixels = 0;
    const corners = [
      [data[0], data[1], data[2]],
      [data[(canvas.width - 1) * 4], data[(canvas.width - 1) * 4 + 1], data[(canvas.width - 1) * 4 + 2]],
      [data[(canvas.height - 1) * canvas.width * 4], data[(canvas.height - 1) * canvas.width * 4 + 1], data[(canvas.height - 1) * canvas.width * 4 + 2]],
      [data[(pixelCount - 1) * 4], data[(pixelCount - 1) * 4 + 1], data[(pixelCount - 1) * 4 + 2]]
    ];
    const background = [0, 1, 2].map((channel) => Math.round(corners.reduce((sum, color) => sum + color[channel], 0) / corners.length));
    let contentPixels = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const luminance = (red + green + blue) / 3;
      luminanceSum += luminance;
      luminanceSquareSum += luminance * luminance;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) >= 5 || luminance >= 13) {
        nonPureColorPixels += 1;
      }
      if (Math.max(Math.abs(red - background[0]), Math.abs(green - background[1]), Math.abs(blue - background[2])) >= 6) {
        const pixelIndex = index / 4;
        const x = pixelIndex % canvas.width;
        const y = Math.floor(pixelIndex / canvas.width);
        contentPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const mean = luminanceSum / pixelCount;
    return {
      mean,
      variance: luminanceSquareSum / pixelCount - mean * mean,
      nonPureColorRatio: nonPureColorPixels / pixelCount,
      background: { red: background[0], green: background[1], blue: background[2] },
      contentBbox: contentPixels > 0 ? {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixelRatio: contentPixels / pixelCount
      } : null
    };
  }, `data:image/png;base64,${png.toString("base64")}`);
}

function assertClose(actual, expected, tolerance, message) {
  assert.ok(Number.isFinite(actual), `${message}: actual value must be finite`);
  assert.ok(Number.isFinite(expected), `${message}: recorded value must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${actual} to be within ${tolerance} of ${expected}`);
}

function assertEvidencePixelMetrics(id, actual, recorded) {
  assert.ok(actual.variance > 1.5, `${id} must contain non-flat visual content`);
  assert.ok(actual.nonPureColorRatio > 0.005, `${id} must not be a black or pure-color frame`);
  assert.ok(actual.contentBbox?.width > 0 && actual.contentBbox?.height > 0, `${id} must have a non-background content bbox`);
  assert.ok(actual.contentBbox?.pixelRatio > 0.002, `${id} content bbox must contain a meaningful number of pixels`);
  assert.ok(recorded.background && typeof recorded.background === "object" && !Array.isArray(recorded.background), `${id} recorded background must be an object`);
  assert.deepEqual(Object.keys(recorded.background).sort(), [...BACKGROUND_CHANNELS].sort(), `${id} recorded background must contain exactly red, green, and blue`);
  for (const channel of BACKGROUND_CHANNELS) {
    assert.ok(Number.isInteger(recorded.background[channel]) && recorded.background[channel] >= 0 && recorded.background[channel] <= 255, `${id} recorded background ${channel} must be an 8-bit integer`);
    assertClose(actual.background?.[channel], recorded.background[channel], 1, `${id} decoded background ${channel}`);
  }
  assertClose(actual.mean, recorded.mean, 0.15, `${id} decoded mean`);
  assertClose(actual.variance, recorded.variance, Math.max(0.75, recorded.variance * 0.1), `${id} decoded variance`);
  assertClose(actual.nonPureColorRatio, recorded.nonPureColorRatio, 0.005, `${id} decoded non-pure-color ratio`);
  for (const key of ["x", "y", "width", "height"]) {
    assertClose(actual.contentBbox[key], recorded.contentBbox?.[key], 2, `${id} decoded content bbox ${key}`);
  }
  assertClose(actual.contentBbox.pixelRatio, recorded.contentBbox?.pixelRatio, 0.005, `${id} decoded content bbox pixel ratio`);
}

async function liveGeometryAt(frame) {
  return page.evaluate(async ({ seek, contractId }) => {
    const timeline = window.__timelines["footsteps-return"];
    timeline.time(seek, false).pause();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const layer = document.querySelector(`[data-pv-transition-layer="${contractId}"]`);
    if (!layer) return null;
    return [...layer.querySelectorAll("[data-transition-geometry-side]")].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        side: node.dataset.transitionGeometrySide,
        geometry: node.dataset.transitionGeometry,
        opacity: Number(getComputedStyle(node).opacity),
        bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    });
  }, frame);
}

function assertLiveGeometryMatches(frame, liveGeometry, recordedGeometry) {
  assert.ok(liveGeometry, `${frame.id} must resolve live geometry for ${frame.contractId}`);
  assert.deepEqual(liveGeometry.map(({ side }) => side), TRANSITION_GEOMETRY_SIDES);
  assert.ok(Array.isArray(recordedGeometry), `${frame.id} manifest must record runtime geometry`);
  assert.deepEqual(recordedGeometry.map(({ side }) => side), TRANSITION_GEOMETRY_SIDES, `${frame.id} manifest must record all three live geometry sides`);
  const expectedBySide = {
    occlusion: frame.expectedGeometry.occlusion,
    "outgoing-match": frame.expectedGeometry.outgoing,
    "incoming-match": frame.expectedGeometry.incoming
  };
  for (const recorded of recordedGeometry) {
    assert.ok(typeof recorded.geometry === "string" && recorded.geometry.length > 0, `${frame.id} ${recorded.side} manifest geometry is required`);
    assert.ok(Number.isFinite(recorded.opacity) && recorded.opacity >= 0 && recorded.opacity <= 1, `${frame.id} ${recorded.side} manifest opacity must be finite and between 0 and 1`);
    assert.ok(recorded.bbox && typeof recorded.bbox === "object" && !Array.isArray(recorded.bbox), `${frame.id} ${recorded.side} manifest bbox is required`);
    assert.deepEqual(Object.keys(recorded.bbox).sort(), [...BBOX_FIELDS].sort(), `${frame.id} ${recorded.side} manifest bbox must contain exactly x, y, width, and height`);
    for (const key of BBOX_FIELDS) {
      assert.ok(Number.isFinite(recorded.bbox[key]), `${frame.id} ${recorded.side} manifest bbox ${key} must be finite`);
    }
    assert.ok(recorded.bbox.width > 0 && recorded.bbox.height > 0, `${frame.id} ${recorded.side} manifest bbox must be valid`);
  }
  for (const live of liveGeometry) {
    const expected = expectedBySide[live.side];
    assert.equal(live.geometry, expected, `${frame.id} ${live.side} expected ${expected} but live runtime used ${live.geometry}`);
    assert.ok(Number.isFinite(live.opacity) && live.opacity >= 0 && live.opacity <= 1, `${frame.id} ${live.side} must expose a finite live opacity`);
    assert.ok(live.bbox.width > 0 && live.bbox.height > 0, `${frame.id} ${live.side} must expose a valid live bbox`);
    const recorded = recordedGeometry.find(({ side }) => side === live.side);
    assert.equal(recorded.geometry, live.geometry, `${frame.id} ${live.side} recorded geometry must match live runtime`);
    assert.equal(recorded.geometry, expected, `${frame.id} ${live.side} recorded geometry must match expectedGeometry`);
    assertClose(live.opacity, recorded.opacity, 0.02, `${frame.id} ${live.side} live opacity`);
    for (const key of ["x", "y", "width", "height"]) {
      assertClose(live.bbox[key], recorded.bbox[key], 2, `${frame.id} ${live.side} live bbox ${key}`);
    }
  }
}

let browser;
let page;
let server;

test.before(async () => {
  const { startStaticServer } = await import("../video/footsteps-return/scripts/serve-app.mjs");
  server = await startStaticServer({ root: PV_ROOT });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.__pvRenderReadyPromise);
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

test("matchId resolves the geometry pair used by each runtime contract", async () => {
  const {
    TRANSITION_MATCH_GEOMETRIES,
    resolveTransitionMatchGeometry,
    transitionContracts
  } = await import("../video/footsteps-return/src/runtime/transitions.js");
  assert.equal(Object.keys(TRANSITION_MATCH_GEOMETRIES).length, transitionContracts.length);
  transitionContracts.forEach((contract) => {
    assert.ok(TRANSITION_MATCH_GEOMETRIES[contract.matchId], `${contract.id} needs a matchId registry entry`);
  });

  const cylinderOutgoing = resolveTransitionMatchGeometry(
    "cylinder-section->torus-inner-ring",
    "outgoing-match",
    { contractId: "chapter-cylinder--chapter-card-torus", selector: '[data-match-shape="cylinder-section"]' }
  );
  const torusOutgoing = resolveTransitionMatchGeometry(
    "torus-inner-ring->mobius-twist-center",
    "outgoing-match",
    { contractId: "chapter-torus--chapter-card-mobius", selector: '[data-match-shape="torus-inner-ring"]' }
  );
  assert.equal(cylinderOutgoing.id, "cylinder-section");
  assert.equal(torusOutgoing.id, "torus-inner-ring");
  assert.notDeepEqual(
    [cylinderOutgoing.clipPath, cylinderOutgoing.maskImage, cylinderOutgoing.shape],
    [torusOutgoing.clipPath, torusOutgoing.maskImage, torusOutgoing.shape],
    "changing matchId must change the applied geometry"
  );
});

test("transition geometry validation fails fast with contract, selector, and side", async () => {
  const result = await page.evaluate(async () => {
    const transitions = await import("./src/runtime/transitions.js");
    const registry = window.__pvSceneRegistry;
    const contract = transitions.transitionContracts.find(({ id }) => id === "chapter-cylinder--chapter-card-torus");
    const source = registry[contract.from];
    const selected = [...source.querySelectorAll(contract.occlusion.selector)];
    const placements = selected.map((node) => ({ node, parent: node.parentNode, next: node.nextSibling }));
    selected.forEach((node) => node.remove());
    let selectorError = "";
    try {
      transitions.validateTransitionGeometryBindings(registry, [contract]);
    } catch (error) {
      selectorError = error.message;
    } finally {
      placements.forEach(({ node, parent, next }) => parent.insertBefore(node, next));
    }

    let geometryError = "";
    try {
      transitions.validateTransitionGeometryBindings(registry, [{
        ...contract,
        matchId: "missing-match-geometry",
        match: { ...contract.match, id: "missing-match-geometry" }
      }]);
    } catch (error) {
      geometryError = error.message;
    }
    return { selectorError, geometryError };
  });

  assert.match(result.selectorError, /chapter-cylinder--chapter-card-torus/);
  assert.match(result.selectorError, /data-occlusion="cylinder-section"/);
  assert.match(result.selectorError, /occlusion/);
  assert.match(result.geometryError, /chapter-cylinder--chapter-card-torus/);
  assert.match(result.geometryError, /data-match-shape="cylinder-section"/);
  assert.match(result.geometryError, /outgoing-match/);
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
  const observations = await page.evaluate(async () => {
    const { voiceoverSchedule } = await import("/src/data/captions.js");
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
        const geometryLayers = [...veil.querySelectorAll("[data-transition-geometry-side]")].map((node) => {
          const style = getComputedStyle(node);
          return {
            side: node.dataset.transitionGeometrySide,
            nodeId: node.dataset.transitionGeometryNode,
            matchId: node.dataset.transitionMatchId || "",
            geometry: node.dataset.transitionGeometry,
            shape: node.dataset.transitionGeometryShape,
            opacity: opacity(node),
            clip: `${style.clipPath}|${style.maskImage}|${style.webkitMaskImage}`,
            bbox: rect(node)
          };
        });
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
            const node = scene.querySelector(veil.dataset.occlusionSelector);
            const value = node?.getBoundingClientRect();
            return value ? [value.x, value.y, value.width, value.height] : null;
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
          sourceNodeUntouched: !scene.querySelector(`[data-match-shape="${veil.dataset.transitionSource}"]`)?.dataset.transitionGeometryRole,
          targetNodeUntouched: !next.querySelector(`[data-match-shape="${veil.dataset.transitionTarget}"]`)?.dataset.transitionGeometryRole,
          geometryLayers
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
      const settled = sample(scene.dataset.sceneId === "seven-world-gallery" ? start + 2.32 : start + 0.01);
      return { id: `${scene.dataset.sceneId}->${next.dataset.sceneId}`, before, middle, after, settled };
    });
    const gallery = document.querySelector('[data-scene-id="seven-world-gallery"]');
    const cameraSample = (time) => {
      timeline.time(time, false).pause();
      const style = getComputedStyle(gallery.querySelector("[data-gallery-camera]"));
      const transform = style.transform;
      const scale = Number(transform.match(/matrix\(([^,]+)/)?.[1] || 1);
      return { transform, scale };
    };
    const firstOutroNarrationStart = voiceoverSchedule.find(({ cueId }) => cueId === "outro-invocation").start;
    const cameraBefore = cameraSample(firstOutroNarrationStart - 0.52);
    const cameraAfter = cameraSample(firstOutroNarrationStart + 1.4);
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

  observations.contracts.forEach(({ id, before, middle, after, settled }) => {
    assert.ok(before.from > 0.9, `${id} source must still cover the pre-boundary frame`);
    if (id === "seven-world-gallery->outro") {
      assert.ok(after.from > 0.9, `${id} must keep the gallery visible at narration start`);
      assert.ok(settled.to > 0.9, `${id} target must cover the completed handoff`);
    } else {
      assert.ok(after.to > 0.9, `${id} target must cover the post-boundary frame`);
    }
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
    assert.equal(middle.contract.occlusionFallback, false, `${id} must not synthesize a fallback occluder`);
    assert.ok(middle.contract.sourceBbox?.[2] > 0 && middle.contract.sourceBbox?.[3] > 0, `${id} needs an outgoing match geometry`);
    assert.ok(middle.contract.targetBbox?.[2] > 0 && middle.contract.targetBbox?.[3] > 0, `${id} needs an incoming match geometry`);
    assert.equal(middle.contract.sourceNodeUntouched, true, `${id} must not overwrite the selected outgoing source node`);
    assert.equal(middle.contract.targetNodeUntouched, true, `${id} must not overwrite the selected incoming source node`);
    assert.deepEqual(
      middle.contract.geometryLayers.map(({ side }) => side),
      ["occlusion", "outgoing-match", "incoming-match"],
      `${id} must use three independent runtime geometry layers`
    );
    assert.equal(new Set(middle.contract.geometryLayers.map(({ nodeId }) => nodeId)).size, 3, `${id} runtime geometry nodes must not overlap`);
    middle.contract.geometryLayers.forEach((geometry) => {
      assert.ok(geometry.geometry, `${id} ${geometry.side} must resolve geometry through the runtime registry`);
      assert.ok(geometry.bbox[2] > 0 && geometry.bbox[3] > 0, `${id} ${geometry.side} needs a visible bbox`);
      assert.notEqual(geometry.clip, "none|none|none", `${id} ${geometry.side} must apply its clip or mask`);
    });
    assert.ok(middle.contract.geometryLayers[0].opacity > 0, `${id} occlusion and match geometry must coexist`);
    assert.ok(middle.contract.geometryLayers[1].opacity > 0, `${id} outgoing match geometry must coexist with occlusion`);
  });
  assert.ok(new Set(observations.contracts.map(({ middle }) => middle.contract.shape)).size >= 5, "topology-specific matches must use different shape parameters");
  assert.equal(observations.reversible, true, "gallery seeking must be deterministic and reversible");
  assert.notEqual(observations.galleryCamera.before, observations.galleryCamera.after, "gallery withdrawal must cross the first outro narration");
  assert.notEqual(observations.galleryCamera.beforeScale, observations.galleryCamera.afterScale, "gallery camera scale must change across the first outro narration");
  assert.equal(await page.locator("[data-scene-layer]").getAttribute("data-transition-geometry-ready"), "true");
  assert.equal(await page.locator("[data-scene-layer]").getAttribute("data-transition-geometry-count"), "17");
});

test("gallery remains visibly in motion through the opening outro narration", async () => {
  const firstOutroNarrationStart = await page.evaluate(async () => {
    const { voiceoverSchedule } = await import("/src/data/captions.js");
    return voiceoverSchedule.find(({ cueId }) => cueId === "outro-invocation").start;
  });
  const samples = [];
  for (const seek of [firstOutroNarrationStart - 0.62, firstOutroNarrationStart + 0.2, firstOutroNarrationStart + 1.4, firstOutroNarrationStart + 2.2]) {
    const state = await page.evaluate(async (time) => {
      const timeline = window.__timelines["footsteps-return"];
      timeline.time(time, false).pause();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const gallery = document.querySelector('[data-scene-id="seven-world-gallery"]');
      const camera = gallery.querySelector("[data-gallery-camera]");
      return {
        seek: time,
        galleryOpacity: Number(getComputedStyle(gallery).opacity),
        cameraTransform: getComputedStyle(camera).transform
      };
    }, seek);
    state.pixels = await pixelMetrics(await page.screenshot({ clip: { x: 0, y: 0, width: 3840, height: 1800 } }));
    samples.push(state);
  }

  assert.ok(samples[0].galleryOpacity > 0.7, "gallery must still cover most of the frame immediately before outro narration");
  assert.ok(samples[1].galleryOpacity > 0.55, "gallery must remain visible after outro narration begins");
  assert.ok(samples[2].galleryOpacity > 0.16, "gallery must still be present during the narrated withdrawal");
  assert.ok(samples[3].galleryOpacity < samples[2].galleryOpacity, "gallery must finish darkening after the visible handoff");
  assert.equal(new Set(samples.map(({ cameraTransform }) => cameraTransform)).size, 4, "camera motion must continue throughout the narrated handoff");
  assert.ok(samples[2].pixels.variance > 2, "the narrated withdrawal must contain visible spatial variation");
  assert.ok(samples[2].pixels.nonPureColorRatio > 0.01, "the narrated withdrawal must not be a pure-color frame");
  assert.ok(samples[3].pixels.variance < samples[2].pixels.variance, "the handoff must darken after the narrated withdrawal");
});

test("evidence validation rejects a replacement PNG containing only black pixels", async () => {
  const fixture = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  await fixture.setContent("<style>html,body{margin:0;width:100%;height:100%;background:#000}</style>");
  const blackMetrics = await pixelMetrics(await fixture.screenshot());
  await fixture.close();

  assert.throws(
    () => assertEvidencePixelMetrics("pure-black-fixture", blackMetrics, blackMetrics),
    /pure-black-fixture.*non-flat visual content/
  );
});

test("evidence validation requires the recorded background structure", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/pv-transition-scenes-task7-manifest.json"), "utf8"));
  const frame = manifest.frames[0];
  const actual = await pixelMetrics(fs.readFileSync(path.join(ROOT, frame.path)));
  const recorded = structuredClone(frame.pixels);
  delete recorded.background;

  assert.throws(
    () => assertEvidencePixelMetrics(frame.id, actual, recorded),
    /cylinder-to-torus-pre recorded background/
  );
});

test("evidence validation rejects a recorded background that disagrees with the decoded PNG", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/pv-transition-scenes-task7-manifest.json"), "utf8"));
  const frame = manifest.frames[0];
  const actual = await pixelMetrics(fs.readFileSync(path.join(ROOT, frame.path)));
  const recorded = structuredClone(frame.pixels);
  recorded.background.red += 12;

  assert.throws(
    () => assertEvidencePixelMetrics(frame.id, actual, recorded),
    /cylinder-to-torus-pre decoded background red/
  );
});

test("evidence validation requires the recorded runtime geometry field", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/pv-transition-scenes-task7-manifest.json"), "utf8"));
  const frame = manifest.frames.find(({ id }) => id === "cylinder-to-torus-post");
  const liveGeometry = await liveGeometryAt(frame);
  const tampered = structuredClone(frame);
  delete tampered.observation.geometry;

  assert.throws(
    () => assertLiveGeometryMatches(tampered, liveGeometry, tampered.observation.geometry),
    /cylinder-to-torus-post manifest must record runtime geometry/
  );
});

test("evidence validation rejects a recorded runtime geometry layer deletion", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/pv-transition-scenes-task7-manifest.json"), "utf8"));
  const frame = manifest.frames.find(({ id }) => id === "cylinder-to-torus-post");
  const liveGeometry = await liveGeometryAt(frame);
  const recordedGeometry = frame.observation.geometry.filter(({ side }) => side !== "outgoing-match");

  assert.throws(
    () => assertLiveGeometryMatches(frame, liveGeometry, recordedGeometry),
    /cylinder-to-torus-post manifest must record all three live geometry sides/
  );
});

test("evidence validation rejects recorded runtime geometry that disagrees with the live layer", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/pv-transition-scenes-task7-manifest.json"), "utf8"));
  const frame = manifest.frames.find(({ id }) => id === "cylinder-to-torus-post");
  const liveGeometry = await liveGeometryAt(frame);
  const recordedGeometry = structuredClone(frame.observation.geometry);
  recordedGeometry.find(({ side }) => side === "incoming-match").geometry = "tampered-inner-ring";

  assert.throws(
    () => assertLiveGeometryMatches(frame, liveGeometry, recordedGeometry),
    /cylinder-to-torus-post incoming-match recorded geometry must match live runtime/
  );
});

test("evidence validation rejects manifest geometry that disagrees with the live runtime", async () => {
  const { transitionCapturePlan } = await import("../video/footsteps-return/scripts/capture-transition-evidence.mjs");
  const reference = transitionCapturePlan.find(({ id }) => id === "cylinder-to-torus-post");
  const tampered = {
    id: "cylinder-to-torus-post",
    seek: reference.seek,
    contractId: "chapter-cylinder--chapter-card-torus",
    expectedGeometry: {
      occlusion: "cylinder-section",
      outgoing: "cylinder-section",
      incoming: "tampered-inner-ring"
    }
  };
  const liveGeometry = await liveGeometryAt(tampered);

  assert.throws(
    () => assertLiveGeometryMatches(tampered, liveGeometry, liveGeometry),
    /cylinder-to-torus-post incoming-match.*tampered-inner-ring.*torus-inner-ring/
  );
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
    assert.ok(frame.contractId, `${frame.id} must name its contract`);
    assert.ok(frame.phase, `${frame.id} must name its transition phase`);
    assert.equal(typeof frame.seek, "number");
    assert.ok(frame.expectedGeometry, `${frame.id} must declare expected geometry`);
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/pv-transition-scenes-task7-manifest.json"), "utf8"));
  assert.deepEqual(manifest.viewport, { width: 3840, height: 2160, deviceScaleFactor: 1 });
  assert.equal(manifest.native4k, true);
  assert.equal(fs.existsSync(path.join(ROOT, "artifacts/pv-transition-scenes-task7-contact-sheet.png")), true);
  assert.deepEqual(manifest.frames.map(({ id }) => id), transitionCapturePlan.map(({ id }) => id));
  for (const frame of manifest.frames) {
    const planned = transitionCapturePlan.find(({ id }) => id === frame.id);
    assert.equal(frame.contractId, planned.contractId);
    assert.equal(frame.seek, planned.seek);
    assert.deepEqual(frame.expectedGeometry, planned.expectedGeometry);

    const artifact = fs.readFileSync(path.join(ROOT, frame.path));
    assert.deepEqual([...artifact.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(artifact.readUInt32BE(16), 3840);
    assert.equal(artifact.readUInt32BE(20), 2160);
    const decodedPixels = await pixelMetrics(artifact);
    assertEvidencePixelMetrics(frame.id, decodedPixels, frame.pixels);

    const liveGeometry = await liveGeometryAt(frame);
    assertLiveGeometryMatches(frame, liveGeometry, frame.observation?.geometry);
    if (frame.id === "cylinder-to-torus-post") {
      const incoming = liveGeometry.find(({ side }) => side === "incoming-match");
      assert.equal(incoming.geometry, "torus-inner-ring");
      assert.ok(incoming.opacity > 0, "the incoming torus-inner-ring must remain visible in the post-boundary evidence");
      assert.ok(incoming.bbox.width > 0 && incoming.bbox.height > 0, "the incoming torus-inner-ring must have a valid bbox");
      assert.ok(decodedPixels.variance > 1.5 && decodedPixels.nonPureColorRatio > 0.005, "the post-boundary PNG must contain non-black pixels");
    }
  }
});

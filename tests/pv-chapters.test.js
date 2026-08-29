"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const CHAPTER_IDS = ["plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"];
const MODULE_EXPORTS = [
  ["plane", "planeChapter"],
  ["cylinder", "cylinderChapter"],
  ["torus", "torusChapter"],
  ["mobius", "mobiusChapter"],
  ["klein", "kleinChapter"],
  ["projective", "projectiveChapter"],
  ["sphere", "sphereChapter"]
];

const EXPECTED = Object.freeze({
  plane: {
    light: "#21302c",
    camera: "suspended-plane-lift",
    evidence: { kind: "finite-plane", cycles: 0, edgeAction: "bounded" },
    demos: ["ordinary-five"],
    morph: "identity",
    exit: "plane-shadow"
  },
  cylinder: {
    light: "#3f8c87",
    camera: "axial-side-closure",
    evidence: { kind: "single-cycle", cycles: 1, edgeAction: "opposite-sides-preserved" },
    demos: ["horizontal-wrap"],
    morph: "native",
    exit: "cylinder-wall"
  },
  torus: {
    light: "#385f78",
    camera: "dual-axis-orbit",
    evidence: { kind: "double-cycle", cycles: 2, edgeAction: "both-opposite-pairs-preserved" },
    demos: ["two-seam-diagonal"],
    morph: "native",
    exit: "torus-aperture"
  },
  mobius: {
    light: "#d95b4f",
    camera: "half-roll-reveal",
    evidence: { kind: "half-twist", halfTurns: 1, edgeAction: "single-pair-reflected" },
    demos: ["reflected-crossing"],
    morph: "native",
    exit: "mobius-ribbon"
  },
  klein: {
    light: "#7f6ca8",
    camera: "paired-memory-orbit",
    evidence: { kind: "preserved-reflected-pair", pathActions: ["preserved", "reflected"], edgeAction: "mixed", handoff: "paired-memory" },
    demos: ["preserved-crossing", "reflected-crossing"],
    morph: "native",
    exit: "klein-neck"
  },
  projective: {
    light: "#8b7556",
    camera: "mirrored-convergence",
    evidence: { kind: "all-edge-reflection", reflectedEdgePairs: 2, edgeAction: "all-reflected" },
    demos: ["mirrored-crossings"],
    morph: "native",
    exit: "projective-crosscap"
  },
  sphere: {
    light: "#c79244",
    camera: "adjacent-polar-arc",
    evidence: { kind: "adjacent-edge-continuation", adjacentEdgePairs: 2, edgeAction: "adjacent-pairs" },
    demos: ["adjacent-edge-turn"],
    morph: "native",
    exit: "sphere-horizon"
  }
});

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

test("seven chapters bind the approved real renderer and differentiated topology evidence", async () => {
  const definitions = [];
  for (const [id, exportName] of MODULE_EXPORTS) {
    const module = await import(`../video/footsteps-return/compositions/chapters/${id}.js`);
    definitions.push(module[exportName]);
  }

  assert.deepEqual(definitions.map(({ id }) => id), CHAPTER_IDS);
  for (const definition of definitions) {
    const expected = EXPECTED[definition.id];
    assert.deepEqual(definition.liveRender, {
      adapter: "GameRenderAdapter",
      source: "./render-game.html?sourceRoot=./assets/game-source",
      topology: definition.id,
      demos: expected.demos,
      canvas: "single-persistent",
      alpha: true,
      approved: true
    });
    assert.deepEqual(definition.identity, { light: expected.light, cameraPath: expected.camera });
    assert.deepEqual(definition.evidence, expected.evidence);
    assert.equal(definition.entryTransition.kind, "match-cut");
    assert.deepEqual(definition.exitOcclusion, { kind: "surface-occlusion", geometry: expected.exit });
    assert.equal(definition.morphMode, expected.morph);
    assert.equal(definition.surface.mapping, "TopologyMorph.surfacePoint");
    if (definition.id === "plane") {
      assert.deepEqual(definition.surface, {
        engine: "game-render-adapter",
        role: "identity-board",
        mapping: "TopologyMorph.surfacePoint"
      });
    } else {
      assert.equal(definition.surface.engine, "three");
      assert.deepEqual(definition.surface.subdivisions, [96, 72]);
      assert.deepEqual(definition.surface.effects, {
        antialias: "multisample",
        depthOfField: "restrained",
        motionBlur: "deterministic-subframe",
        volumetricLight: "low-density",
        particles: 48
      });
      assert.equal(definition.surface.role, "photographic-shadow-only");
    }
  }

  assert.equal(new Set(definitions.map(({ identity }) => identity.cameraPath)).size, 7, "camera paths must not collapse into one generic move");
  assert.equal(new Set(definitions.map(({ identity }) => identity.light)).size, 7, "every realm needs an exact, distinguishable PV light token");
  assert.equal(EXPECTED.cylinder.light, "#3f8c87");
  assert.equal(EXPECTED.torus.light, "#385f78");
});

test("the master mounts seven centered, uncropped, frameless persistent game canvases without microcopy", async () => {
  await page.evaluate(() => window.__renderReady);
  const snapshots = await page.evaluate(() => Object.values(window.__pvChapterControllers ?? {}).map((controller) => {
    const scene = controller.scene;
    const root = document.querySelector('[data-composition-id="footsteps-return"]');
    const frame = scene.querySelector("iframe[data-chapter-game-render]");
    const board = scene.querySelector("[data-chapter-board]");
    const sceneBounds = root.getBoundingClientRect();
    const boardBounds = board.getBoundingClientRect();
    const frameStyle = getComputedStyle(frame);
    const boardStyle = getComputedStyle(board);
    const gameFrame = frame.contentDocument.querySelector("#game-render-frame");
    const innerStage = gameFrame?.contentDocument.querySelector("#boardStage")?.getBoundingClientRect();
    const surfaceCanvas = scene.querySelector("canvas[data-chapter-surface-canvas]");
    return {
      id: controller.definition.id,
      iframeCount: scene.querySelectorAll("iframe[data-chapter-game-render]").length,
      canvasCount: gameFrame?.contentDocument.querySelectorAll("#boardCanvas").length ?? 0,
      instanceId: controller.instanceId,
      text: scene.innerText.trim(),
      centered: {
        x: Math.abs((boardBounds.left + boardBounds.width / 2) - (sceneBounds.left + sceneBounds.width / 2)),
        y: Math.abs((boardBounds.top + boardBounds.height / 2) - (sceneBounds.top + sceneBounds.height / 2))
      },
      contained: boardBounds.left >= sceneBounds.left && boardBounds.top >= sceneBounds.top
        && boardBounds.right <= sceneBounds.right && boardBounds.bottom <= sceneBounds.bottom,
      frameStyle: {
        border: frameStyle.borderWidth,
        radius: frameStyle.borderRadius,
        shadow: frameStyle.boxShadow,
        background: frameStyle.backgroundColor
      },
      boardOverflow: boardStyle.overflow,
      innerStage: innerStage ? { width: innerStage.width, height: innerStage.height } : null,
      surfaceBacking: surfaceCanvas ? { width: surfaceCanvas.width, height: surfaceCanvas.height } : null,
      deviceShells: scene.querySelectorAll(".phone,.tablet,.device-frame,[data-device-frame]").length
    };
  }));

  assert.equal(snapshots.length, 7);
  snapshots.forEach((snapshot) => {
    assert.equal(snapshot.iframeCount, 1, `${snapshot.id} must own one persistent iframe`);
    assert.equal(snapshot.canvasCount, 1, `${snapshot.id} must show the real game canvas`);
    assert.ok(snapshot.instanceId, `${snapshot.id} needs one live adapter instance`);
    assert.equal(snapshot.text, "", `${snapshot.id} cannot add explanatory microcopy`);
    assert.ok(snapshot.centered.x <= 2 && snapshot.centered.y <= 2, `${snapshot.id} board must stay centered`);
    assert.equal(snapshot.contained, true, `${snapshot.id} board cannot be cropped by the 4K stage`);
    assert.deepEqual(snapshot.frameStyle, { border: "0px", radius: "0px", shadow: "none", background: "rgba(0, 0, 0, 0)" });
    assert.equal(snapshot.boardOverflow, "visible");
    assert.deepEqual(snapshot.innerStage, { width: 640, height: 640 });
    assert.deepEqual(snapshot.surfaceBacking, snapshot.id === "plane" ? null : { width: 3840, height: 2160 }, `${snapshot.id} photographic surface must use a true 4K backing store`);
    assert.equal(snapshot.deviceShells, 0);
  });
});

test("real Chromium renders all eight helper paths through 1..5, every crossing breath, final five, morph, hold, and rotation", async () => {
  await page.evaluate(() => window.__renderReady);
  const results = await page.evaluate(async () => {
    const output = {};
    for (const [chapterId, controller] of Object.entries(window.__pvChapterControllers)) {
      const instanceBefore = controller.instanceId;
      const rendered = [];
      for (const sample of controller.samples) {
        const snapshot = await controller.renderProgress(sample.progress);
        rendered.push({ sample, snapshot });
      }
      output[chapterId] = {
        rendered,
        instanceBefore,
        instanceAfter: controller.instanceId,
        iframeCount: controller.scene.querySelectorAll("iframe[data-chapter-game-render]").length
      };
    }
    return output;
  });

  assert.deepEqual(Object.keys(results), CHAPTER_IDS);
  for (const [chapterId, result] of Object.entries(results)) {
    const expected = EXPECTED[chapterId];
    assert.equal(result.iframeCount, 1);
    assert.equal(result.instanceAfter, result.instanceBefore, `${chapterId} must never reload its iframe while seeking`);
    for (const demoId of expected.demos) {
      const demo = result.rendered.filter(({ sample }) => sample.demo === demoId);
      assert.deepEqual(demo.filter(({ sample }) => sample.phase === "drop").map(({ sample }) => sample.step), [1, 2, 3, 4, 5], `${chapterId}/${demoId} drops`);
      assert.deepEqual(demo.filter(({ sample }) => sample.phase === "drop").map(({ snapshot }) => snapshot.lessonStep), [1, 2, 3, 4, 5], `${chapterId}/${demoId} live lesson steps`);
      const crossingSteps = demo.filter(({ sample }) => sample.phase === "breathe").map(({ sample }) => sample.step);
      assert.deepEqual(crossingSteps, demo[0].sample.crossings, `${chapterId}/${demoId} breathes before every crossing`);
      demo.filter(({ sample }) => sample.phase === "breathe").forEach(({ snapshot, sample }) => {
        assert.ok(snapshot.breathPhase > 0 && snapshot.lessonStrokeCalls > 0, `${chapterId}/${demoId} crossing ${sample.step} needs a visible helper breath`);
      });
      const win = demo.find(({ sample }) => sample.phase === "win-hold");
      assert.equal(win.snapshot.state.winningFive, true, `${chapterId}/${demoId} must hold the representative five`);
      if (chapterId !== "plane") assert.equal(win.snapshot.completion, true, `${chapterId}/${demoId} must enter the native completion view`);
      const sortedPoints = (points) => points.map((point) => point.join(",")).sort();
      assert.deepEqual(sortedPoints(win.snapshot.winningPoints), sortedPoints(win.snapshot.lessonPoints), `${chapterId}/${demoId} winner must remain the real helper path`);
      demo.forEach(({ snapshot }) => assert.equal(snapshot.visiblePromptCalls, 0, `${chapterId}/${demoId} may not render helper text`));
    }

    const finalDemo = expected.demos.at(-1);
    const final = result.rendered.filter(({ sample }) => sample.demo === finalDemo);
    const morph = final.filter(({ sample }) => sample.phase === "morph");
    assert.ok(morph[0].snapshot.morphProgress < 0.01, `${chapterId} morph must hand off continuously from zero`);
    assert.ok(morph.at(-1).snapshot.morphProgress > 0.99, `${chapterId} morph must reach its formed state`);
    assert.equal(final.some(({ sample }) => sample.phase === "settled"), true, `${chapterId} needs a formed hold`);
    assert.equal(final.some(({ sample }) => sample.phase === "rotation"), true, `${chapterId} needs a finite rotation beat`);
    const postWin = final.filter(({ sample }) => ["win-hold", "morph", "settled", "rotation"].includes(sample.phase));
    postWin.forEach(({ snapshot }) => assert.equal(snapshot.state.winningFive, true, `${chapterId} must keep the five through the morph handoff`));
    if (chapterId === "plane") morph.forEach(({ snapshot }) => assert.equal(snapshot.surfaceProgress, 0, "plane morph is identity; only the camera may lift"));
    else assert.ok(morph.at(-1).snapshot.surfaceProgress > 0.99, `${chapterId} native surface must form with the real app morph`);
  }

  const kleinMemory = results.klein.rendered.filter(({ sample }) => sample.phase === "paired-memory");
  assert.deepEqual(kleinMemory.map(({ sample }) => sample.memoryProgress), [0, 0.5, 1], "Klein needs an explicit settled-memory-clear state between paths");
  kleinMemory.forEach(({ snapshot, sample }) => {
    assert.equal(snapshot.state.phase, "paired-memory");
    assert.equal(snapshot.state.memoryProgress, sample.memoryProgress);
    assert.deepEqual(snapshot.state.memoryDemos, ["preserved-crossing", "reflected-crossing"]);
  });
});

test("real Canvas stays continuous from fifth stone through morph zero and changes smoothly afterward", async () => {
  await page.evaluate(() => window.__renderReady);
  const observations = await page.evaluate(async () => {
    const { chapterFrameAt } = await import("./src/runtime/topology-surfaces.js");
    const ids = ["cylinder", "torus", "mobius", "klein", "projective", "sphere"];
    const pixels = (controller) => {
      const canvas = controller.adapter.frame.contentDocument.querySelector("#boardCanvas");
      return canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data.slice();
    };
    const difference = (from, to, threshold = 8) => {
      let changed = 0;
      let totalDelta = 0;
      for (let index = 0; index < from.length; index += 4) {
        const delta = Math.max(
          Math.abs(from[index] - to[index]),
          Math.abs(from[index + 1] - to[index + 1]),
          Math.abs(from[index + 2] - to[index + 2]),
          Math.abs(from[index + 3] - to[index + 3])
        );
        if (delta > 8) changed += 1;
        totalDelta += delta;
      }
      const count = from.length / 4;
      return { changedRatio: changed / count, meanDelta: totalDelta / count / 255 };
    };
    const transition = (controller, fromPhase, toPhase, minimum = 0) => {
      let previousProgress = minimum;
      let previous = chapterFrameAt(controller.definition, minimum);
      for (let index = Math.ceil(minimum * 100000) + 1; index <= 100000; index += 1) {
        const progress = index / 100000;
        const frame = chapterFrameAt(controller.definition, progress);
        if (previous.phase === fromPhase && frame.phase === toPhase) {
          let low = previousProgress;
          let high = progress;
          for (let pass = 0; pass < 42; pass += 1) {
            const middle = (low + high) / 2;
            if (chapterFrameAt(controller.definition, middle).phase === fromPhase) low = middle;
            else high = middle;
          }
          return { low, high };
        }
        previousProgress = progress;
        previous = frame;
      }
      throw new Error(`missing ${fromPhase} -> ${toPhase} transition for ${controller.definition.id}`);
    };
    const captureAt = async (controller, progress) => {
      const frame = await controller.renderProgress(progress);
      return { frame, pixels: pixels(controller) };
    };
    const output = {};
    for (const id of ids) {
      const controller = window.__pvChapterControllers[id];
      const minimum = id === "klein" ? 0.5 : 0;
      const dropHold = transition(controller, "drop", "win-hold", minimum);
      const holdMorph = transition(controller, "win-hold", "morph", minimum);
      const morphSettled = transition(controller, "morph", "settled", minimum);
      const frameDelta = 1 / (Math.max(1, controller.sceneDuration - 1.18) * 60);
      const drop = await captureAt(controller, dropHold.low);
      const hold = await captureAt(controller, dropHold.high);
      const holdEnd = await captureAt(controller, holdMorph.low);
      const morphZero = await captureAt(controller, holdMorph.high);
      const morphFirst = await captureAt(controller, Math.min(morphSettled.low, holdMorph.high + frameDelta));
      const morphSpan = morphSettled.low - holdMorph.high;
      const adjacentMorphPair = async (fraction) => {
        const checkpoint = holdMorph.high + morphSpan * fraction;
        return [await captureAt(controller, checkpoint), await captureAt(controller, Math.min(morphSettled.low, checkpoint + frameDelta))];
      };
      const morphPairs = [];
      for (const fraction of [0.25, 0.5, 0.75, 0.9]) morphPairs.push(await adjacentMorphPair(fraction));
      output[id] = {
        dropToHold: difference(drop.pixels, hold.pixels),
        holdToMorphZero: difference(holdEnd.pixels, morphZero.pixels),
        morphZeroToFirst: difference(morphZero.pixels, morphFirst.pixels),
        morphSteps: morphPairs.map(([from, to]) => difference(from.pixels, to.pixels)),
        morphProgress: [morphZero.frame.morphProgress, morphFirst.frame.morphProgress],
        handoffProgress: [morphZero.frame.handoffProgress, morphFirst.frame.handoffProgress]
      };
    }
    return output;
  });

  for (const [id, observation] of Object.entries(observations)) {
    assert.ok(observation.dropToHold.changedRatio < 0.035, `${id} fifth stone -> hold changed ${(observation.dropToHold.changedRatio * 100).toFixed(2)}% pixels`);
    assert.ok(observation.holdToMorphZero.changedRatio < 0.01, `${id} hold -> morph zero changed ${(observation.holdToMorphZero.changedRatio * 100).toFixed(2)}% pixels`);
    assert.ok(observation.morphZeroToFirst.changedRatio > 0, `${id} first non-zero morph frame must begin changing pixels`);
    assert.ok(observation.morphZeroToFirst.changedRatio < 0.08, `${id} first morph frame changed ${(observation.morphZeroToFirst.changedRatio * 100).toFixed(2)}% pixels`);
    assert.equal(observation.morphProgress[0] < 1e-8, true, `${id} handoff must begin at morph zero`);
    assert.ok(observation.morphProgress[1] > 0, `${id} following frame must advance morph`);
    assert.equal(observation.handoffProgress[0] < 1e-8, true, `${id} completion renderer must start at zero blend`);
    assert.ok(observation.handoffProgress[1] > 0, `${id} completion renderer must blend in deterministically`);
    observation.morphSteps.forEach((step, index) => {
      assert.ok(step.changedRatio > 0, `${id} adjacent morph checkpoint ${index + 1} must keep changing`);
    });
  }
});

test("Klein preserved five fades through paired memory before reflected establish without a pixel jump", async () => {
  await page.evaluate(() => window.__renderReady);
  const observation = await page.evaluate(async () => {
    const { chapterFrameAt } = await import("./src/runtime/topology-surfaces.js");
    const controller = window.__pvChapterControllers.klein;
    const canvas = controller.adapter.frame.contentDocument.querySelector("#boardCanvas");
    const pixels = () => canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data.slice();
    const difference = (from, to, threshold = 8) => {
      let changed = 0;
      for (let index = 0; index < from.length; index += 4) {
        if (Math.max(
          Math.abs(from[index] - to[index]), Math.abs(from[index + 1] - to[index + 1]),
          Math.abs(from[index + 2] - to[index + 2]), Math.abs(from[index + 3] - to[index + 3])
        ) > threshold) changed += 1;
      }
      return changed / (from.length / 4);
    };
    const boundaries = [];
    let previous = chapterFrameAt(controller.definition, 0);
    let previousProgress = 0;
    for (let index = 1; index <= 100000; index += 1) {
      const progress = index / 100000;
      const frame = chapterFrameAt(controller.definition, progress);
      if (previous.phase !== frame.phase && (previous.phase === "win-hold" || frame.phase === "establish" || previous.phase === "paired-memory" || frame.phase === "paired-memory")) {
        boundaries.push({ from: previous.phase, to: frame.phase, low: previousProgress, high: progress });
      }
      previous = frame;
      previousProgress = progress;
    }
    const first = boundaries.find((item) => item.from === "win-hold" && item.to === "paired-memory");
    const second = boundaries.find((item) => item.from === "paired-memory" && item.to === "establish");
    if (!first || !second) return { phases: boundaries.map(({ from, to }) => `${from}->${to}`) };
    const frameDelta = 1 / (Math.max(1, controller.sceneDuration - 1.18) * 60);
    const render = async (progress) => { const state = await controller.renderProgress(progress); return { state, data: pixels() }; };
    const beforeFirst = await render(first.low);
    const afterFirst = await render(first.high);
    const afterFirstFrame = await render(Math.min(second.low, first.high + frameDelta));
    const beforeSecond = await render(second.low);
    const afterSecond = await render(second.high);
    return {
      phases: boundaries.map(({ from, to }) => `${from}->${to}`),
      firstBoundary: difference(beforeFirst.data, afterFirst.data),
      firstFrame: difference(afterFirst.data, afterFirstFrame.data),
      firstFrameAny: difference(afterFirst.data, afterFirstFrame.data, 0),
      secondBoundary: difference(beforeSecond.data, afterSecond.data),
      memoryProgress: [afterFirst.state.state.memoryProgress, afterFirstFrame.state.state.memoryProgress, beforeSecond.state.state.memoryProgress]
    };
  });

  assert.deepEqual(observation.phases.filter((phase) => phase.includes("paired-memory")), ["win-hold->paired-memory", "paired-memory->establish"]);
  assert.ok(observation.firstBoundary < 0.035, `Klein memory entrance changed ${(observation.firstBoundary * 100).toFixed(2)}% pixels`);
  assert.ok(observation.firstFrameAny > 0, "Klein paired memory must start fading on its first non-zero frame");
  assert.ok(observation.firstFrame < 0.08, `Klein first memory frame changed ${(observation.firstFrame * 100).toFixed(2)}% pixels`);
  assert.ok(observation.secondBoundary < 0.035, `Klein reflected establish changed ${(observation.secondBoundary * 100).toFixed(2)}% pixels`);
  assert.ok(observation.memoryProgress[0] < 0.001 && observation.memoryProgress[1] > 0 && observation.memoryProgress[2] > 0.999);
});

test("chapter seeking is reversible on the same iframe and every exit exposes a geometry-occlusion handoff", async () => {
  await page.evaluate(() => window.__renderReady);
  const observations = await page.evaluate(async () => {
    const result = [];
    for (const controller of Object.values(window.__pvChapterControllers)) {
      const instanceId = controller.instanceId;
      const finish = await controller.renderProgress(1);
      const rewind = await controller.renderProgress(0);
      const replay = await controller.renderProgress(1);
      const timeline = window.__timelines["footsteps-return"];
      timeline.time(controller.sceneStart + controller.sceneDuration, false).pause();
      const occluder = controller.scene.querySelector("[data-chapter-exit-occlusion]");
      result.push({
        id: controller.definition.id,
        instanceIds: [instanceId, controller.instanceId],
        finish: { phase: finish.phase, lessonStep: finish.lessonStep },
        rewind: { phase: rewind.phase, lessonStep: rewind.lessonStep },
        replay: { phase: replay.phase, lessonStep: replay.lessonStep },
        timelinePhase: controller.scene.dataset.chapterPhase,
        timelineLessonStep: controller.adapter.renderReady().status.lessonStep,
        occlusion: Number(getComputedStyle(occluder).opacity),
        geometry: occluder.dataset.occlusionGeometry
      });
    }
    return result;
  });

  observations.forEach((observation) => {
    assert.equal(observation.instanceIds[1], observation.instanceIds[0], `${observation.id} rewind must reuse the same iframe`);
    assert.deepEqual(observation.finish, { phase: "rotation", lessonStep: 5 });
    assert.deepEqual(observation.rewind, { phase: "establish", lessonStep: 0 });
    assert.deepEqual(observation.replay, { phase: "rotation", lessonStep: 5 });
    assert.equal(observation.timelinePhase, "rotation", `${observation.id} GSAP seek must drive the chapter controller to its terminal phase`);
    assert.equal(observation.timelineLessonStep, 5, `${observation.id} GSAP seek must preserve all five stones`);
    assert.ok(observation.occlusion > 0.98, `${observation.id} must finish behind geometry or shadow`);
    assert.equal(observation.geometry, EXPECTED[observation.id].exit);
  });
});

test("chapter QA manifest names every crossing proof and morph hero with committed non-empty PNGs", async () => {
  const { chapterCapturePlan } = await import("../video/footsteps-return/scripts/capture-chapter-evidence.mjs");
  const evidence = chapterCapturePlan.filter(({ kind }) => kind === "evidence");
  const heroes = chapterCapturePlan.filter(({ kind }) => kind === "hero");
  assert.deepEqual(evidence.map(({ id, demo, crossingIndex }) => [id, demo, crossingIndex]), [
    ["plane", "ordinary-five", null],
    ["cylinder", "horizontal-wrap", 0],
    ["torus", "two-seam-diagonal", 0],
    ["torus", "two-seam-diagonal", 1],
    ["mobius", "reflected-crossing", 0],
    ["klein", "preserved-crossing", 0],
    ["klein", "reflected-crossing", 1],
    ["projective", "mirrored-crossings", 0],
    ["projective", "mirrored-crossings", 1],
    ["sphere", "adjacent-edge-turn", 0]
  ]);
  assert.deepEqual(heroes.map(({ id, demo, crossingIndex }) => [id, demo, crossingIndex]), [
    ["plane", "ordinary-five", null], ["cylinder", "horizontal-wrap", null],
    ["torus", "two-seam-diagonal", null], ["mobius", "reflected-crossing", null],
    ["klein", "reflected-crossing", null], ["projective", "mirrored-crossings", null],
    ["sphere", "adjacent-edge-turn", null]
  ]);
  assert.equal(new Set(chapterCapturePlan.map(({ path: artifactPath }) => artifactPath)).size, 17);
  chapterCapturePlan.forEach((item) => {
    assert.equal(typeof item.shot, "string");
    assert.ok(item.shot.length > 0);
    assert.equal(path.basename(item.path), item.filename);
    const absolutePath = path.join(ROOT, item.path);
    const png = fs.readFileSync(absolutePath);
    assert.ok(png.length > 10000, `${item.path} must be a non-empty evidence PNG`);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 1920, `${item.path} width`);
    assert.equal(png.readUInt32BE(20), 1080, `${item.path} height`);
  });
});

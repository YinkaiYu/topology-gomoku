"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
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
    light: "#3f8c87",
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
    evidence: { kind: "preserved-reflected-pair", pathActions: ["preserved", "reflected"], edgeAction: "mixed" },
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

test("chapter QA capture plan names one evidence and one hero frame per realm", async () => {
  const { chapterCapturePlan } = await import("../video/footsteps-return/scripts/capture-chapter-evidence.mjs");
  assert.deepEqual(chapterCapturePlan.map(({ id, kind }) => [id, kind]), CHAPTER_IDS.flatMap((id) => [[id, "evidence"], [id, "hero"]]));
  assert.equal(new Set(chapterCapturePlan.map(({ filename }) => filename)).size, 14);
});

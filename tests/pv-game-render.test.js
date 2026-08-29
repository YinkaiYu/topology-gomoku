"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Game = require("../app/assets/topology.js");

const ROOT = path.resolve(__dirname, "..");
const imp = (file) => import(new URL(`../${file}`, `file://${__filename}`).href);

test("七章实时渲染镜头复用真实拓扑路径", async () => {
  const { gameRenderShots, findGameRenderShot } = await imp("video/footsteps-return/src/data/game-render-shots.js");
  assert.deepEqual(gameRenderShots.map(({ id }) => id), ["plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"]);
  for (const shot of gameRenderShots) {
    for (const demo of shot.demos) {
      const rules = Game.createRules({ type: shot.topology, width: shot.board.width, height: shot.board.height, target: 5 });
      const traced = Game.tracePath(rules, Game.toCell(rules, ...demo.start), demo.direction, 5);
      assert.deepEqual(traced.cells.map((cell) => { const p = Game.toPoint(rules, cell); return [p.x, p.y]; }), demo.points, `${shot.id}/${demo.id}`);
      assert.deepEqual(traced.seams, demo.seams, `${shot.id}/${demo.id} seam states`);
      assert.deepEqual(demo.crossings, traced.seams.map((seam, index) => seam ? index + 2 : null).filter(Boolean), `${shot.id}/${demo.id} crossings`);
    }
  }
  assert.deepEqual(gameRenderShots.flatMap((shot) => shot.demos.map((demo) => [shot.id, demo.id, demo.sourcePathIndex])), [
    ["plane", "ordinary-five", 0], ["cylinder", "horizontal-wrap", 0], ["torus", "two-seam-diagonal", 1],
    ["mobius", "reflected-crossing", 0], ["klein", "preserved-crossing", 0], ["klein", "reflected-crossing", 1],
    ["projective", "mirrored-crossings", 1], ["sphere", "adjacent-edge-turn", 0]
  ]);
  assert.throws(() => findGameRenderShot("torus", "missing-demo"), /Unknown demo/);
});

test("每条 helper 演示完整覆盖落子 1..5、所有跨界和最终五连", async () => {
  const { gameRenderShots } = await imp("video/footsteps-return/src/data/game-render-shots.js");
  for (const shot of gameRenderShots) for (const demo of shot.demos) {
    assert.deepEqual(demo.sequence.filter((x) => x.kind === "drop").map((x) => x.step), [1, 2, 3, 4, 5], `${shot.id}/${demo.id} drops`);
    assert.deepEqual(demo.sequence.filter((x) => x.kind === "breathe").map((x) => x.beforeStep), demo.crossings, `${shot.id}/${demo.id} crossings shown`);
    assert.deepEqual(demo.sequence.at(-1), { kind: "hold", step: 5, winningFive: true }, `${shot.id}/${demo.id} final five`);
  }
});

test("render(state) 契约显式、可归一化且不含自动播放", async () => {
  const { RENDER_API_METHODS, normalizeRenderState } = await imp("video/footsteps-return/src/game-render/adapter.js");
  assert.deepEqual(RENDER_API_METHODS, ["selectShot", "render", "renderReady"]);
  const state = normalizeRenderState({ topology: "cylinder", shot: "helper", demo: "horizontal-wrap", lessonStep: 3, dropProgress: .5, breathPhase: .25, morphProgress: .5, rotation: { x: .1, y: .2, z: 0 }, freezeRotation: true });
  assert.deepEqual(normalizeRenderState(state), state);
  assert.equal(Object.hasOwn(state, "autoPlay"), false);
});

test("单调章节时间线保持第五颗→胜利→形变→旋转的连续交接", async () => {
  const { gameRenderShots } = await imp("video/footsteps-return/src/data/game-render-shots.js");
  const { chapterStateAt } = await imp("video/footsteps-return/src/game-render/adapter.js");
  for (const definition of gameRenderShots) for (const demo of definition.demos) {
    const samples = Array.from({ length: 20001 }, (_, index) => chapterStateAt(definition, demo, index / 20000));
    const first = (phase) => samples.find((state) => state.phase === phase);
    const last = (phase) => samples.findLast((state) => state.phase === phase);
    assert.equal(last("drop").pendingStep, 5, `${definition.id}/${demo.id} final drop`);
    assert.equal(first("win-hold").lessonStep, 5, `${definition.id}/${demo.id} win keeps five`);
    assert.equal(first("morph").winningFive, true, `${definition.id}/${demo.id} morph keeps win`);
    assert.ok(first("morph").morphProgress < .001, `${definition.id}/${demo.id} morph starts flat`);
    assert.ok(last("morph").morphProgress > .999, `${definition.id}/${demo.id} morph ends formed`);
    assert.ok(Object.values(first("rotation").rotation).every((value) => Math.abs(value) < .001), `${definition.id}/${demo.id} rotation starts still`);
  }
  assert.equal(gameRenderShots[0].morphMode, "identity");
  gameRenderShots.slice(1).forEach((shot) => assert.equal(shot.morphMode, "native"));
});

test("适配器契约要求可逆重建、单次刷新、字体就绪与静态 iframe", async () => {
  const adapter = fs.readFileSync(path.join(ROOT, "video/footsteps-return/src/game-render/adapter.js"), "utf8");
  assert.match(adapter, /rebuild:function/);
  assert.doesNotMatch(adapter, /lastStep|\.flush\(/);
  assert.match(adapter, /document\.fonts\.ready/);
  assert.match(adapter, /animation:none!important;transition:none!important/);
  assert.match(adapter, /sourcePathIndex/);
  const hook = fs.readFileSync(path.join(ROOT, "video/footsteps-return/src/game-render/hook.js"), "utf8");
  assert.match(hook, /queueSize/);
  assert.doesNotMatch(hook, /callbacks\.forEach/);
});

test("PV 页面声明透明承载层并挂载实时适配器", () => {
  const html = fs.readFileSync(path.join(ROOT, "video/footsteps-return/render-game.html"), "utf8");
  assert.match(html, /background:\s*transparent/);
  assert.match(html, /game-render-frame/);
  assert.match(html, /game-render\/adapter\.js/);
});

test("PV hook 精确覆盖所有原生教学 prompt，而非吞掉全部 Canvas 文字", () => {
  const game = fs.readFileSync(path.join(ROOT, "app/assets/game.js"), "utf8");
  const hook = fs.readFileSync(path.join(ROOT, "video/footsteps-return/src/game-render/hook.js"), "utf8");
  const promptArrays = [...game.matchAll(/(?:TUTORIAL_PROMPTS\s*=|prompts:)\s*\[([\s\S]*?)\]/g)].map((match) => match[1]);
  const prompts = promptArrays.flatMap((source) => [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  assert.ok(prompts.length > 30);
  assert.deepEqual(prompts.filter((prompt) => !hook.includes(JSON.stringify(prompt))), []);
  assert.match(hook, /control\.mode === "helper" && prompts\.has\(String\(text\)\)/);
});

test("实时渲染静态服务器拒绝逃逸仓库根目录", async (t) => {
  const { startStaticServer } = await imp("video/footsteps-return/scripts/serve-app.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pv-render-server-"));
  fs.writeFileSync(path.join(root, "index.html"), "render-ok");
  const server = await startStaticServer({ root });
  t.after(async () => { await server.close(); fs.rmSync(root, { recursive: true, force: true }); });
  assert.equal(await (await fetch(`${server.url}/`)).text(), "render-ok");
  assert.equal((await fetch(`${server.url}/..%2fpackage.json`)).status, 403);
});

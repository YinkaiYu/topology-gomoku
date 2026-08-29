"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

async function load(relativePath) {
  return import(new URL(`../${relativePath}`, `file://${__filename}`).href);
}

const expectedTitles = [
  ["ACT. PROLOGUE", "方庭", "平面"],
  ["ACT. I", "回廊", "圆柱面"],
  ["ACT. II", "环游", "环面"],
  ["ACT. III", "扭带", "莫比乌斯环"],
  ["ACT. IV", "瓶界", "克莱因瓶"],
  ["ACT. V", "双生", "实射影平面"],
  ["ACT. VI", "归圆", "球面"]
];

const approvedNarration = [
  "人们总把棋盘的边缘视作尽头。",
  "可那些消失在边界上的道路并未中断。它们在另一处接缝后延续，将遥远的落点重新变为近邻。",
  "现在，落子之人啊，循着隐藏的连接前行吧。七种世界，将在你面前依次展开。",
  "边界分明，方向笔直，胜负都在眼前。方庭以有限的秩序收容第一条五连，也由此埋下对所有边界的疑问。",
  "左右相接，上下仍被截断。横向的路绕过世界回到身后，纵向的路却有始有终。",
  "只拥有一重循环的世界，该如何丈量远近？",
  "四边相接，两个方向各自成环。一条斜线可以先越过上边，再从左侧归来。",
  "两重循环交织之处，最短的道路往往藏在视野之外。",
  "左右边界相接，却带着一次翻转。沿同一面环行一周，归来时上下已经交换。",
  "只有一面的世界，正反又该如何分辨？",
  "一组边界如圆环般相接，另一组边界让方向翻转。两种归来共处一界：一条路保持原样，一条路带回倒影。",
  "路径会记住你选择的环绕。",
  "上下左右，全都通向各自的倒影。一次越界改变方向，两次倒映使棋路重新吻合。",
  "在双生的世界里，每次远行，都会遇见另一个自己。",
  "在最后的世界，棋路离开一条边，便会沿相邻的方向继续。四条边依次归向彼此，方形的棋盘也随之闭合成球。",
  "人们为了看清完整的世界，将它展开成一张有边的图。",
  "所谓边界，或许只是观察世界时留下的痕迹。",
  "现在，落子之人。",
  "七种世界已经显现，但最后的连接，仍等待你亲手完成。",
  "若你已经理解边界的意义，就落下那颗棋子。",
  "然后，去看见世界本来的样子吧。"
];

test("PV manifest orders one intro, seven chapters, a gallery, and an end card", async () => {
  const [{ chapters }, { masterTimeline }] = await Promise.all([
    load("video/footsteps-return/src/data/chapters.js"),
    load("video/footsteps-return/src/data/timeline.js")
  ]);

  assert.deepEqual(chapters.map(({ id }) => id), [
    "plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"
  ]);
  assert.deepEqual(chapters.map(({ title }) => [title.act, title.chapter, title.topology]), expectedTitles);
  assert.equal(masterTimeline.scenes.filter(({ kind }) => kind === "intro").length, 1);
  assert.equal(masterTimeline.scenes.filter(({ kind }) => kind === "chapter").length, 7);
  assert.equal(masterTimeline.scenes.filter(({ kind }) => kind === "seven-world-gallery").length, 1);
  assert.equal(masterTimeline.scenes.filter(({ kind }) => kind === "end-card").length, 1);
});

test("PV narration preserves approved copy and keeps visible punctuation as metadata", async () => {
  const { narrationCues } = await load("video/footsteps-return/src/data/narration.js");
  assert.deepEqual(narrationCues.map(({ spokenText }) => spokenText), approvedNarration);

  narrationCues.forEach((cue) => {
    assert.match(cue.id, /^[a-z]+(?:-[a-z0-9]+)*$/);
    assert.equal(cue.speakerRole, "narrator");
    assert.equal(typeof cue.semanticGroup, "string");
    assert.ok(cue.estimatedDuration > 0);
    assert.equal(typeof cue.subtitle.visibleText, "string");
    assert.equal(typeof cue.subtitle.terminalPunctuation, "string");
    assert.equal(cue.subtitle.visibleText.endsWith(cue.subtitle.terminalPunctuation), false);
  });
  assert.equal(narrationCues.some(({ spokenText }) => /ACT\. (?:PROLOGUE|[IVX]+)/.test(spokenText)), false);
});

test("PV timeline is editable duration data with non-overlapping subtitle groups", async () => {
  const { masterTimeline } = await load("video/footsteps-return/src/data/timeline.js");
  masterTimeline.scenes.forEach((scene) => {
    assert.ok(scene.duration >= 0, `${scene.id} needs a non-negative duration`);
    assert.equal(typeof scene.transition, "object", `${scene.id} needs a transition contract`);
    if (scene.kind === "chapter-card") {
      assert.deepEqual(scene.narrationCueIds, []);
    }
  });
  assert.match(JSON.stringify(masterTimeline), /"duration"/);
  assert.equal(JSON.stringify(masterTimeline).includes("cssDelay"), false);
});

test("PV validator rejects invalid asset paths and timeline audio collisions", async () => {
  const { assets } = await load("video/footsteps-return/src/data/assets.js");
  const validator = await load("video/footsteps-return/scripts/validate-manifest.mjs");
  assert.doesNotThrow(() => validator.validateManifest({ root: ROOT }));
  assert.doesNotThrow(() => validator.validateAssets(assets, ROOT));
  assert.throws(() => validator.validateAssets([{ id: "drive", path: "C:\\outside.svg" }], ROOT), /repository-relative/);
  assert.throws(() => validator.validateAssets([{ id: "url", path: "https://example.test/a.svg" }], ROOT), /repository-relative/);
  assert.throws(() => validator.validateAssets([{ id: "missing", path: "app/assets/topologies/nope.svg" }], ROOT), /missing/);
  assert.throws(() => validator.validateAssets([{ id: "output", path: "video/footsteps-return/renders/final.mp4" }], ROOT), /generated-output/);
  assert.throws(() => validator.validateAssets([{ id: "remote", path: "app/assets/topologies/plane.svg", sourceUrl: "https://example.test/source" }], ROOT), /provenance/);
  assert.throws(() => validator.validateTimeline({ duration: 10, narration: [{ cueId: "a", start: 0, duration: 6, subtitleGroupId: "one" }, { cueId: "b", start: 5, duration: 2, subtitleGroupId: "two" }], audio: [] }), /overlap/);
  assert.throws(() => validator.validateTimeline({ duration: 5, narration: [{ cueId: "a", start: 0, duration: 6, subtitleGroupId: "one" }], audio: [] }), /shorter/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "chapter-teaser");
const story = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "story.json"), "utf8"));
const provenance = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "provenance.json"), "utf8"));
const Engine = require(path.join(ROOT, "app", "assets", "topology.js"));

const EXPECTED_CHAPTERS = [
  ["plane", "ACT. PROLOGUE", "方庭", "平面"],
  ["cylinder", "ACT. I", "回廊", "圆柱面"],
  ["torus", "ACT. II", "环游", "环面"],
  ["mobius", "ACT. III", "扭带", "莫比乌斯环"],
  ["klein", "ACT. IV", "瓶界", "克莱因瓶"],
  ["projective", "ACT. V", "双生", "实射影平面"],
  ["sphere", "ACT. VI", "归圆", "球面"]
];

function allCues() {
  return [
    ...story.intro.cues,
    ...story.chapters.flatMap((chapter) => chapter.cues),
    ...story.finale.cues
  ];
}

test("章节预告规格固定为 4K60 母版、1080p 审阅版和 48kHz 音频", () => {
  assert.equal(story.render.fps, 60);
  assert.deepEqual(story.render.master, { width: 3840, height: 2160 });
  assert.deepEqual(story.render.review, { width: 1920, height: 1080 });
  assert.equal(story.render.sampleRate, 48000);
  assert.ok(story.render.titleTransformFrame > 0);
  assert.ok(story.render.titleTransformFrame < story.render.titleFrames);
});

test("七张章节牌的 ACT、关卡名和流形名一一对应", () => {
  assert.equal(story.chapters.length, 7);
  assert.deepEqual(
    story.chapters.map((chapter) => [chapter.id, chapter.act, chapter.chapter, chapter.manifold]),
    EXPECTED_CHAPTERS
  );
});

test("所有旁白字幕都是无句号的单行文本", () => {
  const cues = allCues();
  assert.ok(cues.length >= 40);
  cues.forEach((cue) => {
    assert.equal(typeof cue.text, "string");
    assert.ok(cue.text.length > 0);
    assert.doesNotMatch(cue.text, /[\r\n]/u);
    assert.doesNotMatch(cue.text, /[。.]/u);
  });
});

test("七章代表棋路全部由真实规则生成且包含五个不同落点", () => {
  story.chapters.forEach((chapter) => {
    const rules = Engine.createRules({
      type: chapter.id,
      width: chapter.width,
      height: chapter.height,
      target: 5
    });
    const start = Engine.toCell(rules, chapter.start[0], chapter.start[1]);
    const traced = Engine.tracePath(rules, start, chapter.direction, 5);
    assert.ok(traced, `${chapter.id}: representative path must exist`);
    assert.equal(traced.cells.length, 5, `${chapter.id}: path length`);
    assert.equal(new Set(traced.cells).size, 5, `${chapter.id}: unique cells`);
    if (chapter.id === "plane") {
      assert.equal(traced.seams.some(Boolean), false);
    } else {
      assert.equal(traced.seams.some(Boolean), true, `${chapter.id}: path must cross a seam`);
    }
  });
});

test("工程依赖保持为自有 Canvas 渲染器与浏览器检查工具", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const dependencies = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {})
  };
  assert.equal("hyperframes" in dependencies, false);
  assert.equal("remotion" in dependencies, false);
  assert.equal(fs.existsSync(path.join(ROOT, ".superpowers")), false);
});

test("片尾机构标识与来源清单中的确定性派生文件一致", () => {
  const logoPath = path.join(ROOT, provenance.institutionLogo.derivedPath);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(logoPath)).digest("hex");
  assert.equal(hash, provenance.institutionLogo.derivedSha256);
  assert.equal(provenance.institutionLogo.sourceSha256.length, 64);
});

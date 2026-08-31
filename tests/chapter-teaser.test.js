const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "chapter-teaser");
const story = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "story.json"), "utf8"));
const timing = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "narration-timing.json"), "utf8"));
const musicPlan = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "music-plan.json"), "utf8"));
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

test("新版正式旁白拆为 39 条单行字幕且标题不进入字幕", () => {
  const cues = allCues();
  assert.equal(cues.length, 39);
  assert.equal(timing.cues.length, 39);
  cues.forEach((cue) => {
    assert.equal(typeof cue.text, "string");
    assert.ok(cue.text.length > 0);
    assert.doesNotMatch(cue.text, /[\r\n]/u);
  });
  timing.cues.forEach((cue) => {
    assert.doesNotMatch(cue.captionText, /[。.\r\n]/u);
    assert.doesNotMatch(cue.captionText, /ACT\.|【|】/u);
  });
  assert.equal(timing.sources.script.sha256, "19779afaeef46168a5698a8f2aa8fd8e41372ac7960163927440dc8b8c4e391b");
  assert.equal(timing.sources.voice.sha256, "502e1b05792ed3d16eddc13d192f73c3c8622e0f10abe05559cdf9f16f8f54e2");
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
  const expectedShowcasePaths = {
    projective: {
      cells: [[5, 2], [4, 1], [3, 0], [5, 7], [6, 6]],
      seams: [0, 0, 6, 0]
    },
    sphere: {
      cells: [[4, 4], [5, 3], [6, 2], [1, 6], [0, 5]],
      seams: [0, 0, 2, 0]
    }
  };
  for (const [id, expected] of Object.entries(expectedShowcasePaths)) {
    const chapter = story.chapters.find((item) => item.id === id);
    const rules = Engine.createRules({ type: id, width: chapter.width, height: chapter.height, target: 5 });
    const trace = Engine.tracePath(
      rules,
      Engine.toCell(rules, chapter.start[0], chapter.start[1]),
      chapter.direction,
      5
    );
    assert.deepEqual(trace.cells.map((cell) => {
      const point = Engine.toPoint(rules, cell);
      return [point.x, point.y];
    }), expected.cells);
    assert.deepEqual(trace.seams, expected.seams);
    assert.equal(trace.seams.filter(Boolean).length, 1, `${id}: showcase path crosses exactly once`);
  }
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

test("片中机构标识、游戏标识与片尾制作人字段齐备", () => {
  const logoPath = path.join(ROOT, provenance.institutionLogo.derivedPath);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(logoPath)).digest("hex");
  assert.equal(hash, provenance.institutionLogo.derivedSha256);
  assert.equal(provenance.institutionLogo.sourceSha256.length, 64);
  assert.equal(fs.existsSync(path.join(ROOT, "app", "assets", "brand-icon.png")), true);
  assert.equal(story.endCard.gameTitle, "拓扑五子棋");
  assert.equal(story.endCard.producer, "制作：余荫铠");
  assert.equal(timing.visualSegments.some((segment) => segment.kind === "institution-logo"), true);
});

test("配乐计划以十一段古典与 HOYO-MiX 选曲构成且足迹只作为结构参考", () => {
  assert.equal(musicPlan.selectionAudit.selected, "elegant-classical-hoyo");
  assert.equal(musicPlan.sources.length, 11);
  assert.equal(musicPlan.clips.length, 11);
  assert.ok(musicPlan.selectionAudit.alternativesAudited.length >= 5);
  const chapterClips = musicPlan.clips.filter((clip) => clip.reveal);
  assert.equal(chapterClips.length, 7);
  assert.equal(new Set(chapterClips.map((clip) => clip.sourceId)).size, 7);
  assert.equal(new Set(chapterClips.map((clip) => clip.chapterRole)).size, 7);
  assert.equal(new Set(chapterClips.map((clip) => clip.reveal.stingerVariant)).size, 7);
  const hoyoSources = new Set(musicPlan.sources.filter((source) => source.composer === "HOYO-MiX").map((source) => source.id));
  assert.deepEqual(musicPlan.clips.filter((clip) => hoyoSources.has(clip.sourceId)).map((clip) => clip.id), ["cylinder", "sphere"]);
  assert.deepEqual(
    musicPlan.clips.filter((clip) => clip.id.startsWith("projective-")).map((clip) => clip.id),
    ["projective-recta", "projective-inversa"]
  );
  const finale = musicPlan.clips.at(-1);
  assert.ok(Math.abs(finale.sourceOutSeconds - finale.sourceInSeconds - 16.9) < 1e-9);
  assert.equal(musicPlan.sources.some((source) => source.sha256 === musicPlan.reference.sha256), false);
  assert.match(musicPlan.reference.role, /structural.*reference only/i);
  assert.ok(musicPlan.sources.every((source) => source.downloadUrl === null && source.cacheRequired === true));
  assert.ok(musicPlan.sources.every((source) => !("localSourcePath" in source)));
});

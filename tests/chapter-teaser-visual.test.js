const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");

const ROOT = path.resolve(__dirname, "..");
const PV_ROOT = path.join(ROOT, "video", "chapter-teaser");
const Compositor = require(path.join(PV_ROOT, "src", "compositor.js"));
const Engine = require(path.join(ROOT, "app", "assets", "topology.js"));
const Morph = require(path.join(ROOT, "app", "assets", "topology-morph.js"));
const Art = require(path.join(ROOT, "app", "assets", "topology-art.js"));
const story = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "story.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "manifest.json"), "utf8"));

for (const weight of [400, 600, 700]) {
  GlobalFonts.registerFromPath(path.join(PV_ROOT, "assets", "fonts", `topo-serif-pv-${weight}.ttf`), "Topo Serif PV");
}
GlobalFonts.registerFromPath(path.join(PV_ROOT, "assets", "fonts", "topo-sans-pv-600.ttf"), "Topo Sans PV");

let composition;
function getComposition() {
  if (!composition) {
    composition = Compositor.createComposition({ story, manifest, width: 320, height: 180, quality: 1.25 });
  }
  return composition;
}

function hashCanvas(canvas) {
  return crypto.createHash("sha256").update(canvas.data()).digest("hex");
}

test("visual compositor accepts the 4K60 master and 1080p review profiles", () => {
  Compositor.validateManifest(manifest, story);
  assert.deepEqual(story.render.master, { width: 3840, height: 2160 });
  assert.deepEqual(story.render.review, { width: 1920, height: 1080 });
  assert.equal(story.render.fps, 60);
  assert.equal(story.render.sampleRate, 48000);
  const master = Compositor.createComposition({ story, manifest, width: 3840, height: 2160, quality: 1 });
  assert.deepEqual([master.width, master.height, master.fps], [3840, 2160, 60]);
  assert.throws(
    () => Compositor.createComposition({ story, manifest, width: 1920, height: 1200 }),
    /exactly 16:9/
  );
});

test("every chapter card has exactly two centered rows and transforms ACT into the manifold name", () => {
  const teaser = getComposition();
  for (const chapter of story.chapters) {
    const card = manifest.segments.find((segment) => segment.kind === "chapter-card" && segment.chapterId === chapter.id);
    assert.ok(card, chapter.id);
    const before = teaser.describeFrame(card.transformFrame - 1);
    const after = teaser.describeFrame(card.transformFrame);
    assert.deepEqual(before.titleRows, [chapter.act, chapter.chapter]);
    assert.deepEqual(after.titleRows, [chapter.manifold, chapter.chapter]);
    assert.equal(before.titleRows.length, 2);
    assert.equal(after.titleRows.length, 2);
    assert.equal(before.subtitle, null);
    assert.equal(after.subtitle, null);
  }
});

test("subtitle lookup is single-cue, one-line, and suppressed on silent chapter cards", () => {
  const teaser = getComposition();
  for (const subtitle of manifest.subtitles) {
    const active = teaser.describeFrame(subtitle.startFrame).subtitle;
    assert.equal(active.id, subtitle.id);
    assert.doesNotMatch(active.text, /[\r\n]/u);
    assert.doesNotMatch(active.text, /[。.]/u);
  }
  const invalid = structuredClone(manifest);
  invalid.subtitles[1].startFrame = invalid.subtitles[0].startFrame;
  assert.throws(() => Compositor.validateManifest(invalid, story), /must not overlap/);
});

test("clean composition disables every burned subtitle without changing the timeline", () => {
  const clean = Compositor.createComposition({
    story,
    manifest,
    width: 320,
    height: 180,
    quality: 1.25,
    subtitlesEnabled: false
  });
  assert.equal(clean.totalFrames, manifest.totalFrames);
  assert.equal(clean.inspect().subtitlesEnabled, false);
  for (const subtitle of manifest.subtitles) assert.equal(clean.describeFrame(subtitle.startFrame).subtitle, null);
});

test("the narration silence is a dedicated institution-logo scene", () => {
  const logo = manifest.segments.find((segment) => segment.kind === "institution-logo");
  assert.ok(logo);
  assert.deepEqual([logo.startFrame, logo.endFrame], [1225, 1466]);
  assert.equal(getComposition().describeFrame(1330).kind, "institution-logo");
  assert.deepEqual(logo.narrationCueIds, []);

  const source = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  const logoSceneBody = source.slice(source.indexOf("function drawInstitutionLogo"), source.indexOf("function drawMiniature"));
  assert.match(logoSceneBody, /drawCircularLogo\(ctx, composition\.logos\.institution/);
  assert.doesNotMatch(logoSceneBody, /ctx\.arc|ctx\.stroke/);
});

test("all seven visual paths are the exact tracePath results and retain per-step seam data", () => {
  const teaser = getComposition();
  const inspected = teaser.inspect();
  assert.equal(inspected.chapters.length, 7);
  for (const chapter of story.chapters) {
    const rules = Engine.createRules({ type: chapter.id, width: chapter.width, height: chapter.height, target: 5 });
    const start = Engine.toCell(rules, chapter.start[0], chapter.start[1]);
    const expected = Engine.tracePath(rules, start, chapter.direction, 5);
    const actual = inspected.chapters.find((entry) => entry.id === chapter.id);
    assert.deepEqual(actual.cells, expected.cells);
    assert.deepEqual(actual.seams, expected.seams);
    assert.deepEqual(actual.directions, expected.directions);
    assert.equal(actual.usesSurface, true);
  }
});

test("the PV and live game share the same restrained canvas art source", () => {
  const teaser = getComposition();
  const inspected = teaser.inspect();
  assert.equal(inspected.artSource, "TopologyArt");
  assert.deepEqual(inspected.palette, Art.PALETTE);
  assert.deepEqual(
    {
      paper: inspected.palette.paper,
      paperDeep: inspected.palette.paperDeep,
      ink: inspected.palette.ink,
      connection: inspected.palette.connection,
      twist: inspected.palette.twist,
      danger: inspected.palette.danger
    },
    {
      paper: "#f2efe7",
      paperDeep: "#e8e2d7",
      ink: "#21302c",
      connection: "#3f8c87",
      twist: "#c79244",
      danger: "#d95b4f"
    }
  );
  const app = fs.readFileSync(path.join(ROOT, "app", "assets", "game.js"), "utf8");
  const compositorSource = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  assert.match(app, /Art\.drawGrid/);
  assert.match(app, /Art\.drawStoneFace/);
  assert.match(app, /Art\.drawTopologyRails/);
  assert.match(app, /Art\.drawCompletionSurface/);
  assert.match(compositorSource, /Art\.drawBoardStage/);
  assert.match(compositorSource, /Art\.drawTutorialGuide/);
  assert.doesNotMatch(compositorSource, /function drawVoid|drawVoid\(/);
});

test("the awakening procession names all seven live hand-drawn topology illustrations", () => {
  const inspected = getComposition().inspect();
  assert.equal(inspected.introIllustrationSource, "app/assets/topologies/*.svg");
  assert.deepEqual(inspected.introIllustrations, [
    "plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"
  ]);
  for (const id of inspected.introIllustrations) {
    const svg = fs.readFileSync(path.join(ROOT, "app", "assets", "topologies", `${id}.svg`), "utf8");
    assert.match(svg, /data-style="hand-drawn-cel-silhouette"/);
  }
});

test("the opening is one continuous boundary crossing rather than the chapter miniature tableau", () => {
  const compositorSource = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  assert.match(compositorSource, /function introBoardPoint/);
  assert.match(compositorSource, /var columns = 6/);
  assert.match(compositorSource, /var rows = 6/);
  assert.doesNotMatch(compositorSource, /\(row \+ column\) % 2/);
  assert.match(compositorSource, /var pathV = 3 \/ rows/);
  assert.match(compositorSource, /var pathStart = 2 \/ columns/);
  assert.match(compositorSource, /var outbound = smootherstep\(550, 805, local\)/);
  assert.match(compositorSource, /var returnTrip = smootherstep\(806, 990, local\)/);
  assert.match(compositorSource, /var fold = smootherstep\(995, 1215, local\)/);
  const introPointBody = compositorSource.slice(
    compositorSource.indexOf("function introBoardPoint"),
    compositorSource.indexOf("function collectIntroParamLine")
  );
  assert.match(introPointBody, /var theta = \(u - 0\.5\) \* TAU;/);
  const introEdgeBody = compositorSource.slice(
    compositorSource.indexOf("function drawIntroEdge"),
    compositorSource.indexOf("function drawIntroAwakening")
  );
  assert.doesNotMatch(introEdgeBody, /bezierCurveTo/);
  const awakeningBody = compositorSource.slice(
    compositorSource.indexOf("function drawIntroAwakening"),
    compositorSource.indexOf("function drawIntro(ctx")
  );
  assert.match(awakeningBody, /composition\.topologyIllustrations/);
  assert.doesNotMatch(awakeningBody, /drawMiniature/);
});

test("the opening board, grid, path and stone share one depth-aware surface mapping", () => {
  const width = 1920;
  const height = 1080;
  const fold = 1;
  const cameraPush = 0.92;
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    const left = Compositor.internals.introBoardPoint(0, v, fold, width, height, cameraPush);
    const right = Compositor.internals.introBoardPoint(1, v, fold, width, height, cameraPush);
    assert.ok(Math.abs(left.x - right.x) < 1e-9);
    assert.ok(Math.abs(left.y - right.y) < 1e-9);
  }

  const meridian = Compositor.internals.collectIntroParamLine(
    width, height, 0.63, cameraPush, "u", 2 / 6, 0, 1, 36
  );
  assert.equal(meridian.length, 37);
  meridian.forEach((point, index) => {
    const expected = Compositor.internals.introBoardPoint(2 / 6, index / 36, 0.63, width, height, cameraPush);
    assert.ok(Math.abs(point.x - expected.x) < 1e-9);
    assert.ok(Math.abs(point.y - expected.y) < 1e-9);
    assert.ok(Math.abs(point.depth - expected.depth) < 1e-9);
  });

  const mesh = Compositor.internals.buildIntroSurfaceMesh(width, height, 0.63, cameraPush);
  assert.equal(mesh.columns, 48);
  assert.equal(mesh.rows, 36);
  assert.equal(mesh.patches.length, 48 * 36);
  assert.equal(mesh.patches.every((patch, index) => index === 0 || mesh.patches[index - 1].depth <= patch.depth), true);

  const source = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  assert.match(source, /function strokeIntroDepthLayer/);
  assert.match(source, /didactic trajectory is\s+\/\/ intentionally shown in full/);
  assert.match(source, /if \(stoneU < 0 \|\| stoneU > 1\) return/);
  assert.doesNotMatch(source, /function introCurve/);
});

test("the opening trajectory and stone remain fully visible on their shared parameter curve", () => {
  const source = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  const edgeBody = source.slice(source.indexOf("function drawIntroEdge"), source.indexOf("function drawIntroAwakening"));
  const rearPaper = edgeBody.indexOf("drawIntroSurfaceFill(ctx, surfaceMesh, alpha, false, fold)");
  const frontPaper = edgeBody.indexOf("drawIntroSurfaceFill(ctx, surfaceMesh, alpha, true, fold)");
  const fullPath = edgeBody.indexOf("frameInfo.frameIndex, alpha)");
  assert.ok(rearPaper >= 0 && rearPaper < frontPaper);
  assert.ok(frontPaper < fullPath);
  assert.equal((edgeBody.match(/drawIntroPathLayer\(/g) || []).length, 1);
  assert.equal((edgeBody.match(/drawIntroStoneLayer\(/g) || []).length, 1);

  const pathBody = source.slice(source.indexOf("function drawIntroPathLayer"), source.indexOf("function drawIntroStoneLayer"));
  assert.equal((pathBody.match(/strokeIntroPolyline/g) || []).length, 2);
  assert.doesNotMatch(pathBody, /strokeIntroDepthLayer|front \?/);
  const stoneBody = source.slice(source.indexOf("function drawIntroStoneLayer"), source.indexOf("function drawIntroEdge"));
  assert.doesNotMatch(stoneBody, /stoneIsFront|front \?/);

  const fillBody = source.slice(source.indexOf("function drawIntroSurfaceFill"), source.indexOf("function drawIntroGridLayer"));
  assert.match(fillBody, /patchIsFront !== front/);
});

test("portrait opening preserves square cells and closes into a constant-radius cylinder", () => {
  const point = Compositor.internals.introBoardPoint;
  const width = 1080;
  const height = 1920;
  const flatOrigin = point(0, 0, 0, width, height, 0.5);
  const flatRight = point(1 / 6, 0, 0, width, height, 0.5);
  const flatDown = point(0, 1 / 6, 0, width, height, 0.5);
  assert.ok(Math.abs((flatRight.x - flatOrigin.x) - (flatDown.y - flatOrigin.y)) < 1e-8);

  const seamStart = point(0, 0.5, 1, width, height, 1);
  const seamEnd = point(1, 0.5, 1, width, height, 1);
  assert.ok(Math.abs(seamStart.x - seamEnd.x) < 1e-8);
  assert.ok(Math.abs(seamStart.y - seamEnd.y) < 1e-8);

  const topLeft = point(0.25, 0, 1, width, height, 1);
  const topRight = point(0.75, 0, 1, width, height, 1);
  const bottomLeft = point(0.25, 1, 1, width, height, 1);
  const bottomRight = point(0.75, 1, 1, width, height, 1);
  assert.ok(Math.abs(Math.abs(topRight.x - topLeft.x) - Math.abs(bottomRight.x - bottomLeft.x)) < 1e-8);
});

test("shared stones safely skip the subpixel entrance state used by full-frame playback", () => {
  const canvas = createCanvas(64, 64);
  const context = canvas.getContext("2d", { alpha: false });
  assert.doesNotThrow(() => Art.drawStoneFace(context, { player: Engine.HUMAN, radius: 0.01 }));
});

test("every chapter starts on the live flat board and only higher topologies morph to 3D", () => {
  const chapters = getComposition().inspect().chapters;
  assert.equal(chapters.every((chapter) => chapter.startsAsFlatBoard), true);
  assert.equal(chapters.find((chapter) => chapter.id === "plane").morphsToSurface, false);
  assert.equal(chapters.filter((chapter) => chapter.id !== "plane").every((chapter) => chapter.morphsToSurface), true);
});

test("every flat topology board preserves the live game's square cell metric", () => {
  const teaser = getComposition();
  const viewport = { x: 0, y: 0, width: teaser.width, height: teaser.height };
  for (const chapter of story.chapters) {
    const layout = Compositor.internals.flatBoardLayout(teaser.chapterById[chapter.id], viewport);
    assert.ok(
      Math.abs(Math.abs(layout.cellX) - Math.abs(layout.cellY)) < 1e-9,
      `${chapter.id} cells must remain square before the topology morph`
    );
  }
});

test("the sphere uses triangular surface patches and front-facing grid clipping", () => {
  const teaser = getComposition();
  const sphere = teaser.chapterById.sphere;
  const cylinder = teaser.chapterById.cylinder;
  const viewport = { x: 0, y: 0, width: teaser.width, height: teaser.height };
  const sphereMesh = Compositor.internals.buildSurfaceMesh(
    sphere,
    viewport,
    1,
    Compositor.internals.makeOrientation(sphere, 0, 1, 1),
    1
  );
  const cylinderMesh = Compositor.internals.buildSurfaceMesh(
    cylinder,
    viewport,
    1,
    Compositor.internals.makeOrientation(cylinder, 0, 1, 1),
    1
  );
  assert.equal(sphereMesh.patches.every((patch) => patch.points.length === 3), true);
  assert.equal(cylinderMesh.patches.every((patch) => patch.points.length === 4), true);
  const source = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  assert.match(source, /strokeFrontFacingSurfacePath\(ctx, points, depthThreshold\)/);
  assert.match(source, /Morph\.smooth\(\(morphAmount - 0\.46\) \/ 0\.42\)/);
});

test("seam-crossing path strokes use both charts of the real parametric surface", () => {
  const teaser = getComposition();
  for (const chapter of story.chapters.filter((entry) => entry.id !== "plane")) {
    const model = teaser.chapterById[chapter.id];
    const seamIndex = model.trace.seams.findIndex(Boolean);
    assert.ok(seamIndex >= 0, `${chapter.id} needs a representative seam crossing`);
    const pieces = Compositor.internals.pathPieces(model, seamIndex);
    assert.equal(pieces.length, 2);
    const source = Morph.surfacePoint(chapter.id, pieces[0].to.u, pieces[0].to.v);
    const target = Morph.surfacePoint(chapter.id, pieces[1].from.u, pieces[1].from.v);
    assert.equal(Morph.close(source, target, 1e-6), true, `${chapter.id} seam charts must meet`);
  }
});

test("completed 3D worlds hide seam decoration while preserving the five-stone path", () => {
  const source = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  assert.match(source, /var seamFade = 1 - smoothstep\(0\.72, 0\.94, morphAmount\)/);

  const pathBody = source.slice(source.indexOf("function drawPath"), source.indexOf("function drawChapterCard"));
  assert.match(pathBody, /drawUvPiece/);
  assert.match(pathBody, /drawStoneFace/);
  assert.doesNotMatch(pathBody, /seamPoint|seamCueAlpha|ctx\.arc/);

  const miniatureBody = source.slice(source.indexOf("function drawMiniature"), source.indexOf("function drawTableau"));
  const finaleBody = source.slice(source.indexOf("function drawFinale"), source.indexOf("function drawCircularLogo"));
  assert.match(miniatureBody, /drawSurface\([^;]+, false\);/s);
  assert.match(finaleBody, /drawSurface\([^;]+, false\);/s);
});

test("frame rendering is deterministic and depends on frame index only", () => {
  const teaser = getComposition();
  const canvas = createCanvas(teaser.width, teaser.height);
  const context = canvas.getContext("2d", { alpha: false });
  const frame = manifest.segments.find((segment) => segment.chapterId === "mobius" && segment.kind === "chapter").startFrame + 420;
  teaser.renderFrame(context, frame);
  const first = hashCanvas(canvas);
  teaser.renderFrame(context, frame);
  const second = hashCanvas(canvas);
  teaser.renderFrame(context, frame + 1);
  const adjacent = hashCanvas(canvas);
  assert.equal(first, second);
  assert.notEqual(first, adjacent);

  const source = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.doesNotMatch(source, /Date\.now\s*\(/);
});

test("representative frames for every segment render without blank output", () => {
  const teaser = getComposition();
  const canvas = createCanvas(teaser.width, teaser.height);
  const context = canvas.getContext("2d", { alpha: false });
  for (const segment of manifest.segments) {
    const frame = segment.startFrame + Math.floor(segment.durationFrames * 0.56);
    const info = teaser.renderFrame(context, Math.min(frame, segment.endFrame - 1));
    assert.equal(info.segment.id, segment.id);
    const pixels = canvas.data();
    assert.ok(pixels.some((value, index) => index % 4 !== 3 && value !== 0), `${segment.id} must render visible pixels`);
  }
});

test("chapter scenes reveal the real board path before the full surface state", () => {
  const teaser = getComposition();
  const canvas = createCanvas(teaser.width, teaser.height);
  const context = canvas.getContext("2d", { alpha: false });
  for (const chapter of story.chapters) {
    const segment = manifest.segments.find((entry) => entry.kind === "chapter" && entry.chapterId === chapter.id);
    const boardFrame = segment.startFrame + Math.floor(segment.durationFrames * 0.4);
    const surfaceFrame = segment.startFrame + Math.floor(segment.durationFrames * 0.88);
    teaser.renderFrame(context, boardFrame);
    const boardHash = hashCanvas(canvas);
    teaser.renderFrame(context, surfaceFrame);
    const surfaceHash = hashCanvas(canvas);
    assert.notEqual(boardHash, surfaceHash, `${chapter.id} must visibly progress from board to surface`);
  }
  const source = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  assert.match(source, /smootherstep\(0\.46, 0\.84, progress\)/);
  assert.match(source, /smootherstep\(0\.08, 0\.38, progress\)/);
});

test("end card exposes both logos, the game title and a prominent producer credit", () => {
  const endCard = getComposition().inspect().endCard;
  assert.equal(endCard.institutionLogoClip, "circle");
  assert.deepEqual(endCard.logos, ["institution", "game"]);
  assert.deepEqual(endCard.textLines, [story.endCard.gameTitle, "制作：余荫铠"]);
  const source = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  assert.match(source, /var gameLogoBox = height \* 0\.315/);
  assert.match(source, /var institutionDiameter = height \* 0\.25/);
  assert.match(source, /A vector collaboration mark/);
});

test("canvas review subtitles are large white sans-serif text with a pure-black outline", () => {
  const source = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  assert.match(source, /var fontSize = Math\.round\(height \* 0\.067\)/);
  assert.match(source, /var maxWidth = width \* 0\.85/);
  assert.match(source, /ctx\.lineWidth = Math\.max\(3, height \* 0\.0078\)/);
  assert.match(source, /ctx\.strokeStyle = "rgba\(0,0,0," \+ alpha \+ "\)"/);
  assert.match(source, /ctx\.fillStyle = "rgba\(255,255,255," \+ alpha \+ "\)"/);
});

test("offline render streams raw frames into FFmpeg without a complete PNG sequence cache", () => {
  const source = fs.readFileSync(path.join(PV_ROOT, "scripts", "render.mjs"), "utf8");
  assert.match(source, /"-f", "rawvideo"/);
  assert.match(source, /canvas\.data\(\)/);
  assert.match(source, /stream\.once\("drain", onDrain\)/);
  assert.doesNotMatch(source, /%0\d+d\.png/);
  assert.doesNotMatch(source, /Math\.random\s*\(|Date\.now\s*\(/);
  assert.match(source, /overwrite:\s*\{ type: "boolean", default: false \}/);
  assert.match(source, /"no-subtitles":\s*\{ type: "boolean", default: false \}/);
  assert.match(source, /brand-icon\.png/);
});

test("4K master burns the same ASS captions used by the approved 1080p delivery", () => {
  const source = fs.readFileSync(path.join(PV_ROOT, "scripts", "render.mjs"), "utf8");
  assert.match(source, /const useAssSubtitles = options\.profile === "master" && !options\["no-subtitles"\]/);
  assert.match(source, /!options\["no-subtitles"\] && !useAssSubtitles/);
  assert.match(source, /subtitles=filename='\$\{filterPath\(subtitlePath\)\}':fontsdir='\$\{filterPath\(subtitleFontDirectory\)\}'/);
  assert.match(source, /DEFAULT_CAPTIONS_ASS = path\.join\(PV_ROOT, "captions\.ass"\)/);
});

test("portrait social exports render native portrait scenes from the shared game assets", () => {
  const source = fs.readFileSync(path.join(PV_ROOT, "scripts", "render-social.mjs"), "utf8");
  assert.match(source, /douyin:[\s\S]*width: 1080,[\s\S]*height: 1920/);
  assert.match(source, /xiaohongshu:[\s\S]*width: 1080,[\s\S]*height: 1440/);
  assert.match(source, /layout: "portrait"/);
  assert.match(source, /composition\.renderFrame\(context, frameIndex\)/);
  assert.match(source, /app\/assets\/topology\.js/);
  assert.match(source, /subtitles=filename=/);
  assert.match(source, /layout: "native portrait scene composition"/);
  assert.match(source, /subtitleFontSize: 68/);
  assert.doesNotMatch(source, /cleanVideo|sourceVideo|force_original_aspect_ratio|gblur|overlay=/);

  const compositorSource = fs.readFileSync(path.join(PV_ROOT, "src", "compositor.js"), "utf8");
  assert.match(compositorSource, /function drawPortraitChapterCard/);
  assert.match(compositorSource, /function drawPortraitChapterScene/);
  assert.match(compositorSource, /function drawPortraitIntroAwakening/);
  assert.match(compositorSource, /function drawPortraitEndCard/);
});

test("cover exports keep exact publishing copy and three requested safe aspect ratios", () => {
  const copy = JSON.parse(fs.readFileSync(path.join(PV_ROOT, "publishing-copy.json"), "utf8"));
  assert.equal(copy.title, "《拓扑五子棋》章节预告PV-「足迹回环」");
  assert.deepEqual(copy.descriptionLines, [
    "人们总把棋盘的边缘视作尽头。",
    "可那些消失在边界上的道路并未中断。",
    "僭越棋盘之人，循着隐藏的连接前行吧。",
    "世界的七重轮廓，在你面前依次苏醒……",
    "【Prologue.方庭】-【I.回廊】-【II.环游】",
    "【III.扭带】-【IV.瓶界】-【V.双生】-【VI.归圆】"
  ]);
  const source = fs.readFileSync(path.join(PV_ROOT, "scripts", "render-covers.mjs"), "utf8");
  const boardSource = fs.readFileSync(path.join(PV_ROOT, "scripts", "render-cover-board-v5.mjs"), "utf8");
  assert.match(boardSource, /id: "4x3"[\s\S]*width: 1600, height: 1200/);
  assert.match(boardSource, /id: "16x9"[\s\S]*width: 1920, height: 1080/);
  assert.match(boardSource, /id: "3x4"[\s\S]*width: 1080, height: 1440/);
  assert.match(source, /large title only; no small cover copy/);
  assert.match(source, /assets", "cover-final", "wordmark\.png"/);
  assert.match(source, /render-cover-board-v5\.mjs/);
  assert.match(source, /drawBoardFoundation/);
  assert.match(source, /opaqueSurface\.addColorStop\(0, "rgba\(255,255,255,0\.86\)"\)/);
  assert.match(source, /shadowColor = "rgba\(19,38,33,0\.28\)"/);
  assert.match(source, /wordmarkDepth: "warm halo plus restrained dark cast shadow"/);
  assert.match(source, /subtitle: "larger Topo Serif PV title, soft ivory outline, no underline"/);
  assert.match(source, /underline: false/);
  assert.match(source, /3x4: the approved wordmark must not cover the board or its lower-left stone/);
  assert.doesNotMatch(source, /sphere\.svg/);

  const approvedWordmark = fs.readFileSync(path.join(PV_ROOT, "assets", "cover-final", "wordmark.png"));
  assert.equal(
    crypto.createHash("sha256").update(approvedWordmark).digest("hex"),
    "b425ad0dcf848f4179805183e096744541906c5f68fad79c452616e17eef7d57"
  );
});

test("cover exploration provides six nontrivial topology and bespoke wordmark families", () => {
  const source = fs.readFileSync(path.join(PV_ROOT, "scripts", "render-cover-directions.mjs"), "utf8");
  for (const id of [
    "mobius-continuum",
    "klein-passage",
    "projective-crossing",
    "torus-orbit",
    "seam-gate",
    "wordmark-manifold"
  ]) assert.match(source, new RegExp(`id: "${id}"`));
  assert.match(source, /Engine\.tracePath/);
  assert.match(source, /Morph\.project/);
  assert.match(source, /Morph\.seamBridgeUV/);
  assert.match(source, /exact live-game trace projected through topology-morph\.js/);
  assert.match(source, /five-stone path integrated into the exact wordmark/);
  assert.match(source, /inner 9% frame/);
  assert.match(source, /id: "4x3"[\s\S]*width: 1600, height: 1200/);
  assert.match(source, /id: "16x9"[\s\S]*width: 1920, height: 1080/);
  assert.match(source, /id: "3x4"[\s\S]*width: 1080, height: 1440/);
});

test("cover redesign uses original vector lettering and opaque thumbnail-safe topology anchors", () => {
  const source = fs.readFileSync(path.join(PV_ROOT, "scripts", "render-cover-redesign.mjs"), "utf8");
  for (const id of ["klein-monolith", "mobius-lacquer", "projective-seal", "atlas-ink"]) {
    assert.match(source, new RegExp(`id: "${id}"`));
  }
  assert.match(source, /WORDMARK_STROKES/);
  assert.match(source, /WORDMARK_KNOCKOUTS/);
  assert.match(source, /WORDMARK_OVERPASSES/);
  assert.match(source, /central over-under twist/);
  assert.match(source, /棋 terminal return loop/);
  assert.match(source, /topology-gomoku-wordmark-colour\.svg/);
  assert.match(source, /topology-gomoku-wordmark-black\.svg/);
  assert.match(source, /topology-gomoku-wordmark-reverse\.svg/);
  assert.match(source, /topology-gomoku-wordmark-240px\.png/);
  assert.match(source, /thumbnail-proof-\$\{profile\.id\}\.png/);
  assert.doesNotMatch(source, /fillText\(["']拓扑五子棋["']/);
  assert.doesNotMatch(source, /fillText\(["']拓["']/);
  assert.match(source, /id: "4x3"[\s\S]*width: 1600, height: 1200/);
  assert.match(source, /id: "16x9"[\s\S]*width: 1920, height: 1080/);
  assert.match(source, /id: "3x4"[\s\S]*width: 1080, height: 1440/);
});

test("imagegen cover exploration keeps real branding and distinct art families across all cover ratios", () => {
  const source = fs.readFileSync(path.join(PV_ROOT, "scripts", "render-cover-imagegen-exploration.mjs"), "utf8");
  for (const id of [
    "real-logo-hero",
    "footsteps-twin",
    "game-atlas",
    "ink-loop",
    "anime-crosscap",
    "porcelain-monolith",
    "geometric-fold",
    "atlas-fantasia",
    "geometric-klein",
    "geometric-duality"
  ]) assert.match(source, new RegExp(`id: "${id}"`));
  assert.match(source, /app", "assets", "brand-icon\.png/);
  assert.match(source, /assets", "cover-exploration/);
  assert.match(source, /wordmarks", "09b-geometric-refined\.png/);
  assert.match(source, /manifolds", "08-geometric-klein\.png/);
  assert.match(source, /drawTwinHero/);
  assert.match(source, /thumbnail-proof-\$\{profile\.id\}\.png/);
  assert.match(source, /wordmark-candidates\.png/);
  assert.match(source, /manifold-candidates\.png/);
  assert.match(source, /Only \$\{activeDirections\.length\} cover directions have complete assets/);
  assert.match(source, /id: "4x3"[\s\S]*width: 1600, height: 1200/);
  assert.match(source, /id: "16x9"[\s\S]*width: 1920, height: 1080/);
  assert.match(source, /id: "3x4"[\s\S]*width: 1080, height: 1440/);
});

test("cover selection exploration keeps only approved wordmark families and adapts eleven focused directions", () => {
  const source = fs.readFileSync(path.join(PV_ROOT, "scripts", "render-cover-selection-exploration.mjs"), "utf8");
  const compositor = fs.readFileSync(path.join(PV_ROOT, "scripts", "compose-cover-wordmarks-v4.mjs"), "utf8");
  for (const id of [
    "selected-sphere-baseline",
    "mobius-footsteps",
    "torus-board-4x4",
    "real-game-logo",
    "geometric-atlas",
    "geometric-klein",
    "seven-manifold-orbit",
    "imagegen-seven-orbit",
    "imagegen-mobius-stage",
    "imagegen-torus-board",
    "imagegen-footsteps-atlas"
  ]) assert.match(source, new RegExp(`id: "${id}"`));
  assert.doesNotMatch(source, /06-ink-wash|07-anime-chapter/);
  assert.match(source, /app", "assets", "brand-icon\.png/);
  assert.match(source, /manifolds", "07b-geometric-refined\.png/);
  assert.match(source, /manifolds", "08-geometric-klein\.png/);
  assert.match(source, /function drawTorusBoard/);
  assert.match(source, /xConnection: "same", yConnection: "same"/);
  assert.match(source, /for \(let index = 0; index < 5; index \+= 1\)/);
  assert.match(source, /function orbitPlacements/);
  assert.match(source, /thumbnail-proof-\$\{profile\.id\}\.png/);
  assert.match(source, /exactCoverText: \["拓扑五子棋", "足迹回环"\]/);
  assert.match(source, /id: "4x3"[\s\S]*width: 1600, height: 1200/);
  assert.match(source, /id: "16x9"[\s\S]*width: 1920, height: 1080/);
  assert.match(source, /id: "3x4"[\s\S]*width: 1080, height: 1440/);

  assert.match(compositor, /five-twin\.png/);
  assert.match(compositor, /qi-three-stones\.png/);
  assert.match(compositor, /qi-geometric\.png/);
  assert.match(compositor, /08d-footsteps-corrected\.png/);
  assert.match(compositor, /09f-geometric-corrected\.png/);
  assert.match(compositor, /heightScale: 1\.5/);
  assert.match(compositor, /heightScale: 1\.25/);
  for (const asset of [
    "08d-footsteps-corrected.png",
    "09f-geometric-corrected.png",
    "09c-folded-inscription.png",
    "09d-single-ribbon.png",
    "09e-modular-join.png"
  ]) {
    const assetPath = path.join(PV_ROOT, "assets", "cover-exploration-v4", "wordmarks", asset);
    assert.ok(fs.existsSync(assetPath), `missing approved wordmark asset: ${asset}`);
    assert.ok(fs.statSync(assetPath).size > 40_000, `wordmark asset is unexpectedly small: ${asset}`);
  }
});

test("cover wordmark v5 uses the real torus rules, square game board, and repaired 08/09 families", () => {
  const boardSource = fs.readFileSync(path.join(PV_ROOT, "scripts", "render-cover-board-v5.mjs"), "utf8");
  const coverSource = fs.readFileSync(path.join(PV_ROOT, "scripts", "render-cover-wordmark-exploration-v5.mjs"), "utf8");

  assert.match(boardSource, /require\("\.\.\/\.\.\/\.\.\/app\/assets\/topology-art\.js"\)/);
  assert.match(boardSource, /require\("\.\.\/\.\.\/\.\.\/app\/assets\/topology\.js"\)/);
  assert.match(boardSource, /Engine\.tracePath/);
  assert.match(boardSource, /columns: 4, rows: 4/);
  assert.match(boardSource, /vertical: 5, horizontal: 5/);
  assert.match(boardSource, /auxiliaryCircleCount: 0/);
  assert.match(boardSource, /x: "same", y: "same"/);
  assert.match(boardSource, /projection: "orthographic"/);
  assert.match(boardSource, /titleOverlapFraction < 0\.10/);
  assert.match(boardSource, /titleOverlapFraction > 0\.25/);

  for (const id of [
    "serif-baseline",
    "08g-footsteps-release-tight",
    "08h-footsteps-twin-surface",
    "08i-footsteps-ribbon-release",
    "09g-geometric-repaired",
    "09h-geometric-folded",
    "09i-geometric-release"
  ]) assert.match(coverSource, new RegExp(`id: "${id}"`));
  assert.match(coverSource, /exactCoverText: \["拓扑五子棋", "足迹回环"\]/);
  assert.match(coverSource, /boardSource: "repository game art: topology-art\.js"/);
  assert.match(coverSource, /x: 0\.075[\s\S]*width: 0\.50, height: 0\.34/);
  assert.match(coverSource, /x: 0\.07[\s\S]*width: 0\.555, height: 0\.42/);
  assert.match(coverSource, /x: 0\.07[\s\S]*width: 0\.86, height: 0\.28/);
  assert.doesNotMatch(coverSource, /heightScale|fiveScale|oversizedFive/);
  assert.match(coverSource, /qa-chapter-teaser-cover-wordmarks-v5-/);
  assert.match(coverSource, /thumbnail-proof-/);

  for (const asset of [
    "08g-footsteps-release-tight.png",
    "08h-footsteps-twin-surface.png",
    "08i-footsteps-ribbon-release.png",
    "09g-geometric-repaired.png",
    "09h-geometric-folded.png",
    "09i-geometric-release.png"
  ]) {
    const assetPath = path.join(PV_ROOT, "assets", "cover-exploration-v5", "wordmarks", asset);
    assert.ok(fs.existsSync(assetPath), `missing v5 wordmark asset: ${asset}`);
    assert.ok(fs.statSync(assetPath).size > 100_000, `v5 wordmark asset is unexpectedly small: ${asset}`);
  }
});

test("native portrait compositions render directly at both platform aspect ratios", () => {
  for (const [width, height] of [[1080, 1920], [1080, 1440]]) {
    const teaser = Compositor.createComposition({
      story,
      manifest,
      width,
      height,
      layout: "portrait",
      subtitlesEnabled: false
    });
    assert.equal(teaser.inspect().layout, "portrait");
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false });
    for (const id of ["intro-awakening", "chapter-iii", "tableau", "end-card"]) {
      const segment = manifest.segments.find((item) => item.id === id);
      const frame = segment.startFrame + Math.floor((segment.endFrame - segment.startFrame) * 0.62);
      assert.equal(teaser.renderFrame(context, frame).segment.id, id);
      assert.ok(canvas.data().some((value, index) => index % 4 !== 3 && value !== 0));
    }
  }
});

test("missing manifest failure is explicit and manifest-only verification passes", () => {
  const missing = spawnSync(
    process.execPath,
    [path.join(PV_ROOT, "scripts", "render.mjs"), "frame", "--manifest", "video/chapter-teaser/not-present.json"],
    { cwd: ROOT, encoding: "utf8" }
  );
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /manifest\.json is missing.*run the PV audio build first/s);

  const verified = spawnSync(
    process.execPath,
    [path.join(PV_ROOT, "scripts", "verify-video.mjs"), "--manifest-only"],
    { cwd: ROOT, encoding: "utf8" }
  );
  assert.equal(verified.status, 0, verified.stderr);
  assert.match(verified.stdout, /verification passed/);
});

test("offline render rejects an audio master that no longer matches the manifest", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-teaser-stale-audio-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const staleManifest = structuredClone(manifest);
  const staleAudio = path.join(temporaryRoot, "stale.wav");
  fs.writeFileSync(staleAudio, Buffer.alloc(44));
  staleManifest.audio.masterMix = staleAudio;
  staleManifest.audio.artifacts = {
    ...(staleManifest.audio.artifacts || {}),
    masterMix: { path: staleAudio, bytes: 44, sha256: "0".repeat(64) }
  };
  const manifestPath = path.join(temporaryRoot, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(staleManifest)}\n`, "utf8");
  const rendered = spawnSync(
    process.execPath,
    [
      path.join(PV_ROOT, "scripts", "render.mjs"),
      "review",
      "--manifest", manifestPath,
      "--start-frame", "0",
      "--end-frame", "1",
      "--output", path.join(temporaryRoot, "must-not-render.mp4")
    ],
    { cwd: ROOT, encoding: "utf8" }
  );
  assert.notEqual(rendered.status, 0);
  assert.match(rendered.stderr, /Audio master checksum differs.*run the PV audio build first/s);
  assert.equal(fs.existsSync(path.join(temporaryRoot, "must-not-render.mp4")), false);
});

test("browser preview uses the shared compositor and the local server can open through Playwright", () => {
  const preview = fs.readFileSync(path.join(PV_ROOT, "preview.html"), "utf8");
  const server = fs.readFileSync(path.join(PV_ROOT, "scripts", "serve.mjs"), "utf8");
  assert.match(preview, /aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(preview, /ChapterTeaserCompositor\.createComposition/);
  assert.match(preview, /topology-art\.js/);
  assert.match(preview, /Topo Sans PV/);
  assert.match(preview, /brand-icon\.png/);
  assert.match(preview, /manifest\.json is missing; run the PV audio build first/);
  assert.match(server, /import\("playwright-core"\)/);
});

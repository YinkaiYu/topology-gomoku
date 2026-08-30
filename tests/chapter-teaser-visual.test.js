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

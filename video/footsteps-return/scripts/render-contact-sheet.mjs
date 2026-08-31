import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { captionCues } from "../src/data/captions.js";
import { masterTimeline } from "../src/data/timeline.js";
import { CHAPTER_MOTION_TIMING } from "../src/runtime/topology-surfaces.js";
import { startStaticServer } from "./serve-app.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, "..", "..");
const LOCAL_FRAME_DIRECTORY = path.join(PROJECT_ROOT, "captures", "task11-contact-sheet");
const ARTIFACT_DIRECTORY = path.join(REPOSITORY_ROOT, "artifacts");
const EVIDENCE_PATH = path.join(ARTIFACT_DIRECTORY, "pv-footsteps-return-task11-evidence.json");
const CONTACT_SHEET_PATH = path.join(ARTIFACT_DIRECTORY, "pv-footsteps-return-task11-contact-sheet.png");
const ANIMATION_MAP_PATH = path.join(ARTIFACT_DIRECTORY, "pv-footsteps-return-task11-animation-map.svg");
const FPS = 60;
const LOGICAL_DURATION_SECONDS = 214.04;
const TOTAL_FRAMES = Math.ceil(LOGICAL_DURATION_SECONDS * FPS);
const PICTURE_DURATION_SECONDS = TOTAL_FRAMES / FPS;
const VIEWPORT = Object.freeze({ width: 3840, height: 2160, deviceScaleFactor: 1 });
const CHAPTER_IDS = Object.freeze(["plane", "cylinder", "torus", "mobius", "klein", "projective", "sphere"]);
const ACCEPTED_TITLE = "《拓扑五子棋》章节预告 PV—「足迹回环」";
const VISUAL_CONTRACT_ROOTS = Object.freeze([
  "index.html",
  "render-game.html",
  "hyperframes.config.json",
  "compositions",
  "src",
  "assets/brand",
  "assets/fonts",
  "assets/game-source",
  "assets/topology"
]);
const EVIDENCE_TOOL_CONTRACT_ROOTS = Object.freeze([
  "scripts/render-contact-sheet.mjs",
  "scripts/serve-app.mjs"
]);

const frame = (id, group, sceneId, options = {}) => Object.freeze({ id, group, sceneId, ...options });

export const task11CapturePlan = Object.freeze([
  frame("intro-hidden-adjacency", "intro", "intro", { label: "Intro hidden adjacency" }),
  ...CHAPTER_IDS.flatMap((chapterId) => [
    frame(`chapter-card-${chapterId}`, "chapter-card", `chapter-card-${chapterId}`, { chapterId, label: `${chapterId} chapter card` }),
    frame(`chapter-evidence-${chapterId}`, "chapter-evidence", `chapter-${chapterId}`, { chapterId, label: `${chapterId} rule evidence` }),
    frame(`chapter-morph-${chapterId}`, "chapter-morph", `chapter-${chapterId}`, { chapterId, label: `${chapterId} morph hero` })
  ]),
  frame("seven-world-gallery", "gallery", "seven-world-gallery", { label: "Seven-world gallery" }),
  frame("end-card-identity", "end-card", "end-card", { label: "End-card identity" })
]);

function repositoryRelative(filePath) {
  return path.relative(REPOSITORY_ROOT, filePath).split(path.sep).join("/");
}

function sceneById(sceneId) {
  const scene = masterTimeline.scenes.find(({ id }) => id === sceneId);
  if (!scene) throw new Error(`Task 11 capture references unknown scene ${sceneId}`);
  return scene;
}

function quantizeTime(seconds) {
  const frameIndex = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(seconds * FPS)));
  return Object.freeze({ frameIndex, seekSeconds: frameIndex / FPS });
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function listContractFiles(targetPath) {
  const entries = await readdir(targetPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOTDIR") return null;
    throw error;
  });
  if (entries === null) return [targetPath];
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const childPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) files.push(...await listContractFiles(childPath));
    else if (entry.isFile()) files.push(childPath);
  }
  return files;
}

async function buildContract(projectRoot, roots) {
  const files = (await Promise.all(roots.map((entry) => listContractFiles(path.join(projectRoot, entry)))))
    .flat()
    .sort((left, right) => repositoryRelative(left).localeCompare(repositoryRelative(right), "en"));
  const hash = createHash("sha256");
  for (const filePath of files) {
    hash.update(repositoryRelative(filePath));
    hash.update("\0");
    hash.update(await readFile(filePath));
    hash.update("\0");
  }
  return Object.freeze({ sha256: hash.digest("hex"), fileCount: files.length });
}

export async function buildTask11VisualContract({ projectRoot = PROJECT_ROOT } = {}) {
  return buildContract(projectRoot, VISUAL_CONTRACT_ROOTS);
}

export async function buildTask11EvidenceToolContract({ projectRoot = PROJECT_ROOT } = {}) {
  return buildContract(projectRoot, EVIDENCE_TOOL_CONTRACT_ROOTS);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildAnimationMap(frames, mix) {
  const width = 3840;
  const height = 2160;
  const left = 430;
  const right = 180;
  const timelineWidth = width - left - right;
  const rowHeight = 78;
  const top = 188;
  const timeX = (time) => left + time / LOGICAL_DURATION_SECONDS * timelineWidth;
  const kindColors = Object.freeze({
    intro: "#817f77",
    "chapter-card": "#c79244",
    chapter: "#3f8c87",
    "seven-world-gallery": "#385f78",
    outro: "#7f6ca8",
    "end-card": "#f2efe7"
  });
  const sceneRows = masterTimeline.scenes.map((scene, index) => {
    const y = top + index * rowHeight;
    const x = timeX(scene.start);
    const sceneWidth = Math.max(2, timeX(scene.start + scene.duration) - x);
    const markers = frames.filter(({ sceneId }) => sceneId === scene.id).map(({ seekSeconds, group }) => {
      const markerX = timeX(seekSeconds);
      return `<path d="M ${markerX.toFixed(2)} ${y + 9} l -8 -12 h 16 z" fill="#d95b4f"><title>${escapeXml(group)} at ${seekSeconds.toFixed(3)}s</title></path>`;
    }).join("");
    return `<g>
      <text x="36" y="${y + 37}" class="scene-label">${escapeXml(scene.id)}</text>
      <rect x="${x.toFixed(2)}" y="${y + 12}" width="${sceneWidth.toFixed(2)}" height="42" rx="10" fill="${kindColors[scene.kind] ?? "#8b7556"}" opacity="0.82"/>
      <text x="${(x + 12).toFixed(2)}" y="${y + 40}" class="bar-label">${scene.start.toFixed(2)}–${(scene.start + scene.duration).toFixed(2)}</text>
      ${markers}
    </g>`;
  }).join("");
  const captionY = top + masterTimeline.scenes.length * rowHeight + 40;
  const captions = captionCues.map((cue) => `<rect x="${timeX(cue.start).toFixed(2)}" y="${captionY}" width="${Math.max(1, timeX(cue.end) - timeX(cue.start)).toFixed(2)}" height="24" rx="4" fill="#f2efe7" opacity="0.82"><title>${escapeXml(cue.id)} ${cue.start.toFixed(3)}–${cue.end.toFixed(3)}</title></rect>`).join("");
  const sfxY = captionY + 62;
  const sfx = mix.inputs.sfx.cues.map((cue) => `<rect x="${timeX(cue.startSeconds).toFixed(2)}" y="${sfxY}" width="${Math.max(2, timeX(cue.startSeconds + cue.durationSeconds) - timeX(cue.startSeconds)).toFixed(2)}" height="24" rx="4" fill="#d95b4f" opacity="0.88"><title>${escapeXml(cue.id)} ${cue.startSeconds.toFixed(3)}–${(cue.startSeconds + cue.durationSeconds).toFixed(3)}</title></rect>`).join("");
  const tickLabels = Array.from({ length: 12 }, (_, index) => {
    const seconds = index === 11 ? LOGICAL_DURATION_SECONDS : index * 20;
    const x = timeX(seconds);
    return `<line x1="${x.toFixed(2)}" y1="142" x2="${x.toFixed(2)}" y2="${sfxY + 44}" stroke="#817f77" stroke-width="1" opacity="0.22"/><text x="${x.toFixed(2)}" y="132" class="tick" text-anchor="middle">${seconds.toFixed(index === 11 ? 2 : 0)}s</text>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(ACCEPTED_TITLE)}</title>
  <desc id="description">Native 4K 60 fps scene, caption, sound effect, and representative-frame map for the 214.040 second composition.</desc>
  <rect width="100%" height="100%" fill="#060908"/>
  <style>
    text{font-family:"Topo Serif","Noto Serif SC",serif;fill:#f2efe7}.title{font-size:58px;font-weight:700}.subtitle{font-size:25px;fill:#b9b4a9}.scene-label{font-size:24px}.bar-label{font-size:20px;fill:#060908;font-weight:700}.tick{font-size:20px;fill:#817f77}.lane{font-size:24px;font-weight:700}
  </style>
  <text id="title-text" x="36" y="72" class="title">${escapeXml(ACCEPTED_TITLE)}—动画图</text>
  <text x="36" y="112" class="subtitle">214.040s logical timeline · 12,843 CFR frames · 214.050s picture envelope · 24 representative native-4K frames</text>
  ${tickLabels}
  ${sceneRows}
  <text x="36" y="${captionY + 21}" class="lane">46 captions</text>${captions}
  <text x="36" y="${sfxY + 21}" class="lane">21 sparse SFX</text>${sfx}
  <g transform="translate(36 ${height - 110})"><path d="M 8 12 l -8 -12 h 16 z" fill="#d95b4f"/><text x="30" y="13" class="subtitle">contact-sheet frame</text><rect x="315" y="-4" width="34" height="22" rx="5" fill="#f2efe7"/><text x="363" y="13" class="subtitle">caption cue</text><rect x="565" y="-4" width="34" height="22" rx="5" fill="#d95b4f"/><text x="613" y="13" class="subtitle">SFX cue</text></g>
</svg>\n`;
}

function contactSheetMarkup(frames) {
  const cells = frames.map((item) => `<figure>
    <img src="${item.dataUrl}" alt="">
    <figcaption><strong>${escapeXml(item.id)}</strong><span>${item.seekSeconds.toFixed(3)}s · frame ${item.frameIndex}</span><span>${escapeXml(item.observation.visibleSceneIds.join(" + "))}</span></figcaption>
  </figure>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:3840px;height:2160px;overflow:hidden;background:#060908;color:#f2efe7;font-family:Georgia,"Noto Serif SC",serif}.grid{display:grid;grid-template-columns:repeat(4,960px);grid-template-rows:repeat(6,360px);width:3840px;height:2160px}.grid figure{display:grid;grid-template-columns:640px 320px;position:relative;margin:0;overflow:hidden;border:1px solid #21302c;background:#080c0b}.grid img{display:block;width:640px;height:360px;object-fit:contain;background:#060908}.grid figcaption{display:flex;flex-direction:column;justify-content:center;gap:18px;padding:28px 24px;border-left:1px solid #21302c;font-size:22px;line-height:1.35}.grid strong{font-size:25px;color:#fff}.grid span{color:#b9b4a9}
  </style></head><body><main class="grid">${cells}</main></body></html>`;
}

async function resolveCapture(page, planned) {
  const scene = sceneById(planned.sceneId);
  if (planned.group === "intro") return Object.freeze({ ...planned, ...quantizeTime(scene.start + 14.2), expectedPhase: "hidden-adjacency" });
  if (planned.group === "chapter-card") return Object.freeze({ ...planned, ...quantizeTime(scene.start + 1.95), expectedPhase: "phase-b" });
  if (planned.group === "gallery") return Object.freeze({ ...planned, ...quantizeTime(scene.start + 4.4), expectedPhase: "withdrawal" });
  if (planned.group === "end-card") return Object.freeze({ ...planned, ...quantizeTime(scene.start + 2.65), expectedPhase: "identity-hero" });

  const sample = await page.evaluate(({ chapterId, group, progressStartOffsetSeconds, progressEndOffsetSeconds }) => {
    const controller = window.__pvChapterControllers?.[chapterId];
    if (!controller) throw new Error(`missing chapter controller ${chapterId}`);
    const finalDemo = controller.definition.liveRender.demos.at(-1);
    const candidates = controller.samples.filter(({ demo }) => demo === finalDemo);
    const selected = group === "chapter-evidence"
      ? (chapterId === "plane"
        ? candidates.find(({ phase }) => phase === "win-hold")
        : candidates.filter(({ phase }) => phase === "breathe").at(-1))
      : candidates.find(({ phase }) => phase === "settled");
    if (!selected) throw new Error(`missing ${group} sample for ${chapterId}`);
    const rawTime = controller.sceneStart
      + progressStartOffsetSeconds
      + selected.progress * (controller.sceneDuration - progressEndOffsetSeconds);
    return { ...selected, rawTime, sceneStart: controller.sceneStart, sceneDuration: controller.sceneDuration };
  }, {
    chapterId: planned.chapterId,
    group: planned.group,
    progressStartOffsetSeconds: CHAPTER_MOTION_TIMING.progressStartOffsetSeconds,
    progressEndOffsetSeconds: CHAPTER_MOTION_TIMING.progressEndOffsetSeconds,
  });
  const rawFrame = Math.round(sample.rawTime * FPS);
  const frameOffsets = [0, ...Array.from({ length: 30 }, (_, index) => [-(index + 1), index + 1]).flat()];
  let timing;
  let renderProgress;
  for (const offset of frameOffsets) {
    const candidateFrame = rawFrame + offset;
    if (candidateFrame < 0 || candidateFrame >= TOTAL_FRAMES) continue;
    const candidateTiming = { frameIndex: candidateFrame, seekSeconds: candidateFrame / FPS };
    const candidateProgress = Math.max(0, Math.min(1,
      (candidateTiming.seekSeconds - sample.sceneStart - CHAPTER_MOTION_TIMING.progressStartOffsetSeconds)
        / (sample.sceneDuration - CHAPTER_MOTION_TIMING.progressEndOffsetSeconds)
    ));
    const semantic = await page.evaluate(async ({ chapterId, progress }) => {
      const result = await window.__pvChapterControllers[chapterId].renderProgress(progress);
      return { phase: result.phase, demo: result.demo };
    }, { chapterId: planned.chapterId, progress: candidateProgress });
    if (semantic.phase === sample.phase && semantic.demo === sample.demo) {
      timing = candidateTiming;
      renderProgress = candidateProgress;
      break;
    }
  }
  if (!timing) throw new Error(`no native-60fps ${sample.phase}/${sample.demo} frame for ${planned.id}`);
  return Object.freeze({ ...planned, ...timing, expectedPhase: sample.phase, demo: sample.demo, step: sample.step, renderProgress });
}

async function settleAndObserve(page, resolved) {
  return page.evaluate(async (entry) => {
    const timeline = window.__timelines["footsteps-return"];
    timeline.time(entry.seekSeconds, false).pause();
    if (entry.chapterId && Number.isFinite(entry.renderProgress)) {
      await window.__pvChapterControllers[entry.chapterId].renderProgress(entry.renderProgress);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const root = document.querySelector('[data-composition-id="footsteps-return"]');
    const rootRect = root.getBoundingClientRect();
    const visibleSceneIds = [...document.querySelectorAll("[data-scene-id]")]
      .filter((scene) => {
        const style = getComputedStyle(scene);
        return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.01;
      })
      .map((scene) => scene.dataset.sceneId);
    const visibleCaptions = [...document.querySelectorAll("[data-caption]")]
      .filter((caption) => Number(getComputedStyle(caption).opacity) > 0.01)
      .map((caption) => {
        const rect = caption.getBoundingClientRect();
        const style = getComputedStyle(caption);
        return {
          id: caption.dataset.caption,
          text: caption.textContent.trim(),
          width: rect.width,
          height: rect.height,
          lineHeight: Number.parseFloat(style.lineHeight),
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          punctuationFree: !/[\p{P}\p{S}]/u.test(caption.textContent)
        };
      });
    const chapterScene = entry.chapterId ? document.querySelector(`[data-scene-id="chapter-${entry.chapterId}"]`) : null;
    const card = entry.group === "chapter-card" ? document.querySelector(`[data-chapter-card="${entry.chapterId}"]`) : null;
    const introScene = entry.group === "intro" ? document.querySelector('[data-scene-id="intro"]') : null;
    const opacity = (node) => node ? Number(getComputedStyle(node).opacity) : null;
    return {
      renderReady: window.__renderReady === true && document.documentElement.dataset.renderReady === "true",
      timelineTime: timeline.time(),
      width: rootRect.width,
      height: rootRect.height,
      visibleSceneIds,
      captions: visibleCaptions,
      intro: introScene ? {
        gameTitleCount: introScene.querySelectorAll("[data-game-title-mark]").length,
        iopCount: introScene.querySelectorAll("[data-iop-mark]").length
      } : null,
      chapter: chapterScene ? {
        phase: chapterScene.dataset.chapterPhase,
        demo: chapterScene.dataset.chapterDemo,
        canvasCount: chapterScene.querySelectorAll("iframe[data-chapter-game-render]").length,
        webglContextReady: entry.chapterId === "plane" || Boolean(chapterScene.querySelector("[data-chapter-surface-canvas]")?.getContext("webgl2") || chapterScene.querySelector("[data-chapter-surface-canvas]")?.getContext("webgl"))
      } : null,
      card: card ? {
        act: card.querySelector("[data-chapter-act]")?.textContent.trim(),
        chapter: card.querySelector("[data-chapter-name]")?.textContent.trim(),
        topology: card.querySelector("[data-topology-name]")?.textContent.trim(),
        actOpacity: opacity(card.querySelector("[data-chapter-act]")),
        chapterOpacity: opacity(card.querySelector("[data-chapter-name]")),
        topologyOpacity: opacity(card.querySelector("[data-topology-name]"))
      } : null,
      gallery: entry.group === "gallery" ? {
        shapeCount: document.querySelectorAll("[data-gallery-shape]").length,
        readyCanvasCount: document.querySelectorAll('[data-gallery-canvas-ready="true"]').length,
        cameraPosition: document.querySelector("[data-gallery-camera]")?.dataset.galleryCameraPosition
      } : null,
      endCard: entry.group === "end-card" ? {
        titleCount: document.querySelectorAll("[data-game-title-mark]").length,
        iopCount: document.querySelectorAll("[data-iop-mark]").length,
        titleOpacity: opacity(document.querySelector("[data-game-title-mark]")),
        iopOpacity: opacity(document.querySelector("[data-iop-mark]"))
      } : null
    };
  }, resolved);
}

function assertSemanticCapture(resolved, observation) {
  if (!observation.visibleSceneIds.includes(resolved.sceneId)) throw new Error(`Task 11 capture ${resolved.id} does not visibly contain ${resolved.sceneId}`);
  if (observation.captions.length > 1 || observation.captions.some(({ punctuationFree, height, lineHeight }) => !punctuationFree || height > lineHeight * 1.25)) {
    throw new Error(`Task 11 capture ${resolved.id} violates the single-line punctuation-free caption contract`);
  }
  if (resolved.group === "intro" && (observation.intro?.gameTitleCount !== 0 || observation.intro?.iopCount !== 0)) {
    throw new Error("Task 11 intro capture contains forbidden game or IOP identity");
  }
  if (resolved.group === "chapter-card" && (!observation.card || observation.card.actOpacity > 0.01 || observation.card.chapterOpacity < 0.99 || observation.card.topologyOpacity < 0.99)) {
    throw new Error(`Task 11 card capture ${resolved.id} is not the readable phase-B hierarchy`);
  }
  if (["chapter-evidence", "chapter-morph"].includes(resolved.group)) {
    if (!observation.chapter || observation.chapter.phase !== resolved.expectedPhase || observation.chapter.demo !== resolved.demo) {
      throw new Error(`Task 11 chapter capture ${resolved.id} observed ${observation.chapter?.phase}/${observation.chapter?.demo}, expected ${resolved.expectedPhase}/${resolved.demo}`);
    }
    if (observation.chapter.canvasCount !== 1 || observation.chapter.webglContextReady !== true) {
      throw new Error(`Task 11 chapter capture ${resolved.id} lost its real-game Canvas or topology surface`);
    }
  }
  if (resolved.group === "gallery" && (observation.gallery?.shapeCount !== 7 || observation.gallery?.readyCanvasCount !== 7 || observation.gallery?.cameraPosition !== "withdrawn-center")) {
    throw new Error("Task 11 gallery capture does not contain seven ready surfaces at the withdrawal camera");
  }
  if (resolved.group === "end-card" && (observation.endCard?.titleCount !== 1 || observation.endCard?.iopCount !== 1 || observation.endCard?.titleOpacity < 0.99 || observation.endCard?.iopOpacity < 0.99)) {
    throw new Error("Task 11 end-card capture does not preserve the one-title/one-IOP hierarchy");
  }
}

export async function renderTask11Evidence({ projectRoot = PROJECT_ROOT } = {}) {
  const repositoryRoot = path.resolve(projectRoot, "..", "..");
  if (repositoryRoot !== REPOSITORY_ROOT) throw new Error("Task 11 evidence must be generated from the repository PV project");
  await mkdir(LOCAL_FRAME_DIRECTORY, { recursive: true });
  await mkdir(ARTIFACT_DIRECTORY, { recursive: true });
  const mix = JSON.parse(await readFile(path.join(projectRoot, "audio", "mix.json"), "utf8"));
  const sourceAudioPath = path.join(REPOSITORY_ROOT, ...mix.composition.outputFile.split("/"));
  const sourceAudioSha256 = await sha256File(sourceAudioPath);
  if (sourceAudioSha256 !== mix.output.sha256) throw new Error("Task 11 refuses to capture against an unauthenticated final mix");
  const visualContract = await buildTask11VisualContract({ projectRoot });
  const evidenceToolContract = await buildTask11EvidenceToolContract({ projectRoot });

  const server = await startStaticServer({ root: projectRoot });
  const browser = await chromium.launch({ headless: true });
  const frames = [];
  try {
    const page = await browser.newPage({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: VIEWPORT.deviceScaleFactor });
    await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.__pvRenderReadyPromise);
    if (!await page.evaluate(() => window.__renderReady === true)) throw new Error("HyperFrames boolean readiness gate is not true after authentication");

    for (const planned of task11CapturePlan) {
      const resolved = await resolveCapture(page, planned);
      const observation = await settleAndObserve(page, resolved);
      if (!observation.renderReady) throw new Error(`Task 11 capture ${planned.id} lost render readiness`);
      if (Math.abs(observation.timelineTime - resolved.seekSeconds) > 1e-6) throw new Error(`Task 11 capture ${planned.id} did not seek exactly`);
      assertSemanticCapture(resolved, observation);
      const localPath = path.join(LOCAL_FRAME_DIRECTORY, `${String(frames.length + 1).padStart(2, "0")}-${planned.id}.png`);
      const png = await page.screenshot({ path: localPath, type: "png" });
      frames.push(Object.freeze({
        ...resolved,
        localFramePath: repositoryRelative(localPath),
        pngSha256: sha256Buffer(png),
        observation
      }));
    }

    const contactFrames = await Promise.all(frames.map(async (item) => ({
      ...item,
      dataUrl: `data:image/png;base64,${(await readFile(path.join(REPOSITORY_ROOT, ...item.localFramePath.split("/")))).toString("base64")}`
    })));
    const sheet = await browser.newPage({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: 1 });
    await sheet.setContent(contactSheetMarkup(contactFrames), { waitUntil: "load", timeout: 120_000 });
    await sheet.screenshot({ path: CONTACT_SHEET_PATH, type: "png" });
  } finally {
    await browser.close();
    await server.close();
  }

  await writeFile(ANIMATION_MAP_PATH, buildAnimationMap(frames, mix), "utf8");
  const contactSheetSha256 = await sha256File(CONTACT_SHEET_PATH);
  const animationMapSha256 = await sha256File(ANIMATION_MAP_PATH);
  const evidence = Object.freeze({
    task: "task11-output",
    title: ACCEPTED_TITLE,
    viewport: VIEWPORT,
    visualContract,
    evidenceToolContract,
    frameStrategy: Object.freeze({
      logicalDurationSeconds: LOGICAL_DURATION_SECONDS,
      fps: FPS,
      totalFrames: TOTAL_FRAMES,
      pictureDurationSeconds: PICTURE_DURATION_SECONDS,
      preservedAudioSeconds: LOGICAL_DURATION_SECONDS,
      appendedSilenceSeconds: PICTURE_DURATION_SECONDS - LOGICAL_DURATION_SECONDS
    }),
    sourceAudio: Object.freeze({
      path: mix.composition.outputFile,
      sha256: sourceAudioSha256,
      bytes: mix.output.bytes,
      renderContractSha256: mix.output.renderContractSha256
    }),
    captions: Object.freeze({ count: captionCues.length, singleLine: true, unicodePunctuationCount: captionCues.filter(({ text }) => /[\p{P}\p{S}]/u.test(text)).length }),
    frames: Object.freeze(frames),
    artifacts: Object.freeze({
      contactSheet: Object.freeze({ path: repositoryRelative(CONTACT_SHEET_PATH), sha256: contactSheetSha256, width: 3840, height: 2160 }),
      animationMap: Object.freeze({ path: repositoryRelative(ANIMATION_MAP_PATH), sha256: animationMapSha256, width: 3840, height: 2160 })
    })
  });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--contract-json")) {
    console.log(JSON.stringify(await buildTask11VisualContract()));
  } else if (process.argv.includes("--evidence-contract-json")) {
    console.log(JSON.stringify(await buildTask11EvidenceToolContract()));
  } else {
    const evidence = await renderTask11Evidence();
    console.log(`Task 11 evidence: ${evidence.frames.length} native-4K frames, ${evidence.artifacts.contactSheet.path}, ${evidence.artifacts.animationMap.path}.`);
  }
}

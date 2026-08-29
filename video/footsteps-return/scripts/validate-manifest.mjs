import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assets } from "../src/data/assets.js";
import { chapters } from "../src/data/chapters.js";
import { narrationCueById, narrationCues } from "../src/data/narration.js";
import { masterTimeline } from "../src/data/timeline.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const generatedPathSegment = /(^|\/)(?:captures|renders|\.hyperframes)(?:\/|$)/;
const driveLetterPath = /^[A-Za-z]:[\\/]/;
const urlPath = /^[a-z][a-z0-9+.-]*:\/\//i;

function fail(message) {
  throw new Error(`PV manifest validation: ${message}`);
}

function isRepositoryRelative(assetPath) {
  return typeof assetPath === "string"
    && assetPath.length > 0
    && !path.isAbsolute(assetPath)
    && !driveLetterPath.test(assetPath)
    && !urlPath.test(assetPath)
    && !assetPath.includes("\\")
    && !assetPath.split("/").includes("..");
}

export function validateAssets(assetList, root = repositoryRoot) {
  if (!Array.isArray(assetList)) fail("assets must be an array");
  const ids = new Set();
  for (const asset of assetList) {
    if (!asset || typeof asset.id !== "string" || !asset.id) fail("every asset needs a stable id");
    if (ids.has(asset.id)) fail(`duplicate asset id ${asset.id}`);
    ids.add(asset.id);
    if (!isRepositoryRelative(asset.path)) fail(`asset ${asset.id} path must be repository-relative`);
    if (generatedPathSegment.test(asset.path)) fail(`asset ${asset.id} cannot point to generated-output paths`);
    if (asset.sourceUrl && !asset.provenance) fail(`asset ${asset.id} source URL requires provenance`);
    if (asset.sourceUrl && !urlPath.test(asset.sourceUrl)) fail(`asset ${asset.id} source URL must be a URL`);
    const absolutePath = path.resolve(root, ...asset.path.split("/"));
    const relative = path.relative(root, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) fail(`asset ${asset.id} path must stay inside the repository`);
    if (!fs.existsSync(absolutePath)) fail(`asset ${asset.id} is missing: ${asset.path}`);
  }
}

function validateNarration() {
  const ids = new Set();
  narrationCues.forEach((cue) => {
    if (!cue.id || ids.has(cue.id)) fail(`invalid narration cue id ${cue.id}`);
    ids.add(cue.id);
    if (cue.speakerRole !== "narrator") fail(`narration cue ${cue.id} must use narrator role`);
    if (!cue.semanticGroup) fail(`narration cue ${cue.id} needs a semantic group`);
    if (!(cue.estimatedDuration > 0)) fail(`narration cue ${cue.id} needs a positive estimated duration`);
  });
}

export function validateTimeline(timeline) {
  if (!timeline || !(timeline.duration >= 0)) fail("master timeline needs a non-negative duration");
  const narration = Array.isArray(timeline.narration) ? timeline.narration : [];
  const audio = Array.isArray(timeline.audio) ? timeline.audio : [];
  const subtitleGroups = [...narration].sort((a, b) => a.start - b.start || a.duration - b.duration);
  let lastSubtitleEnd = 0;
  let lastSubtitleId;
  let lastAudioEnd = 0;
  for (const cue of subtitleGroups) {
    if (!(cue.start >= 0 && cue.duration > 0) || !cue.cueId || !cue.subtitleGroupId) fail("narration timeline entries need cue, subtitle group, start, and positive duration");
    if (cue.start < lastSubtitleEnd) fail(`subtitle groups overlap: ${lastSubtitleId} and ${cue.subtitleGroupId}`);
    lastSubtitleEnd = cue.start + cue.duration;
    lastSubtitleId = cue.subtitleGroupId;
    lastAudioEnd = Math.max(lastAudioEnd, lastSubtitleEnd);
  }
  for (const cue of audio) {
    if (!(cue.start >= 0 && cue.duration >= 0)) fail(`audio cue ${cue.id ?? "unknown"} needs a non-negative range`);
    lastAudioEnd = Math.max(lastAudioEnd, cue.start + cue.duration);
  }
  if (timeline.duration < lastAudioEnd) fail(`master timeline is shorter than the last narration/audio cue (${lastAudioEnd}s)`);
}

function validateScenes() {
  const sceneIds = new Set();
  const chapterIds = new Set(chapters.map(({ id }) => id));
  masterTimeline.scenes.forEach((scene) => {
    if (!scene.id || sceneIds.has(scene.id)) fail(`invalid scene id ${scene.id}`);
    sceneIds.add(scene.id);
    if (!(scene.start >= 0 && scene.duration >= 0)) fail(`scene ${scene.id} needs a non-negative duration`);
    if (!scene.transition || typeof scene.transition.kind !== "string") fail(`scene ${scene.id} needs a transition contract`);
    if (scene.chapterId && !chapterIds.has(scene.chapterId)) fail(`scene ${scene.id} references an unknown chapter`);
    if (scene.kind === "chapter-card" && scene.narrationCueIds.length !== 0) fail(`chapter card ${scene.id} cannot contain narration`);
    scene.narrationCueIds.forEach((cueId) => {
      if (!narrationCueById[cueId]) fail(`scene ${scene.id} references unknown narration ${cueId}`);
    });
    if (scene.start + scene.duration > masterTimeline.duration) fail(`scene ${scene.id} exceeds the master duration`);
  });
}

export function validateManifest({ root = repositoryRoot } = {}) {
  validateAssets(assets, root);
  validateNarration();
  validateScenes();
  validateTimeline(masterTimeline);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateManifest();
    console.log("PV manifest is valid.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

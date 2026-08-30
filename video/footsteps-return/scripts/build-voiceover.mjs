import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { narrationCues } from "../src/data/narration.js";
import { buildCaptionArtifacts, measureCaptionLayout } from "./build-captions.mjs";

const buildScriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(buildScriptPath);
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const voiceoverRoot = path.join(repositoryRoot, "video", "footsteps-return", "audio", "voiceover");
const sourceScriptPath = path.join(voiceoverRoot, "script.json");
const timingPath = path.join(voiceoverRoot, "timing.json");
const reviewPath = path.join(voiceoverRoot, "review.json");
const generatorPath = "video/footsteps-return/scripts/generate_final_voiceover.py";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function requireSuccessful(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
}

export function validateFinalScript(script) {
  const approved = narrationCues.map(({ id, semanticGroup, spokenText }) => ({ id, semanticGroup, text: spokenText }));
  const actual = script.cues.map(({ id, semanticGroup, text }) => ({ id, semanticGroup, text }));
  if (JSON.stringify(actual) !== JSON.stringify(approved)) {
    throw new Error("script.json must preserve the approved 21-cue narration order and wording verbatim");
  }
  const voice = script.voice;
  if (script.purpose !== "final-release-narration"
    || voice.engine !== "Qwen3-TTS VoiceDesign"
    || voice.selectedAuditionId !== "F"
    || voice.selectedVoiceId !== "cold-witness"
    || voice.generationMethod !== "generate_voice_design"
    || Object.hasOwn(voice, "fallback")) {
    throw new Error("script.json must select only F cold-witness through the official VoiceDesign path");
  }
}

export function runFinalVoiceGenerator(args = []) {
  return spawnSync("uv", ["run", "--locked", "python", generatorPath, ...args], {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: { ...process.env, PYTHONUTF8: "1" }
  });
}

export async function buildVoiceover({
  script = readJson(sourceScriptPath),
  generator = runFinalVoiceGenerator
} = {}) {
  validateFinalScript(script);
  requireSuccessful(generator([]), "pinned Qwen VoiceDesign final cue generation");
  const captions = buildCaptionArtifacts({ script, timing: readJson(timingPath) });
  const measurements = await measureCaptionLayout(captions.captions);
  requireSuccessful(generator(["--finalize"]), "final voice review WAV and ASR evidence");

  const widest = measurements.reduce((best, current) => current.width > best.width ? current : best, measurements[0]);
  const timing = readJson(timingPath);
  const review = readJson(reviewPath);
  console.log(`✓ ${timing.cues.length} final F/cold-witness cue WAVs; ${timing.masterDurationSeconds.toFixed(3)}s master; ASR ${review.asr.status}; widest caption ${widest.id} ${widest.width.toFixed(2)}px/${widest.safeWidth}px.`);
  return { timing, review, captions: captions.captions, measurements };
}

if (process.argv[1] && path.resolve(process.argv[1]) === buildScriptPath) {
  const verifyOnly = process.argv.includes("--verify");
  const operation = verifyOnly
    ? Promise.resolve(requireSuccessful(runFinalVoiceGenerator(["--verify"]), "final voice verification"))
    : buildVoiceover();
  operation.catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}

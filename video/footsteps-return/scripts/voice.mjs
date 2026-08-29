import { fileURLToPath } from "node:url";
import path from "node:path";
import { runHyperframes } from "./hyperframes-cli.mjs";

export const voiceOutput = "video/footsteps-return/captures/narration.wav";

function hasOutputArgument(args) {
  return args.some((arg) => arg === "-o" || arg === "-out" || arg === "--output" || arg.startsWith("--output="));
}

export function buildVoiceArgs(args) {
  if (args.length === 0) {
    throw new Error("Narration text or a text file is required. Use: npm run pv:voice -- <text-or-file>");
  }
  if (hasOutputArgument(args)) {
    throw new Error("Narration output is fixed under video/footsteps-return/captures/.");
  }
  return ["tts", ...args, "--output", voiceOutput];
}

function main() {
  const result = runHyperframes(buildVoiceArgs(process.argv.slice(2)));
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

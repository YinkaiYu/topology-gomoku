import { fileURLToPath } from "node:url";
import path from "node:path";
import { runHyperframes } from "./hyperframes-cli.mjs";

export const captureOutput = "video/footsteps-return/captures/website";

function hasOutputArgument(args) {
  return args.some((arg) => arg === "-o" || arg === "--output" || arg.startsWith("--output="));
}

export function buildCaptureArgs(args) {
  if (args.length === 0) {
    throw new Error("A URL is required. Use: npm run pv:capture -- <URL>");
  }
  if (args.includes("--")) {
    throw new Error("The literal -- is not allowed because it can bypass the fixed PV capture output path.");
  }
  if (hasOutputArgument(args)) {
    throw new Error("Capture output is fixed under video/footsteps-return/captures/.");
  }
  return ["capture", ...args, "--output", captureOutput];
}

function main() {
  const result = runHyperframes(buildCaptureArgs(process.argv.slice(2)));
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const cli = path.join(repositoryRoot, "node_modules", "hyperframes", "bin", "hyperframes.mjs");

export function runHyperframes(args, { env = process.env } = {}) {
  return spawnSync(process.execPath, [cli, ...args], { stdio: "inherit", env });
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalMixRenderContract } from "../src/runtime/mix-contract.js";

const mixPath = process.argv[2];
if (!mixPath) {
  throw new Error("Usage: node hash-mix-contract.mjs <mix.json>");
}

const mix = JSON.parse(readFileSync(resolve(mixPath), "utf8"));
process.stdout.write(`${createHash("sha256").update(canonicalMixRenderContract(mix)).digest("hex")}\n`);

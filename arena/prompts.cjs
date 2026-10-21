"use strict";
const fs = require("node:fs");
const path = require("node:path");
const files = new Set(["invitation.md", "player.md", "commentator.md", "mcp.md", "tools.json", "rules.json"]);
function readPrompt(name) {
  if (!files.has(name)) throw new Error("Unknown prompt file.");
  return fs.readFileSync(path.join(__dirname, "prompts", name), "utf8").trim();
}
module.exports = { readPrompt };

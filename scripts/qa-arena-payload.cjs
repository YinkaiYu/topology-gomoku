"use strict";

// Synthetic fixtures only. Nothing is read from a running Arena or its records.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const { Arena } = require("../arena/match.cjs");
const ROOT = path.resolve(__dirname, "..");
const BASE = "bd7b447";
const bytes = value => Buffer.byteLength(JSON.stringify(value), "utf8");

function avatarPng() {
  const crc32 = data => {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const kind = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
    size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([kind, data])));
    return Buffer.concat([size, kind, data, crc]);
  };
  const width = 80, height = 64, header = Buffer.alloc(13), raw = Buffer.alloc(height * (1 + width * 4));
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  let random = 123456789;
  for (let y = 0; y < height; y++) for (let x = 1; x <= width * 4; x++) {
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
    raw[y * (width * 4 + 1) + x] = random & 255;
  }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

function historicalArena() {
  const source = relative => execFileSync("git", ["show", `${BASE}:${relative}`], { cwd: ROOT, encoding: "utf8" });
  const promptReader = { readPrompt: name => source(`arena/prompts/${name}`).trim() };
  const compile = (relative, overrides) => {
    const filename = path.join(ROOT, relative), loaded = new Module(filename, module);
    loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const normalRequire = loaded.require.bind(loaded);
    loaded.require = id => Object.hasOwn(overrides, id) ? overrides[id] : normalRequire(id);
    loaded._compile(source(relative), filename);
    return loaded.exports;
  };
  const guidance = compile("arena/guidance.cjs", { "./prompts.cjs": promptReader });
  return compile("arena/match.cjs", { "./prompts.cjs": promptReader, "./guidance.cjs": guidance }).Arena;
}

function seed(ArenaClass, notePairs = 30) {
  const arena = typeof ArenaClass === "function" ? new ArenaClass({ now: () => 1800000000000 }) : ArenaClass;
  const host = { hostAuthorized: true };
  const avatar = avatarPng();
  const created = arena.call("arena_create", { topology: "mobius", mode: "duel", width: 7, height: 7, clock: null,
    players: { black: { name: "Example Black", avatar }, white: { name: "Example White", avatar } } }, host);
  const gameId = created.gameId, tokens = {};
  for (const role of ["black", "white", "commentator"]) {
    const invitation = arena.call("arena_invite", { gameId, role }, host);
    tokens[role] = arena.call("arena_join", { ...invitation, name: `example-${role}` }).token;
  }
  arena.call("arena_ready", { gameId, token: tokens.black });
  arena.call("arena_ready", { gameId, token: tokens.white });
  arena.call("arena_move", { gameId, token: tokens.black, cell: "D4", expectedVersion: 0, requestId: "open-black" });
  arena.call("arena_move", { gameId, token: tokens.white, cell: "E4", expectedVersion: 1, requestId: "open-white" });
  const afterSeq = arena.call("arena_state", { gameId, token: tokens.black }).eventSeq;
  for (let n = 0; n < notePairs; n++) for (const role of ["black", "white"]) {
    arena.call("arena_note", { gameId, token: tokens[role], text: `${role}-private-${n} ${"Synthetic sentence. ".repeat(20)}`, ply: 2, requestId: `${role}-${n}` });
  }
  return { arena, gameId, tokens, afterSeq, avatar, host };
}

function measure(ArenaClass) {
  const fixture = seed(ArenaClass), { arena, gameId, tokens, afterSeq } = fixture;
  try {
    const args = { gameId, token: tokens.black };
    const state = arena.call("arena_state", args);
    const delta = arena.call("arena_state", { ...args, afterSeq });
    const rules = arena.call("arena_rules", args);
    const pathResult = arena.call("arena_rules", { ...args, cell: "D4", direction: 0, length: 5 });
    const note = arena.call("arena_note", { ...args, text: "One more synthetic sentence.", ply: 2, requestId: "receipt" });
    const move = arena.call("arena_move", { ...args, cell: "D5", expectedVersion: 2, requestId: "third-move" });
    const replay = arena.call("arena_replay", args);
    return Object.fromEntries(Object.entries({ state, waitDelta: delta, note, move, path: pathResult, fullRules: rules, replayPage: replay }).map(([name, value]) => [name, bytes(value)]));
  } finally { arena.close(); }
}

function main() {
  const before = measure(historicalArena()), after = measure(Arena);
  const report = { baseline: BASE, fixture: "7x7 Mobius; untimed; two valid uploaded PNG avatars; two moves; 30 synthetic notes per player; black perspective", units: "UTF-8 bytes of compact JSON result (not token estimates or transport envelopes)", measurements: Object.fromEntries(Object.keys(before).map(name => [name, { before: before[name], after: after[name], reductionPercent: Number(((1 - after[name] / before[name]) * 100).toFixed(2)) }])) };
  const output = path.join(ROOT, "artifacts/arena-lean-protocol/payload-results.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { seed, avatarPng, bytes };
if (require.main === module) main();

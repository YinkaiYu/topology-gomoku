"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { Arena } = require("../arena/match.cjs");
const Coordinates = require("../arena/public/coordinates.js");
const HOST = { hostAuthorized: true };
function setup(options = {}, create = {}) {
  let now = 1000;
  const arena = new Arena({ now: () => now, ...options });
  const { gameId } = arena.call("arena_create", { topology: "mobius", mode: "duel", width: 7, height: 7, ...create }, HOST);
  const tokens = {};
  for (const role of create.mode === "ai" ? ["black"] : ["black", "white"]) {
    tokens[role] = arena.call("arena_join", { ...arena.call("arena_invite", { gameId, role }, HOST), name: role }).token;
  }
  const state = () => arena.call("arena_state", { gameId });
  const control = action => arena.call("arena_control", { gameId, action }, HOST);
  const move = (cell, role = state().turn, requestId = `move-${state().ply}`) => arena.call("arena_move", { gameId, token: tokens[role], cell, expectedVersion: state().version, requestId });
  return { arena, gameId, tokens, state, control, move, advance: ms => { now += ms; } };
}
test("a 5+5 clock starts on play, charges only the active player and increments once per accepted move", () => {
  const g = setup();
  g.advance(600000);
  assert.equal(g.state().clock.active, null);
  assert.deepEqual(g.state().clock.remainingMs, { black: 300000, white: 300000 });
  g.control("start"); g.advance(12000);
  const args = { gameId: g.gameId, token: g.tokens.black, cell: "D4", expectedVersion: 0, requestId: "first" };
  const moved = g.arena.call("arena_move", args);
  assert.deepEqual(moved.clock.remainingMs, { black: 293000, white: 300000 });
  assert.equal(moved.clock.active, "white");
  assert.equal(moved.moves[0].coordinate, "D4");
  g.advance(3000);
  assert.equal(g.arena.call("arena_move", { ...args, cell: 24 }).duplicate, true);
  assert.deepEqual(g.state().clock.remainingMs, { black: 293000, white: 297000 });
  g.arena.call("arena_note", { gameId: g.gameId, token: g.tokens.white, text: "再看看左边。", ply: 1, requestId: "note" });
  g.arena.call("arena_draw", { gameId: g.gameId, token: g.tokens.white, expectedVersion: 1, action: "offer", requestId: "offer" });
  g.advance(4000);
  assert.deepEqual(g.state().clock.remainingMs, { black: 293000, white: 293000 });
  const rules = g.arena.call("arena_rules", { gameId: g.gameId, token: g.tokens.white });
  assert.deepEqual(rules.clock, g.state().clock);
  g.control("pause"); g.advance(1000000);
  assert.deepEqual(g.state().clock.remainingMs, { black: 293000, white: 293000 });
  assert.equal(g.state().clock.deadline, null);
  g.control("resume"); g.advance(2000); g.move("E4");
  assert.deepEqual(g.state().clock.remainingMs, { black: 293000, white: 296000 });
});
test("time expires at the deadline without a player call; late moves, draw responses and AI cannot revive the match", () => {
  for (const mode of ["duel", "ai"]) {
    const g = setup({}, { mode, clock: { initialMs: 1000, incrementMs: 0 } });
    g.control("start"); g.advance(1000);
    assert.equal(g.arena.tick(), true);
    const ended = g.state();
    assert.equal(ended.phase, "ended"); assert.equal(ended.winner, "white"); assert.equal(ended.winReason, "timeout");
    assert.equal(ended.ply, 0); assert.equal(ended.version, 0); assert.equal(ended.clock.active, null);
    assert.deepEqual(ended.clock.remainingMs, { black: 0, white: 1000 });
    assert.throws(() => g.move("D4", "black"), { code: "NOT_PLAYING" });
    assert.throws(() => g.arena.call("arena_draw", { gameId: g.gameId, token: g.tokens.black, expectedVersion: 0, requestId: "late", action: "offer" }), { code: "NOT_PLAYING" });
    g.advance(100000); g.arena.tick();
    assert.equal(g.state().eventSeq, ended.eventSeq);
    assert.equal(g.state().ply, 0);
  }
  const g = setup({}, { clock: { initialMs: 1000, incrementMs: 0 } });
  g.control("start"); g.move("D4"); g.advance(1000);
  // No tick in between: an incoming move must still adjudicate the expired clock first.
  assert.throws(() => g.arena.call("arena_move", { gameId: g.gameId, token: g.tokens.white, cell: "E4", expectedVersion: 1, requestId: "late" }), { code: "NOT_PLAYING" });
  assert.equal(g.state().winner, "black"); assert.equal(g.state().ply, 1);
});
test("invalid moves do not stop or increment the clock; resignation and agreement stop it", () => {
  for (const end of ["resign", "draw"]) {
    const g = setup(); g.control("start"); g.move("D4"); g.advance(1000);
    assert.throws(() => g.move("D4"), { code: "ILLEGAL_MOVE" });
    assert.equal(g.state().clock.active, "white");
    g.advance(1000); assert.equal(g.state().clock.remainingMs.white, 298000);
    const common = { gameId: g.gameId, expectedVersion: 1 };
    if (end === "resign") g.arena.call("arena_resign", { ...common, token: g.tokens.black, requestId: "resign" });
    else {
      const offer = g.arena.call("arena_draw", { ...common, token: g.tokens.black, requestId: "offer", action: "offer" });
      g.arena.call("arena_draw", { ...common, token: g.tokens.white, requestId: "accept", action: "accept", offerId: offer.drawOffer.id });
    }
    const remaining = g.state().clock.remainingMs;
    g.advance(1000000);
    assert.deepEqual(g.state().clock.remainingMs, remaining); assert.equal(g.state().clock.active, null);
  }
});
test("clock checkpoints survive restart without charging downtime and legacy matches remain untimed", t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-clock-"));
  const g = setup({ dataDir }); let restored;
  t.after(() => { restored?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  g.control("start"); g.advance(23456); g.arena.close();
  restored = new Arena({ dataDir, now: () => 99999999 });
  const state = restored.call("arena_state", { gameId: g.gameId });
  assert.equal(state.phase, "paused"); assert.equal(state.clock.active, null);
  assert.equal(state.clock.remainingMs.black, 276544);
  restored.call("arena_control", { gameId: g.gameId, action: "resume" }, HOST);
  assert.equal(restored.call("arena_state", { gameId: g.gameId }).clock.remainingMs.black, 276544);
  restored.close();
  const file = path.join(dataDir, `match-${g.gameId}.json`), saved = JSON.parse(fs.readFileSync(file));
  delete saved.clock; fs.writeFileSync(file, JSON.stringify(saved));
  restored = new Arena({ dataDir });
  assert.equal(restored.call("arena_state", { gameId: g.gameId }).clock, null);
});
test("A1 coordinates round-trip on every supported board size, with bottom-left origin and no skipped column", () => {
  for (let width = 5; width <= 19; width++) for (let height = 5; height <= 19; height++) {
    for (let cell = 0; cell < width * height; cell++) assert.equal(Coordinates.cell(Coordinates.label(cell, width, height), width, height), cell);
  }
  assert.equal(Coordinates.label(0, 7, 7), "A7"); assert.equal(Coordinates.label(42, 7, 7), "A1");
  assert.equal(Coordinates.cell("H8", 19, 19), 216); assert.equal(Coordinates.cell("I1", 19, 19), 350);
  for (const cell of ["H1", "A8", "A0", "A01", "1A", "A1 ", "0", 49, -1, 1.5, null]) assert.equal(Coordinates.cell(cell, 7, 7), null);
  const g = setup();
  const rules = g.arena.call("arena_rules", { gameId: g.gameId, cell: "G7", direction: 1, length: 3 });
  assert.deepEqual(rules.path.coordinates, ["G7", "A2", "B3"]);
  assert.equal(rules.next.coordinate, "A2");
  const cycle = g.arena.call("arena_rules", { gameId: g.gameId, cell: "D4", direction: 0, length: 9 });
  assert.equal(cycle.path.stop.coordinate, "C4"); assert.equal(cycle.path.stop.next.coordinate, "D4");
});

test("clock configuration is bounded, and explicitly untimed games never expire", () => {
  for (const clock of [{}, true, { initialMs: 0, incrementMs: 0 }, { initialMs: 3600001, incrementMs: 0 },
    { initialMs: 1000, incrementMs: -1 }, { initialMs: 1000, incrementMs: 60001 }, { initialMs: 1000.5, incrementMs: 0 }]) {
    assert.throws(() => setup({}, { clock }), { code: "INVALID_CLOCK" });
  }
  const g = setup({}, { clock: null }); g.control("start"); g.advance(100000000);
  assert.equal(g.state().phase, "playing"); assert.equal(g.state().clock, null);
  g.move("A1"); assert.equal(g.state().moves[0].coordinate, "A1");
});

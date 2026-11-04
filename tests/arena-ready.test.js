"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { Arena } = require("../arena/match.cjs");
const HOST = { hostAuthorized: true };

function setup(options = {}, create = {}) {
  let now = 1000;
  const arena = new Arena({ now: () => now, ...options });
  const { gameId } = arena.call("arena_create", { mode: "duel", topology: "mobius", ...create }, HOST);
  const tokens = {};
  const join = role => {
    const invite = arena.call("arena_invite", { gameId, role }, HOST);
    const joined = arena.call("arena_join", { ...invite, name: role });
    tokens[role] = joined.token;
    return joined;
  };
  const state = () => arena.call("arena_state", { gameId });
  const ready = role => arena.call("arena_ready", { gameId, token: tokens[role] });
  const control = action => arena.call("arena_control", { gameId, action }, HOST);
  return { arena, gameId, tokens, join, state, ready, control, advance: ms => { now += ms; } };
}

test("joining and reading rules leave both clocks stopped until both players explicitly ready", () => {
  const g = setup();
  const joined = g.join("black"); g.join("white");
  assert.equal(joined.state.seats.black.ready, false);
  assert.equal(joined.state.guidance.action, "prepare");
  g.arena.call("arena_rules", { gameId: g.gameId, token: g.tokens.black });
  g.advance(600000); g.arena.tick();
  assert.equal(g.state().phase, "waiting");
  assert.deepEqual(g.state().clock.remainingMs, { black: 300000, white: 300000 });
  assert.throws(() => g.control("start"), { code: "SEATS_NOT_READY" });
  const first = g.ready("white");
  assert.equal(first.guidance.action, "wait"); assert.equal(first.phase, "waiting");
  assert.equal(first.seats.white.ready, true); assert.equal(first.seats.black.ready, false);
  assert.throws(() => g.control("start"), { code: "SEATS_NOT_READY" });
  g.advance(120000); const last = g.ready("black");
  assert.equal(last.phase, "playing"); assert.equal(last.turn, "black");
  assert.equal(last.clock.active, "black"); assert.equal(last.clock.remainingMs.black, 300000);
  assert.equal(last.guidance.action, "act");
  assert.equal(last.version, 0); assert.equal(last.ply, 0);
  assert.equal(last.events.filter(e => e.type === "ready").length, 2);
  assert.equal(last.events.filter(e => e.type === "control" && e.action === "start").length, 1);
  g.advance(12345);
  const repeat = g.ready("black");
  assert.equal(repeat.clock.remainingMs.black, 287655);
  assert.equal(repeat.clock.deadline, last.clock.deadline);
  assert.equal(repeat.eventSeq, last.eventSeq);
  g.control("pause");
  assert.equal(g.ready("white").phase, "paused", "Retry cannot resume a host-paused match");
  g.control("stop"); assert.equal(g.ready("black").phase, "ended", "Retry cannot revive a finished match");
});

test("readiness requires a player token; late joins do not implicitly ready and reconnects preserve readiness", () => {
  const g = setup(); g.join("black"); g.join("commentator");
  assert.throws(() => g.arena.call("arena_ready", { gameId: g.gameId }), { code: "TOKEN_REQUIRED" });
  assert.throws(() => g.arena.call("arena_ready", { gameId: g.gameId, token: "unknown" }), { code: "INVALID_TOKEN" });
  assert.throws(() => g.ready("commentator"), { code: "PLAYER_REQUIRED" });
  g.ready("black");
  const before = g.state().eventSeq;
  assert.equal(g.join("black").state.seats.black.ready, true);
  assert.equal(g.state().eventSeq, before);
  const late = g.join("white");
  assert.equal(late.state.phase, "waiting"); assert.equal(late.state.seats.white.ready, false);
  g.control("stop");
  assert.throws(() => g.ready("white"), { code: "NOT_PREPARING" });
});

test("single-player preparation starts only after the external player is ready", () => {
  const g = setup({}, { mode: "ai" });
  const joined = g.join("black");
  assert.equal(joined.state.seats.white.ready, true);
  assert.equal(joined.state.phase, "waiting");
  g.advance(500000); g.arena.tick(); assert.equal(g.state().ply, 0);
  assert.equal(g.ready("black").phase, "playing");
  assert.equal(g.state().clock.remainingMs.black, 300000);
});

test("preparation survives restart without auto-start; legacy waiting needs readiness while started games can resume", t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-ready-"));
  let restored;
  t.after(() => { restored?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const g = setup({ dataDir }); g.join("black"); g.join("white"); g.ready("black");
  g.arena.close(); restored = new Arena({ dataDir, now: () => 9000000 });
  let state = restored.call("arena_state", { gameId: g.gameId });
  assert.equal(state.phase, "waiting"); assert.equal(state.clock.active, null);
  assert.equal(state.seats.black.ready, true); assert.equal(state.seats.white.ready, false);
  restored.close();
  const file = path.join(dataDir, `match-${g.gameId}.json`), saved = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const seat of Object.values(saved.seats)) delete seat.ready;
  fs.writeFileSync(file, JSON.stringify(saved));
  restored = new Arena({ dataDir, now: () => 9000000 });
  state = restored.call("arena_state", { gameId: g.gameId });
  assert.equal(state.seats.black.ready, false); assert.equal(state.seats.white.ready, false);
  for (const token of Object.values(g.tokens)) restored.call("arena_ready", { gameId: g.gameId, token });
  restored.close();
  const playing = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const seat of Object.values(playing.seats)) delete seat.ready;
  fs.writeFileSync(file, JSON.stringify(playing));
  restored = new Arena({ dataDir, now: () => 99999999 });
  state = restored.call("arena_state", { gameId: g.gameId });
  assert.equal(state.phase, "paused"); assert.equal(state.clock.active, null);
  assert.equal(state.seats.black.ready, true); assert.equal(state.seats.white.ready, true);
  assert.equal(restored.call("arena_control", { gameId: g.gameId, action: "resume" }, HOST).phase, "playing");
});

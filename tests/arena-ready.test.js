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

test("joining and reading rules leave clocks stopped during preparation; both ready start early", () => {
  const g = setup();
  const joined = g.join("black"); g.join("white");
  assert.equal(joined.state.seats.black.ready, false);
  assert.equal(joined.state.guidance.action, "prepare");
  g.arena.call("arena_rules", { gameId: g.gameId, token: g.tokens.black });
  g.advance(10000); g.arena.tick();
  assert.equal(g.state().phase, "waiting");
  assert.deepEqual(g.state().clock.remainingMs, { black: 300000, white: 300000 });
  assert.throws(() => g.control("start"), { code: "SEATS_NOT_READY" });
  const first = g.ready("white");
  assert.equal(first.guidance.action, "wait"); assert.equal(first.phase, "waiting");
  assert.equal(first.seats.white.ready, true); assert.equal(first.seats.black.ready, false);
  assert.throws(() => g.control("start"), { code: "SEATS_NOT_READY" });
  g.advance(10000); const last = g.ready("black");
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

test("single-player preparation can finish early when the external player is ready", () => {
  const g = setup({}, { mode: "ai" });
  const joined = g.join("black");
  assert.equal(joined.state.seats.white.ready, true);
  assert.equal(joined.state.phase, "waiting");
  g.advance(10000); g.arena.tick(); assert.equal(g.state().ply, 0);
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
  delete saved.preparation; delete saved.playPolicy;
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

test("play policy fixes preparation allowance and joining delivers the complete policy", () => {
  for (const [playPolicy, durationMs] of [["direct", 60000], ["assisted", 300000]]) {
    const g = setup({}, { playPolicy });
    const first = g.join("black");
    assert.equal(first.state.playPolicy, playPolicy);
    assert.equal(first.rules.playPolicy, playPolicy);
    assert.equal(first.rules.preparation.durationMs, durationMs);
    assert.equal(first.rules.preparation.deadline, null);
    assert.match(first.rules.playPolicyRule, playPolicy === "direct" ? /仅允许推理/ : /允许自制工具/);
    assert.ok(first.rules.preparationRule.includes(`${durationMs / 60000} 分钟`));
    g.advance(900000); g.arena.tick();
    assert.equal(g.state().phase, "waiting", "One seat alone never starts the deadline");
    g.join("commentator");
    assert.equal(g.state().preparation.deadline, null);
    const both = g.join("white").state;
    assert.equal(both.preparation.startedAt, 901000);
    assert.equal(both.preparation.deadline, 901000 + durationMs);
    assert.equal(both.preparation.remainingMs, durationMs);
    assert.equal(g.join("white").state.preparation.deadline, both.preparation.deadline, "Reconnect cannot reset preparation");
    assert.equal(g.arena.call("arena_list").matches[0].playPolicy, playPolicy);
    g.advance(durationMs - 1); g.arena.tick();
    assert.equal(g.state().phase, "waiting");
    assert.throws(() => g.control("start"), { code: "SEATS_NOT_READY" });
    g.advance(1); assert.equal(g.arena.tick(), true);
    const started = g.state();
    assert.equal(started.phase, "playing");
    assert.equal(started.clock.active, "black");
    assert.equal(started.clock.remainingMs.black, 300000);
    assert.equal(started.preparation.completedAt, both.preparation.deadline);
    assert.equal(started.preparation.deadline, null);
    assert.equal(started.preparation.remainingMs, 0);
    assert.equal(started.seats.black.ready, false, "Auto-start does not claim the player confirmed ready");
    assert.equal(g.ready("black").eventSeq, started.eventSeq, "Late ready returns current play without resetting time");
    g.control("pause"); g.advance(90000); g.control("resume");
    assert.equal(g.state().clock.remainingMs.black, 300000);
  }
  const g = setup();
  assert.equal(g.state().playPolicy, "direct");
  for (const playPolicy of [null, "legacy", "unknown", [], ["direct"], {}, 1]) {
    assert.throws(() => g.arena.call("arena_create", { mode: "duel", topology: "plane", playPolicy }, HOST), { code: "INVALID_PLAY_POLICY" });
  }
});

test("delayed ticks and calls charge play from the preparation deadline; untimed and AI use the same deadline", () => {
  for (const mode of ["duel", "ai"]) {
    for (const clock of [null, { initialMs: 10000, incrementMs: 5000 }]) {
      const g = setup({}, { mode, clock }); g.join("black"); if (mode === "duel") g.join("white");
      g.advance(62500);
      const state = g.state();
      assert.equal(state.phase, "playing");
      assert.equal(state.preparation.completedAt, 61000);
      if (clock) {
        assert.equal(state.clock.remainingMs.black, 7500);
        assert.equal(state.clock.deadline, 71000);
      } else assert.equal(state.clock, null);
      g.advance(10000); g.arena.tick();
      assert.equal(g.state().phase, clock ? "ended" : "playing");
    }
  }
});

test("stopping preparation freezes it and no later tick starts the ended match", () => {
  const g = setup(); g.join("black"); g.join("white"); g.advance(12000);
  const stopped = g.control("stop");
  assert.equal(stopped.preparation.remainingMs, 48000);
  assert.equal(stopped.preparation.deadline, null);
  g.advance(900000); assert.equal(g.arena.tick(), false);
  assert.equal(g.state().eventSeq, stopped.eventSeq);
  assert.equal(g.state().phase, "ended");
});

test("restart retains policy, exact preparation balance and original readiness without charging downtime", t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-policy-"));
  let restored;
  t.after(() => { restored?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const g = setup({ dataDir }, { playPolicy: "assisted" }); g.join("black"); g.join("white");
  g.advance(120000); g.ready("black"); g.arena.close();
  let now = 9000000;
  restored = new Arena({ dataDir, now: () => now });
  let state = restored.call("arena_state", { gameId: g.gameId });
  assert.equal(state.playPolicy, "assisted");
  assert.equal(state.preparation.remainingMs, 180000);
  assert.equal(state.preparation.deadline, now + 180000);
  assert.equal(state.seats.black.ready, true); assert.equal(state.seats.white.ready, false);
  now += 180000; restored.tick();
  state = restored.call("arena_state", { gameId: g.gameId });
  assert.equal(state.phase, "playing"); assert.equal(state.clock.remainingMs.black, 300000);
});

test("shutdown between ticks settles elapsed preparation before restart pauses the started match", t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-close-deadline-"));
  let restored;
  t.after(() => { restored?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const g = setup({ dataDir }); g.join("black"); g.join("white");
  g.advance(60050); g.arena.close();
  restored = new Arena({ dataDir, now: () => 9000000 });
  const state = restored.call("arena_state", { gameId: g.gameId });
  assert.equal(state.phase, "paused");
  assert.equal(state.preparation.completedAt, 61000);
  assert.equal(state.preparation.deadline, null);
  assert.equal(state.clock.active, null);
  assert.equal(state.clock.remainingMs.black, 299950);
  assert.equal(state.events.filter(event => event.type === "control" && event.action === "start").length, 1);
});

test("legacy waiting saves retain unlimited preparation and their original tool contract", t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-legacy-policy-"));
  let restored;
  t.after(() => { restored?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const g = setup({ dataDir }); g.join("black"); g.join("white"); g.arena.close();
  const file = path.join(dataDir, `match-${g.gameId}.json`), saved = JSON.parse(fs.readFileSync(file, "utf8"));
  delete saved.playPolicy; delete saved.preparation; fs.writeFileSync(file, JSON.stringify(saved));
  let now = 2000000;
  restored = new Arena({ dataDir, now: () => now }); now += 900000; restored.tick();
  const state = restored.call("arena_state", { gameId: g.gameId });
  assert.equal(state.phase, "waiting"); assert.equal(state.playPolicy, "legacy"); assert.equal(state.preparation, null);
  const rules = restored.call("arena_rules", { gameId: g.gameId, token: g.tokens.black });
  assert.equal(typeof rules.playPolicyRule, "string"); assert.equal(typeof rules.preparationRule, "string");
  for (const token of Object.values(g.tokens)) restored.call("arena_ready", { gameId: g.gameId, token });
  assert.equal(restored.call("arena_state", { gameId: g.gameId }).phase, "playing");
});

test("only the host may disqualify a named side; verdict freezes clocks and preparation and cannot be overwritten", t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-disqualify-"));
  const g = setup({ dataDir }); let restored;
  t.after(() => { g.arena.close(); restored?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  g.join("black"); g.join("white");
  const args = { gameId: g.gameId, action: "disqualify", role: "black" };
  assert.throws(() => g.arena.call("arena_control", { ...args, token: g.tokens.black }), { code: "HOST_REQUIRED" });
  for (const role of [null, undefined, "commentator", "both"]) {
    assert.throws(() => g.arena.call("arena_control", { ...args, role }, HOST), { code: "INVALID_ROLE" });
  }
  g.advance(5000);
  const verdict = g.arena.call("arena_control", args, HOST);
  assert.equal(verdict.winner, "white"); assert.equal(verdict.winReason, "rule_violation"); assert.equal(verdict.phase, "ended");
  assert.equal(verdict.preparation.deadline, null); assert.equal(verdict.preparation.remainingMs, 55000);
  assert.equal(verdict.clock.active, null);
  assert.equal(g.arena.call("arena_list").matches[0].winReason, "rule_violation");
  assert.throws(() => g.arena.call("arena_control", { ...args, role: "white" }, HOST), { code: "INVALID_PHASE" });
  g.advance(100000); g.arena.tick(); assert.equal(g.state().eventSeq, verdict.eventSeq);
  g.arena.close(); restored = new Arena({ dataDir });
  assert.equal(restored.call("arena_state", { gameId: g.gameId }).winReason, "rule_violation");

  for (const phase of ["playing", "paused"]) {
    const playing = setup({}, { mode: "ai" }); playing.join("black"); playing.ready("black");
    if (phase === "paused") playing.control("pause");
    const ended = playing.arena.call("arena_control", { gameId: playing.gameId, action: "disqualify", role: "white" }, HOST);
    assert.equal(ended.winner, "black"); assert.equal(ended.clock.active, null);
    assert.deepEqual(playing.arena.matches.get(playing.gameId).controller.scheduled, []);
  }
});

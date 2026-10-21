"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Arena, ArenaError } = require("../arena/match.cjs");
const Engine = require("../app/assets/topology.js");
const Content = require("../app/assets/level-config.js");

const HOST = { hostAuthorized: true };

function setup(options = {}, create = {}) {
  const arena = new Arena({ now: () => 1000, random: () => 0.25, ...options });
  const initial = arena.call("arena_create", { topology: "plane", mode: "duel", ...create }, HOST);
  const gameId = initial.gameId;
  const join = (role, name = role, model = "") => {
    const invitation = arena.call("arena_invite", { gameId, role }, HOST);
    return arena.call("arena_join", { ...invitation, name, model });
  };
  const black = join("black");
  const white = create.mode === "ai" ? null : join("white");
  const state = () => arena.call("arena_state", { gameId });
  const move = (cell, extra = {}) => {
    const current = state();
    return arena.call("arena_move", {
      gameId, token: current.turn === "black" ? black.token : white?.token,
      cell, expectedVersion: current.version, requestId: `move-${current.version + 1}`, ...extra
    });
  };
  const start = () => arena.call("arena_control", { gameId, action: "start" }, HOST);
  return { arena, gameId, initial, black, white, join, state, move, start };
}

function errorCode(code) {
  return (error) => error instanceof ArenaError && error.code === code;
}

function winningCells(level, winner) {
  const rules = Engine.createRules({ type: level.topology, width: level.width, height: level.height, target: 5 });
  const definition = level.lessonPaths[0];
  const line = Engine.tracePath(rules, Engine.toCell(rules, ...definition.start), definition.direction, 5).cells;
  const other = winner === "black" ? -1 : 1;
  const board = Engine.createBoard(rules);
  const fillers = [];
  for (let cell = 0; cell < board.length && fillers.length < (winner === "black" ? 4 : 5); cell += 1) {
    if (line.includes(cell)) continue;
    board[cell] = other;
    if (Engine.checkWin(board, rules, cell, other)) board[cell] = 0;
    else fillers.push(cell);
  }
  const black = winner === "black" ? line : fillers;
  const white = winner === "white" ? line : fillers;
  return black.flatMap((cell, index) => index < white.length ? [cell, white[index]] : [cell]);
}

test("arena gates creation and match control behind the host credential", () => {
  const arena = new Arena();
  assert.throws(() => arena.call("arena_create", { topology: "plane", mode: "duel" }), errorCode("HOST_REQUIRED"));
  const catalog = arena.call("arena_catalog");
  assert.equal(catalog.levels.length, 7);
  assert.deepEqual(catalog.difficulties.map((item) => item.id), ["easy", "normal", "hard"]);
  const state = arena.call("arena_create", { topology: "plane", mode: "duel" }, HOST);
  assert.equal(state.phase, "waiting");
  assert.equal(state.ply, 0);
  assert.throws(() => arena.call("arena_control", { gameId: state.gameId, action: "start" }), errorCode("HOST_REQUIRED"));
  assert.throws(() => arena.call("arena_control", { gameId: state.gameId, action: "start" }, HOST), errorCode("SEATS_NOT_READY"));
  assert.throws(() => arena.call("arena_create", { topology: "unknown", mode: "ai" }, HOST), errorCode("INVALID_TOPOLOGY"));
  assert.throws(() => arena.call("arena_create", { topology: "plane", mode: "duel", difficulty: "__proto__" }, HOST), errorCode("INVALID_DIFFICULTY"));
});

test("arena legal alternating wins use shared topology paths for all seven topologies and both colors", (t) => {
  const choose = t.mock.method(Engine, "chooseMove", () => { throw new Error("Duel must never call AI"); });
  for (const level of Content.LEVELS) {
    for (const winner of ["black", "white"]) {
      const game = setup({}, { topology: level.topology });
      game.start();
      const cells = winningCells(level, winner);
      cells.forEach((cell) => game.move(cell));
      const state = game.state();
      assert.equal(state.phase, "ended", `${level.topology} ${winner}`);
      assert.equal(state.winner, winner);
      assert.equal(state.outcome, "win");
      assert.equal(state.winningCells.length, 5);
      assert.equal(state.version, cells.length);
      assert.equal(state.moves.length, cells.length);
      assert.equal(state.turn, null);
      assert.equal(state.events.filter((event) => event.type === "result").length, 1);
      game.arena.tick();
      assert.equal(game.state().topology, level.topology);
      assert.throws(() => game.move(state.board.findIndex((cell) => cell === 0), { token: game.black.token }), errorCode("NOT_PLAYING"));
    }
  }
  assert.equal(choose.mock.callCount(), 0);
});

test("plane AI is an ordinary match with no tutorial and AI acts only when running", () => {
  let time = 1000;
  const game = setup({ now: () => time }, { mode: "ai", difficulty: "easy" });
  assert.equal(game.state().seats.white.name, "Built-in AI");
  assert.equal(game.state().seats.white.model, "");
  assert.throws(() => game.arena.call("arena_invite", { gameId: game.gameId, role: "white" }, HOST), errorCode("AI_SEAT"));
  game.start();
  const state = game.move(0);
  assert.equal(state.turn, "white");
  assert.equal(state.ply, 1);
  game.arena.call("arena_control", { gameId: game.gameId, action: "pause" }, HOST);
  time = 100000;
  game.arena.tick();
  assert.equal(game.state().ply, 1);
  game.arena.call("arena_control", { gameId: game.gameId, action: "resume" }, HOST);
  time += 1000;
  assert.equal(game.arena.tick(), true);
  assert.equal(game.state().ply, 2);
  assert.equal(game.state().turn, "black");
  assert.equal(game.state().moves[1].player, "white");
  assert.equal(Content.LEVELS[0].tutorial, true, "Arena does not modify shared chapter configuration");
});

test("all seven AI matches alternate normally, and a finished plane match never advances chapters", (t) => {
  const choose = t.mock.method(Engine, "chooseMove", () => 1);
  for (const level of Content.LEVELS) {
    let time = 0;
    const game = setup({ now: () => time }, { mode: "ai", topology: level.topology, difficulty: "easy" });
    game.start();
    game.move(0);
    time += 1000;
    game.arena.tick();
    assert.deepEqual(game.state().moves.map((move) => move.player), ["black", "white"]);
    assert.equal(game.state().turn, "black");
    assert.equal(game.state().phase, "playing");
  }
  let time = 0;
  const game = setup({ now: () => time }, { mode: "ai", difficulty: "easy" });
  const cells = winningCells(Content.LEVELS[0], "black");
  let aiIndex = 1;
  choose.mock.mockImplementation(() => {
    const cell = cells[aiIndex];
    aiIndex += 2;
    return cell;
  });
  game.start();
  for (let index = 0; index < cells.length; index += 2) {
    game.move(cells[index]);
    time += 1000;
    game.arena.tick();
  }
  const ended = game.state();
  assert.equal(ended.phase, "ended");
  assert.equal(ended.winner, "black");
  time += 100000;
  game.arena.tick();
  assert.equal(game.state().topology, "plane");
  assert.deepEqual(game.state().board, ended.board);
  assert.equal(game.state().eventSeq, ended.eventSeq);
});

test("all seven duel draws keep playing until the board is full", () => {
  const fixtures = [
    "bbbwwbwwbwbwwbbbwbbbwbwbwbwbwwbwwbbwwwbbbbwwwwbwb",
    "wbbwbwbwbbwbwbwbbwbwbbwwbwwwbbwbwbwwwwbbbw",
    "wbwwbbwwbbbwwwbbwwwbwwwwbbbbbbbwbwwbwbwbwb",
    "wbbwwbwwwbwbbwbbbbbwwbbwbbwbbbwwbwwwwbwwwbwbbwbw",
    "bwbwwbwbwbbwbwwwwbwwwwbwbbbwbbwbwwbbwbwbbb",
    "bwwwbwbwwbbbbwwwbbwwbbwbwwwbwbwwwwbbwbbbbwbbbwwwwbbbbwwbbwwwbbwb",
    "bbbbwwbbbwbwbbwbwbwwwwwwbbwwbwbwbwwbbbwbbbbwwbwww"
  ];
  fixtures.forEach((fixture, levelIndex) => {
    const game = setup({}, { topology: Content.LEVELS[levelIndex].topology });
    game.start();
    const black = [], white = [];
    Array.from(fixture).forEach((color, cell) => (color === "b" ? black : white).push(cell));
    const cells = black.flatMap((cell, index) => index < white.length ? [cell, white[index]] : [cell]);
    cells.forEach((cell) => {
      assert.equal(game.state().phase, "playing");
      game.move(cell);
    });
    assert.equal(game.state().phase, "ended");
    assert.equal(game.state().outcome, "draw");
    assert.equal(game.state().winner, null);
    assert.deepEqual(game.state().winningCells, []);
  });
});

test("arena validates turn, version, integer coordinates and idempotent move requests", () => {
  const game = setup();
  assert.throws(() => game.move(0), errorCode("NOT_PLAYING"));
  game.start();
  assert.throws(() => game.move(0, { token: game.white.token }), errorCode("WRONG_TURN"));
  for (const cell of [null, "0", 0.5, -1, 49, NaN]) {
    assert.throws(() => game.move(cell), errorCode("INVALID_CELL"));
  }
  assert.throws(() => game.move(0, { expectedVersion: "0" }), errorCode("INVALID_VERSION"));
  const args = {
    gameId: game.gameId, token: game.black.token, cell: 0, expectedVersion: 0,
    requestId: "black-first", explanation: "Control the corner."
  };
  const played = game.arena.call("arena_move", args);
  assert.equal(played.ply, 1);
  const seq = played.eventSeq;
  const duplicate = game.arena.call("arena_move", args);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.acceptedVersion, 1);
  assert.equal(duplicate.eventSeq, seq);
  assert.equal(duplicate.ply, 1);
  assert.throws(() => game.arena.call("arena_move", { ...args, cell: 1 }), errorCode("REQUEST_REUSED"));
  assert.throws(() => game.move(1, { expectedVersion: 0 }), errorCode("STALE_VERSION"));
  assert.throws(() => game.move(0), errorCode("ILLEGAL_MOVE"));
  game.move(1);
  assert.equal(game.state().ply, 2);
  const detached = game.state();
  detached.board[0] = 99;
  detached.seats.black.name = "Changed";
  assert.equal(game.state().board[0], 1);
  assert.equal(game.state().seats.black.name, "black");
});

test("invitations reconnect seats without silently changing identity or revoking active credentials", () => {
  const game = setup();
  const invitation = game.arena.call("arena_invite", { gameId: game.gameId, role: "black" }, HOST);
  const reissued = game.arena.call("arena_invite", { gameId: game.gameId, role: "black" }, HOST);
  assert.deepEqual(reissued, invitation);
  const rejoined = game.arena.call("arena_join", { ...invitation, name: "black" });
  assert.equal(rejoined.token, game.black.token);
  assert.throws(() => game.arena.call("arena_join", { ...invitation, name: "replacement" }), errorCode("SEAT_CLAIMED"));
  assert.throws(() => game.arena.call("arena_join", { gameId: game.gameId, inviteToken: "guess", name: "black" }), errorCode("INVALID_INVITE"));
  assert.throws(() => game.arena.call("arena_state", { gameId: game.gameId, token: invitation.inviteToken }), errorCode("INVALID_TOKEN"));
  const serialized = JSON.stringify(game.state());
  assert.ok(!serialized.includes(invitation.inviteToken));
  assert.ok(!serialized.includes(game.black.token));
  assert.ok(!JSON.stringify(game.arena.call("arena_list")).includes(game.white.token));
});

test("speech is chronological, limited to legitimate positions and filtered from opponent tools", () => {
  const game = setup();
  const commentator = game.join("commentator", "Commentator", "declared-model");
  game.start();
  const speak = (token, kind, ply, value) => game.arena.call("arena_speak", {
    gameId: game.gameId, token, kind, ply, text: value
  });
  const before = game.state().version;
  speak(game.black.token, "thinking", 0, "I will make an opening.");
  assert.equal(game.state().version, before);
  assert.throws(() => speak(game.white.token, "thinking", 0, "Wrong turn"), errorCode("WRONG_TURN"));
  assert.throws(() => speak(game.black.token, "explanation", 0, "No move"), errorCode("INVALID_PLY"));
  assert.throws(() => speak(commentator.token, "thinking", 0, "No"), errorCode("ROLE_RESTRICTED"));
  assert.throws(() => game.move(0, { token: commentator.token }), errorCode("PLAYER_REQUIRED"));
  game.move(0, { explanation: "Take a corner." });
  speak(game.white.token, "reaction", 1, "An unusual opening.");
  speak(commentator.token, "commentary", 1, "The game begins at a corner.");
  assert.throws(() => speak(commentator.token, "commentary", 2, "Future"), errorCode("INVALID_PLY"));
  const publicSpeech = game.state().events.filter((event) => event.type === "speech");
  assert.equal(publicSpeech.length, 4);
  for (const [role, token] of [["black", game.black.token], ["white", game.white.token]]) {
    for (const operation of ["arena_state", "arena_replay"]) {
      const state = game.arena.call(operation, { gameId: game.gameId, token });
      assert.ok(state.events.filter((event) => event.type === "speech").every((event) => event.role === role));
    }
  }
  assert.equal(game.arena.call("arena_state", { gameId: game.gameId, token: commentator.token })
    .events.filter((event) => event.type === "speech").length, 4);
  assert.throws(() => speak(game.white.token, "thinking", 1, "x".repeat(1001)), errorCode("INVALID_ARGUMENT"));
  for (let index = 0; index < 7; index += 1) speak(game.white.token, "thinking", 1, `Thought ${index}`);
  assert.throws(() => speak(game.white.token, "thinking", 1, "Too much"), errorCode("SPEECH_LIMIT"));
});

test("arena rules trace twisted seams without providing strategy evaluation", () => {
  const game = setup({}, { topology: "mobius" });
  const rules = game.arena.call("arena_rules", { gameId: game.gameId, cell: 7, direction: 0, length: 5 });
  assert.equal(rules.width, 8);
  assert.equal(rules.directions[0].name, "E");
  assert.ok(rules.path.seams.some((seam) => seam & Engine.SEAM_TWIST));
  assert.equal(rules.path.cells.length, 5);
  assert.equal(Object.hasOwn(rules, "bestMove"), false);
  assert.throws(() => game.arena.call("arena_rules", { gameId: game.gameId, cell: 0, direction: 1.5 }), errorCode("INVALID_DIRECTION"));
  assert.throws(() => game.arena.call("arena_rules", { gameId: game.gameId, cell: 0, direction: 0, length: 0 }), errorCode("INVALID_LENGTH"));
});

test("restart restores seats, board and receipts, pauses active games, and exports a credential-free replay", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "topology-arena-test-"));
  let restored;
  t.after(() => {
    restored?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const game = setup({ dataDir }, { topology: "cylinder" });
  game.start();
  game.move(0, { requestId: "saved-request", explanation: "Opening." });
  game.move(1);
  const before = game.state();
  game.arena.close();
  restored = new Arena({ dataDir, now: () => 5000 });
  const state = restored.call("arena_state", { gameId: game.gameId, token: game.black.token });
  assert.deepEqual(state.board, before.board);
  assert.deepEqual(state.moves, before.moves);
  assert.equal(state.phase, "paused");
  assert.equal(state.version, 2);
  assert.equal(state.eventSeq, before.eventSeq + 1);
  assert.equal(state.events.at(-1).reason, "service_restart");
  const retry = restored.call("arena_move", {
    gameId: game.gameId, token: game.black.token, cell: 0, expectedVersion: 0,
    requestId: "saved-request", explanation: "Opening."
  });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.ply, 2);
  restored.call("arena_control", { gameId: game.gameId, action: "resume" }, HOST);
  restored.call("arena_move", {
    gameId: game.gameId, token: game.black.token, cell: 2, expectedVersion: 2, requestId: "next"
  });
  const replay = restored.call("arena_replay", { gameId: game.gameId });
  assert.equal(replay.moves.length, 3);
  assert.equal(replay.gameVersion, require("../package.json").version);
  assert.ok(!JSON.stringify(replay).includes(game.black.token));
  assert.ok(!JSON.stringify(replay).includes("credentials"));
  assert.deepEqual(replay.events.map((event) => event.seq),
    Array.from({ length: replay.events.length }, (_, index) => index + 1));
});

test("restoring AI turn replays recorded moves rather than choosing new ones", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "topology-arena-ai-test-"));
  let restored;
  t.after(() => {
    restored?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  let time = 0;
  const game = setup({ dataDir, now: () => time }, { mode: "ai", difficulty: "easy" });
  game.start();
  game.move(0);
  game.arena.close();
  const choose = t.mock.method(Engine, "chooseMove", () => 1);
  restored = new Arena({ dataDir, now: () => time });
  assert.equal(choose.mock.callCount(), 0);
  time = 100000;
  restored.tick();
  assert.equal(choose.mock.callCount(), 0);
  restored.call("arena_control", { gameId: game.gameId, action: "resume" }, HOST);
  time += 1000;
  restored.tick();
  assert.equal(choose.mock.callCount(), 1);
  const state = restored.call("arena_state", { gameId: game.gameId });
  assert.deepEqual(state.moves.map((move) => move.cell), [0, 1]);
  assert.equal(state.turn, "black");
});

test("host stop ends a game without altering the board version and a commentator cannot resume it", () => {
  const game = setup();
  const commentator = game.join("commentator");
  game.start();
  game.move(0);
  assert.throws(() => game.arena.call("arena_control", {
    gameId: game.gameId, action: "pause", token: commentator.token
  }), errorCode("HOST_REQUIRED"));
  const stopped = game.arena.call("arena_control", { gameId: game.gameId, action: "stop" }, HOST);
  assert.equal(stopped.phase, "ended");
  assert.equal(stopped.outcome, "stopped");
  assert.equal(stopped.winner, null);
  assert.equal(stopped.version, 1);
  assert.equal(stopped.turn, null);
  assert.throws(() => game.arena.call("arena_control", { gameId: game.gameId, action: "resume" }, HOST), errorCode("INVALID_PHASE"));
});

test("either player can resign without waiting for a five or their turn, with safe retries", () => {
  for (const level of Content.LEVELS) for (const loser of ["black", "white"]) {
    const g = setup({}, { topology: level.topology });
    g.start();
    g.move(0);
    const args = { gameId: g.gameId, token: g[loser].token, expectedVersion: 1, requestId: "concede", reason: "No useful continuation." };
    const state = g.arena.call("arena_resign", args);
    assert.equal(state.phase, "ended");
    assert.equal(state.winner, loser === "black" ? "white" : "black");
    assert.equal(state.winReason, "resign");
    assert.equal(state.ply, 1);
    assert.deepEqual(state.winningCells, []);
    assert.equal(g.arena.call("arena_resign", args).duplicate, true);
    assert.equal(g.state().eventSeq, state.eventSeq);
    assert.throws(() => g.arena.call("arena_resign", { ...args, reason: "Changed" }), errorCode("REQUEST_REUSED"));
    assert.throws(() => g.move(1), errorCode("NOT_PLAYING"));
    g.arena.tick();
    assert.equal(g.state().ply, 1);
  }
});

test("decisions require a player, current board and a started match, but allow pausing", () => {
  const g = setup(); const observer = g.join("commentator");
  const args = { gameId: g.gameId, token: g.black.token, expectedVersion: 0, requestId: "decision" };
  assert.throws(() => g.arena.call("arena_resign", args), errorCode("NOT_PLAYING"));
  g.start();
  for (const operation of ["arena_resign", "arena_draw"]) {
    assert.throws(() => g.arena.call(operation, { ...args, token: observer.token, action: "offer" }), errorCode("PLAYER_REQUIRED"));
    assert.throws(() => g.arena.call(operation, { ...args, expectedVersion: 2, action: "offer" }), errorCode("STALE_VERSION"));
  }
  g.arena.call("arena_control", { gameId: g.gameId, action: "pause" }, HOST);
  assert.equal(g.arena.call("arena_resign", args).winReason, "resign");
});

test("draw agreement requires a matching offer and the other player's consent", () => {
  const g = setup(); g.start();
  const offerArgs = { gameId: g.gameId, token: g.black.token, action: "offer", expectedVersion: 0, requestId: "offer" };
  const offered = g.arena.call("arena_draw", offerArgs);
  const offerId = offered.drawOffer.id;
  assert.equal(offered.phase, "playing");
  assert.equal(offered.version, 0);
  assert.equal(g.arena.call("arena_draw", offerArgs).drawOffer.id, offerId);
  const reply = { ...offerArgs, token: g.white.token, action: "accept", offerId, requestId: "reply" };
  assert.throws(() => g.arena.call("arena_draw", { ...reply, token: g.black.token }), errorCode("ROLE_RESTRICTED"));
  assert.throws(() => g.arena.call("arena_draw", { ...reply, offerId: "old-offer" }), errorCode("STALE_OFFER"));
  assert.throws(() => g.arena.call("arena_draw", { ...reply, action: "withdraw" }), errorCode("ROLE_RESTRICTED"));
  const agreed = g.arena.call("arena_draw", reply);
  assert.equal(agreed.phase, "ended");
  assert.equal(agreed.outcome, "draw");
  assert.equal(agreed.winReason, "draw_agreement");
  assert.equal(agreed.winner, null);
  assert.equal(agreed.ply, 0);
  assert.equal(agreed.drawOffer, null);
  assert.equal(g.arena.call("arena_draw", reply).eventSeq, agreed.eventSeq);
  assert.throws(() => g.arena.call("arena_resign", { ...reply, requestId: "late" }), errorCode("NOT_PLAYING"));
});

test("draw offers can be declined or withdrawn, cannot spam a position, and moves invalidate them", () => {
  const g = setup(); g.start();
  const decide = (role, action, requestId, offerId) => g.arena.call("arena_draw", {
    gameId: g.gameId, token: g[role].token, action, requestId, offerId, expectedVersion: g.state().version
  });
  const first = decide("black", "offer", "b-offer").drawOffer.id;
  assert.throws(() => decide("white", "offer", "conflict"), errorCode("DRAW_PENDING"));
  assert.equal(decide("white", "decline", "decline", first).phase, "playing");
  assert.throws(() => decide("black", "offer", "spam"), errorCode("DRAW_LIMIT"));
  const second = decide("white", "offer", "w-offer").drawOffer.id;
  assert.equal(decide("white", "withdraw", "withdraw", second).drawOffer, null);
  g.move(0);
  const third = decide("black", "offer", "new-position").drawOffer.id;
  g.move(1);
  assert.equal(g.state().drawOffer, null);
  assert.throws(() => decide("white", "accept", "late-accept", third), errorCode("STALE_OFFER"));
  const fourth = decide("black", "offer", "another-position").drawOffer.id;
  g.move(2);
  assert.equal(g.state().events.find(e => e.type === "draw" && e.offerId === fourth && e.reason === "move").action, "withdraw");
});

test("negotiation and terminal decisions survive restart without replaying an AI move", (t) => {
  for (const ending of ["resign", "draw"]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-decisions-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const g = setup({ dataDir: directory }); g.start(); g.move(0);
    const args = { gameId: g.gameId, token: g.black.token, expectedVersion: 1, requestId: "offer", action: "offer" };
    const offerId = g.arena.call("arena_draw", args).drawOffer.id;
    g.arena.close();
    const restored = new Arena({ dataDir: directory });
    assert.equal(restored.call("arena_state", { gameId: g.gameId }).drawOffer.id, offerId);
    const decision = { gameId: g.gameId, token: g.white.token, expectedVersion: 1, requestId: "finish", action: "accept", offerId };
    const result = restored.call(ending === "resign" ? "arena_resign" : "arena_draw", decision);
    restored.close();
    const final = new Arena({ dataDir: directory });
    assert.deepEqual(final.call("arena_state", { gameId: g.gameId }), result);
    assert.equal(final.call(ending === "resign" ? "arena_resign" : "arena_draw", decision).duplicate, true);
    final.tick();
    assert.equal(final.call("arena_state", { gameId: g.gameId }).ply, 1);
    final.close();
  }
});

test("built-in AI declines early draw offers and stops scheduled moves on resignation", () => {
  let time = 0;
  const g = setup({ now: () => time }, { mode: "ai" }); g.start();
  const declined = g.arena.call("arena_draw", { gameId: g.gameId, token: g.black.token, action: "offer", expectedVersion: 0, requestId: "offer" });
  assert.equal(declined.drawOffer, null);
  assert.ok(declined.events.some(e => e.type === "draw" && e.action === "decline" && e.role === "white"));
  g.move(0);
  g.arena.call("arena_resign", { gameId: g.gameId, token: g.black.token, expectedVersion: 1, requestId: "concede" });
  time = 10000; g.arena.tick();
  assert.equal(g.state().ply, 1);
  assert.equal(g.state().winner, "white");
});

test("built-in AI accepts a balanced late position and leaves the board intact", (t) => {
  const cells = [11,31,27,40,2,29,3,15,26,41,30,22,24,35,46,16,13,17,28,7,12,42,4,25,23];
  let time = 0, next = 1;
  t.mock.method(Engine, "chooseMove", () => { const cell = cells[next]; next += 2; return cell; });
  const g = setup({ now: () => time }, { mode: "ai" }); g.start();
  for (let index = 0; index < cells.length; index += 2) {
    g.move(cells[index]);
    if (index + 1 < cells.length) { time += 1000; g.arena.tick(); }
  }
  assert.equal(g.state().phase, "playing");
  const board = g.state().board;
  const agreed = g.arena.call("arena_draw", { gameId: g.gameId, token: g.black.token, action: "offer", expectedVersion: 25, requestId: "balanced-draw" });
  assert.equal(agreed.winReason, "draw_agreement");
  assert.equal(agreed.outcome, "draw");
  time += 1000; g.arena.tick();
  assert.deepEqual(g.state().board, board);
  assert.equal(g.state().ply, 25);
});

test("new matches leave commentary off until the host explicitly invites a commentator", () => {
  const g = setup();
  assert.equal(g.state().commentaryEnabled, false);
  assert.throws(() => g.arena.call("arena_invite", { gameId:g.gameId, role:"commentator" }), errorCode("HOST_REQUIRED"));
  assert.equal(g.state().commentaryEnabled, false);
  const commentator = g.join("commentator");
  assert.equal(g.state().commentaryEnabled, true);
  g.arena.call("arena_control", { gameId: g.gameId, action: "commentary_off" }, HOST);
  assert.equal(g.state().commentaryEnabled, false);
  assert.throws(() => g.arena.call("arena_speak", { gameId:g.gameId, token:commentator.token, kind:"commentary", text:"Not enabled", ply:0 }), errorCode("COMMENTARY_DISABLED"));
  g.arena.call("arena_control", { gameId:g.gameId, action:"commentary_on" }, HOST);
  assert.equal(g.state().commentaryEnabled, true);
});


test("custom board sizes use shared rules and survive restoration for every topology", (t) => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"arena-sizes-"));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const arena=new Arena({dataDir:directory});
  for(const level of Content.LEVELS){
    const width=9,height=level.topology==="sphere"?9:8;
    const state=arena.call("arena_create",{mode:"duel",topology:level.topology,width,height},HOST);
    const tokens={};for(const role of ["black","white"])tokens[role]=arena.call("arena_join",{...arena.call("arena_invite",{gameId:state.gameId,role},HOST),name:role}).token;
    arena.call("arena_control",{gameId:state.gameId,action:"start"},HOST);
    const sequence=[0,9,1,10,2,11,3,12,4];
    for(let i=0;i<sequence.length;i++)arena.call("arena_move",{gameId:state.gameId,token:tokens[i%2?"white":"black"],cell:sequence[i],expectedVersion:i,requestId:"size-"+i});
    assert.equal(arena.call("arena_state",{gameId:state.gameId}).winner,"black");
    assert.equal(arena.call("arena_rules",{gameId:state.gameId,token:tokens.black}).width,width);
  }
  const ids=arena.call("arena_list").matches.map(m=>m.gameId);arena.close();const restored=new Arena({dataDir:directory});
  for(const gameId of ids){const state=restored.call("arena_state",{gameId});assert.equal(state.width,9);assert.equal(state.height,state.topology==="sphere"?9:8);assert.equal(state.board.length,state.width*state.height);assert.equal(state.winner,"black");}
  restored.close();
  const empty=new Arena();for(const args of [{width:4},{width:20},{width:7.5},{width:NaN},{height:0},{topology:"sphere",width:8,height:9}])assert.throws(()=>empty.call("arena_create",{mode:"duel",topology:"plane",...args},HOST),errorCode("INVALID_SIZE"));
  const large=empty.call("arena_create",{mode:"ai",topology:"plane",width:19,height:19},HOST);assert.equal(large.board.length,361);
});

test("display profiles preserve role identity, credentials and moves, and reject unsafe avatars", (t) => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"arena-profiles-"));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const g=setup({dataDir:directory});g.start();g.move(0);
  const args={gameId:g.gameId,role:"black",name:"蓝色大肥鱼",avatar:"deepseek-color"};
  assert.throws(()=>g.arena.call("arena_profile",args),errorCode("HOST_REQUIRED"));
  const edited=g.arena.call("arena_profile",args,HOST);assert.equal(edited.seats.black.displayName,args.name);assert.equal(edited.seats.black.name,g.black.state.seats.black.name);assert.equal(edited.version,1);
  assert.equal(g.arena.call("arena_state",{gameId:g.gameId,token:g.black.token}).seats.black.avatar,"deepseek-color");
  for(const avatar of ["https://example.com/avatar.png","data:image/svg+xml,<svg/>","data:image/png;base64,AAAA","../../secret"])assert.throws(()=>g.arena.call("arena_profile",{...args,avatar},HOST),errorCode("INVALID_AVATAR"));
  g.arena.close();const restored=new Arena({dataDir:directory});assert.equal(restored.call("arena_state",{gameId:g.gameId}).seats.black.displayName,args.name);restored.close();
  const created=new Arena().call("arena_create",{topology:"torus",mode:"duel",players:{black:{name:"DeepSeek",avatar:"deepseek-color"}}},HOST);assert.equal(created.seats.black.joined,false);assert.equal(created.seats.black.displayName,"DeepSeek");
});

test("record management deletes only ended games and never resurrects them on restart", (t) => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"arena-delete-"));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const arena=new Arena({dataDir:directory}),make=()=>arena.call("arena_create",{topology:"torus",mode:"duel"},HOST);
  const waiting=make(),ended=make();
  assert.throws(()=>arena.call("arena_delete",{gameId:waiting.gameId},HOST),errorCode("NOT_ENDED"));
  assert.throws(()=>arena.call("arena_clear",{}),errorCode("HOST_REQUIRED"));
  arena.call("arena_control",{gameId:ended.gameId,action:"stop"},HOST);
  assert.deepEqual(arena.call("arena_clear",{},HOST).deleted,[ended.gameId]);assert.equal(arena.call("arena_list").matches.length,1);
  assert.throws(()=>arena.call("arena_state",{gameId:ended.gameId}),errorCode("GAME_NOT_FOUND"));
  arena.close();const restored=new Arena({dataDir:directory});assert.deepEqual(restored.call("arena_list").matches.map(m=>m.gameId),[waiting.gameId]);restored.close();
});

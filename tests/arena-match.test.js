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

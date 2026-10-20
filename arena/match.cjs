"use strict";

const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Engine = require("../app/assets/topology.js");
const Content = require("../app/assets/level-config.js");
const { GameController } = require("../app/assets/game-controller.js");
const { version: gameVersion } = require("../package.json");

const ROLES = ["black", "white", "commentator"];
const PLAYERS = { black: Engine.HUMAN, white: Engine.AI };
const clone = (value) => JSON.parse(JSON.stringify(value));

class ArenaError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "ArenaError";
    this.code = code;
    this.status = status;
  }
}

function requireValue(condition, code, message, status) {
  if (!condition) throw new ArenaError(code, message, status);
}

function text(value, field, max, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return "";
  requireValue(typeof value === "string", "INVALID_ARGUMENT", `${field} must be text.`);
  const cleaned = value.trim();
  requireValue(cleaned.length > 0 && cleaned.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(cleaned),
    "INVALID_ARGUMENT", `${field} must contain 1–${max} characters without control characters.`);
  return cleaned;
}

function controllerFor(levelIndex, mode, difficulty, now, random) {
  const controller = new GameController({
    now, random, preferences: { difficulty, unlocked: Content.LEVELS.length - 1, hints: false, sound: false }
  });
  // The shared plane chapter intentionally starts a single-player tutorial.
  // Arena starts a normal empty match, then restores the requested mode on this
  // instance only. All moves and adjudication still use the shared controller.
  controller.startLevel(levelIndex, { mode: "duel", introMode: "none" }, now());
  controller.game.mode = mode;
  controller.game.level = { ...controller.game.level, tutorial: false };
  controller.drainEvents();
  return controller;
}

class Arena extends EventEmitter {
  constructor({ dataDir, now = Date.now, random = Math.random } = {}) {
    super();
    this.now = now;
    this.random = random;
    this.dataDir = dataDir ? path.resolve(dataDir) : null;
    this.matches = new Map();
    this.closed = false;
    if (this.dataDir) {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      this._load();
    }
  }

  _at() { return new Date(this.now()).toISOString(); }

  _load() {
    for (const filename of fs.readdirSync(this.dataDir).filter((name) => /^match-[a-f0-9-]+\.json$/u.test(name))) {
      const saved = JSON.parse(fs.readFileSync(path.join(this.dataDir, filename), "utf8"));
      requireValue(saved.schemaVersion === 1 && typeof saved.gameId === "string"
        && filename === `match-${saved.gameId}.json`
        && Number.isInteger(saved.levelIndex) && Content.LEVELS[saved.levelIndex]
        && ["ai", "duel"].includes(saved.mode) && Array.isArray(saved.moves)
        && Array.isArray(saved.events), "INVALID_SAVE", `Cannot restore ${filename}.`, 500);
      const controller = controllerFor(saved.levelIndex, saved.mode, saved.difficulty, this.now, this.random);
      for (const move of saved.moves) {
        requireValue(PLAYERS[move.player] && controller.performMove(move.cell, PLAYERS[move.player], null, this.now()),
          "INVALID_SAVE", `Invalid replay in ${filename}.`, 500);
        // Recorded white moves are replayed directly; never choose AI moves
        // again or run chapter advancement while restoring a finished game.
        controller.scheduled = [];
        controller.game.autoAdvancePending = false;
      }
      controller.drainEvents();
      const match = { ...saved, controller, receipts: saved.receipts || {} };
      requireValue(match.version === match.moves.length
        && match.eventSeq === (match.events.at(-1)?.seq || 0),
      "INVALID_SAVE", `Inconsistent counters in ${filename}.`, 500);
      this.matches.set(match.gameId, match);
      if (match.phase === "playing") {
        match.phase = "paused";
        this._event(match, "control", { action: "pause", reason: "service_restart", ply: match.moves.length });
      }
      if (match.phase === "paused" || match.phase === "waiting") controller.pause(this.now());
      this._save(match);
    }
  }

  _save(match) {
    if (!this.dataDir) return;
    const { controller, ...saved } = match;
    const filename = path.join(this.dataDir, `match-${match.gameId}.json`);
    const temporary = `${filename}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(saved), { encoding: "utf8", mode: 0o600 });
      fs.renameSync(temporary, filename);
    } catch (error) {
      try { fs.unlinkSync(temporary); } catch {}
      throw error;
    }
  }

  _event(match, type, detail = {}) {
    const event = { seq: ++match.eventSeq, type, at: this._at(), ...detail };
    match.events.push(event);
    return event;
  }

  _changed(match) {
    this._save(match);
    this.emit("change", match.gameId);
  }

  _match(gameId) {
    requireValue(typeof gameId === "string" && this.matches.has(gameId),
      "GAME_NOT_FOUND", "This game does not exist.", 404);
    return this.matches.get(gameId);
  }

  _host(context) {
    requireValue(context.hostAuthorized === true, "HOST_REQUIRED", "This action requires the local host credential.", 403);
  }

  _seat(match, token, required = false) {
    if (token === undefined || token === null || token === "") {
      requireValue(!required, "TOKEN_REQUIRED", "A joined seat token is required.", 401);
      return null;
    }
    requireValue(typeof token === "string", "INVALID_TOKEN", "Invalid seat token.", 401);
    const role = ROLES.find((item) => match.credentials[item]?.token === token);
    requireValue(role, "INVALID_TOKEN", "Invalid seat token.", 401);
    match.seats[role].lastSeen = this._at();
    return role;
  }

  _visibleEvents(match, role) {
    return match.events.filter((event) =>
      !PLAYERS[role] || event.type !== "speech" || event.role === role);
  }

  _snapshot(match, role = null) {
    const game = match.controller.game;
    return clone({
      schemaVersion: 1,
      gameVersion: match.gameVersion,
      gameId: match.gameId,
      title: match.title,
      mode: match.mode,
      difficulty: match.difficulty,
      topology: game.level.topology,
      levelIndex: match.levelIndex,
      width: game.rules.width,
      height: game.rules.height,
      target: game.rules.target,
      board: Array.from(game.board),
      turn: match.phase === "ended" ? null : (game.turn === Engine.HUMAN ? "black" : "white"),
      phase: match.phase,
      version: match.version,
      eventSeq: match.eventSeq,
      ply: match.moves.length,
      moves: match.moves,
      events: this._visibleEvents(match, role),
      seats: match.seats,
      outcome: match.stopped ? "stopped" : game.outcome,
      winner: match.stopped ? null : (game.winner === Engine.HUMAN ? "black" : game.winner === Engine.AI ? "white" : null),
      winReason: match.stopped ? "host_stopped" : game.winReason,
      winningCells: game.winningMask ? Array.from(game.winningMask.cells) : [],
      legalCells: match.phase === "playing" ? Array.from(game.board.keys()).filter((cell) => game.board[cell] === 0) : [],
      createdAt: match.createdAt,
      updatedAt: match.events.at(-1)?.at || match.createdAt
    });
  }

  _recordMoves(match) {
    const game = match.controller.game;
    for (let index = match.moves.length; index < game.moves.length; index += 1) {
      const source = game.moves[index];
      const move = {
        cell: source.cell, player: source.player === Engine.HUMAN ? "black" : "white",
        ply: index + 1, at: this._at()
      };
      match.moves.push(move);
      match.version += 1;
      this._event(match, "move", { ...move, version: match.version });
    }
    if (game.status === "ended" && match.phase !== "ended") {
      match.phase = "ended";
      game.autoAdvancePending = false;
      match.controller.scheduled = [];
      this._event(match, "result", {
        ply: match.moves.length, outcome: game.outcome,
        winner: game.winner === Engine.HUMAN ? "black" : game.winner === Engine.AI ? "white" : null,
        winReason: game.winReason,
        winningCells: game.winningMask ? Array.from(game.winningMask.cells) : []
      });
    }
    match.controller.drainEvents();
  }

  call(name, args = {}, context = {}) {
    requireValue(!this.closed, "SERVICE_CLOSED", "The arena service is closed.", 503);
    requireValue(args && typeof args === "object" && !Array.isArray(args), "INVALID_ARGUMENT", "Arguments must be an object.");
    switch (name) {
      case "arena_catalog":
        return {
          levels: Content.LEVELS.map((level, index) => ({
            index, topology: level.topology, name: level.name, typeName: level.typeName,
            width: level.width, height: level.height, edgeText: level.edgeText, ruleText: level.ruleText
          })),
          difficulties: Object.entries(Content.DIFFICULTIES).map(([id, value]) => ({ id, label: value.label }))
        };
      case "arena_list":
        return {
          matches: Array.from(this.matches.values()).reverse().map((match) => {
            const state = this._snapshot(match);
            return {
              gameId: state.gameId, title: state.title, topology: state.topology, mode: state.mode,
              phase: state.phase, ply: state.ply, turn: state.turn, seats: state.seats,
              winner: state.winner, outcome: state.outcome, createdAt: state.createdAt, updatedAt: state.updatedAt
            };
          })
        };
      case "arena_create": return this._create(args, context);
      case "arena_invite": return this._invite(args, context);
      case "arena_join": return this._join(args);
      case "arena_state": {
        const match = this._match(args.gameId);
        return this._snapshot(match, this._seat(match, args.token));
      }
      case "arena_move": return this._move(args);
      case "arena_speak": return this._speak(args);
      case "arena_control": return this._control(args, context);
      case "arena_rules": return this._rules(args);
      case "arena_replay": {
        const match = this._match(args.gameId);
        return this._snapshot(match, this._seat(match, args.token));
      }
      default: throw new ArenaError("UNKNOWN_TOOL", `Unknown arena operation: ${name}`, 404);
    }
  }

  _create(args, context) {
    this._host(context);
    const levelIndex = Content.LEVELS.findIndex((level) => level.topology === args.topology);
    requireValue(levelIndex >= 0, "INVALID_TOPOLOGY", "Choose a topology from arena_catalog.");
    requireValue(["ai", "duel"].includes(args.mode), "INVALID_MODE", "mode must be ai or duel.");
    const difficulty = args.difficulty === undefined ? "normal" : args.difficulty;
    requireValue(typeof difficulty === "string" && Object.hasOwn(Content.DIFFICULTIES, difficulty),
      "INVALID_DIFFICULTY", "Choose a difficulty from arena_catalog.");
    const createdAt = this._at();
    const match = {
      schemaVersion: 1, gameVersion,
      gameId: crypto.randomUUID(),
      title: text(args.title, "title", 100, true) || "Topology Gomoku",
      levelIndex, mode: args.mode, difficulty, phase: "waiting",
      createdAt, version: 0, eventSeq: 0, stopped: false, moves: [], events: [],
      seats: Object.fromEntries(ROLES.map((role) => [role, {
        name: role === "white" && args.mode === "ai" ? "Built-in AI" : "",
        model: "", joined: role === "white" && args.mode === "ai", lastSeen: null
      }])),
      credentials: {}, receipts: {},
      controller: controllerFor(levelIndex, args.mode, difficulty, this.now, this.random)
    };
    match.controller.pause(this.now());
    this._event(match, "created", { ply: 0, mode: match.mode, topology: args.topology });
    this.matches.set(match.gameId, match);
    this._changed(match);
    return this._snapshot(match);
  }

  _invite(args, context) {
    this._host(context);
    const match = this._match(args.gameId);
    requireValue(ROLES.includes(args.role), "INVALID_ROLE", "role must be black, white or commentator.");
    requireValue(!(match.mode === "ai" && args.role === "white"), "AI_SEAT", "White is occupied by the built-in AI.", 409);
    requireValue(match.phase !== "ended", "GAME_ENDED", "This game has ended.", 409);
    if (!match.credentials[args.role]) {
      match.credentials[args.role] = { inviteToken: crypto.randomBytes(24).toString("hex"), token: null };
      this._save(match);
    }
    return { gameId: match.gameId, role: args.role, inviteToken: match.credentials[args.role].inviteToken };
  }

  _join(args) {
    const match = this._match(args.gameId);
    requireValue(typeof args.inviteToken === "string", "INVALID_INVITE", "Invalid invitation.", 401);
    const role = ROLES.find((item) => match.credentials[item]?.inviteToken === args.inviteToken);
    requireValue(role, "INVALID_INVITE", "Invalid invitation.", 401);
    const name = text(args.name, "name", 60);
    const model = text(args.model, "model", 100, true);
    const credential = match.credentials[role];
    if (!credential.token) {
      requireValue(match.phase !== "ended", "GAME_ENDED", "This game has ended.", 409);
      credential.token = crypto.randomBytes(32).toString("hex");
      match.seats[role] = { name, model, joined: true, lastSeen: this._at() };
      this._event(match, "joined", { role, name, model, ply: match.moves.length });
      this._changed(match);
    } else {
      // A copied invitation reconnects its seat; changing identity silently
      // would make the recorded player attribution unreliable.
      requireValue(match.seats[role].name === name && match.seats[role].model === model,
        "SEAT_CLAIMED", "This invitation already belongs to another identity. Reconnect using the original name and model.", 409);
      match.seats[role].lastSeen = this._at();
    }
    return { token: credential.token, role, state: this._snapshot(match, role) };
  }

  _move(args) {
    const match = this._match(args.gameId);
    const role = this._seat(match, args.token, true);
    requireValue(PLAYERS[role], "PLAYER_REQUIRED", "Only a player can place stones.", 403);
    const requestId = text(args.requestId, "requestId", 128);
    const explanation = text(args.explanation, "explanation", 1000, true);
    requireValue(Number.isInteger(args.cell) && args.cell >= 0 && args.cell < match.controller.game.board.length,
      "INVALID_CELL", "cell must be an integer on this board.");
    requireValue(Number.isInteger(args.expectedVersion) && args.expectedVersion >= 0,
      "INVALID_VERSION", "expectedVersion must be a nonnegative integer.");
    const key = `${role}:${requestId}`;
    const fingerprint = JSON.stringify([args.cell, args.expectedVersion, explanation]);
    const receipt = match.receipts[key];
    if (receipt) {
      requireValue(receipt.fingerprint === fingerprint, "REQUEST_REUSED", "This requestId was used for a different move.", 409);
      // A previous write may have failed after the in-memory move. A retry
      // must make that receipt durable before reporting it as accepted.
      this._save(match);
      return { ...this._snapshot(match, role), duplicate: true, acceptedVersion: receipt.version };
    }
    requireValue(match.phase === "playing", "NOT_PLAYING", "Wait until the host starts or resumes the game.", 409);
    requireValue(args.expectedVersion === match.version, "STALE_VERSION", "Read the current state before moving.", 409);
    requireValue(match.controller.game.turn === PLAYERS[role], "WRONG_TURN", "Wait for your own turn.", 409);
    requireValue(match.controller.performMove(args.cell, PLAYERS[role], null, this.now()),
      "ILLEGAL_MOVE", "That intersection is occupied or cannot be played.", 409);
    this._recordMoves(match);
    if (explanation) this._event(match, "speech", { role, kind: "explanation", text: explanation, ply: match.moves.length });
    match.receipts[key] = { fingerprint, version: match.version };
    this._changed(match);
    return this._snapshot(match, role);
  }

  _speak(args) {
    const match = this._match(args.gameId);
    const role = this._seat(match, args.token, true);
    requireValue(["reaction", "thinking", "explanation", "commentary"].includes(args.kind),
      "INVALID_KIND", "Choose reaction, thinking, explanation or commentary.");
    const message = text(args.text, "text", 1000);
    requireValue(Number.isInteger(args.ply) && args.ply >= 0 && args.ply <= match.moves.length,
      "INVALID_PLY", "ply must refer to the current position or a recorded move.");
    if (args.expectedVersion !== undefined) {
      requireValue(Number.isInteger(args.expectedVersion) && args.expectedVersion === match.version,
        "STALE_VERSION", "Read the current state before speaking about this position.", 409);
    }
    if (role === "commentator") {
      requireValue(args.kind === "commentary", "ROLE_RESTRICTED", "A commentator publishes commentary.", 403);
    } else {
      requireValue(args.kind !== "commentary", "ROLE_RESTRICTED", "Players publish reaction, thinking or explanation.", 403);
      if (args.kind === "explanation") {
        requireValue(args.ply > 0 && match.moves[args.ply - 1].player === role,
          "INVALID_PLY", "An explanation must refer to your own recorded move.");
      } else {
        requireValue(match.phase === "playing" && match.controller.game.turn === PLAYERS[role]
          && args.ply === match.moves.length,
        "WRONG_TURN", "Publish reactions and thinking during your turn at the current position.", 409);
      }
    }
    const count = match.events.filter((event) => event.type === "speech" && event.role === role && event.ply === args.ply).length;
    requireValue(count < 8, "SPEECH_LIMIT", "This role has already published eight messages for this position.", 409);
    const event = this._event(match, "speech", { role, kind: args.kind, text: message, ply: args.ply });
    this._changed(match);
    return { event: clone(event), state: this._snapshot(match, role) };
  }

  _control(args, context) {
    this._host(context);
    const match = this._match(args.gameId);
    requireValue(["start", "pause", "resume", "stop"].includes(args.action),
      "INVALID_ACTION", "action must be start, pause, resume or stop.");
    const allowed = {
      start: match.phase === "waiting",
      pause: match.phase === "playing",
      resume: match.phase === "paused",
      stop: match.phase !== "ended"
    };
    requireValue(allowed[args.action], "INVALID_PHASE", `Cannot ${args.action} a ${match.phase} game.`, 409);
    if (args.action === "start" || args.action === "resume") {
      requireValue(match.seats.black.joined && match.seats.white.joined,
        "SEATS_NOT_READY", "Both player seats must be ready before starting.", 409);
      match.phase = "playing";
      match.controller.resume(this.now());
      if (match.mode === "ai" && match.controller.game.turn === Engine.AI) match.controller._scheduleAi(this.now());
    } else if (args.action === "pause") {
      match.phase = "paused";
      match.controller.pause(this.now());
    } else {
      match.phase = "ended";
      match.stopped = true;
      match.controller.pause(this.now());
      match.controller.scheduled = [];
    }
    this._event(match, "control", { action: args.action, ply: match.moves.length });
    this._changed(match);
    return this._snapshot(match);
  }

  _rules(args) {
    const match = this._match(args.gameId);
    this._seat(match, args.token);
    const game = match.controller.game;
    const result = {
      topology: game.level.topology, width: game.rules.width, height: game.rules.height, target: game.rules.target,
      coordinateSystem: "Zero-based, row-major: cell = y * width + x. x increases right; y increases down.",
      pieces: { black: 1, white: -1, empty: 0 },
      directions: Engine.DIRECTIONS.map((direction, index) => ({ index, ...direction })),
      edgeText: game.level.edgeText, ruleText: game.level.ruleText,
      victory: match.mode === "duel"
        ? "First player with five distinct stones along a topology path wins. A full board without a line is a draw."
        : "Shared single-player rules apply: five in a topology path wins; blocking all white winning paths completes the level; no remaining black winning path settles the game. See outcome, winner and winReason.",
      seamBits: { x: Engine.SEAM_X, y: Engine.SEAM_Y, twist: Engine.SEAM_TWIST },
      speech: "Player speech is public to spectators and commentators, and is excluded from the opponent's player-state response."
    };
    if (args.cell !== undefined || args.direction !== undefined || args.length !== undefined) {
      requireValue(Number.isInteger(args.cell) && args.cell >= 0 && args.cell < game.board.length,
        "INVALID_CELL", "cell must be an integer on this board.");
      requireValue(Number.isInteger(args.direction) && args.direction >= 0 && args.direction < 8,
        "INVALID_DIRECTION", "direction must be an integer from 0 to 7.");
      const length = args.length === undefined ? game.rules.target : args.length;
      requireValue(Number.isInteger(length) && length >= 1 && length <= game.board.length,
        "INVALID_LENGTH", "length must be between 1 and the board cell count.");
      result.path = Engine.tracePath(game.rules, args.cell, args.direction, length);
      result.next = Engine.step(game.rules, args.cell, args.direction);
    }
    return result;
  }

  tick() {
    if (this.closed) return false;
    let changed = false;
    for (const match of this.matches.values()) {
      if (match.phase !== "playing") continue;
      const previous = match.moves.length;
      match.controller.tick(this.now());
      if (match.controller.game.moves.length !== previous) {
        this._recordMoves(match);
        this._changed(match);
        changed = true;
      }
    }
    return changed;
  }

  close() {
    if (this.closed) return;
    for (const match of this.matches.values()) this._save(match);
    this.closed = true;
    this.removeAllListeners();
  }
}

module.exports = { Arena, ArenaError };

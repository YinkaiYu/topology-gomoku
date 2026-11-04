"use strict";

const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Engine = require("../app/assets/topology.js");
const Content = require("../app/assets/level-config.js");
const { GameController } = require("../app/assets/game-controller.js");
const { readPrompt } = require("./prompts.cjs");
const Coordinates = require("./public/coordinates.js");
const Clock = require("./clock.cjs");
const { guidance } = require("./guidance.cjs");
const { briefingFor } = require("./rules-briefing.cjs");
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

// Keep the previous OpenCode avatar valid for saved profiles and replays.
const AVATARS = ["deepseek-color", "openai", "claude-color", "gemini-color", "kimi-color", "qwen-color", "grok", "opencode"];
function profile(value = {}) {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "INVALID_PROFILE", "Expected a player profile.");
  const name = text(value.name, "name", 60, true);
  const avatar = value.avatar || "";
  requireValue(typeof avatar === "string", "INVALID_AVATAR", "Choose a built-in avatar or upload a PNG.");
  if (avatar && !AVATARS.includes(avatar)) {
    requireValue(avatar.length <= 100000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar), "INVALID_AVATAR", "Use a PNG avatar up to 256 pixels and 75 KiB.");
    const data = Buffer.from(avatar.slice(22), "base64");
    requireValue(data.length >= 24 && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      && data.toString("ascii",12,16) === "IHDR" && data.readUInt32BE(16) > 0 && data.readUInt32BE(16) <= 256
      && data.readUInt32BE(20) > 0 && data.readUInt32BE(20) <= 256, "INVALID_AVATAR", "Use a PNG avatar up to 256 pixels.");
  }
  return { displayName: name, avatar };
}
function dimensions(level, width = level.width, height = level.height) {
  requireValue(Number.isInteger(width) && Number.isInteger(height) && width >= 5 && width <= 19 && height >= 5 && height <= 19,
    "INVALID_SIZE", "Board width and height must be integers from 5 to 19.");
  requireValue(level.topology !== "sphere" || width === height, "INVALID_SIZE", "The sphere requires a square board.");
  return { width, height };
}
function clockFor(value) {
  if (value === null) return null;
  value = value === undefined ? { initialMs: 300000, incrementMs: 5000 } : value;
  requireValue(value && typeof value === "object" && Number.isInteger(value.initialMs) && value.initialMs >= 1000 && value.initialMs <= 3600000
    && Number.isInteger(value.incrementMs) && value.incrementMs >= 0 && value.incrementMs <= 60000,
  "INVALID_CLOCK", "clock needs initialMs (1000–3600000) and incrementMs (0–60000), or null for an untimed game.");
  return { initialMs: value.initialMs, incrementMs: value.incrementMs, remainingMs: { black: value.initialMs, white: value.initialMs }, active: null, runningSince: null };
}
function inputCell(value, rules) {
  const cell = Coordinates.cell(value, rules.width, rules.height);
  requireValue(cell !== null, "INVALID_CELL", "cell must be an on-board coordinate such as A1, or a zero-based cell index.");
  return cell;
}
function controllerFor(levelIndex, mode, difficulty, now, random, size) {
  const controller = new GameController({
    now, random, preferences: { difficulty, unlocked: Content.LEVELS.length - 1, hints: false, sound: false }
  });
  // The shared plane chapter intentionally starts a single-player tutorial.
  // Arena starts a normal empty match, then restores the requested mode on this
  // instance only. All moves and adjudication still use the shared controller.
  controller.startLevel(levelIndex, { mode: "duel", introMode: "none" }, now());
  controller.game.mode = mode;
  controller.game.level = { ...controller.game.level, ...size, tutorial: false };
  if (size) {
    controller.game.rules = Engine.createRules({ type: controller.game.level.topology, ...size, target: 5 });
    controller.game.board = Engine.createBoard(controller.game.rules);
  }
  controller.drainEvents();
  return controller;
}

// Use the shared engine's transitions, retaining the prefix that tracePath
// discards when a requested number of distinct cells cannot be reached.
function traceRulePath(rules, cell, direction, length) {
  const path = { requestedLength: length, cells: [cell], seams: [], directions: [direction], complete: false, stop: null };
  const visited = new Set(path.cells);
  while (path.cells.length < length) {
    const next = Engine.step(rules, cell, direction);
    if (!next || visited.has(next.cell)) {
      path.stop = { reason: next ? "repeated_cell" : "boundary", cell, direction, next };
      return path;
    }
    path.seams.push(next.seam);
    cell = next.cell;
    direction = next.direction;
    path.cells.push(cell);
    path.directions.push(direction);
    visited.add(cell);
  }
  path.complete = true;
  return path;
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
      const size = dimensions(Content.LEVELS[saved.levelIndex], saved.width, saved.height);
      const controller = controllerFor(saved.levelIndex, saved.mode, saved.difficulty, this.now, this.random, size);
      for (const move of saved.moves) {
        requireValue(PLAYERS[move.player] && controller.performMove(move.cell, PLAYERS[move.player], null, this.now()),
          "INVALID_SAVE", `Invalid replay in ${filename}.`, 500);
        // Recorded white moves are replayed directly; never choose AI moves
        // again or run chapter advancement while restoring a finished game.
        controller.scheduled = [];
        controller.game.autoAdvancePending = false;
      }
      controller.drainEvents();
      const match = { ...saved, ...size, controller, receipts: saved.receipts || {} };
      for (const role of ROLES) {
        const seat = match.seats[role];
        seat.ready = role !== "commentator" && (typeof seat.ready === "boolean" ? seat.ready
          : (saved.mode === "ai" && role === "white") || (saved.phase !== "waiting" && seat.joined));
      }
      // Saved balances are checkpointed; downtime never consumes a player's time.
      match.clock = saved.clock ? { ...saved.clock, active: null, runningSince: null } : null;
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
    if (match.clock) saved.clock = { ...match.clock, remainingMs: Clock.remaining(match.clock, this.now()), active: null, runningSince: null };
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
    const match = this.matches.get(gameId);
    this._expireClock(match);
    return match;
  }

  _expireClock(match, now = this.now()) {
    if (match.phase !== "playing" || !match.clock?.active || Clock.remaining(match.clock, now)[match.clock.active] > 0) return false;
    const loser = match.clock.active;
    Clock.freeze(match.clock, now);
    this._finish(match, "win", loser === "black" ? "white" : "black", "timeout");
    this._changed(match);
    return true;
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
      !role || !["note", "speech"].includes(event.type) || event.role === role);
  }

  _progress(match) {
    return {
      gameId: match.gameId,
      phase: match.phase,
      turn: match.phase === "ended" ? null : (match.controller.game.turn === Engine.HUMAN ? "black" : "white"),
      ply: match.moves.length,
      version: match.version,
      eventSeq: match.eventSeq
    };
  }

  _snapshot(match, role = null) {
    const game = match.controller.game;
    const progress = this._progress(match), clock = Clock.snapshot(match.clock, this.now());
    return clone({
      schemaVersion: 1,
      gameVersion: match.gameVersion,
      ...progress,
      guidance: guidance({ ...progress, clock, seats: match.seats }, role),
      clock,
      title: match.title,
      mode: match.mode,
      difficulty: match.difficulty,
      topology: game.level.topology,
      levelIndex: match.levelIndex,
      width: game.rules.width,
      height: game.rules.height,
      target: game.rules.target,
      board: Array.from(game.board),
      moves: match.moves.map(move => ({ ...move, coordinate: Coordinates.label(move.cell, game.rules.width, game.rules.height) })),
      events: this._visibleEvents(match, role).map(event => event.type === "move" ? { ...event, coordinate: Coordinates.label(event.cell, game.rules.width, game.rules.height) } : event),
      seats: match.seats,
      outcome: match.resolution?.outcome || (match.stopped ? "stopped" : game.outcome),
      winner: match.resolution ? match.resolution.winner : match.stopped ? null : (game.winner === Engine.HUMAN ? "black" : game.winner === Engine.AI ? "white" : null),
      winReason: match.resolution?.winReason || (match.stopped ? "host_stopped" : game.winReason),
      winningCells: match.resolution ? [] : game.winningMask ? Array.from(game.winningMask.cells) : [],
      drawOffer: match.drawOffer || null,
      commentaryEnabled: match.commentaryEnabled ?? Boolean(match.seats.commentator?.joined),
      legalCells: match.phase === "playing" ? Array.from(game.board.keys()).filter((cell) => game.board[cell] === 0) : [],
      createdAt: match.createdAt,
      updatedAt: match.events.at(-1)?.at || match.createdAt
    });
  }

  _recordMoves(match, now = this.now()) {
    const game = match.controller.game;
    for (let index = match.moves.length; index < game.moves.length; index += 1) {
      const source = game.moves[index];
      const move = {
        cell: source.cell, player: source.player === Engine.HUMAN ? "black" : "white",
        ply: index + 1, at: this._at()
      };
      Clock.moved(match.clock, move.player, now);
      match.moves.push(move);
      match.version += 1;
      this._event(match, "move", { ...move, version: match.version });
    }
    if (game.status === "ended" && match.phase !== "ended") {
      Clock.freeze(match.clock, now);
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
            this._expireClock(match);
            const state = this._snapshot(match);
            return {
              gameId: state.gameId, title: state.title, topology: state.topology, mode: state.mode,
              phase: state.phase, ply: state.ply, turn: state.turn, seats: state.seats,
              winner: state.winner, outcome: state.outcome, createdAt: state.createdAt, updatedAt: state.updatedAt
            };
          })
        };
      case "arena_create": return this._create(args, context);
      case "arena_profile": {
        this._host(context);
        const match = this._match(args.gameId);
        requireValue(PLAYERS[args.role], "INVALID_ROLE", "Choose black or white.");
        Object.assign(match.seats[args.role], profile(args));
        this._event(match, "profile", { role: args.role, ply: match.moves.length });
        this._changed(match);
        return this._snapshot(match);
      }
      case "arena_delete": {
        this._host(context);
        const match = this._match(args.gameId);
        requireValue(match.phase === "ended", "NOT_ENDED", "End the match before deleting it.", 409);
        if (this.dataDir) fs.unlinkSync(path.join(this.dataDir, `match-${match.gameId}.json`));
        this.matches.delete(match.gameId);
        this.emit("deleted", match.gameId);
        return { deleted: [match.gameId] };
      }
      case "arena_clear": {
        this._host(context);
        const ids = [...this.matches.values()].filter(m => m.phase === "ended").map(m => m.gameId);
        for (const gameId of ids) this.call("arena_delete", { gameId }, context);
        return { deleted: ids };
      }
      case "arena_invite": return this._invite(args, context);
      case "arena_join": return this._join(args);
      case "arena_ready": return this._ready(args);
      case "arena_state": {
        const match = this._match(args.gameId);
        return this._snapshot(match, this._seat(match, args.token));
      }
      case "arena_move": return this._move(args);
      case "arena_resign": return this._decision(args, "resign");
      case "arena_draw": return this._decision(args, "draw");
      case "arena_note": return this._note(args);
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
    const size = dimensions(Content.LEVELS[levelIndex], args.width, args.height);
    const profiles = Object.fromEntries(["black", "white"].map(role => [role, profile(args.players?.[role])]));
    const match = {
      schemaVersion: 1, gameVersion,
      gameId: crypto.randomUUID(),
      title: text(args.title, "title", 100, true) || "Topology Gomoku",
      levelIndex, ...size, mode: args.mode, difficulty, phase: "waiting", commentaryEnabled: false,
      createdAt, version: 0, eventSeq: 0, stopped: false, moves: [], events: [],
      seats: Object.fromEntries(ROLES.map((role) => [role, {
        name: role === "white" && args.mode === "ai" ? "Built-in AI" : "",
        ...profiles[role], model: "", joined: role === "white" && args.mode === "ai",
        ready: role === "white" && args.mode === "ai", lastSeen: null
      }])),
      credentials: {}, receipts: {},
      clock: clockFor(args.clock),
      controller: controllerFor(levelIndex, args.mode, difficulty, this.now, this.random, size)
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
    if (args.role === "commentator" && !match.commentaryEnabled) {
      match.commentaryEnabled = true;
      this._event(match, "commentary", { enabled: true, ply: match.moves.length });
      this._changed(match);
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
      match.seats[role] = { ...match.seats[role], name, model, joined: true, lastSeen: this._at() };
      this._event(match, "joined", { role, name, model, ply: match.moves.length });
      this._changed(match);
    } else {
      // A copied invitation reconnects its seat; changing identity silently
      // would make the recorded player attribution unreliable.
      requireValue(match.seats[role].name === name && match.seats[role].model === model,
        "SEAT_CLAIMED", "This invitation already belongs to another identity. Reconnect using the original name and model.", 409);
      match.seats[role].lastSeen = this._at();
    }
    return { token: credential.token, role, state: this._snapshot(match, role), rules: this._rules({ gameId: match.gameId, token: credential.token }) };
  }

  _begin(match, automatic = false) {
    requireValue(match.seats.black.joined && match.seats.white.joined
      && match.seats.black.ready && match.seats.white.ready,
    "SEATS_NOT_READY", "Both players must finish preparation and call arena_ready before starting.", 409);
    const now = this.now();
    match.phase = "playing";
    Clock.start(match.clock, match.controller.game.turn === Engine.HUMAN ? "black" : "white", now);
    match.controller.resume(now);
    if (match.mode === "ai" && match.controller.game.turn === Engine.AI) match.controller._scheduleAi(now);
    this._event(match, "control", { action: "start", automatic, ply: match.moves.length });
  }

  _ready(args) {
    const match = this._match(args.gameId);
    const role = this._seat(match, args.token, true);
    requireValue(PLAYERS[role], "PLAYER_REQUIRED", "Only a player can confirm readiness.", 403);
    if (match.seats[role].ready) {
      this._save(match);
      return this._snapshot(match, role);
    }
    requireValue(match.phase === "waiting", "NOT_PREPARING", "Readiness can only be confirmed before the match starts.", 409);
    match.seats[role].ready = true;
    this._event(match, "ready", { role, ply: 0 });
    if (match.seats.black.joined && match.seats.white.joined && match.seats.black.ready && match.seats.white.ready) this._begin(match, true);
    this._changed(match);
    return this._snapshot(match, role);
  }

  _move(args) {
    const match = this._match(args.gameId);
    const role = this._seat(match, args.token, true);
    requireValue(PLAYERS[role], "PLAYER_REQUIRED", "Only a player can place stones.", 403);
    const requestId = text(args.requestId, "requestId", 128);
    requireValue(args.explanation === undefined, "INVALID_ARGUMENT", "Send text separately with arena_note.");
    const cell = inputCell(args.cell, match.controller.game.rules);
    requireValue(Number.isInteger(args.expectedVersion) && args.expectedVersion >= 0,
      "INVALID_VERSION", "expectedVersion must be a nonnegative integer.");
    const key = `${role}:${requestId}`;
    const fingerprint = JSON.stringify([cell, args.expectedVersion, ""]);
    const receipt = match.receipts[key];
    if (receipt) {
      requireValue(receipt.fingerprint === fingerprint, "REQUEST_REUSED", "This requestId was used for a different move.", 409);
      // A previous write may have failed after the in-memory move. A retry
      // must make that receipt durable before reporting it as accepted.
      this._save(match);
      return { ...this._snapshot(match, role), duplicate: true, acceptedVersion: receipt.version };
    }
    const now = this.now();
    this._expireClock(match, now);
    requireValue(match.phase === "playing", "NOT_PLAYING", "The match must be playing; read arena_state for the current phase and result.", 409);
    requireValue(args.expectedVersion === match.version, "STALE_VERSION", "Read the current state before moving.", 409);
    requireValue(match.controller.game.turn === PLAYERS[role], "WRONG_TURN", "Wait for your own turn.", 409);
    requireValue(match.controller.performMove(cell, PLAYERS[role], null, now),
      "ILLEGAL_MOVE", "That intersection is occupied or cannot be played.", 409);
    this._clearDraw(match, role);
    this._recordMoves(match, now);
    match.receipts[key] = { fingerprint, version: match.version };
    this._changed(match);
    return this._snapshot(match, role);
  }

  _clearDraw(match, role) {
    if (!match.drawOffer) return;
    this._event(match, "draw", { action: role === match.drawOffer.role ? "withdraw" : "decline",
      role, offerId: match.drawOffer.id, reason: "move", ply: match.moves.length });
    match.drawOffer = null;
  }

  _finish(match, outcome, winner, winReason) {
    Clock.freeze(match.clock, this.now());
    match.resolution = { outcome, winner, winReason };
    match.phase = "ended";
    match.drawOffer = null;
    match.controller.pause(this.now());
    match.controller.scheduled = [];
    match.controller.game.autoAdvancePending = false;
    this._event(match, "result", { ...match.resolution, ply: match.moves.length, winningCells: [] });
  }

  _decision(args, operation) {
    const match = this._match(args.gameId);
    const role = this._seat(match, args.token, true);
    requireValue(PLAYERS[role], "PLAYER_REQUIRED", "Only a player can resign or negotiate a draw.", 403);
    const requestId = text(args.requestId, "requestId", 128);
    requireValue(args.reason === undefined, "INVALID_ARGUMENT", "Send text separately with arena_note.");
    requireValue(Number.isInteger(args.expectedVersion) && args.expectedVersion >= 0,
      "INVALID_VERSION", "expectedVersion must be a nonnegative integer.");
    const fingerprint = JSON.stringify([operation, args.expectedVersion, args.action || null, args.offerId || null, ""]);
    const key = `${role}:${requestId}`;
    const receipt = match.receipts[key];
    if (receipt) {
      requireValue(receipt.fingerprint === fingerprint, "REQUEST_REUSED", "This requestId already belongs to another action.", 409);
      this._save(match);
      return { ...this._snapshot(match, role), duplicate: true, acceptedVersion: receipt.version };
    }
    requireValue(["playing", "paused"].includes(match.phase), "NOT_PLAYING", "The match must have started and not ended.", 409);
    requireValue(args.expectedVersion === match.version, "STALE_VERSION", "Read the current state before deciding.", 409);
    if (operation === "resign") {
      this._event(match, "resign", { role, ply: match.moves.length });
      this._finish(match, "win", role === "black" ? "white" : "black", "resign");
    } else {
      requireValue(["offer", "accept", "decline", "withdraw"].includes(args.action), "INVALID_ACTION", "Choose offer, accept, decline or withdraw.");
      if (args.action === "offer") {
        requireValue(!match.drawOffer, "DRAW_PENDING", "Respond to the existing draw offer first.", 409);
        requireValue(!match.events.some((event) => event.type === "draw" && event.action === "offer" && event.role === role && event.ply === match.moves.length),
          "DRAW_LIMIT", "You already offered a draw at this position. Wait for another move.", 409);
        match.drawOffer = { id: crypto.randomUUID(), role, ply: match.moves.length };
        this._event(match, "draw", { action: "offer", role, offerId: match.drawOffer.id, ply: match.moves.length });
        if (match.mode === "ai") {
          // A transparent position-based policy; no LLM or artificial speech.
          const { board, rules } = match.controller.game;
          const black = Engine.countLiveLines(board, rules, Engine.HUMAN);
          const white = Engine.countLiveLines(board, rules, Engine.AI);
          const accepts = match.moves.length >= Math.ceil(board.length / 2)
            && Math.max(black, white) <= 2 * Math.min(black, white)
            && !Engine.immediateMoves(board, rules, Engine.HUMAN).length
            && !Engine.immediateMoves(board, rules, Engine.AI).length;
          this._event(match, "draw", { action: accepts ? "accept" : "decline", role: "white", offerId: match.drawOffer.id, ply: match.moves.length });
          match.drawOffer = null;
          if (accepts) this._finish(match, "draw", null, "draw_agreement");
        }
      } else {
        const offer = match.drawOffer;
        requireValue(offer && args.offerId === offer.id, "STALE_OFFER", "Read and reference the current drawOffer.id.", 409);
        requireValue(args.action === "withdraw" ? role === offer.role : role !== offer.role,
          "ROLE_RESTRICTED", "Only the other player can respond; only the proposer can withdraw.", 403);
        this._event(match, "draw", { action: args.action, role, offerId: offer.id, ply: match.moves.length });
        match.drawOffer = null;
        if (args.action === "accept") this._finish(match, "draw", null, "draw_agreement");
      }
    }
    match.receipts[key] = { fingerprint, version: match.version };
    this._changed(match);
    return this._snapshot(match, role);
  }

  _note(args) {
    const match = this._match(args.gameId);
    const role = this._seat(match, args.token, true);
    requireValue(args.kind === undefined, "INVALID_ARGUMENT", "Notes do not need a kind.");
    const requestId = text(args.requestId, "requestId", 128);
    const message = text(args.text, "text", 1000);
    requireValue(Number.isInteger(args.ply) && args.ply >= 0 && args.ply <= match.moves.length,
      "INVALID_PLY", "ply must refer to the current position or a recorded move.");
    const key = `${role}:${requestId}`;
    const fingerprint = JSON.stringify(["note", args.ply, message]);
    const receipt = match.receipts[key];
    if (receipt) {
      requireValue(receipt.fingerprint === fingerprint, "REQUEST_REUSED", "This requestId already belongs to another action.", 409);
      this._save(match);
      return { event: clone(match.events.find(event => event.seq === receipt.eventSeq)), state: this._snapshot(match, role), duplicate: true };
    }
    if (role === "commentator") {
      requireValue(match.commentaryEnabled !== false, "COMMENTARY_DISABLED", "Commentary is off. Stop commentary until invited again.", 409);
    }
    const event = this._event(match, "note", { role, text: message, ply: args.ply });
    match.receipts[key] = { fingerprint, eventSeq: event.seq };
    this._changed(match);
    return { event: clone(event), state: this._snapshot(match, role) };
  }

  _control(args, context) {
    this._host(context);
    const match = this._match(args.gameId);
    requireValue(["start", "pause", "resume", "stop", "commentary_on", "commentary_off"].includes(args.action),
      "INVALID_ACTION", "Choose start, pause, resume, stop, commentary_on or commentary_off.");
    if (args.action.startsWith("commentary_")) {
      match.commentaryEnabled = args.action === "commentary_on";
      this._event(match, "commentary", { enabled: match.commentaryEnabled, ply: match.moves.length });
      this._changed(match);
      return this._snapshot(match);
    }
    const allowed = {
      start: match.phase === "waiting",
      pause: match.phase === "playing",
      resume: match.phase === "paused",
      stop: match.phase !== "ended"
    };
    requireValue(allowed[args.action], "INVALID_PHASE", `Cannot ${args.action} a ${match.phase} game.`, 409);
    if (args.action === "start") {
      this._begin(match);
      this._changed(match);
      return this._snapshot(match);
    } else if (args.action === "resume") {
      requireValue(match.seats.black.joined && match.seats.white.joined,
        "SEATS_NOT_READY", "Both player seats must be ready before starting.", 409);
      match.phase = "playing";
      Clock.start(match.clock, match.controller.game.turn === Engine.HUMAN ? "black" : "white", this.now());
      match.controller.resume(this.now());
      if (match.mode === "ai" && match.controller.game.turn === Engine.AI) match.controller._scheduleAi(this.now());
    } else if (args.action === "pause") {
      Clock.freeze(match.clock, this.now());
      match.phase = "paused";
      match.controller.pause(this.now());
    } else {
      Clock.freeze(match.clock, this.now());
      match.phase = "ended";
      match.stopped = true;
      match.drawOffer = null;
      match.controller.pause(this.now());
      match.controller.scheduled = [];
    }
    this._event(match, "control", { action: args.action, ply: match.moves.length });
    this._changed(match);
    return this._snapshot(match);
  }

  _rules(args) {
    const match = this._match(args.gameId);
    const role = this._seat(match, args.token);
    const game = match.controller.game;
    const promptRules = JSON.parse(readPrompt("rules.json"));
    const progress = this._progress(match), clock = Clock.snapshot(match.clock, this.now());
    const result = {
      guidance: guidance({ ...progress, clock, seats: match.seats }, role),
      ...promptRules.common,
      state: progress,
      clock,
      topology: game.level.topology, width: game.rules.width, height: game.rules.height, target: game.rules.target,
      briefing: briefingFor(game.rules),
      pieces: { black: 1, white: -1, empty: 0 },
      directions: Engine.DIRECTIONS.map((direction, index) => ({ index, ...direction })),
      edgeText: game.level.edgeText, ruleText: game.level.ruleText,
      victory: promptRules.victory[match.mode],
      seamBits: { x: Engine.SEAM_X, y: Engine.SEAM_Y, twist: Engine.SEAM_TWIST }
    };
    if (args.cell !== undefined || args.direction !== undefined || args.length !== undefined) {
      const cell = inputCell(args.cell, game.rules);
      requireValue(Number.isInteger(args.direction) && args.direction >= 0 && args.direction < 8,
        "INVALID_DIRECTION", "direction must be an integer from 0 to 7.");
      const length = args.length === undefined ? game.rules.target : args.length;
      requireValue(Number.isInteger(length) && length >= 1 && length <= game.board.length,
        "INVALID_LENGTH", "length must be between 1 and the board cell count.");
      result.path = traceRulePath(game.rules, cell, args.direction, length);
      result.path.coordinates = result.path.cells.map(value => Coordinates.label(value, game.rules.width, game.rules.height));
      result.next = Engine.step(game.rules, cell, args.direction);
      const annotate = step => { if (step) step.coordinate = Coordinates.label(step.cell, game.rules.width, game.rules.height); };
      annotate(result.next); annotate(result.path.stop); annotate(result.path.stop?.next);
    }
    return result;
  }

  tick() {
    if (this.closed) return false;
    let changed = false;
    for (const match of this.matches.values()) {
      if (match.phase !== "playing") continue;
      const now = this.now();
      if (this._expireClock(match, now)) { changed = true; continue; }
      const previous = match.moves.length;
      match.controller.tick(this.now());
      if (match.controller.game.moves.length !== previous) {
        this._clearDraw(match, "white");
        this._recordMoves(match, now);
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

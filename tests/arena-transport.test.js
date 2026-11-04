"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { startServer, validLocalRequest } = require("../arena/server.cjs");
const { Client } = require("../arena/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js");
const { StreamableHTTPClientTransport } = require("../arena/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js");
const { StdioClientTransport } = require("../arena/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js");

async function fixture(t, create = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-transport-"));
  const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
  t.after(async () => {
    await app.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const rpc = async (name, arguments_, host = false) => {
    const response = await fetch(`${app.url}/api/call`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(host ? { Authorization: `Bearer ${app.hostToken}` } : {}) },
      body: JSON.stringify({ name, arguments: arguments_ })
    });
    return { status: response.status, ...await response.json() };
  };
  const created = await rpc("arena_create", { topology: "torus", mode: "duel", title: "Transport test", ...create }, true);
  const gameId = created.result.gameId;
  const seats = {};
  for (const role of ["black", "white", "commentator"]) {
    const invite = await rpc("arena_invite", { gameId, role }, true);
    seats[role] = (await rpc("arena_join", { gameId, inviteToken: invite.result.inviteToken, name: role })).result;
  }
  return { app, rpc, gameId, seats, directory };
}

async function preparePlayers(rpc, gameId, seats) {
  let result;
  for (const role of ["black", "white"]) if (seats[role]) result = await rpc("arena_ready", { gameId, token: seats[role].token });
  return result;
}

test("local origin validation accepts equivalent default HTTP ports without admitting other ports or hosts", () => {
  const request = (host, origin) => ({ headers: { host, ...(origin === undefined ? {} : { origin }) } });
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    for (const authority of [host, `${host}:80`]) {
      assert.equal(validLocalRequest(request(authority), 80), true, authority);
      for (const origin of [`http://${host}`, `http://${host}:80`]) {
        assert.equal(validLocalRequest(request(authority, origin), 80), true, `${authority} ${origin}`);
      }
      assert.equal(validLocalRequest(request(authority), 4318), false, "A missing/default port cannot reach a nondefault server");
      assert.equal(validLocalRequest(request(`${host}:4318`, `http://${authority}`), 4318), false);
    }
    assert.equal(validLocalRequest(request(`${host}:4318`, `http://${host}:4318`), 4318), true);
    assert.equal(validLocalRequest(request(`${host}:4318`), 80), false);
    assert.equal(validLocalRequest(request(host, `http://${host}:4318`), 80), false);
  }
  for (const host of ["evil.example", "evil.example:80", "127.0.0.1.evil.example", "127.0.0.1:81", "127.0.0.1@evil.example"]) {
    assert.equal(validLocalRequest(request(host, "http://127.0.0.1"), 80), false);
  }
  for (const origin of ["https://127.0.0.1", "http://evil.example", "http://127.0.0.1:81", "http://127.0.0.1/", "null", ""]) {
    assert.equal(validLocalRequest(request("127.0.0.1", origin), 80), false);
  }
  assert.equal(validLocalRequest(request("127.0.0.1"), undefined), false);
});

test("HTTP enforces host scope, local origins, JSON input and private-file boundaries", async (t) => {
  const { app, rpc, gameId, seats } = await fixture(t);
  assert.equal((await rpc("arena_control", { gameId, action: "start" })).status, 403);
  assert.equal((await rpc("arena_control", { gameId, action: "start" }, true)).error.code, "SEATS_NOT_READY");
  assert.equal((await preparePlayers(rpc, gameId, seats)).result.phase, "playing");
  const crossOrigin = await fetch(`${app.url}/api/health`, { headers: { Origin: "https://example.com" } });
  assert.equal(crossOrigin.status, 403);
  // Node fetch normalizes Host. Use a raw HTTP request to exercise the actual
  // DNS-rebinding guard rather than accidentally retesting a valid request.
  const badHost = await new Promise((resolve, reject) => {
    const request = http.get(`${app.url}/api/health`, { headers: { Host: "evil.example" } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on("error", reject);
  });
  assert.equal(badHost, 403);
  assert.equal((await fetch(`${app.url}/.arena/runtime.json`)).status, 404);
  assert.equal((await fetch(`${app.url}/assets/../..%2f.arena/runtime.json`)).status, 404);
  const wrongType = await fetch(`${app.url}/api/call`, { method: "POST", body: "{}" });
  assert.equal(wrongType.status, 415);
  assert.equal((await fetch(`${app.url}/api/health`)).status, 200);
});

test("two servers cannot concurrently own the same persistent matches", async (t) => {
  const { directory } = await fixture(t);
  await assert.rejects(startServer({ port: 0, dataDir: directory, writeRuntime: false }), { code: "DATA_LOCKED" });
});

test("startup runtime-write failure releases the listener and data lock", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-startup-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const runtimePath = path.join(directory, "a-directory");
  fs.mkdirSync(runtimePath);
  await assert.rejects(startServer({ port: 0, dataDir: directory, runtimePath }));
  assert.equal(fs.existsSync(path.join(directory, "server.lock")), false);
  const restarted = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
  await restarted.close();
});

test("aborted waits detach listeners and shutdown cancels pending waits", async (t) => {
  const { app, gameId, seats } = await fixture(t);
  const state = await app.call("arena_state", { gameId, token: seats.black.token });
  const baseline = app.arena.listenerCount("change");
  const abort = new AbortController();
  const first = app.call("arena_wait", {
    gameId, token: seats.black.token, afterSeq: state.eventSeq, timeoutMs: 25000
  }, {}, abort.signal);
  assert.equal(app.arena.listenerCount("change"), baseline + 1);
  abort.abort();
  await assert.rejects(first, { code: "CANCELLED" });
  assert.equal(app.arena.listenerCount("change"), baseline);
  const second = app.call("arena_wait", {
    gameId, token: seats.black.token, afterSeq: state.eventSeq, timeoutMs: 25000
  });
  const rejected = assert.rejects(second, { code: "SHUTDOWN" });
  await app.close();
  await rejected;
  assert.equal(app.arena.listenerCount("change"), 0);
  await assert.rejects(app.call("arena_state", { gameId }), { code: "SHUTDOWN" });
});

test("shutdown closes incomplete requests and releases the lock even if final persistence fails", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-shutdown-"));
  const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
  t.after(async () => {
    await app.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await app.call("arena_create", { topology: "plane", mode: "duel" }, { hostAuthorized: true });
  t.mock.method(app.arena, "_save", () => { throw new Error("Simulated disk failure"); });
  const connected = new Promise((resolve) => app.server.once("connection", resolve));
  const request = http.request(`${app.url}/api/call`, {
    method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "100" }
  });
  request.on("error", () => {});
  request.flushHeaders();
  await connected;
  const closing = app.close();
  assert.equal(app.close(), closing, "close is idempotent while sockets drain");
  await assert.rejects(closing, /Simulated disk failure/);
  assert.equal(app.server.listening, false);
  assert.equal(fs.existsSync(path.join(directory, "server.lock")), false);
  request.destroy();
  const restarted = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
  await restarted.close();
});

test("concurrent moves are serialized around the authoritative version", async (t) => {
  const { rpc, gameId, seats } = await fixture(t);
  await preparePlayers(rpc, gameId, seats);
  const attempts = await Promise.all([0, 1].map((cell) => rpc("arena_move", {
    gameId, token: seats.black.token, cell, expectedVersion: 0, requestId: `concurrent-${cell}`
  })));
  assert.deepEqual(attempts.map((result) => result.status).sort(), [200, 409]);
  assert.equal(attempts.find((result) => result.status === 409).error.code, "STALE_VERSION");
  const state = (await rpc("arena_state", { gameId })).result;
  assert.equal(state.ply, 1);
  assert.equal(state.version, 1);
  assert.equal(state.board.filter(Boolean).length, 1);
});

test("SSE spectators see notes, while player and commentator waits and replays remain filtered", async (t) => {
  const { app, rpc, gameId, seats } = await fixture(t);
  await preparePlayers(rpc, gameId, seats);
  const streamAbort = new AbortController();
  const response = await fetch(`${app.url}/api/events?gameId=${gameId}`, { signal: streamAbort.signal });
  const reader = response.body.getReader();
  t.after(() => { streamAbort.abort(); });
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: state/);
  const seq = (await rpc("arena_state", { gameId, token: seats.white.token })).result.eventSeq;
  const waiting = [seats.white, seats.commentator].map(seat => rpc("arena_wait", { gameId, token: seat.token, afterSeq: seq, timeoutMs: 2000 }));
  await rpc("arena_note", { gameId, token: seats.black.token, requestId: "seam", ply: 0, text: "I see a seam." });
  const next = new TextDecoder().decode((await reader.read()).value);
  assert.match(next, /I see a seam/);
  for (const result of await Promise.all(waiting)) assert.ok(!result.result.events.some((event) => event.text));
  for (const seat of [seats.white, seats.commentator]) assert.ok(!(await rpc("arena_replay", { gameId, token: seat.token })).result.events.some((event) => event.text));
  assert.equal((await rpc("arena_wait", { gameId, timeoutMs: 0, afterSeq: 0 })).status, 401);
  assert.equal((await rpc("arena_wait", { gameId, token: seats.black.token, afterSeq: 0, timeoutMs: 999999 })).status, 400);
});

test("README service discovery finds the Skill and real CLI notes preserve text and seat privacy", async (t) => {
  const { app, rpc, gameId, seats, directory } = await fixture(t);
  const health = await (await fetch(`${app.url}/api/health`)).json();
  assert.equal(health.service, "topology-gomoku-arena");
  assert.ok(fs.existsSync(path.join(health.workspacePath, "arena/skills/topology-gomoku-arena/SKILL.md")));
  const cli = path.join(health.workspacePath, "arena/cli.cjs");
  const file = path.join(directory, "note.json");
  const args = { gameId, token: seats.black.token, text: '咦，接缝相连。`$() "quotes"\n再看一眼。', ply: 0, requestId: "cli-note" };
  fs.writeFileSync(file, JSON.stringify(args), "utf8");
  const run = async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [cli, "call", "arena_note", "--url", app.url, "--file", file]);
    return JSON.parse(stdout);
  };
  const first = await run();
  assert.equal(first.ok, true);
  assert.equal(first.result.event.text, args.text);
  const retry = await run();
  assert.equal(retry.result.duplicate, true);
  assert.equal(retry.result.event.seq, first.result.event.seq);
  for (const seat of [seats.white, seats.commentator]) {
    assert.ok(!(await rpc("arena_state", { gameId, token: seat.token })).result.events.some(event => event.text === args.text));
  }
  assert.equal((await rpc("arena_state", { gameId })).result.events.filter(event => event.text === args.text).length, 1);
});

for (const transport of ["http", "stdio", "cli"]) {
  test(`real ${transport} rule queries preserve partial paths and current progress`, async (t) => {
    const { app, rpc, gameId, seats, directory } = await fixture(t, { topology: "mobius", width: 7, height: 7 });
    let call;
    if (transport === "cli") {
      const file = path.join(directory, "rules-request.json");
      call = async (args) => {
        fs.writeFileSync(file, JSON.stringify(args));
        const { stdout } = await promisify(execFile)(process.execPath, [path.resolve(__dirname, "../arena/cli.cjs"), "call", "arena_rules", "--url", app.url, "--file", file]);
        const response = JSON.parse(stdout);
        assert.equal(response.ok, true);
        return response.result;
      };
    } else {
      const client = new Client({ name: "arena-rules-test", version: "1.0.0" });
      const wire = transport === "http"
        ? new StreamableHTTPClientTransport(new URL(`${app.url}/mcp`))
        : new StdioClientTransport({ command: process.execPath, args: [path.resolve(__dirname, "../arena/mcp.cjs"), "--url", app.url], stderr: "pipe" });
      t.after(() => client.close());
      await client.connect(wire);
      call = async (args) => {
        const response = await client.callTool({ name: "arena_rules", arguments: args });
        assert.equal(response.isError, undefined);
        assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent);
        return response.structuredContent;
      };
    }
    const query = (extra = {}) => call({ gameId, token: seats.black.token, ...extra });
    const waiting = await query();
    assert.equal(waiting.state.phase, "waiting");
    const boundary = await query({ cell: 0, direction: 2, length: 8 });
    assert.deepEqual(boundary.path.cells, [0, 7, 14, 21, 28, 35, 42]);
    assert.equal(boundary.path.complete, false);
    assert.equal(boundary.path.stop.reason, "boundary");
    assert.equal(boundary.path.stop.next, null);
    assert.equal(boundary.next.cell, 7);
    const cycle = await query({ cell: "D4", direction: 0, length: 9 });
    assert.equal(cycle.path.complete, false);
    assert.equal(cycle.path.stop.reason, "repeated_cell");
    assert.equal(cycle.path.stop.next.cell, 24);
    const diagonal = await query({ cell: 6, direction: 1, length: 3 });
    assert.equal(diagonal.path.complete, true);
    assert.deepEqual(diagonal.path.cells, [6, 35, 29]);
    assert.deepEqual(diagonal.path.directions, [1, 7, 7]);
    await preparePlayers(rpc, gameId, seats);
    await rpc("arena_move", { gameId, token: seats.black.token, cell: "D4", expectedVersion: 0, requestId: "first" });
    const state = (await rpc("arena_note", { gameId, token: seats.white.token, text: "private-thought", ply: 1, requestId: "note" })).result.state;
    const current = await query({ cell: 24, direction: 0, length: 9 });
    assert.deepEqual(current.state, { gameId, phase: "playing", turn: "white", ply: 1, version: 1, eventSeq: state.eventSeq });
    assert.deepEqual(current.path, cycle.path, "Geometry is independent of occupancy");
    assert.ok(!JSON.stringify(current).includes("private-thought"));
    const large = (await rpc("arena_create", { topology: "mobius", mode: "duel", width: 9, height: 9 }, true)).result;
    const invitation = (await rpc("arena_invite", { gameId: large.gameId, role: "black" }, true)).result;
    const joined = (await rpc("arena_join", { ...invitation, name: "large-board-player" })).result;
    const long = await call({ gameId: large.gameId, token: joined.token, cell: 0, direction: 2, length: 65 });
    assert.equal(long.path.requestedLength, 65, "MCP and CLI accept lengths up to the board cell count");
    assert.equal(long.path.stop.reason, "boundary");
  });
}

for (const transport of ["http", "stdio"]) {
  test(`real MCP SDK ${transport} client discovers tools and plays on the shared server`, async (t) => {
    const { app, rpc, gameId, seats } = await fixture(t);
    const client = new Client({ name: "arena-test", version: "1.0.0" });
    const wire = transport === "http"
      ? new StreamableHTTPClientTransport(new URL(`${app.url}/mcp`))
      : new StdioClientTransport({ command: process.execPath, args: [path.resolve(__dirname, "../arena/mcp.cjs"), "--url", app.url], stderr: "pipe" });
    t.after(async () => { await client.close(); });
    await client.connect(wire);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
      "arena_draw", "arena_join", "arena_move", "arena_note", "arena_ready", "arena_replay", "arena_resign", "arena_rules", "arena_state", "arena_wait"
    ]);
    assert.equal(listed.tools.find(tool => tool.name === "arena_move").inputSchema.properties.explanation, undefined);
    assert.equal(listed.tools.find(tool => tool.name === "arena_note").inputSchema.properties.kind, undefined);
    const firstReady = await client.callTool({ name: "arena_ready", arguments: { gameId, token: seats.white.token } });
    assert.equal(firstReady.structuredContent.phase, "waiting");
    assert.equal(firstReady.structuredContent.clock.active, null);
    const lastReady = await client.callTool({ name: "arena_ready", arguments: { gameId, token: seats.black.token } });
    assert.equal(lastReady.structuredContent.phase, "playing");
    assert.equal(lastReady.structuredContent.clock.active, "black");
    assert.equal((await client.callTool({ name: "arena_ready", arguments: { gameId, token: seats.black.token } })).structuredContent.eventSeq, lastReady.structuredContent.eventSeq);
    const moveArgs = { gameId, token: seats.black.token, cell: `A${seats.black.state.height}`, expectedVersion: 0, requestId: "first" };
    assert.equal((await client.callTool({ name: "arena_move", arguments: { ...moveArgs, explanation: "Old field" } })).isError, true);
    const move = await client.callTool({ name: "arena_move", arguments: moveArgs });
    assert.equal(move.isError, undefined);
    assert.equal(move.structuredContent.ply, 1);
    assert.equal(move.structuredContent.clock.active, "white");
    assert.equal(move.structuredContent.clock.incrementMs, 5000);
    assert.equal(move.structuredContent.clock.deadline - move.structuredContent.clock.serverNow, move.structuredContent.clock.remainingMs.white);
    const noteArgs = { gameId, token: seats.black.token, ply: 1, text: "Occupy the seam.", requestId: "seam-note" };
    const note = await client.callTool({ name: "arena_note", arguments: noteArgs });
    assert.equal(note.isError, undefined);
    assert.equal(note.structuredContent.event.text, noteArgs.text);
    assert.equal(note.structuredContent.state.clock.deadline, move.structuredContent.clock.deadline);
    assert.ok(note.structuredContent.state.clock.remainingMs.white <= move.structuredContent.clock.remainingMs.white);
    assert.equal((await client.callTool({ name: "arena_note", arguments: noteArgs })).structuredContent.duplicate, true);
    assert.equal((await rpc("arena_state", { gameId })).result.board[0], 1);
    const bad = await client.callTool({ name: "arena_move", arguments: { gameId, token: seats.commentator.token, cell: 1, expectedVersion: 1, requestId: "illegal" } });
    assert.equal(bad.isError, true);
    const state = await client.callTool({ name: "arena_state", arguments: { gameId, token: seats.white.token } });
    assert.equal(state.structuredContent.turn, "white");
    assert.ok(!state.structuredContent.events.some((event) => event.type === "note"));
    const timedWait = await client.callTool({ name: "arena_wait", arguments: { gameId, token: seats.white.token, afterSeq: state.structuredContent.eventSeq, timeoutMs: 30 } });
    assert.equal(timedWait.structuredContent.eventSeq, state.structuredContent.eventSeq);
    assert.equal(timedWait.structuredContent.clock.deadline, state.structuredContent.clock.deadline);
    assert.equal(timedWait.structuredContent.guidance.action, "act");
    assert.ok(timedWait.structuredContent.clock.remainingMs.white <= state.structuredContent.clock.remainingMs.white, "An own-turn wait immediately returns a fresh balance");
    assert.equal(timedWait.structuredContent.clock.remainingMs.black, state.structuredContent.clock.remainingMs.black);
    const observer = await client.callTool({ name: "arena_state", arguments: { gameId, token: seats.commentator.token } });
    assert.ok(!observer.structuredContent.events.some((event) => event.type === "note"));
    const offer = await client.callTool({ name: "arena_draw", arguments: { gameId, token: seats.black.token, action: "offer", expectedVersion: 1, requestId: "offer" } });
    assert.equal(offer.isError, undefined);
    const declined = await client.callTool({ name: "arena_draw", arguments: { gameId, token: seats.white.token, action: "decline", offerId: offer.structuredContent.drawOffer.id, expectedVersion: 1, requestId: "decline" } });
    assert.equal(declined.structuredContent.drawOffer, null);
    const other = await rpc("arena_create", { topology: "plane", mode: "ai" }, true);
    const otherInvite = await rpc("arena_invite", { gameId: other.result.gameId, role: "black" }, true);
    const joined = await client.callTool({ name: "arena_join", arguments: { ...otherInvite.result, name: "Conceding player" } });
    const joinedState = joined.structuredContent.state, briefing = joined.structuredContent.rules;
    assert.equal(joinedState.phase, "waiting");
    assert.equal(briefing.width, joinedState.width); assert.equal(briefing.height, joinedState.height);
    assert.equal(briefing.topology, joinedState.topology); assert.equal(briefing.target, joinedState.target);
    assert.ok(briefing.briefing.boundaryRules.length > 0);
    assert.ok(briefing.briefing.examples.length > 0);
    const reread = await client.callTool({ name: "arena_rules", arguments: { gameId: other.result.gameId, token: joined.structuredContent.token } });
    assert.deepEqual(reread.structuredContent.briefing, briefing.briefing);
    await client.callTool({ name: "arena_ready", arguments: { gameId: other.result.gameId, token: joined.structuredContent.token } });
    const conceded = await client.callTool({ name: "arena_resign", arguments: { gameId: other.result.gameId, token: joined.structuredContent.token, expectedVersion: 0, requestId: "resign" } });
    assert.equal(conceded.structuredContent.winReason, "resign");
    const baseline = app.arena.listenerCount("change");
    const pending = client.callTool({
      name: "arena_wait",
      arguments: { gameId, token: seats.black.token, afterSeq: declined.structuredContent.eventSeq, timeoutMs: 25000 }
    }).catch((error) => error);
    const startedDeadline = Date.now() + 1000;
    while (app.arena.listenerCount("change") === baseline && Date.now() < startedDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(app.arena.listenerCount("change"), baseline + 1);
    await client.close();
    await pending;
    const cancelledDeadline = Date.now() + 1000;
    while (app.arena.listenerCount("change") > baseline && Date.now() < cancelledDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(app.arena.listenerCount("change"), baseline, "Closing an MCP client cancels its server-side wait");
  });
}

test("waits keep following on timeout and return immediately once it is the caller's turn", { timeout: 3000 }, async t => {
  const { app, rpc, gameId, seats } = await fixture(t);
  const start = (await preparePlayers(rpc, gameId, seats)).result;
  const wait = (role, state, timeoutMs) => app.call("arena_wait", { gameId, token: seats[role].token, afterSeq: state.eventSeq, timeoutMs });
  const baseline = app.arena.listenerCount("change");
  const ownTurn = wait("black", start, 25000);
  assert.equal(app.arena.listenerCount("change"), baseline, "Own-turn calls never install a long poll");
  assert.equal((await ownTurn).guidance.action, "act");
  const idle = await wait("white", start, 30);
  assert.equal(idle.guidance.action, "wait");
  assert.equal(idle.eventSeq, start.eventSeq);
  assert.ok(idle.clock.remainingMs.black < start.clock.remainingMs.black);
  assert.equal(idle.clock.remainingMs.white, start.clock.remainingMs.white);
  const pending = wait("white", idle, 25000);
  await rpc("arena_move", { gameId, token: seats.black.token, cell: "D4", expectedVersion: 0, requestId: "handover" });
  const changed = await pending;
  assert.equal(changed.guidance.action, "act"); assert.equal(changed.turn, "white");
  assert.equal(app.arena.listenerCount("change"), baseline);
  assert.equal((await rpc("arena_state", { gameId, token: seats.commentator.token })).result.guidance, null);
});

for (const transport of ["http", "stdio"]) {
  test(`real MCP ${transport} waits receive a clock timeout without any player action`, async t => {
    const { app, rpc, gameId, seats } = await fixture(t, { clock: { initialMs: 1000, incrementMs: 0 } });
    const client = new Client({ name: "arena-clock-test", version: "1.0.0" });
    t.after(() => client.close());
    await client.connect(transport === "http" ? new StreamableHTTPClientTransport(new URL(`${app.url}/mcp`))
      : new StdioClientTransport({ command: process.execPath, args: [path.resolve(__dirname, "../arena/mcp.cjs"), "--url", app.url], stderr: "pipe" }));
    const state = (await preparePlayers(rpc, gameId, seats)).result;
    const result = await client.callTool({ name: "arena_wait", arguments: { gameId, token: seats.white.token, afterSeq: state.eventSeq, timeoutMs: 5000 } });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.phase, "ended");
    assert.equal(result.structuredContent.winReason, "timeout");
    assert.equal(result.structuredContent.winner, "white");
    assert.equal(result.structuredContent.clock.remainingMs.black, 0);
    assert.equal(result.structuredContent.ply, 0);
  });
}

test("stdio bridge refuses HTTP redirects instead of forwarding seat credentials", async (t) => {
  let redirected = 0;
  const redirector = http.createServer((request, response) => {
    request.resume();
    if (request.url === "/api/call") {
      response.writeHead(307, { Location: "/unexpected-target" });
      response.end();
    } else {
      redirected += 1;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, result: {} }));
    }
  });
  await new Promise((resolve) => redirector.listen(0, "127.0.0.1", resolve));
  const client = new Client({ name: "arena-redirect-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await new Promise((resolve) => { redirector.close(resolve); redirector.closeIdleConnections(); });
  });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(__dirname, "../arena/mcp.cjs"), "--url", `http://127.0.0.1:${redirector.address().port}`],
    stderr: "pipe"
  }));
  const response = await client.callTool({
    name: "arena_state", arguments: { gameId: "local-game", token: "private-seat" }
  });
  assert.equal(response.isError, true);
  assert.equal(redirected, 0);
});


test("every local browser entry obtains an HttpOnly session without a host URL", async(t)=>{
  const {app}=await fixture(t);const response=await fetch(app.url+"/api/bootstrap");const data=await response.json();
  assert.ok(!JSON.stringify(data).includes(app.hostToken));const cookie=response.headers.get("set-cookie");assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
  const rpc=await fetch(app.url+"/api/call",{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie.split(";")[0],Origin:app.url},body:JSON.stringify({name:"arena_create",arguments:{mode:"duel",topology:"torus",width:10,height:9}})});
  assert.equal(rpc.status,200);assert.equal((await rpc.json()).result.width,10);
  const foreign=await fetch(app.url+"/api/bootstrap",{headers:{"Sec-Fetch-Site":"cross-site"}});assert.equal(foreign.status,403);assert.equal(foreign.headers.get("set-cookie"),null);
  const foreignMutation=await fetch(app.url+"/api/call",{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie.split(";")[0],Origin:"https://example.com"},body:'{}'});assert.equal(foreignMutation.status,403);
});

test("deleting a record closes its spectator stream with a deletion event",async(t)=>{
  const {app,gameId,rpc}=await fixture(t);await rpc("arena_control",{gameId,action:"stop"},true);
  const response=await fetch(app.url+"/api/events?gameId="+gameId), reader=response.body.getReader();await reader.read();
  assert.equal((await rpc("arena_delete",{gameId},true)).status,200);
  const next=await reader.read();assert.match(Buffer.from(next.value).toString(),/event: deleted/);assert.equal((await reader.read()).done,true);
  assert.equal(app.arena.listenerCount("deleted"),0);assert.equal((await rpc("arena_state",{gameId})).status,404);
});

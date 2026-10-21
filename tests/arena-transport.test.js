"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { startServer, validLocalRequest } = require("../arena/server.cjs");
const { Client } = require("../arena/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js");
const { StreamableHTTPClientTransport } = require("../arena/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js");
const { StdioClientTransport } = require("../arena/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js");

async function fixture(t) {
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
  const created = await rpc("arena_create", { topology: "torus", mode: "duel", title: "Transport test" }, true);
  const gameId = created.result.gameId;
  const seats = {};
  for (const role of ["black", "white", "commentator"]) {
    const invite = await rpc("arena_invite", { gameId, role }, true);
    seats[role] = (await rpc("arena_join", { gameId, inviteToken: invite.result.inviteToken, name: role })).result;
  }
  return { app, rpc, gameId, seats, directory };
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
  const { app, rpc, gameId } = await fixture(t);
  assert.equal((await rpc("arena_control", { gameId, action: "start" })).status, 403);
  assert.equal((await rpc("arena_control", { gameId, action: "start" }, true)).result.phase, "playing");
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
  await rpc("arena_control", { gameId, action: "start" }, true);
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

test("SSE spectators see reflections, while player waiting and replay remain filtered", async (t) => {
  const { app, rpc, gameId, seats } = await fixture(t);
  await rpc("arena_control", { gameId, action: "start" }, true);
  const streamAbort = new AbortController();
  const response = await fetch(`${app.url}/api/events?gameId=${gameId}`, { signal: streamAbort.signal });
  const reader = response.body.getReader();
  t.after(() => { streamAbort.abort(); });
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: state/);
  const seq = (await rpc("arena_state", { gameId, token: seats.white.token })).result.eventSeq;
  const waiting = rpc("arena_wait", { gameId, token: seats.white.token, afterSeq: seq, timeoutMs: 2000 });
  await rpc("arena_speak", { gameId, token: seats.black.token, kind: "thinking", ply: 0, text: "I see a seam." });
  const next = new TextDecoder().decode((await reader.read()).value);
  assert.match(next, /I see a seam/);
  assert.ok(!(await waiting).result.events.some((event) => event.text === "I see a seam."));
  assert.ok(!(await rpc("arena_replay", { gameId, token: seats.white.token })).result.events.some((event) => event.text));
  assert.equal((await rpc("arena_wait", { gameId, timeoutMs: 0, afterSeq: 0 })).status, 401);
  assert.equal((await rpc("arena_wait", { gameId, token: seats.black.token, afterSeq: 0, timeoutMs: 999999 })).status, 400);
});

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
      "arena_draw", "arena_join", "arena_move", "arena_replay", "arena_resign", "arena_rules", "arena_speak", "arena_state", "arena_wait"
    ]);
    await rpc("arena_control", { gameId, action: "start" }, true);
    const move = await client.callTool({ name: "arena_move", arguments: { gameId, token: seats.black.token, cell: 0, expectedVersion: 0, requestId: "first", explanation: "Occupy the seam." } });
    assert.equal(move.isError, undefined);
    assert.equal(move.structuredContent.ply, 1);
    assert.equal((await rpc("arena_state", { gameId })).result.board[0], 1);
    const bad = await client.callTool({ name: "arena_move", arguments: { gameId, token: seats.commentator.token, cell: 1, expectedVersion: 1, requestId: "illegal" } });
    assert.equal(bad.isError, true);
    const state = await client.callTool({ name: "arena_state", arguments: { gameId, token: seats.white.token } });
    assert.equal(state.structuredContent.turn, "white");
    assert.ok(!state.structuredContent.events.some((event) => event.type === "speech"));
    const offer = await client.callTool({ name: "arena_draw", arguments: { gameId, token: seats.black.token, action: "offer", expectedVersion: 1, requestId: "offer" } });
    assert.equal(offer.isError, undefined);
    const declined = await client.callTool({ name: "arena_draw", arguments: { gameId, token: seats.white.token, action: "decline", offerId: offer.structuredContent.drawOffer.id, expectedVersion: 1, requestId: "decline" } });
    assert.equal(declined.structuredContent.drawOffer, null);
    const other = await rpc("arena_create", { topology: "plane", mode: "ai" }, true);
    const otherInvite = await rpc("arena_invite", { gameId: other.result.gameId, role: "black" }, true);
    const joined = await client.callTool({ name: "arena_join", arguments: { ...otherInvite.result, name: "Conceding player" } });
    await rpc("arena_control", { gameId: other.result.gameId, action: "start" }, true);
    const conceded = await client.callTool({ name: "arena_resign", arguments: { gameId: other.result.gameId, token: joined.structuredContent.token, expectedVersion: 0, requestId: "resign" } });
    assert.equal(conceded.structuredContent.winReason, "resign");
    const baseline = app.arena.listenerCount("change");
    const pending = client.callTool({
      name: "arena_wait",
      arguments: { gameId, token: seats.white.token, afterSeq: declined.structuredContent.eventSeq, timeoutMs: 25000 }
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

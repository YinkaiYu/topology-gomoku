"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { startServer } = require("../arena/server.cjs");
const { seed, bytes } = require("../scripts/qa-arena-payload.cjs");
const { Client } = require("../arena/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js");
const { StreamableHTTPClientTransport } = require("../arena/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js");
const { StdioClientTransport } = require("../arena/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js");

for (const transport of ["http", "stdio", "cli"]) {
  test(`${transport} lean results bound context, keep current board, page events and preserve role privacy`, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-lean-transport-"));
    const app = await startServer({ port: 0, dataDir: directory, writeRuntime: false });
    let client;
    t.after(async () => {
      await client?.close(); await app.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const { gameId, tokens, afterSeq, avatar, host } = seed(app.arena, 35);
    let invoke;
    if (transport === "cli") {
      const request = path.join(directory, "request.json");
      invoke = async (name, args) => {
        fs.writeFileSync(request, JSON.stringify(args));
        const { stdout } = await promisify(execFile)(process.execPath, [path.resolve(__dirname, "../arena/cli.cjs"), "call", name, "--url", app.url, "--file", request]);
        const response = JSON.parse(stdout); assert.equal(response.ok, true);
        assert.equal(stdout.trim(), JSON.stringify(response), "CLI tool results avoid expanding arrays into hundreds of lines");
        return response.result;
      };
    } else {
      client = new Client({ name: "lean-protocol-test", version: "1.0.0" });
      await client.connect(transport === "http" ? new StreamableHTTPClientTransport(new URL(`${app.url}/mcp`))
        : new StdioClientTransport({ command: process.execPath, args: [path.resolve(__dirname, "../arena/mcp.cjs"), "--url", app.url], stderr: "pipe" }));
      invoke = async (name, args) => {
        const response = await client.callTool({ name, arguments: args });
        assert.equal(response.isError, undefined, JSON.stringify(response.content));
        assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent);
        return response.structuredContent;
      };
    }
    const call = async (name, extra = {}, role = "black") => {
      const result = await invoke(name, { gameId, token: tokens[role], ...extra });
      const encoded = JSON.stringify(result);
      assert.ok(!encoded.includes("data:image"), `${name} must never include uploaded image data`);
      assert.ok(!encoded.includes('"avatar"'), `${name} omits presentation avatar fields`);
      for (const other of ["black", "white", "commentator"].filter(r => r !== role)) {
        assert.ok(!encoded.includes(`${other}-private-`), `${name} must preserve ${other}'s private notes`);
      }
      return result;
    };
    const before = await call("arena_state");
    assert.equal(before.board.length, 49); assert.equal(before.board.filter(Boolean).length, 2);
    assert.equal(before.events, undefined); assert.equal(before.moves, undefined);
    assert.ok(bytes(before) < 6000, "Ordinary state should not grow with avatar/history size");
    app.arena.call("arena_profile", { gameId, role: "white", name: "Profile updated", avatar }, host);
    const afterProfile = await call("arena_state");
    assert.equal(afterProfile.seats.white.displayName, "Profile updated");
    const delta = await call("arena_wait", { afterSeq, limit: 3, timeoutMs: 0 });
    assert.equal(delta.events.length, 3); assert.equal(delta.hasMore, true);
    assert.ok(delta.nextAfterSeq < delta.eventSeq, "History cursor is distinct from current board eventSeq");
    assert.equal(delta.board.filter(Boolean).length, 2);
    assert.ok(delta.events.every(event => !event.text), "Live note events return acknowledgements, not repeated note text");
    let cursor = afterSeq, pageCount = 0; const seen = [];
    do {
      const page = await call("arena_wait", { afterSeq: cursor, limit: 50, timeoutMs: 0 });
      assert.ok(page.events.length <= 50); assert.ok(bytes(page) < 24000);
      assert.ok(page.nextAfterSeq > cursor || !page.hasMore);
      seen.push(...page.events.map(event => event.seq)); cursor = page.nextAfterSeq; pageCount++;
      if (!page.hasMore) break;
      assert.ok(pageCount < 100);
    } while (true);
    const spectator = app.arena.call("arena_state", { gameId });
    assert.ok(JSON.stringify(spectator).includes("data:image/png;base64,"), "Browser still receives its visual assets");
    const expected = spectator.events.filter(event => event.seq > afterSeq && (!["note", "speech"].includes(event.type) || event.role === "black")).map(event => event.seq);
    assert.deepEqual(seen, expected); assert.equal(new Set(seen).size, seen.length);
    assert.equal(cursor, spectator.eventSeq, "Cursor advances past invisible events as well");
    const empty = await call("arena_wait", { afterSeq: cursor, timeoutMs: 0 });
    assert.deepEqual(empty.events, []); assert.equal(empty.hasMore, false);
    for (const role of ["black", "white", "commentator"]) {
      const replay = await call("arena_replay", { limit: 50 }, role);
      assert.ok(replay.events.length <= 50); assert.ok(bytes(replay) < 24000);
      assert.equal(replay.moves, undefined);
      if (role === "commentator") assert.ok(!replay.events.some(event => event.type === "note"));
    }
    const replayNotes = []; cursor = 0;
    do {
      const replay = await call("arena_replay", { afterSeq: cursor, limit: 50 });
      replayNotes.push(...replay.events.filter(e => e.type === "note").map(e => e.text));
      cursor = replay.nextAfterSeq;
      if (!replay.hasMore) break;
    } while (true);
    assert.equal(replayNotes.length, 35); assert.ok(replayNotes.every(text => text.startsWith("black-private-")));
    const rules = await call("arena_rules"); assert.ok(rules.briefing); assert.ok(rules.playPolicyRule);
    const geometry = await call("arena_rules", { cell: "D4", direction: 0, length: 5 });
    assert.ok(geometry.path); assert.equal(geometry.briefing, undefined); assert.equal(geometry.playPolicyRule, undefined);
    assert.ok(bytes(geometry) < bytes(rules) / 2);
    const text = "This receipt must not repeat my submitted sentence.";
    const note = await call("arena_note", { text, ply: 2, requestId: "compact-receipt" });
    assert.ok(!JSON.stringify(note).includes(text)); assert.equal(note.state.board, undefined);
    assert.ok(bytes(note) < 3000);
    const duplicate = await call("arena_note", { text, ply: 2, requestId: "compact-receipt" });
    assert.equal(duplicate.duplicate, true); assert.equal(duplicate.event.seq, note.event.seq);
    const move = await call("arena_move", { cell: "D5", expectedVersion: 2, requestId: "compact-move" });
    assert.equal(move.board.filter(Boolean).length, 3); assert.equal(move.turn, "white");
    assert.equal(move.events, undefined); assert.equal(move.moves, undefined);
    const moveRetry = await call("arena_move", { cell: "D5", expectedVersion: 2, requestId: "compact-move" });
    assert.equal(moveRetry.duplicate, true); assert.equal(moveRetry.ply, 3);
    const draw = await call("arena_draw", { action: "offer", expectedVersion: 3, requestId: "compact-draw" });
    assert.ok(draw.drawOffer.id);
    const ended = await call("arena_resign", { expectedVersion: 3, requestId: "compact-resign" });
    assert.equal(ended.winner, "white"); assert.equal(ended.phase, "ended");
  });
}

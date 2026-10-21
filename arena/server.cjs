#!/usr/bin/env node
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Arena } = require("./match.cjs");
const { createMcp } = require("./tools.cjs");
const { readPrompt } = require("./prompts.cjs");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const ROOT = path.resolve(__dirname, "..");
const VERSION = require("./package.json").version;
const GAME_VERSION = require("../package.json").version;
const BASE_COMMIT = "76bef39";
const SERVICE = "topology-gomoku-arena";

function problem(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}
async function bodyJSON(request) {
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw problem("CONTENT_TYPE", "Use application/json.", 415);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 262144) throw problem("BODY_TOO_LARGE", "Request exceeds 256 KiB.", 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw problem("INVALID_JSON", "Expected a JSON object."); }
}
function equalSecret(a, b) {
  if (typeof a !== "string" || a.length !== b.length) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validLocalRequest(request, port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const localHosts = ["127.0.0.1", "localhost", "[::1]"];
  const hosts = new Set(localHosts.map((host) => `${host}:${port}`));
  // HTTP clients omit the default port when serializing Host and Origin.
  // Accept both spellings only when this server actually listens on port 80.
  if (port === 80) for (const host of localHosts) hosts.add(host);
  if (!hosts.has(request.headers.host)) return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  return typeof origin === "string" && [...hosts].some((host) => origin === `http://${host}`);
}

function lockDataDirectory(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const lockPath = path.join(dataDir, "server.lock");
  const nonce = crypto.randomBytes(16).toString("hex");
  function write() {
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, nonce }), { flag: "wx", mode: 0o600 });
  }
  try { write(); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let previous;
    try { previous = JSON.parse(fs.readFileSync(lockPath, "utf8")); } catch { throw problem("DATA_LOCKED", "Unrecognized arena data lock; inspect it before starting.", 409); }
    if (!Number.isInteger(previous.pid) || previous.pid < 1) throw problem("DATA_LOCKED", "Invalid arena data lock.", 409);
    let running = true;
    try { process.kill(previous.pid, 0); } catch (error_) { if (error_.code === "ESRCH") running = false; }
    if (running) throw problem("DATA_LOCKED", "Another arena process owns this data directory.", 409);
    // Two starters may observe the same dead owner. Serialize recovery so a
    // late starter can never unlink the fresh lock installed by the first.
    const recoveryPath = `${lockPath}.recovery`;
    let recovery;
    try {
      recovery = fs.openSync(recoveryPath, "wx", 0o600);
    } catch (recoveryError) {
      if (recoveryError.code === "EEXIST") throw problem("DATA_LOCKED", "Another startup is recovering this data directory. If it was interrupted, inspect server.lock.recovery.", 409);
      throw recoveryError;
    }
    try {
      const latest = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      if (latest.pid !== previous.pid || latest.nonce !== previous.nonce) {
        throw problem("DATA_LOCKED", "The data directory owner changed during startup. Try again.", 409);
      }
      fs.unlinkSync(lockPath);
      write();
    } finally {
      fs.closeSync(recovery);
      fs.unlinkSync(recoveryPath);
    }
  }
  return () => {
    try {
      if (JSON.parse(fs.readFileSync(lockPath, "utf8")).nonce === nonce) fs.unlinkSync(lockPath);
    } catch { /* never remove a lock now owned by another process */ }
  };
}

async function startServer(options = {}) {
  const dataDir = options.dataDir || path.join(ROOT, ".arena", "data");
  const runtimePath = options.runtimePath || path.join(ROOT, ".arena", "runtime.json");
  const hostToken = options.hostToken || crypto.randomBytes(32).toString("hex");
  const unlock = lockDataDirectory(dataDir);
  let arena;
  try { arena = new Arena({ dataDir }); } catch (error) { unlock(); throw error; }
  const streams = new Map();
  const waits = new Set();
  let closed = false;
  let closePromise;
  let tick;
  let url;
  let server;

  async function call(name, args = {}, context = {}, signal) {
    if (closed) throw problem("SHUTDOWN", "Arena is stopping.", 503);
    if (typeof name !== "string" || !args || typeof args !== "object" || Array.isArray(args)) {
      throw problem("INVALID_ARGUMENT", "Expected a tool name and argument object.");
    }
    if (name !== "arena_wait") return arena.call(name, args, context);
    if (!Number.isInteger(args.afterSeq) || args.afterSeq < 0 ||
        !Number.isInteger(args.timeoutMs ?? 20000) || (args.timeoutMs ?? 20000) < 0 || (args.timeoutMs ?? 20000) > 25000) {
      throw problem("INVALID_ARGUMENT", "afterSeq must be nonnegative; timeoutMs is 0–25000.");
    }
    if (!args.token) throw problem("TOKEN_REQUIRED", "Join a role before waiting.", 401);
    const state = arena.call("arena_state", args, context);
    if (state.eventSeq > args.afterSeq || state.phase === "ended" || args.timeoutMs === 0) return state;
    if (waits.size >= 64) throw problem("BUSY", "Too many pending waits.", 429);
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        arena.off("change", changed);
        signal?.removeEventListener("abort", aborted);
        waits.delete(cancel);
      };
      const finish = () => {
        cleanup();
        try { resolve(arena.call("arena_state", args, context)); } catch (error) { reject(error); }
      };
      const changed = (gameId) => { if (gameId === args.gameId) finish(); };
      const aborted = () => { cleanup(); reject(problem("CANCELLED", "Wait cancelled.", 499)); };
      const cancel = () => { cleanup(); reject(problem("SHUTDOWN", "Arena is stopping.", 503)); };
      waits.add(cancel);
      arena.on("change", changed);
      signal?.addEventListener("abort", aborted, { once: true });
      timer = setTimeout(finish, args.timeoutMs ?? 20000);
      if (signal?.aborted) aborted();
    });
  }

  const MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
    ".woff2": "font/woff2", ".ico": "image/x-icon"
  };
  function serveFile(response, pathname) {
    let base;
    let relative;
    if (pathname.startsWith("/assets/")) { base = path.join(ROOT, "app", "assets"); relative = pathname.slice(8); }
    else if (pathname.startsWith("/arena-fonts/")) { base = path.join(__dirname, "public", "fonts"); relative = pathname.slice(13); }
    else { base = path.join(__dirname, "public"); relative = pathname === "/" ? "index.html" : pathname.slice(1); }
    const file = path.resolve(base, relative);
    if (!file.startsWith(base + path.sep) || !MIME[path.extname(file)] || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw problem("NOT_FOUND", "Not found.", 404);
    }
    response.writeHead(200, { "Content-Type": MIME[path.extname(file)], "Cache-Control": "no-cache" });
    const stream = fs.createReadStream(file);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  }

  server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (closed) throw problem("SHUTDOWN", "Arena is stopping.", 503);
      if (!validLocalRequest(request, server.address()?.port)) throw problem("LOCAL_ONLY", "Use this arena's local origin.", 403);
      if (request.headers["sec-fetch-site"] === "cross-site") throw problem("LOCAL_ONLY", "Open the local arena directly.", 403);
      const parsed = new URL(request.url, url);
      const pathname = decodeURIComponent(parsed.pathname);
      const bearer = request.headers.authorization?.replace(/^Bearer /, "");
      const cookie = (request.headers.cookie || "").split(";").map(s => s.trim()).find(s => s.startsWith(`arena_${server.address().port}=`))?.split("=")[1];
      const context = { hostAuthorized: equalSecret(bearer, hostToken) || equalSecret(cookie, hostToken) };
      if (request.method === "GET" && pathname === "/api/health") {
        return json(response, 200, { service: SERVICE, version: VERSION, gameVersion: GAME_VERSION, pid: process.pid, workspacePath: ROOT });
      }
      if (request.method === "GET" && pathname === "/api/bootstrap") {
        response.setHeader("Set-Cookie", `arena_${server.address().port}=${hostToken}; HttpOnly; SameSite=Strict; Path=/`);
        return json(response, 200, { version: VERSION, gameVersion: GAME_VERSION, baseCommit: BASE_COMMIT, workspacePath: ROOT, mcpUrl: `${url}/mcp` });
      }
      if (request.method === "GET" && pathname === "/api/prompts") {
        return json(response, 200, { invitation: readPrompt("invitation.md") });
      }
      if (request.method === "POST" && pathname === "/api/shutdown") {
        if (!context.hostAuthorized) throw problem("HOST_REQUIRED", "Host permission required.", 403);
        json(response, 200, { ok: true });
        setTimeout(() => close().catch((error) => console.error("Arena shutdown failed:", error.message)), 30);
        return;
      }
      if (request.method === "POST" && pathname === "/api/call") {
        const body = await bodyJSON(request);
        const controller = new AbortController();
        response.on("close", () => { if (!response.writableEnded) controller.abort(); });
        const result = await call(body.name, body.arguments || {}, context, controller.signal);
        if (!response.destroyed) json(response, 200, { ok: true, result });
        return;
      }
      if (pathname === "/mcp") {
        if (request.method !== "POST") return json(response, 405, { error: "Use MCP Streamable HTTP POST." });
        const body = await bodyJSON(request);
        const mcp = createMcp((name, args, signal) => call(name, args, {}, signal));
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        response.on("close", () => { mcp.close().catch(() => {}); });
        await mcp.connect(transport);
        await transport.handleRequest(request, response, body);
        return;
      }
      if (request.method === "GET" && pathname === "/api/events") {
        if (streams.size >= 32) throw problem("BUSY", "Too many spectator connections.", 429);
        const gameId = parsed.searchParams.get("gameId");
        const state = arena.call("arena_state", { gameId });
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        const send = (value) => {
          if (response.writableLength > 1024 * 1024) { response.destroy(); return; }
          response.write(`id: ${value.eventSeq}\nevent: state\ndata: ${JSON.stringify(value)}\n\n`);
        };
        send(state);
        const changed = (id) => { if (id === gameId) send(arena.call("arena_state", { gameId })); };
        arena.on("change", changed);
        const deleted = (id) => { if (id === gameId) { response.write('event: deleted\ndata: {}\n\n'); cleanup(); response.end(); } };
        arena.on("deleted", deleted);
        const heartbeat = setInterval(() => send(arena.call("arena_state", { gameId })), 10000);
        const cleanup = () => { clearInterval(heartbeat); arena.off("change", changed); arena.off("deleted", deleted); streams.delete(response); };
        streams.set(response, cleanup);
        response.on("close", cleanup);
        return;
      }
      if (request.method === "GET") return serveFile(response, pathname);
      throw problem("NOT_FOUND", "Not found.", 404);
    } catch (error) {
      if (!response.headersSent && !response.destroyed) {
        json(response, error.status || 400, { ok: false, error: { code: error.code || "REQUEST_FAILED", message: error.message } });
      } else if (!response.destroyed) response.end();
    }
  });
  server.requestTimeout = 35000;
  server.headersTimeout = 10000;
  arena.setMaxListeners(128);
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port ?? 4318, "127.0.0.1", resolve);
    });
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
  url = `http://127.0.0.1:${server.address().port}`;
  try {
    if (options.writeRuntime !== false) {
      fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
      const temporary = `${runtimePath}.${process.pid}.tmp`;
      try {
        fs.writeFileSync(temporary, JSON.stringify({ service: SERVICE, pid: process.pid, url, hostToken, workspacePath: ROOT, version: VERSION }), { mode: 0o600 });
        fs.renameSync(temporary, runtimePath);
      } catch (error) {
        try { fs.unlinkSync(temporary); } catch {}
        throw error;
      }
    }
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
  tick = setInterval(() => {
    try { arena.tick(); } catch (error) { console.error("Arena tick failed:", error.message); }
  }, 100);
  function close() {
    if (closePromise) return closePromise;
    closed = true;
    clearInterval(tick);
    for (const cancel of [...waits]) cancel();
    for (const [stream, cleanup] of streams) { cleanup(); stream.end(); }
    let persistenceError;
    try { arena.close(); } catch (error) { persistenceError = error; }
    closePromise = new Promise((resolve, reject) => {
      // Incomplete request bodies and disconnected MCP clients must not keep
      // a stopped arena alive. Completed tool calls get a short flush window.
      const force = setTimeout(() => server.closeAllConnections(), 250);
      force.unref();
      server.close(() => {
        clearTimeout(force);
        unlock();
        if (options.writeRuntime !== false) {
          try {
            const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
            if (runtime.hostToken === hostToken) fs.unlinkSync(runtimePath);
          } catch { /* absent runtime is already stopped */ }
        }
        if (persistenceError) reject(persistenceError);
        else resolve();
      });
      server.closeIdleConnections();
    });
    return closePromise;
  }
  return { server, arena, url, hostToken, call, close };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const port = Number(option("--port", 4318));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be 1–65535.");
  const instance = await startServer({ port, dataDir: option("--data-dir", undefined) });
  console.log(`Topology Gomoku Arena ${VERSION}: ${instance.url}`);
  const shutdown = () => instance.close().catch((error) => { console.error(error.message); process.exitCode = 1; });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { startServer, SERVICE, validLocalRequest };

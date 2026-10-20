#!/usr/bin/env node
"use strict";

const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { createMcp } = require("./tools.cjs");

function requestSignal(signal, timeoutMs) {
  // AbortSignal.any was added after Node 20.0. Keep the declared Node 20
  // baseline usable and remove the parent listener after each request.
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error("Arena request timed out.")), timeoutMs);
  return {
    signal: controller.signal,
    cleanup() { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const position = args.indexOf("--url");
  const base = new URL(position >= 0 ? args[position + 1] : "http://127.0.0.1:4318");
  if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
      base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("Arena only connects to a local HTTP server.");
  }
  const server = createMcp(async (name, arguments_, signal) => {
    const request = requestSignal(signal, 30000);
    try {
      const response = await fetch(new URL("/api/call", base), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, arguments: arguments_ }),
        redirect: "error", signal: request.signal
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw Object.assign(new Error(body.error?.message || `HTTP ${response.status}`), { code: body.error?.code });
      }
      return body.result;
    } finally {
      request.cleanup();
    }
  });
  await server.connect(new StdioServerTransport());
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };

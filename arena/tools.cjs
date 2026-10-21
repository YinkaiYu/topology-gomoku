"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");
const { version } = require("./package.json");
const { readPrompt } = require("./prompts.cjs");

const id = z.string().min(1).max(128);
const game = { gameId: id };
const seat = { ...game, token: id };
const tools = {
  arena_join: {
    schema: { ...game, inviteToken: id, name: z.string().min(1).max(60), model: z.string().max(100).optional() }
  },
  arena_state: {
    schema: seat, readOnly: true
  },
  arena_rules: {
    schema: { ...seat, cell: z.number().int().nonnegative().optional(), direction: z.number().int().min(0).max(7).optional(), length: z.number().int().min(1).max(64).optional() },
    readOnly: true
  },
  arena_move: {
    schema: { ...seat, cell: z.number().int().nonnegative(), expectedVersion: z.number().int().nonnegative(), requestId: id, explanation: z.string().max(1000).optional() }
  },
  arena_speak: {
    schema: { ...seat, kind: z.enum(["reaction", "thinking", "explanation", "commentary"]), text: z.string().min(1).max(1000), ply: z.number().int().nonnegative(), expectedVersion: z.number().int().nonnegative().optional() }
  },
  arena_resign: {
    schema: { ...seat, expectedVersion: z.number().int().nonnegative(), requestId: id, reason: z.string().max(1000).optional() }
  },
  arena_draw: {
    schema: { ...seat, action: z.enum(["offer", "accept", "decline", "withdraw"]), offerId: id.optional(), expectedVersion: z.number().int().nonnegative(), requestId: id, reason: z.string().max(1000).optional() }
  },
  arena_wait: {
    schema: { ...seat, afterSeq: z.number().int().nonnegative(), timeoutMs: z.number().int().min(0).max(25000).default(20000) },
    readOnly: true
  },
  arena_replay: {
    schema: seat, readOnly: true
  }
};

function createMcp(call) {
  const descriptions = JSON.parse(readPrompt("tools.json"));
  const server = new McpServer({ name: "topology-gomoku-arena", version }, {
    instructions: readPrompt("mcp.md")
  });
  for (const [name, entry] of Object.entries(tools)) {
    server.registerTool(name, {
      description: descriptions[name],
      inputSchema: entry.schema,
      annotations: { readOnlyHint: Boolean(entry.readOnly), destructiveHint: false, openWorldHint: false }
    }, async (args, extra) => {
      try {
        const result = await call(name, args, extra.signal);
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: error.code || "REQUEST_FAILED", message: error.message } }) }] };
      }
    });
  }
  return server;
}

module.exports = { createMcp, tools };

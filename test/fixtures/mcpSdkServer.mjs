#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

function createServer() {
  const server = new McpServer({ name: "mcp-sdk-test-server", version: "1.0.0" });
  server.registerTool(
    "ping",
    {
      description: "Return a deterministic fixture response.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      structuredContent: { ok: true }
    })
  );
  return server;
}

if (process.argv.includes("--legacy")) {
  await createServer().connect(new StdioServerTransport());
} else {
  serveStdio(() => createServer());
}

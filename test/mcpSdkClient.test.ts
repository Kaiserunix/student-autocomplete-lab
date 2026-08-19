import path from "node:path";
import { describe, expect, test } from "vitest";
import { connectOjMcpSession } from "../src/oj/mcpSdkClient";

const fixture = path.resolve(process.cwd(), "test", "fixtures", "mcpSdkServer.mjs");

describe("OJ MCP SDK client", () => {
  test("negotiates MCP 2026-07-28 and calls a structured tool", async () => {
    const session = await connectFixture([]);
    try {
      expect(session.protocolVersion).toBe("2026-07-28");
      expect(await session.listTools()).toEqual(["ping"]);
      expect(await session.callTool("ping", {})).toEqual({ payload: { ok: true } });
    } finally {
      await session.close();
    }
  });

  test("falls back to MCP 2025-11-25 for a legacy-only stdio server", async () => {
    const session = await connectFixture(["--legacy"]);
    try {
      expect(session.protocolVersion).toBe("2025-11-25");
      expect(await session.listTools()).toEqual(["ping"]);
    } finally {
      await session.close();
    }
  });
});

function connectFixture(extraArgs: string[]) {
  return connectOjMcpSession({
    platform: "luogu",
    label: "MCP SDK fixture",
    dialect: "canonical-v1",
    transport: {
      kind: "local_stdio",
      command: process.execPath,
      args: [fixture, ...extraArgs],
      cwd: process.cwd()
    }
  });
}

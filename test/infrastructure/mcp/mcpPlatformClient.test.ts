import { describe, expect, test } from "vitest";
import { McpPlatformClient } from "../../../src/infrastructure/mcp/McpPlatformClient";
import { hashMcpToolSchema } from "../../../src/infrastructure/mcp/McpToolCodec";
import type {
  McpClientConnection,
  McpConnectionFactory,
  McpListedTool,
  McpToolCallResult
} from "../../../src/infrastructure/mcp/McpTransportFactory";
import { ProviderQuarantinedError } from "../../../src/infrastructure/mcp/errors";
import { FakeConnection } from "../../fixtures/mcp/fakeConnection";
import { createFixtureManifest, fixtureSource, fixtureTools } from "../../fixtures/mcp/providerFixture";

describe("McpPlatformClient", () => {
  test("hashes tool input and output schemas deterministically", () => {
    const first = hashMcpToolSchema(fixtureTools[0]);
    const reordered: McpListedTool = {
      ...fixtureTools[0],
      outputSchema: { properties: { schemaVersion: { const: "oj.capabilities/v1" } }, type: "object" }
    };
    const changed: McpListedTool = { ...fixtureTools[0], outputSchema: { type: "object", properties: {} } };

    expect(hashMcpToolSchema(reordered)).toBe(first);
    expect(hashMcpToolSchema(changed)).not.toBe(first);
  });

  test("connects once and returns validated structured search results", async () => {
    const connection = new FakeConnection(fixtureTools, {
      structuredContent: {
        schemaVersion: "oj.search-result/v1",
        requestId: "search-1",
        items: [],
        source: fixtureSource
      }
    });
    const client = new McpPlatformClient({
      manifest: createFixtureManifest(),
      entrypointId: "agentReadOnly",
      connectionFactory: new FakeFactory(connection)
    });

    await Promise.all([client.start(), client.start()]);
    const result = await client.search({
      schemaVersion: "oj.search-request/v1",
      requestId: "search-1",
      platform: "codeforces",
      query: "watermelon",
      limit: 10
    });

    expect(connection.connectCount).toBe(1);
    expect(connection.calls).toEqual([{ name: "oj_search_problems", arguments: expect.objectContaining({ query: "watermelon" }) }]);
    expect(result.requestId).toBe("search-1");
  });

  test("quarantines providers when tools drift from the signed manifest", async () => {
    const driftedTools = [...fixtureTools, { ...fixtureTools[0], name: "oj_commit_submission" }];
    const client = new McpPlatformClient({
      manifest: createFixtureManifest(),
      entrypointId: "agentReadOnly",
      connectionFactory: new FakeFactory(new FakeConnection(driftedTools, { structuredContent: {} }))
    });

    await expect(client.start()).rejects.toBeInstanceOf(ProviderQuarantinedError);
    expect(client.state).toBe("quarantined");
  });

  test("quarantines an already connected provider after tools/list_changed drift", async () => {
    const connection = new FakeConnection(fixtureTools, { structuredContent: {} });
    const client = new McpPlatformClient({
      manifest: createFixtureManifest(),
      entrypointId: "agentReadOnly",
      connectionFactory: new FakeFactory(connection)
    });
    await client.start();

    connection.emitToolsChanged([...fixtureTools, { ...fixtureTools[0], name: "oj_commit_submission" }]);

    expect(client.state).toBe("quarantined");
  });

  test("maps structured MCP tool failures without falling back to text", async () => {
    const connection = new FakeConnection(fixtureTools, {
      isError: true,
      structuredContent: {
        schemaVersion: "oj.error/v1",
        code: "rate_limited",
        layer: "upstream",
        message: "Retry after cooldown.",
        retryPolicy: "safe_read",
        userAction: "retry",
        retryAfterMs: 2000
      }
    });
    const client = new McpPlatformClient({
      manifest: createFixtureManifest(),
      entrypointId: "agentReadOnly",
      connectionFactory: new FakeFactory(connection)
    });

    await expect(
      client.search({
        schemaVersion: "oj.search-request/v1",
        requestId: "search-1",
        platform: "codeforces",
        query: "watermelon",
        limit: 10
      })
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
});

class FakeFactory implements McpConnectionFactory {
  constructor(private readonly connection: McpClientConnection) {}

  create(): McpClientConnection {
    return this.connection;
  }
}

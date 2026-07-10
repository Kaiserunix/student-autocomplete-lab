import { describe, expect, test } from "vitest";
import { ProviderRegistry } from "../../../src/infrastructure/mcp/ProviderRegistry";
import type { McpClientConnection, McpConnectionFactory } from "../../../src/infrastructure/mcp/McpTransportFactory";
import { FakeConnection } from "../../fixtures/mcp/fakeConnection";
import { createFixtureManifest, fixtureTools } from "../../fixtures/mcp/providerFixture";

describe("ProviderRegistry", () => {
  test("shares concurrent lazy starts and closes the provider once", async () => {
    const connection = new FakeConnection(fixtureTools, { structuredContent: {} });
    const factory = new CountingFactory(connection);
    const registry = new ProviderRegistry(factory);
    registry.register(createFixtureManifest());

    const [first, second] = await Promise.all([
      registry.connect("codeforces-official-api", "agentReadOnly"),
      registry.connect("codeforces-official-api", "agentReadOnly")
    ]);

    expect(first).toBe(second);
    expect(factory.createCount).toBe(1);
    expect(connection.connectCount).toBe(1);

    await registry.dispose();
    expect(connection.closeCount).toBe(1);
  });

  test("rejects duplicate provider registrations", () => {
    const registry = new ProviderRegistry(new CountingFactory(new FakeConnection(fixtureTools, { structuredContent: {} })));
    registry.register(createFixtureManifest());

    expect(() => registry.register(createFixtureManifest())).toThrow(/already registered/i);
  });
});

class CountingFactory implements McpConnectionFactory {
  createCount = 0;

  constructor(private readonly connection: McpClientConnection) {}

  create(): McpClientConnection {
    this.createCount += 1;
    return this.connection;
  }
}

import path from "node:path";
import { describe, expect, test } from "vitest";
import { admitLocalAnonymousLeetCodeProvider } from "../../../src/infrastructure/mcp/LocalAnonymousLeetCodeProvider";
import { ProviderRegistry } from "../../../src/infrastructure/mcp/ProviderRegistry";
import type { McpClientConnection, McpConnectionFactory } from "../../../src/infrastructure/mcp/McpTransportFactory";
import { ProviderQuarantinedError } from "../../../src/infrastructure/mcp/errors";
import { FakeConnection } from "../../fixtures/mcp/fakeConnection";
import { createLeetcodeManifest, leetcodeArtifactPath, leetcodeTools } from "./leetcodeFixture";

describe("local anonymous LeetCode provider admission", () => {
  test("registers an explicitly injected pinned private stdio manifest", async () => {
    const connection = new FakeConnection(leetcodeTools, { structuredContent: {} });
    const factory = new CapturingFactory(connection);
    const registry = new ProviderRegistry(factory);

    const registration = admitLocalAnonymousLeetCodeProvider(registry, createLeetcodeManifest());
    await registry.connect(registration.providerId, registration.entrypointId);

    expect(registration).toEqual({ providerId: "leetcode-anonymous-local", entrypointId: "productPrivate" });
    expect(factory.entrypoint).toMatchObject({
      id: "productPrivate",
      transport: "local_stdio",
      command: process.execPath,
      args: [leetcodeArtifactPath, "--site", "global"],
      allowedRisks: ["R0_public_read"]
    });
    expect(factory.entrypoint?.expectedTools.map((tool) => [tool.upstream, tool.canonical])).toEqual([
      ["oj_capabilities", "capabilities"],
      ["oj_health", "health"],
      ["oj_search_problems", "searchProblems"],
      ["oj_fetch_problem", "fetchProblem"]
    ]);
  });

  test.each([
    ["remote transport", (manifest: any) => Object.assign(manifest.entrypoints[0], { transport: "remote_http", url: "https://example.com/mcp" })],
    ["launch arguments", (manifest: any) => Object.assign(manifest.entrypoints[0], { args: ["--session", "anonymous"] })],
    ["arbitrary executable", (manifest: any) => Object.assign(manifest.entrypoints[0], { command: path.resolve("powershell.exe"), args: [] })],
    ["environment injection", (manifest: any) => Object.assign(manifest.entrypoints[0], { env: { LEETCODE_SESSION: "secret" } })],
    ["secret references", (manifest: any) => Object.assign(manifest.entrypoints[0], { secretRefs: [{ logicalName: "session", secretStorageKey: "session", envName: "LEETCODE_SESSION", required: false }] })],
    ["run tools", (manifest: any) => manifest.entrypoints[0].expectedTools.push({ ...manifest.entrypoints[0].expectedTools[3], canonical: "localRun", upstream: "oj_local_run" })]
  ])("rejects %s before registration", (_label, mutate) => {
    const registry = new ProviderRegistry(new CapturingFactory(new FakeConnection(leetcodeTools, { structuredContent: {} })));
    const manifest: any = structuredClone(createLeetcodeManifest());
    mutate(manifest);

    expect(() => admitLocalAnonymousLeetCodeProvider(registry, manifest)).toThrow();
  });

  test("quarantines tools whose schemas differ from the injected manifest hashes", async () => {
    const registry = new ProviderRegistry(new CapturingFactory(new FakeConnection(leetcodeTools, { structuredContent: {} })));
    const manifest = createLeetcodeManifest();
    manifest.entrypoints[0].expectedTools[3].schemaSha256 = "e".repeat(64);
    const registration = admitLocalAnonymousLeetCodeProvider(registry, manifest);

    await expect(registry.connect(registration.providerId, registration.entrypointId)).rejects.toBeInstanceOf(
      ProviderQuarantinedError
    );
  });
});

class CapturingFactory implements McpConnectionFactory {
  entrypoint?: Parameters<McpConnectionFactory["create"]>[0];

  constructor(private readonly connection: McpClientConnection) {}

  create(entrypoint: Parameters<McpConnectionFactory["create"]>[0]): McpClientConnection {
    this.entrypoint = entrypoint;
    return this.connection;
  }
}

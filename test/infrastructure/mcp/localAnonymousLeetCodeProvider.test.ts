import path from "node:path";
import { describe, expect, test } from "vitest";
import { admitLocalAnonymousLeetCodeProvider } from "../../../src/infrastructure/mcp/LocalAnonymousLeetCodeProvider";
import { ProviderRegistry } from "../../../src/infrastructure/mcp/ProviderRegistry";
import type { McpClientConnection, McpConnectionFactory } from "../../../src/infrastructure/mcp/McpTransportFactory";
import { ProviderQuarantinedError } from "../../../src/infrastructure/mcp/errors";
import { FakeConnection } from "../../fixtures/mcp/fakeConnection";
import {
  createLeetcodeManifest,
  leetcodeArtifactBytes,
  leetcodeArtifactPath,
  leetcodeProviderRoot,
  leetcodeTools
} from "./leetcodeFixture";

const admissionOptions = {
  providerRoot: leetcodeProviderRoot,
  trustedRuntimePaths: [process.execPath],
  readArtifact: async () => leetcodeArtifactBytes,
  resolveRealPath: async (filePath: string) => filePath
};

describe("local anonymous LeetCode provider admission", () => {
  test("registers an explicitly injected pinned private stdio manifest", async () => {
    const connection = new FakeConnection(leetcodeTools, { structuredContent: {} });
    const factory = new CapturingFactory(connection);
    const registry = new ProviderRegistry(factory);

    const registration = await admitLocalAnonymousLeetCodeProvider(registry, createLeetcodeManifest(), admissionOptions);
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
  ])("rejects %s before registration", async (_label, mutate) => {
    const registry = new ProviderRegistry(new CapturingFactory(new FakeConnection(leetcodeTools, { structuredContent: {} })));
    const manifest: any = structuredClone(createLeetcodeManifest());
    mutate(manifest);

    await expect(admitLocalAnonymousLeetCodeProvider(registry, manifest, admissionOptions)).rejects.toThrow();
  });

  test("rejects launch targets outside the trusted install root and mismatched artifact hashes", async () => {
    const registry = new ProviderRegistry(new CapturingFactory(new FakeConnection(leetcodeTools, { structuredContent: {} })));
    const escaped = createLeetcodeManifest();
    escaped.entrypoints[0].args = [path.resolve("outside", "index.js")];
    const mismatched = createLeetcodeManifest();
    mismatched.artifacts.active.filesSha256 = "e".repeat(64);

    await expect(admitLocalAnonymousLeetCodeProvider(registry, escaped, admissionOptions)).rejects.toThrow(/trusted provider root/i);
    await expect(admitLocalAnonymousLeetCodeProvider(registry, mismatched, admissionOptions)).rejects.toThrow(/hash/i);
  });

  test("rejects an unapproved runtime even when the pinned script is valid", async () => {
    const registry = new ProviderRegistry(new CapturingFactory(new FakeConnection(leetcodeTools, { structuredContent: {} })));
    const manifest = createLeetcodeManifest();
    manifest.entrypoints[0].command = path.resolve("outside-runtime", "node.exe");

    await expect(admitLocalAnonymousLeetCodeProvider(registry, manifest, admissionOptions)).rejects.toThrow(
      /approved runtime/i
    );
  });

  test("quarantines tools whose schemas differ from the injected manifest hashes", async () => {
    const registry = new ProviderRegistry(new CapturingFactory(new FakeConnection(leetcodeTools, { structuredContent: {} })));
    const manifest = createLeetcodeManifest();
    manifest.entrypoints[0].expectedTools[3].schemaSha256 = "e".repeat(64);
    const registration = await admitLocalAnonymousLeetCodeProvider(registry, manifest, admissionOptions);

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

import type { OjCapabilityName, OjProviderManifestV1, OjSourceRef } from "../../../src/domain/oj/contracts";
import type { McpListedTool } from "../../../src/infrastructure/mcp/McpTransportFactory";
import { hashMcpToolSchema } from "../../../src/infrastructure/mcp/McpToolCodec";

export const fixtureSource: OjSourceRef = {
  kind: "official_api",
  adapterId: "codeforces-official-api",
  adapterVersion: "0.1.0",
  fetchedAt: "2026-07-10T12:00:00.000Z",
  sourceUrl: "https://codeforces.com/api/problemset.problems",
  confidence: "authoritative"
};

export const fixtureTools: McpListedTool[] = [
  tool("oj_capabilities", {}, { schemaVersion: { const: "oj.capabilities/v1" } }),
  tool("oj_health", {}, { schemaVersion: { const: "oj.provider-health/v1" } }),
  tool(
    "oj_search_problems",
    { platform: { type: "string" }, query: { type: "string" }, limit: { type: "number" } },
    { schemaVersion: { const: "oj.search-result/v1" }, items: { type: "array" } }
  )
];

export function createFixtureManifest(tools: McpListedTool[] = fixtureTools): OjProviderManifestV1 {
  const artifact = {
    sourceUrl: "https://github.com/kaiserunix/oj-mcp-adapters/releases/download/codeforces-v0.1.0/codeforces.tgz",
    repository: "https://github.com/kaiserunix/oj-mcp-adapters",
    version: "0.1.0",
    commit: "0123456789abcdef0123456789abcdef01234567",
    os: ["win32", "linux", "darwin"],
    arch: ["x64", "arm64"],
    runtime: "node>=22",
    archiveSha256: "a".repeat(64),
    filesSha256: "b".repeat(64),
    sbomSha256: "c".repeat(64),
    license: "MIT"
  };
  const canonicalByTool = {
    oj_capabilities: "capabilities",
    oj_health: "health",
    oj_search_problems: "searchProblems"
  } as const;

  return {
    schemaVersion: "oj-provider-manifest/v1",
    providerId: "codeforces-official-api",
    platform: "codeforces",
    minimumExtensionVersion: "0.1.0-beta.1",
    installDirectoryLayout: "providers/codeforces-official-api/0.1.0",
    artifacts: { active: artifact, rollback: artifact },
    entrypoints: [
      {
        id: "agentReadOnly",
        transport: "remote_http",
        url: "https://codeforces-mcp.example.com/mcp",
        expectedTools: tools.map((listedTool) => ({
          canonical: canonicalByTool[listedTool.name as keyof typeof canonicalByTool] ?? ("searchProblems" as OjCapabilityName),
          upstream: listedTool.name,
          schemaSha256: hashMcpToolSchema(listedTool),
          risk: "R0_public_read"
        })),
        allowedRisks: ["R0_public_read"]
      }
    ],
    expectedProtocol: "2025-11-25"
  };
}

function tool(name: string, inputProperties: Record<string, object>, outputProperties: Record<string, object>): McpListedTool {
  return {
    name,
    inputSchema: { type: "object", properties: inputProperties },
    outputSchema: { type: "object", properties: outputProperties },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
  };
}

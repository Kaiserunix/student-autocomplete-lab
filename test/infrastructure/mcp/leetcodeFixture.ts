import path from "node:path";
import type {
  OjProblemDocument,
  OjProblemRef,
  OjProviderManifestV1,
  OjSourceRef
} from "../../../src/domain/oj/contracts";
import type { McpListedTool } from "../../../src/infrastructure/mcp/McpTransportFactory";
import { hashMcpToolSchema } from "../../../src/infrastructure/mcp/McpToolCodec";

export const leetcodeSource: OjSourceRef = {
  kind: "community_adapter",
  adapterId: "leetcode-anonymous-local",
  adapterVersion: "0.1.0",
  fetchedAt: "2026-07-12T08:00:00.000Z",
  sourceUrl: "https://leetcode.com/problems/two-sum/",
  confidence: "derived"
};

export const leetcodeArtifactPath = path.resolve("fixtures", "providers", "leetcode-anonymous-local", "build", "index.js");

export const leetcodeTools: McpListedTool[] = [
  tool("oj_capabilities", {}, { schemaVersion: { const: "oj.capabilities/v1" } }),
  tool("oj_health", {}, { schemaVersion: { const: "oj.provider-health/v1" } }),
  tool(
    "oj_search_problems",
    { schemaVersion: { const: "oj.search-request/v1" }, query: { type: "string" }, limit: { type: "integer" } },
    { schemaVersion: { const: "oj.search-result/v1" }, items: { type: "array" } }
  ),
  tool(
    "oj_fetch_problem",
    { schemaVersion: { const: "oj.problem-ref/v1" }, nativeId: { type: "string" }, canonicalId: { type: "string" } },
    { schemaVersion: { const: "oj.problem-document/v1" }, content: { type: "object" } }
  )
];

export function createLeetcodeManifest(): OjProviderManifestV1 {
  const artifact = {
    sourceUrl: "https://example.invalid/leetcode-anonymous-local.exe",
    repository: "https://github.com/example/oj-mcp-adapters",
    version: "0.1.0",
    commit: "0123456789abcdef0123456789abcdef01234567",
    os: ["win32"],
    arch: ["x64"],
    runtime: "native",
    archiveSha256: "a".repeat(64),
    filesSha256: "b".repeat(64),
    sbomSha256: "c".repeat(64),
    license: "MIT"
  };
  const canonicalByTool = {
    oj_capabilities: "capabilities",
    oj_health: "health",
    oj_search_problems: "searchProblems",
    oj_fetch_problem: "fetchProblem"
  } as const;

  return {
    schemaVersion: "oj-provider-manifest/v1",
    providerId: "leetcode-anonymous-local",
    platform: "leetcode",
    minimumExtensionVersion: "0.1.0-beta.1",
    installDirectoryLayout: "providers/leetcode-anonymous-local/0.1.0",
    artifacts: { active: artifact, rollback: artifact },
    entrypoints: [
      {
        id: "productPrivate",
        transport: "local_stdio",
        command: process.execPath,
        args: [leetcodeArtifactPath, "--site", "global"],
        expectedTools: leetcodeTools.map((listedTool) => ({
          canonical: canonicalByTool[listedTool.name as keyof typeof canonicalByTool],
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

export function createLeetcodeProblemRef(): OjProblemRef {
  return {
    schemaVersion: "oj.problem-ref/v1",
    platform: "leetcode",
    site: "global",
    nativeId: "two-sum",
    canonicalId: "leetcode:global:two-sum",
    url: "https://leetcode.com/problems/two-sum/",
    source: leetcodeSource
  };
}

export function createLeetcodeProblemDocument(): OjProblemDocument {
  return {
    schemaVersion: "oj.problem-document/v1",
    ref: createLeetcodeProblemRef(),
    title: "Two Sum",
    locale: "en-US",
    access: "public",
    difficulty: { scale: "leetcode", value: 1, label: "Easy" },
    tags: [
      { namespace: "platform", slug: "array", name: "Array" },
      { namespace: "canonical", slug: "hash-table", name: "Hash Table" }
    ],
    content: {
      statement: textBlock("PRIVATE MCP STATEMENT: return two indices."),
      input: textBlock("nums and target"),
      output: textBlock("two indices")
    },
    constraints: ["2 <= nums.length <= 10000"],
    samples: [{ ordinal: 1, input: "[2,7,11,15], 9", output: "[0,1]", explanation: "2 + 7 = 9" }],
    limits: {},
    io: { mode: "function" },
    starterCode: [],
    source: leetcodeSource
  };
}

function textBlock(text: string) {
  return {
    text,
    format: "markdown" as const,
    locale: "en-US",
    truncated: false,
    sha256: "d".repeat(64)
  };
}

function tool(name: string, inputProperties: Record<string, object>, outputProperties: Record<string, object>): McpListedTool {
  return {
    name,
    inputSchema: { type: "object", properties: inputProperties },
    outputSchema: { type: "object", properties: outputProperties },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  };
}

import { describe, expect, test } from "vitest";
import type { OjCapabilityName, OjProviderManifestV1 } from "../../src/domain/oj/contracts";
import { buildOjSchemaArtifacts } from "../../src/domain/oj/schemaArtifacts";
import {
  ojCapabilitiesSchema,
  ojErrorSchema,
  ojImportPreviewSchema,
  ojImportWindowSchema,
  ojImportWindowRequestSchema,
  ojPrepareSubmissionRequestSchema,
  ojProblemDocumentSchema,
  ojProblemSummarySchema,
  ojProviderHealthSchema,
  ojProviderManifestSchema,
  ojRunRequestSchema,
  ojRunResultSchema,
  ojSearchRequestSchema,
  ojSearchResultSchema,
  ojSchemaRegistry,
  ojSubmissionEvidenceSchema,
  ojSubmitCommitRequestSchema,
  ojSubmitPreviewSchema,
  ojSubmitResultSchema
} from "../../src/domain/oj/schemas";

const source = {
  kind: "official_api",
  adapterId: "codeforces-official-api",
  adapterVersion: "0.1.0",
  fetchedAt: "2026-07-10T12:00:00.000Z",
  sourceUrl: "https://codeforces.com/api/problemset.problems",
  confidence: "authoritative"
} as const;

describe("OJ contract v1", () => {
  test("round-trips a problem summary with authoritative provenance", () => {
    const summary = {
      schemaVersion: "oj.problem-summary/v1",
      ref: {
        schemaVersion: "oj.problem-ref/v1",
        platform: "codeforces",
        nativeId: "4/A",
        canonicalId: "codeforces:4/A",
        url: "https://codeforces.com/problemset/problem/4/A",
        contest: { nativeId: "4", index: "A" },
        source
      },
      title: "Watermelon",
      difficulty: { scale: "codeforces-rating", value: 800 },
      tags: [{ namespace: "platform", slug: "math", name: "math" }],
      source
    };

    expect(ojProblemSummarySchema.parse(summary)).toEqual(summary);
  });

  test("rejects unknown contract versions and missing provenance", () => {
    const invalid = {
      schemaVersion: "oj.problem-summary/v2",
      ref: {
        schemaVersion: "oj.problem-ref/v1",
        platform: "codeforces",
        nativeId: "4/A",
        canonicalId: "codeforces:4/A",
        url: "https://codeforces.com/problemset/problem/4/A",
        source
      },
      title: "Watermelon",
      tags: []
    };

    expect(ojProblemSummarySchema.safeParse(invalid).success).toBe(false);
  });

  test("describes Codeforces as remote public metadata without submit", () => {
    const capabilities = {
      schemaVersion: "oj.capabilities/v1",
      providerId: "codeforces-official-api",
      providerVersion: "0.1.0",
      platform: "codeforces",
      protocolVersion: "2025-11-25",
      operations: codeforcesOperations(),
      languages: [],
      source
    };

    expect(ojCapabilitiesSchema.parse(capabilities)).toEqual(capabilities);
    expect(capabilities.operations.commitSubmission.status).toBe("unsupported");
  });

  test("treats wrong answer as a completed run result instead of an MCP error", () => {
    const result = {
      schemaVersion: "oj.run-result/v1",
      requestId: "request-1",
      jobId: "job-1",
      attemptId: "attempt-1",
      mode: "local",
      state: "completed",
      verdict: "wrong_answer",
      codeSha256: "a".repeat(64),
      cases: [{ ordinal: 1, verdict: "wrong_answer", actualOutputSha256: "b".repeat(64) }],
      startedAt: "2026-07-10T12:00:00.000Z",
      completedAt: "2026-07-10T12:00:01.000Z",
      source
    };

    expect(ojRunResultSchema.parse(result)).toEqual(result);
  });

  test("requires submission results to bind operation and code hashes", () => {
    const result = {
      schemaVersion: "oj.submit-result/v1",
      requestId: "request-1",
      intentId: "intent-1",
      submissionOperationId: "operation-1",
      state: "outcome_unknown",
      verdict: "unknown",
      lastCheckedAt: "2026-07-10T12:00:00.000Z",
      source
    };

    expect(ojSubmitResultSchema.safeParse(result).success).toBe(false);
    expect(ojSubmitResultSchema.parse({ ...result, codeSha256: "c".repeat(64) }).codeSha256).toBe("c".repeat(64));
  });

  test("validates layered health and actionable structured errors", () => {
    const health = {
      schemaVersion: "oj.provider-health/v1",
      providerId: "codeforces-official-api",
      platform: "codeforces",
      checkedAt: "2026-07-10T12:00:00.000Z",
      overall: "degraded",
      layers: {
        transport: "pass",
        protocol: "pass",
        schema: "pass",
        auth: "not_required",
        upstream: "rate_limited"
      },
      retryAfterMs: 2000,
      message: "Codeforces is rate limited; cached metadata remains available."
    };
    const error = {
      schemaVersion: "oj.error/v1",
      code: "rate_limited",
      layer: "upstream",
      message: "Retry after the provider cooldown.",
      retryPolicy: "safe_read",
      userAction: "retry",
      platform: "codeforces",
      providerId: "codeforces-official-api",
      retryAfterMs: 2000
    };

    expect(ojProviderHealthSchema.parse(health)).toEqual(health);
    expect(ojErrorSchema.parse(error)).toEqual(error);
  });

  test("validates complete problem documents and bounded search/import requests", () => {
    const document = {
      schemaVersion: "oj.problem-document/v1",
      ref: codeforcesProblemRef(),
      title: "Watermelon",
      locale: "en",
      access: "public",
      difficulty: { scale: "codeforces-rating", value: 800 },
      tags: [{ namespace: "platform", slug: "math", name: "math" }],
      content: {
        statement: {
          text: "Decide whether the watermelon can be split into two positive even weights.",
          format: "text",
          locale: "en",
          truncated: false,
          sha256: "d".repeat(64)
        }
      },
      constraints: ["1 <= w <= 100"],
      samples: [{ ordinal: 1, input: "8\n", output: "YES\n" }],
      limits: { timeMs: 1000, memoryBytes: 64 * 1024 * 1024 },
      io: { mode: "stdin_stdout" },
      starterCode: [],
      source
    };

    expect(ojProblemDocumentSchema.parse(document)).toEqual(document);
    expect(
      ojSearchRequestSchema.parse({
        schemaVersion: "oj.search-request/v1",
        requestId: "search-1",
        platform: "codeforces",
        query: "watermelon",
        limit: 20
      }).limit
    ).toBe(20);
    expect(
      ojImportWindowRequestSchema.safeParse({
        schemaVersion: "oj.import-window-request/v1",
        requestId: "import-1",
        allowedPlatforms: ["codeforces"],
        expiresInMs: 60_001
      }).success
    ).toBe(false);
  });

  test("requires local runs to deny network and bind an immutable code artifact", () => {
    const request = {
      schemaVersion: "oj.run-request/v1",
      requestId: "run-1",
      attemptId: "attempt-1",
      problem: codeforcesProblemRef(),
      mode: "local",
      code: codeArtifact(),
      sampleOrdinals: [1],
      limits: { wallTimeMs: 2000, outputBytes: 65536, network: "deny" }
    };

    expect(ojRunRequestSchema.parse(request)).toEqual(request);
    expect(ojRunRequestSchema.safeParse({ ...request, limits: { ...request.limits, network: "allow" } }).success).toBe(false);
  });

  test("binds submission previews and commits to the confirmed code artifact", () => {
    const preview = {
      schemaVersion: "oj.submit-preview/v1",
      intentId: "intent-1",
      submissionOperationId: "operation-1",
      expiresAt: "2026-07-10T12:05:00.000Z",
      attemptId: "attempt-1",
      providerId: "leetcode-global",
      problem: codeforcesProblemRef(),
      account: { accountId: "account-1", displayName: "Student" },
      languageKey: "cpp",
      platformLanguageId: "54",
      codeArtifactId: "artifact-1",
      fileLabel: "main.cpp",
      sourceWasDirty: true,
      codeSha256: "e".repeat(64),
      codeBytes: 42,
      warnings: ["The editor contains unsaved changes."],
      actionLabel: "Submit Codeforces 4/A"
    };
    const commit = {
      schemaVersion: "oj.submit-commit/v1",
      requestId: "commit-1",
      intentId: "intent-1",
      submissionOperationId: "operation-1",
      codeArtifactId: "artifact-1",
      confirmationProof: "opaque-proof",
      codeSha256: "e".repeat(64)
    };

    expect(ojSubmitPreviewSchema.parse(preview)).toEqual(preview);
    expect(ojSubmitCommitRequestSchema.parse(commit)).toEqual(commit);
    expect(ojSubmitCommitRequestSchema.safeParse({ ...commit, confirmationProof: "" }).success).toBe(false);
  });

  test("round-trips search, import, prepare, and submission evidence contracts", () => {
    const summary = {
      schemaVersion: "oj.problem-summary/v1",
      ref: codeforcesProblemRef(),
      title: "Watermelon",
      tags: [],
      source
    };
    const searchResult = {
      schemaVersion: "oj.search-result/v1",
      requestId: "search-1",
      items: [summary],
      source
    };
    const importWindow = {
      schemaVersion: "oj.import-window/v1",
      windowId: "window-1",
      expiresAt: "2026-07-10T12:01:00.000Z",
      state: "waiting"
    };
    const prepare = {
      schemaVersion: "oj.prepare-submission/v1",
      requestId: "prepare-1",
      attemptId: "attempt-1",
      providerId: "leetcode-global",
      problem: codeforcesProblemRef(),
      accountId: "account-1",
      languageKey: "cpp",
      platformLanguageId: "54",
      code: codeArtifact()
    };
    const evidence = {
      schemaVersion: "oj.submission-evidence/v1",
      evidenceId: "evidence-1",
      attemptId: "attempt-1",
      submissionOperationId: "operation-1",
      problem: codeforcesProblemRef(),
      verdict: "accepted",
      codeSha256: "e".repeat(64),
      observedAt: "2026-07-10T12:02:00.000Z",
      terminal: true,
      source
    };

    expect(ojSearchResultSchema.parse(searchResult)).toEqual(searchResult);
    expect(ojImportWindowSchema.parse(importWindow)).toEqual(importWindow);
    expect(ojImportPreviewSchema.safeParse({ schemaVersion: "oj.import-preview/v1", windowId: "window-1" }).success).toBe(false);
    expect(ojPrepareSubmissionRequestSchema.parse(prepare)).toEqual(prepare);
    expect(ojSubmissionEvidenceSchema.parse(evidence)).toEqual(evidence);
  });

  test("publishes every contract through the stable schema registry", () => {
    expect(Object.keys(ojSchemaRegistry).sort()).toEqual(
      [
        "capabilities",
        "error",
        "import-preview",
        "import-window",
        "import-window-request",
        "problem-document",
        "problem-ref",
        "problem-summary",
        "provider-health",
        "provider-manifest",
        "run-request",
        "run-result",
        "search-request",
        "search-result",
        "submission-evidence",
        "submit-commit",
        "submit-preview",
        "submit-prepare",
        "submit-result"
      ].sort()
    );
  });

  test("generates deterministic JSON Schema artifacts from the registry", () => {
    const first = buildOjSchemaArtifacts();
    const second = buildOjSchemaArtifacts();

    expect(first).toEqual(second);
    expect(Object.keys(first)).toContain("provider-manifest.schema.json");
    expect(JSON.parse(first["problem-summary.schema.json"])).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema"
    });
  });

  test("rejects secrets in manifest arguments and write risk in Agent entrypoints", () => {
    const manifest = codeforcesManifest();
    const unsafeArgs = structuredClone(manifest);
    unsafeArgs.entrypoints[0].args = ["--token=secret-value"];
    const unsafeAgent = structuredClone(manifest);
    unsafeAgent.entrypoints[0].allowedRisks = ["R0_public_read", "R4_real_submit"];

    expect(ojProviderManifestSchema.safeParse(unsafeArgs).success).toBe(false);
    expect(ojProviderManifestSchema.safeParse(unsafeAgent).success).toBe(false);
    expect(ojProviderManifestSchema.parse(manifest)).toEqual(manifest);
  });

  test("allows provider control tools in manifest entrypoints", () => {
    const manifest = codeforcesManifest() as any;
    manifest.entrypoints[0].expectedTools.unshift(
      {
        canonical: "capabilities",
        upstream: "oj_capabilities",
        schemaSha256: "e".repeat(64),
        risk: "R0_public_read"
      },
      {
        canonical: "health",
        upstream: "oj_health",
        schemaSha256: "f".repeat(64),
        risk: "R0_public_read"
      }
    );

    expect(ojProviderManifestSchema.parse(manifest)).toEqual(manifest);
  });
});

function codeforcesManifest(): OjProviderManifestV1 {
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
        expectedTools: [
          {
            canonical: "searchProblems",
            upstream: "codeforces_search_problems",
            schemaSha256: "d".repeat(64),
            risk: "R0_public_read"
          }
        ],
        allowedRisks: ["R0_public_read"]
      }
    ],
    expectedProtocol: "2025-11-25"
  };
}

function codeforcesProblemRef() {
  return {
    schemaVersion: "oj.problem-ref/v1" as const,
    platform: "codeforces" as const,
    nativeId: "4/A",
    canonicalId: "codeforces:4/A",
    url: "https://codeforces.com/problemset/problem/4/A",
    contest: { nativeId: "4", index: "A" },
    source
  };
}

function codeArtifact() {
  return {
    languageKey: "cpp",
    platformLanguageId: "54",
    source: "int main() { return 0; }",
    sha256: "e".repeat(64),
    bytes: 24,
    fileName: "main.cpp",
    capturedAt: "2026-07-10T12:00:00.000Z",
    sourceWasDirty: false
  };
}

function codeforcesOperations() {
  const checkedAt = "2026-07-10T12:00:00.000Z";
  const unsupported = (name: OjCapabilityName) => ({
    name,
    status: "unsupported" as const,
    transport: "remote_http" as const,
    auth: "none" as const,
    risk: name === "commitSubmission" ? ("R4_real_submit" as const) : ("R0_public_read" as const),
    compliance: "official" as const,
    reason: "The Codeforces official API does not expose this operation.",
    checkedAt
  });

  return {
    searchProblems: {
      name: "searchProblems" as const,
      status: "available" as const,
      toolName: "codeforces_search_problems",
      transport: "remote_http" as const,
      auth: "none" as const,
      risk: "R0_public_read" as const,
      compliance: "official" as const,
      checkedAt
    },
    fetchProblem: {
      name: "fetchProblem" as const,
      status: "degraded" as const,
      toolName: "codeforces_get_problem_metadata",
      transport: "remote_http" as const,
      auth: "none" as const,
      risk: "R0_public_read" as const,
      compliance: "official" as const,
      reason: "Official API exposes metadata only; import statements through Competitive Companion.",
      checkedAt
    },
    importProblem: unsupported("importProblem"),
    fetchProfile: unsupported("fetchProfile"),
    listSubmissions: unsupported("listSubmissions"),
    localRun: unsupported("localRun"),
    platformRun: unsupported("platformRun"),
    prepareSubmission: unsupported("prepareSubmission"),
    commitSubmission: unsupported("commitSubmission"),
    pollSubmission: unsupported("pollSubmission")
  };
}

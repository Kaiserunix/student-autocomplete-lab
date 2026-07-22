import { describe, expect, test } from "vitest";
import {
  OjContractError,
  parseOjCapabilities,
  parseOjProblemDocument,
  parseOjProviderHealth,
  parseOjSearchResult
} from "../src/oj/contracts";
import { ojCapabilityNames, type OjPlatformId } from "../src/oj/types";

const checkedAt = "2026-07-22T10:00:00.000Z";

describe("OJ MCP contracts", () => {
  test("accepts a complete canonical capability document", () => {
    const parsed = parseOjCapabilities(capabilityPayload("atcoder"), "atcoder");

    expect(parsed.platform).toBe("atcoder");
    expect(parsed.operations.searchProblems).toMatchObject({
      name: "searchProblems",
      status: "available",
      risk: "R0_public_read"
    });
    expect(Object.keys(parsed.operations)).toHaveLength(ojCapabilityNames.length);
  });

  test("rejects schema drift and cross-platform responses", () => {
    const missingOperation = capabilityPayload("atcoder") as Record<string, unknown>;
    delete (missingOperation.operations as Record<string, unknown>).fetchProblem;

    expect(() => parseOjCapabilities(missingOperation, "atcoder")).toThrow(OjContractError);
    expect(() => parseOjCapabilities(capabilityPayload("codeforces"), "atcoder")).toThrow(
      "platform mismatch"
    );
  });

  test("validates search, health, and problem-document identities", () => {
    const search = searchPayload("atcoder", "request-1");
    expect(parseOjSearchResult(search, "atcoder").items[0]?.ref.canonicalId).toBe("atcoder:abc086_a");
    expect(() => parseOjSearchResult(search, "leetcode")).toThrow("platform mismatch");

    expect(parseOjProviderHealth(healthPayload("atcoder"), "atcoder").overall).toBe("healthy");
    expect(() => parseOjProviderHealth({ ...healthPayload("atcoder"), checkedAt: "not-a-date" }, "atcoder")).toThrow(
      "must be an ISO date"
    );

    const problem = problemPayload("atcoder");
    expect(parseOjProblemDocument(problem, "atcoder").content.statement.sha256).toHaveLength(64);
    expect(() =>
      parseOjProblemDocument(
        {
          ...problem,
          content: {
            ...(problem.content as Record<string, unknown>),
            statement: {
              ...((problem.content as Record<string, unknown>).statement as Record<string, unknown>),
              sha256: "short"
            }
          }
        },
        "atcoder"
      )
    ).toThrow("SHA-256");
  });
});

function capabilityPayload(platform: OjPlatformId): unknown {
  const operations = Object.fromEntries(
    ojCapabilityNames.map((name) => [
      name,
      {
        name,
        status: name === "searchProblems" || name === "fetchProblem" ? "available" : "unsupported",
        toolName: name === "searchProblems" ? "oj_search_problems" : name === "fetchProblem" ? "oj_fetch_problem" : undefined,
        transport: "remote_http",
        auth: "none",
        risk: name === "commitSubmission" ? "R4_real_submit" : "R0_public_read",
        compliance: "unofficial",
        checkedAt
      }
    ])
  );
  return {
    schemaVersion: "oj.capabilities/v1",
    providerId: `${platform}-test-provider`,
    providerVersion: "1.0.0",
    platform,
    protocolVersion: "2025-11-25",
    operations,
    languages: [],
    source: source(platform)
  };
}

function healthPayload(platform: OjPlatformId): Record<string, unknown> {
  return {
    schemaVersion: "oj.provider-health/v1",
    providerId: `${platform}-test-provider`,
    platform,
    checkedAt,
    overall: "healthy",
    layers: {
      transport: "pass",
      protocol: "pass",
      schema: "pass",
      auth: "not_required",
      upstream: "pass"
    },
    message: "ok"
  };
}

function searchPayload(platform: OjPlatformId, requestId: string): unknown {
  const problemSource = source(platform);
  return {
    schemaVersion: "oj.search-result/v1",
    requestId,
    items: [
      {
        schemaVersion: "oj.problem-summary/v1",
        ref: {
          schemaVersion: "oj.problem-ref/v1",
          platform,
          nativeId: "abc086_a",
          canonicalId: `${platform}:abc086_a`,
          url: "https://atcoder.jp/contests/abc086/tasks/abc086_a",
          source: problemSource
        },
        title: "Product",
        tags: [],
        source: problemSource
      }
    ],
    source: problemSource
  };
}

function problemPayload(platform: OjPlatformId): Record<string, unknown> {
  const problemSource = source(platform);
  return {
    schemaVersion: "oj.problem-document/v1",
    ref: {
      schemaVersion: "oj.problem-ref/v1",
      platform,
      nativeId: "abc086_a",
      canonicalId: `${platform}:abc086_a`,
      url: "https://atcoder.jp/contests/abc086/tasks/abc086_a",
      source: problemSource
    },
    title: "Product",
    locale: "en",
    access: "public",
    tags: [],
    content: {
      statement: {
        text: "Multiply two integers.",
        format: "text",
        locale: "en",
        truncated: false,
        originalChars: 22,
        sha256: "0".repeat(64)
      }
    },
    constraints: [],
    samples: [],
    limits: {},
    io: { mode: "stdin_stdout" },
    starterCode: [],
    source: problemSource
  };
}

function source(platform: OjPlatformId): Record<string, unknown> {
  return {
    kind: "page_adapter",
    adapterId: `${platform}-test-provider`,
    adapterVersion: "1.0.0",
    fetchedAt: checkedAt,
    sourceUrl: "https://atcoder.jp/",
    confidence: "derived"
  };
}

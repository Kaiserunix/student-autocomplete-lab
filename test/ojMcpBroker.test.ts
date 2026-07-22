import { describe, expect, test } from "vitest";
import { OjMcpBroker } from "../src/oj/broker";
import {
  ojCapabilityNames,
  type OjMcpSession,
  type OjMcpToolResult,
  type OjPlatformId,
  type OjProviderDescriptor
} from "../src/oj/types";

const checkedAt = "2026-07-22T10:00:00.000Z";

describe("OJ MCP broker", () => {
  test("reuses one lazy MCP session and caches capabilities", async () => {
    let connections = 0;
    const calls: string[] = [];
    const broker = new OjMcpBroker([descriptor("atcoder")], async () => {
      connections += 1;
      return session(async (name, args) => {
        calls.push(name);
        if (name === "oj_capabilities") return ok(capabilityPayload("atcoder"));
        if (name === "oj_search_problems") return ok(searchPayload("atcoder", String(args.requestId)));
        throw new Error(`Unexpected tool: ${name}`);
      });
    });

    const first = await broker.searchProblems({ platform: "atcoder", query: "abc086_a" });
    const second = await broker.searchProblems({ platform: "atcoder", query: "abc086_a" });

    expect(first.items[0]?.title).toBe("Product");
    expect(second.items).toHaveLength(1);
    expect(connections).toBe(1);
    expect(calls.filter((name) => name === "oj_capabilities")).toHaveLength(1);
    expect(calls.filter((name) => name === "oj_search_problems")).toHaveLength(2);
    await broker.close();
  });

  test("isolates a failed provider during a parallel health refresh", async () => {
    const broker = new OjMcpBroker(
      [descriptor("atcoder"), descriptor("codeforces")],
      async (provider) => {
        if (provider.platform === "codeforces") throw new Error("upstream offline");
        return session(async (name) => {
          if (name === "oj_capabilities") return ok(capabilityPayload("atcoder"));
          if (name === "oj_health") return ok(healthPayload("atcoder"));
          throw new Error(`Unexpected tool: ${name}`);
        });
      }
    );

    const statuses = await broker.refreshAll();

    expect(statuses.find((item) => item.platform === "atcoder")?.overall).toBe("healthy");
    expect(statuses.find((item) => item.platform === "codeforces")).toMatchObject({
      overall: "unavailable",
      searchStatus: "degraded",
      fetchStatus: "degraded"
    });
    await broker.close();
  });

  test("does not overlap capability and health calls on one HTTP session", async () => {
    let activeCalls = 0;
    const broker = new OjMcpBroker([descriptor("atcoder")], async () =>
      session(async (name) => {
        activeCalls += 1;
        if (activeCalls > 1) throw new Error("overlapping session call");
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeCalls -= 1;
        if (name === "oj_capabilities") return ok(capabilityPayload("atcoder"));
        if (name === "oj_health") return ok(healthPayload("atcoder"));
        throw new Error(`Unexpected tool: ${name}`);
      })
    );

    await expect(broker.refresh("atcoder")).resolves.toMatchObject({ overall: "healthy" });
    expect(activeCalls).toBe(0);
    await broker.close();
  });

  test("normalizes the legacy Luogu read contract without exposing write entry points", async () => {
    const calls: string[] = [];
    const broker = new OjMcpBroker(
      [
        {
          ...descriptor("luogu"),
          dialect: "luogu-v0.2"
        }
      ],
      async () =>
        session(async (name) => {
          calls.push(name);
          if (name === "luogu_get_capabilities") {
            return ok({
              tools: [
                { name: "luogu_search_problems", status: "available" },
                { name: "luogu_fetch_problem", status: "available" }
              ]
            });
          }
          if (name === "luogu_search_problems") {
            return ok({
              items: [
                {
                  id: "p1000",
                  title: "A+B Problem",
                  sourceUrl: "https://www.luogu.com.cn/problem/P1000",
                  difficulty: 1,
                  tags: ["入门"]
                }
              ]
            });
          }
          if (name === "luogu_fetch_problem") {
            return ok({
              id: "P1000",
              title: "A+B Problem",
              sourceUrl: "https://www.luogu.com.cn/problem/P1000",
              statement: "求和",
              inputFormat: "两个整数",
              outputFormat: "一个整数",
              samples: [{ input: "1 2", output: "3" }],
              truncated: true
            });
          }
          throw new Error(`Unexpected tool: ${name}`);
        })
    );

    const search = await broker.searchProblems({ platform: "luogu", query: "P1000" });
    const problem = await broker.fetchProblem(search.items[0]!);

    expect(search.items[0]?.ref.canonicalId).toBe("luogu:P1000");
    expect(problem.content.statement.truncated).toBe(true);
    expect(calls).toEqual(["luogu_get_capabilities", "luogu_search_problems", "luogu_fetch_problem"]);
    expect(Object.getOwnPropertyNames(OjMcpBroker.prototype)).not.toEqual(
      expect.arrayContaining(["prepareSubmission", "commitSubmission", "platformRun"])
    );
    await broker.close();
  });
});

function descriptor(platform: OjPlatformId): OjProviderDescriptor {
  return {
    platform,
    label: platform,
    dialect: "canonical-v1",
    transport: { kind: "remote_http", endpoint: `https://${platform}.example.test/mcp` }
  };
}

function session(
  callTool: (name: string, args: Record<string, unknown>) => Promise<OjMcpToolResult>
): OjMcpSession {
  return {
    listTools: async () => ["oj_capabilities", "oj_health", "oj_search_problems", "oj_fetch_problem"],
    callTool,
    close: async () => undefined
  };
}

function ok(payload: unknown): OjMcpToolResult {
  return { payload };
}

function capabilityPayload(platform: OjPlatformId): unknown {
  return {
    schemaVersion: "oj.capabilities/v1",
    providerId: `${platform}-test-provider`,
    providerVersion: "1.0.0",
    platform,
    protocolVersion: "2025-11-25",
    operations: Object.fromEntries(
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
    ),
    languages: [],
    source: source(platform)
  };
}

function healthPayload(platform: OjPlatformId): unknown {
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

function source(platform: OjPlatformId): unknown {
  return {
    kind: "page_adapter",
    adapterId: `${platform}-test-provider`,
    adapterVersion: "1.0.0",
    fetchedAt: checkedAt,
    sourceUrl: "https://atcoder.jp/",
    confidence: "derived"
  };
}

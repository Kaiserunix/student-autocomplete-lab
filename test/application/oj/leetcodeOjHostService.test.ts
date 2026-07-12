import { describe, expect, test } from "vitest";
import { buildAutocompletePrompt } from "../../../src/autocomplete/prompt";
import { LeetCodeOjHostService } from "../../../src/application/oj/LeetCodeOjHostService";
import type {
  McpClientConnection,
  McpConnectionFactory,
  McpListedTool,
  McpToolCallResult
} from "../../../src/infrastructure/mcp/McpTransportFactory";
import {
  createLeetcodeManifest,
  createLeetcodeProblemDocument,
  createLeetcodeProblemRef,
  leetcodeSource,
  leetcodeTools
} from "../../infrastructure/mcp/leetcodeFixture";

describe("LeetCodeOjHostService", () => {
  test("searches and fetches through the registry, then maps the document to ProblemRecord", async () => {
    const connection = new RoutingConnection(leetcodeTools, {
      oj_search_problems: {
        structuredContent: {
          schemaVersion: "oj.search-result/v1",
          requestId: "oj-search-1",
          items: [
            {
              schemaVersion: "oj.problem-summary/v1",
              ref: createLeetcodeProblemRef(),
              title: "Two Sum",
              difficulty: { scale: "leetcode", value: 1, label: "Easy" },
              tags: [{ namespace: "platform", slug: "array", name: "Array" }],
              source: leetcodeSource
            }
          ],
          source: leetcodeSource
        }
      },
      oj_fetch_problem: { structuredContent: createLeetcodeProblemDocument() }
    });
    const service = new LeetCodeOjHostService(new SingleConnectionFactory(connection), () => "oj-search-1");
    service.configure(createLeetcodeManifest());

    const search = await service.searchProblems({ query: "two sum", locale: "en-US", limit: 5 });
    const problem = await service.fetchProblem(createLeetcodeProblemRef());

    expect(search.items).toHaveLength(1);
    expect(connection.calls[0]).toEqual({
      name: "oj_search_problems",
      arguments: {
        schemaVersion: "oj.search-request/v1",
        requestId: "oj-search-1",
        platform: "leetcode",
        query: "two sum",
        locale: "en-US",
        limit: 5
      }
    });
    expect(connection.calls[1]).toEqual({ name: "oj_fetch_problem", arguments: createLeetcodeProblemRef() });
    expect(problem).toEqual({
      platform: "leetcode",
      id: "two-sum",
      title: "Two Sum",
      sourceUrl: "https://leetcode.com/problems/two-sum/",
      difficulty: 1,
      tags: ["Array", "Hash Table"],
      statement: "PRIVATE MCP STATEMENT: return two indices.",
      inputFormat: "nums and target",
      outputFormat: "two indices",
      samples: [{ input: "[2,7,11,15], 9", output: "[0,1]" }]
    });
  });

  test("keeps fetched MCP problem data outside autocomplete prompts", async () => {
    const connection = new RoutingConnection(leetcodeTools, {
      oj_fetch_problem: { structuredContent: createLeetcodeProblemDocument() }
    });
    const service = new LeetCodeOjHostService(new SingleConnectionFactory(connection), () => "unused");
    service.configure(createLeetcodeManifest());
    const problem = await service.fetchProblem(createLeetcodeProblemRef());

    const prompt = buildAutocompletePrompt({
      prefix: "def two_sum(nums, target):\n    ",
      suffix: "",
      language: "python",
      filePath: "practice/leetcode/two-sum.py",
      activeProblem: { title: problem.title, statement: problem.statement, referenceSolution: "PRIVATE MCP ANSWER" }
    });

    expect(prompt).not.toContain(problem.statement);
    expect(prompt).not.toContain("PRIVATE MCP ANSWER");
  });

  test("uses the pinned capability and health control tools", async () => {
    const operations = Object.fromEntries(
      [
        "searchProblems",
        "fetchProblem",
        "importProblem",
        "fetchProfile",
        "listSubmissions",
        "localRun",
        "platformRun",
        "prepareSubmission",
        "commitSubmission",
        "pollSubmission"
      ].map((name) => [
        name,
        {
          name,
          status: name === "searchProblems" || name === "fetchProblem" ? "available" : "unsupported",
          ...(name === "searchProblems" || name === "fetchProblem" ? { toolName: `oj_${name}` } : {}),
          transport: "local_stdio",
          auth: "none",
          risk: "R0_public_read",
          compliance: "unofficial",
          checkedAt: "2026-07-12T08:00:00.000Z"
        }
      ])
    );
    const connection = new RoutingConnection(leetcodeTools, {
      oj_capabilities: {
        structuredContent: {
          schemaVersion: "oj.capabilities/v1",
          providerId: "leetcode-anonymous-local",
          providerVersion: "0.1.0",
          platform: "leetcode",
          protocolVersion: "2025-11-25",
          operations,
          languages: [],
          source: leetcodeSource
        }
      },
      oj_health: {
        structuredContent: {
          schemaVersion: "oj.provider-health/v1",
          providerId: "leetcode-anonymous-local",
          platform: "leetcode",
          checkedAt: "2026-07-12T08:00:00.000Z",
          overall: "healthy",
          layers: {
            transport: "pass",
            protocol: "pass",
            schema: "pass",
            auth: "not_required",
            upstream: "pass"
          },
          message: "Anonymous reads are available."
        }
      }
    });
    const service = new LeetCodeOjHostService(new SingleConnectionFactory(connection), () => "unused");
    service.configure(createLeetcodeManifest());

    const capabilities = await service.getCapabilities();
    const health = await service.getHealth();

    expect(capabilities.operations.fetchProblem.status).toBe("available");
    expect(health.overall).toBe("healthy");
    expect(connection.calls.map((call) => call.name)).toEqual(["oj_capabilities", "oj_health"]);
  });

  test("owns provider lifecycle and rejects use before explicit configuration", async () => {
    const connection = new RoutingConnection(leetcodeTools, {
      oj_fetch_problem: { structuredContent: createLeetcodeProblemDocument() }
    });
    const service = new LeetCodeOjHostService(new SingleConnectionFactory(connection), () => "unused");

    await expect(service.fetchProblem(createLeetcodeProblemRef())).rejects.toThrow(/not configured/i);
    service.configure(createLeetcodeManifest());
    await service.fetchProblem(createLeetcodeProblemRef());
    await service.dispose();

    expect(connection.closeCount).toBe(1);
  });
});

class SingleConnectionFactory implements McpConnectionFactory {
  constructor(private readonly connection: McpClientConnection) {}

  create(): McpClientConnection {
    return this.connection;
  }
}

class RoutingConnection implements McpClientConnection {
  closeCount = 0;
  calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

  constructor(
    private readonly tools: McpListedTool[],
    private readonly results: Record<string, McpToolCallResult>
  ) {}

  async connect(): Promise<void> {}

  async listTools(): Promise<McpListedTool[]> {
    return this.tools;
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<McpToolCallResult> {
    this.calls.push({ name, arguments: arguments_ });
    const result = this.results[name];
    if (!result) {
      throw new Error(`No fake result configured for ${name}.`);
    }
    return result;
  }

  onToolsChanged(): void {}

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  fetchLuoguProblemForMcp,
  recommendProblemsByPainPoint,
  searchLuoguProblemSetsForMcp,
  searchLuoguProblemsForMcp
} from "./problemSearchTools";

export const PROBLEM_SEARCH_MCP_TOOL_NAMES = [
  "luogu_search_problems",
  "luogu_search_problem_sets",
  "luogu_fetch_problem",
  "recommend_by_pain_point"
] as const;

const SERVER_VERSION = "0.1.0";

export function createProblemSearchMcpServer(): McpServer {
  const server = new McpServer({
    name: "student-problem-search",
    version: SERVER_VERSION
  });

  server.registerTool(
    "luogu_search_problems",
    {
      title: "Search Luogu Problems",
      description: "Search Luogu problems by keyword and return compact structured results.",
      inputSchema: {
        keyword: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional()
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      }
    },
    async (input) => toToolResult(await searchLuoguProblemsForMcp(input))
  );

  server.registerTool(
    "luogu_search_problem_sets",
    {
      title: "Search Luogu Problem Sets",
      description: "Search Luogu training/problem sets by keyword.",
      inputSchema: {
        keyword: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional()
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      }
    },
    async (input) => toToolResult(await searchLuoguProblemSetsForMcp(input))
  );

  server.registerTool(
    "luogu_fetch_problem",
    {
      title: "Fetch Luogu Problem",
      description: "Fetch a Luogu problem statement, formats, samples, tags, and source URL by problem id.",
      inputSchema: {
        pid: z.string().min(1),
        maxStatementChars: z.number().int().min(200).max(20000).optional()
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      }
    },
    async (input) => toToolResult(await fetchLuoguProblemForMcp(input))
  );

  server.registerTool(
    "recommend_by_pain_point",
    {
      title: "Recommend Problems by Pain Point",
      description: "Recommend practice problems and search hints from a normalized student pain point.",
      inputSchema: {
        painPoint: z.string().min(1),
        painPointCounts: z.record(z.string(), z.number()).optional(),
        transferEvidence: z
          .record(
            z.string(),
            z.object({
              probes: z.number().int().min(0),
              passed: z.number().int().min(0),
              estimatedHintReduction: z.number().optional()
            })
          )
          .optional(),
        limit: z.number().int().min(1).max(10).optional(),
        currentProblemId: z.string().optional()
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async (input) => toToolResult(recommendProblemsByPainPoint(input))
  );

  return server;
}

export async function runProblemSearchMcpServer(): Promise<void> {
  serveStdio(() => createProblemSearchMcpServer());
}

function toToolResult(result: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ],
    structuredContent: result as Record<string, unknown>
  };
}

if (require.main === module) {
  runProblemSearchMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`problem-search MCP failed: ${message}`);
    process.exit(1);
  });
}

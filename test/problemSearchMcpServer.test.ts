import { describe, expect, test } from "vitest";
import { PROBLEM_SEARCH_MCP_TOOL_NAMES } from "../src/mcp/problemSearchServer";

describe("problem-search MCP server", () => {
  test("declares the small tool surface used by MiMo", () => {
    expect(PROBLEM_SEARCH_MCP_TOOL_NAMES).toEqual([
      "luogu_search_problems",
      "luogu_search_problem_sets",
      "luogu_fetch_problem",
      "recommend_by_pain_point"
    ]);
  });
});

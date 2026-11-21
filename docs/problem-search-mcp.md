# Problem Search MCP

Status: Reference — verified against `src/mcp/problemSearchServer.ts` and `src/mcp/problemSearchTools.ts`.

This repository ships a small standalone stdio MCP server (`student-problem-search`) for external model/client problem discovery.

> **Relationship to `src/oj/`**: Inside the VS Code extension itself, multi-platform search and read-only problem import across Luogu, LeetCode, NowCoder, Codeforces, and AtCoder are powered by `src/oj/broker.ts` (connecting to hosted HTTP MCP endpoints or external local stdio adapters). This server (`dist/src/mcp/problemSearchServer.js`) is a separate local Luogu + pain-point recommendation stdio MCP server and is excluded from the clean beta-release VSIX.

## Tools

| Tool | Description | Annotations |
| --- | --- | --- |
| `luogu_search_problems` | Search Luogu problems by `keyword` (`limit` 1–20, default 8) | `readOnlyHint: true`, `openWorldHint: true` |
| `luogu_search_problem_sets` | Search Luogu training/problem sets by `keyword` (`limit` 1–20, default 8) | `readOnlyHint: true`, `openWorldHint: true` |
| `luogu_fetch_problem` | Fetch a Luogu problem statement, formats, samples, tags, and URL by `pid` (`maxStatementChars` 200–20000, default 4000) | `readOnlyHint: true`, `openWorldHint: true` |
| `recommend_by_pain_point` | Deterministically recommend built-in practice problems and search hints from a normalized pain point (`painPoint`, optional `painPointCounts`, `transferEvidence`, `limit` 1–10, `currentProblemId`) | `readOnlyHint: true`, `openWorldHint: false` |

## Build

```powershell
npm run compile
```

## MCP Client Configuration

Invoke `node` directly as the stdio MCP command. Avoid plain `npm run` in MCP client configs because npm lifecycle output on stdout corrupts JSON-RPC framing.

```json
{
  "mcpServers": {
    "problem-search": {
      "command": "node",
      "args": [
        "<repo-root>\\dist\\src\\mcp\\problemSearchServer.js"
      ],
      "cwd": "<repo-root>"
    }
  }
}
```

Manual local launch after compiling:

```powershell
npm run --silent mcp:problem-search
```

## Scope

- Luogu lookups reuse the extension's content-only HTTP adapters (`src/problemBank/luoguClient.ts`, `luoguSearchClient.ts`).
- `recommend_by_pain_point` runs the deterministic rule engine (`src/recommendation/rules.ts`) over the built-in candidate pool so MCP clients receive grounded recommendations without hallucinating problem IDs.
- No API keys or private student records are read or exposed.

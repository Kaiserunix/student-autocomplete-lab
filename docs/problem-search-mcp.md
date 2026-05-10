# Problem Search MCP

This repo ships a small stdio MCP server for model-side problem discovery.

## Tools

- `luogu_search_problems`: search Luogu problems by keyword.
- `luogu_search_problem_sets`: search Luogu training/problem sets by keyword.
- `luogu_fetch_problem`: fetch one Luogu problem by `pid`.
- `recommend_by_pain_point`: recommend practice problems from a normalized student pain point.

## Build

```powershell
cmd /c npm run compile
```

## MCP Client Config

Use `node` directly as the MCP command. Avoid plain `npm run` as a stdio MCP command because npm can print lifecycle text to stdout and corrupt JSON-RPC.

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

For manual local runs after compiling:

```powershell
cmd /c npm run --silent mcp:problem-search
```

## Current Scope

The first version keeps the server small:

- Luogu uses the existing content-only HTTP adapters already used by the extension.
- Recommendations are deterministic and pain-point keyed, so MiMo can ask for practice targets without hallucinating a random next problem.
- Playwright is intentionally a fallback layer for later blocked/dynamic pages, not the default path.
- LeetCode can later be wired either through a local adapter or an existing community LeetCode MCP server.

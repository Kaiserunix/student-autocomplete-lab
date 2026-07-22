const { existsSync } = require("node:fs");
const path = require("node:path");
const { OjMcpBroker } = require("../dist/src/oj/broker.js");
const { ojProblemDocumentToRecord } = require("../dist/src/oj/problemDocument.js");

const root = path.resolve(__dirname, "..");
const providers = [
  remote(
    "luogu",
    "洛谷",
    "luogu-v0.2",
    "https://luogu-mcp-server.lantangtang54.workers.dev/mcp",
    process.env.LUOGU_OJ_MCP_KEY
  ),
  local(
    "leetcode",
    "LeetCode",
    path.resolve(root, "..", "leetcode-mcp-private", "build", "index.js"),
    ["--site", "cn"]
  ),
  local(
    "nowcoder",
    "牛客",
    path.resolve(root, "..", "nowcoder-oj-mcp", "packages", "nowcoder", "dist", "index.js"),
    [],
    {
      ...(process.env.NOWCODER_SESSION_COOKIE
        ? { NOWCODER_SESSION_COOKIE: process.env.NOWCODER_SESSION_COOKIE }
        : {}),
      COMPETITIVE_COMPANION_PORT: process.env.COMPETITIVE_COMPANION_PORT || "10043"
    }
  ),
  remote(
    "codeforces",
    "Codeforces",
    "canonical-v1",
    "https://codeforces-oj-mcp.lantangtang54.workers.dev/mcp",
    process.env.CODEFORCES_OJ_MCP_KEY
  ),
  remote(
    "atcoder",
    "AtCoder",
    "canonical-v1",
    "https://api.ksrnyx.top/oj-mcp/atcoder/mcp",
    process.env.ATCODER_OJ_MCP_KEY
  )
];

const probes = {
  luogu: "P1000",
  leetcode: "两数之和",
  nowcoder: "字符串",
  codeforces: "4A",
  atcoder: "abc086_a"
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const broker = new OjMcpBroker(providers);
  try {
    const statuses = await broker.refreshAll();
    const results = await Promise.all(
      statuses.map(async (status) => {
        if (!status.configured) {
          return {
            platform: status.platform,
            health: "skipped",
            reason: status.message
          };
        }
        try {
          const search = await broker.searchProblems({
            platform: status.platform,
            query: probes[status.platform],
            limit: 3
          });
          const first = search.items[0];
          if (!first) {
            return {
              platform: status.platform,
              health: status.overall,
              searchItems: 0,
              import: "not-tested"
            };
          }
          if (status.platform === "codeforces") {
            return {
              platform: status.platform,
              health: status.overall,
              searchItems: search.items.length,
              firstId: first.ref.nativeId,
              import: "companion-required"
            };
          }
          const document = await broker.fetchProblem(first);
          const record = ojProblemDocumentToRecord(document);
          return {
            platform: status.platform,
            health: status.overall,
            searchItems: search.items.length,
            firstId: first.ref.nativeId,
            import: "pass",
            statementChars: record.statement.length,
            samples: record.samples.length
          };
        } catch (error) {
          return {
            platform: status.platform,
            health: status.overall,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    console.log(JSON.stringify(results, null, 2));
    if (results.some((result) => "error" in result)) process.exitCode = 1;
  } finally {
    await broker.close();
  }
}

function remote(platform, label, dialect, endpoint, apiKey) {
  return {
    platform,
    label,
    dialect,
    transport: {
      kind: "remote_http",
      endpoint,
      headers: apiKey ? { "X-OJ-MCP-Key": apiKey } : undefined
    }
  };
}

function local(platform, label, entrypoint, args, env) {
  if (!existsSync(entrypoint)) {
    return {
      platform,
      label,
      dialect: "canonical-v1",
      unavailableReason: `Local entrypoint is missing: ${entrypoint}`
    };
  }
  return {
    platform,
    label,
    dialect: "canonical-v1",
    transport: {
      kind: "local_stdio",
      command: process.execPath,
      args: [entrypoint, ...args],
      cwd: path.dirname(entrypoint),
      env
    }
  };
}

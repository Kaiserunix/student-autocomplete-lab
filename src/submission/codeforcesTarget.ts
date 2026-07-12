import type { CodeforcesTarget } from "./types";

const patterns = [
  { kind: "contest", expression: /^\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)\/?$/ },
  { kind: "contest", expression: /^\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)\/?$/ },
  { kind: "gym", expression: /^\/gym\/(\d+)\/problem\/([A-Za-z0-9]+)\/?$/ }
] as const;

export function parseCodeforcesProblemUrl(value: string): CodeforcesTarget {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("请输入完整的 Codeforces HTTPS 题目链接。");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Codeforces 题目链接必须使用 HTTPS。");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "codeforces.com" && hostname !== "www.codeforces.com") {
    throw new Error("当前真实提交只支持 codeforces.com。");
  }

  for (const pattern of patterns) {
    const match = parsed.pathname.match(pattern.expression);
    if (!match) {
      continue;
    }

    const contestId = Number(match[1]);
    const problemIndex = match[2].toUpperCase();
    const canonicalPath =
      pattern.kind === "gym"
        ? `/gym/${contestId}/problem/${problemIndex}`
        : `/contest/${contestId}/problem/${problemIndex}`;
    return {
      platform: "codeforces",
      contestKind: pattern.kind,
      contestId,
      problemIndex,
      canonicalUrl: `https://codeforces.com${canonicalPath}`
    };
  }

  throw new Error("请输入具体的 Codeforces 题目链接，例如 /contest/1200/problem/F。");
}

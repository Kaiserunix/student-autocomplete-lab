import type { ProblemPlatform, SourcePolicy } from "./types";

const policies: Record<ProblemPlatform, SourcePolicy> = {
  luogu: {
    platform: "luogu",
    primary: "public-fetch",
    fallback: "manual-import",
    defaultEnabled: true,
    notes:
      "Use the public problem page JSON endpoint when it responds normally; keep Markdown file import as a durable fallback."
  },
  leetcode: {
    platform: "leetcode",
    primary: "optional-adapter",
    fallback: "manual-import",
    defaultEnabled: false,
    notes:
      "LeetCode GraphQL support is adapter-gated because availability can vary by session, region, and login state."
  },
  manual: {
    platform: "manual",
    primary: "manual-import",
    fallback: "manual-import",
    defaultEnabled: true,
    notes: "Manual Markdown file import is always supported."
  }
};

export function getSourcePolicy(platform: ProblemPlatform): SourcePolicy {
  return policies[platform];
}

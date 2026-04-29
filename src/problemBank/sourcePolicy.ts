import type { ProblemPlatform, SourcePolicy } from "./types";

const policies: Record<ProblemPlatform, SourcePolicy> = {
  luogu: {
    platform: "luogu",
    primary: "public-fetch",
    fallback: "manual-paste",
    defaultEnabled: true,
    notes:
      "Use the public problem page JSON endpoint when it responds normally; keep manual paste as a durable fallback."
  },
  leetcode: {
    platform: "leetcode",
    primary: "optional-adapter",
    fallback: "manual-paste",
    defaultEnabled: false,
    notes:
      "LeetCode GraphQL support is adapter-gated because availability can vary by session, region, and login state."
  },
  manual: {
    platform: "manual",
    primary: "manual-paste",
    fallback: "manual-paste",
    defaultEnabled: true,
    notes: "Manual entries are always supported."
  }
};

export function getSourcePolicy(platform: ProblemPlatform): SourcePolicy {
  return policies[platform];
}

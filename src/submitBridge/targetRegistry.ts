import type { ProblemDocument, ProblemSourceId } from "../core/contracts";
import { parseCodeforcesRef } from "../problems/adapters/codeforcesAdapter";
import { normalizeLuoguPid } from "../problems/adapters/luoguAdapter";

export interface SubmitTarget {
  platform: ProblemSourceId;
  problemKey: string;
  submitUrl: string;
  canonicalUrl: string;
  supportsAutoVerdictPoll: boolean;
  notes: string;
}

/**
 * Strict HTTPS hostname whitelist for the 5 supported OJ platforms.
 * Prevents open-redirect / phishing URLs from browser bridges or untrusted problem metadata.
 */
export const PLATFORM_HTTPS_HOST_WHITELIST: Record<
  Extract<
    ProblemSourceId,
    "leetcode-global" | "leetcode-cn" | "luogu" | "codeforces" | "atcoder" | "nowcoder"
  >,
  readonly string[]
> = {
  "leetcode-global": ["leetcode.com", "www.leetcode.com"],
  "leetcode-cn": ["leetcode.cn", "www.leetcode.cn"],
  luogu: ["www.luogu.com.cn", "luogu.com.cn"],
  codeforces: ["codeforces.com", "www.codeforces.com"],
  atcoder: ["atcoder.jp"],
  nowcoder: ["ac.nowcoder.com", "www.nowcoder.com"]
};

const ALL_ALLOWED_HOSTS = new Set<string>(
  Object.values(PLATFORM_HTTPS_HOST_WHITELIST).flat()
);

export function isAllowedSubmitUrl(url: string, platform?: ProblemSourceId): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }

  // Strict HTTPS only, never allow embedded credentials or non-standard ports
  if (parsed.protocol !== "https:") {
    return false;
  }
  if (parsed.username || parsed.password || parsed.port) {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (platform && platform in PLATFORM_HTTPS_HOST_WHITELIST) {
    const allowed =
      PLATFORM_HTTPS_HOST_WHITELIST[
        platform as keyof typeof PLATFORM_HTTPS_HOST_WHITELIST
      ];
    return allowed.includes(host);
  }

  return ALL_ALLOWED_HOSTS.has(host);
}

export function validateSubmissionUrl(url: string, platform: ProblemSourceId): boolean {
  return isAllowedSubmitUrl(url, platform);
}

export function resolveSubmitTarget(problem: ProblemDocument): SubmitTarget | null {
  switch (problem.source) {
    case "leetcode-global": {
      const slug = problem.sourceId.trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(slug)) return null;
      const submitUrl = `https://leetcode.com/problems/${slug}/`;
      return {
        platform: "leetcode-global",
        problemKey: problem.problemKey,
        submitUrl,
        canonicalUrl: submitUrl,
        supportsAutoVerdictPoll: false,
        notes: "Paste clean Solution code in the LeetCode Global editor and click Submit manually."
      };
    }

    case "leetcode-cn": {
      const slug = problem.sourceId.trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(slug)) return null;
      const submitUrl = `https://leetcode.cn/problems/${slug}/`;
      return {
        platform: "leetcode-cn",
        problemKey: problem.problemKey,
        submitUrl,
        canonicalUrl: submitUrl,
        supportsAutoVerdictPoll: false,
        notes: "Paste clean Solution code in the LeetCode CN editor and click Submit manually."
      };
    }

    case "luogu": {
      const pid = normalizeLuoguPid(problem.sourceId);
      if (!/^[A-Za-z0-9_]+$/.test(pid)) return null;
      const canonicalUrl = `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`;
      const submitUrl = `${canonicalUrl}#submit`;
      return {
        platform: "luogu",
        problemKey: problem.problemKey,
        submitUrl,
        canonicalUrl,
        supportsAutoVerdictPoll: false,
        notes: "Paste code on Luogu's #submit tab, complete any human check, and submit manually."
      };
    }

    case "codeforces": {
      const parsed =
        parseCodeforcesRef(problem.canonicalUrl ?? "") ?? parseCodeforcesRef(problem.sourceId);
      if (!parsed) return null;
      const prefix = parsed.isGym ? "gym" : "contest";
      const submitUrl = `https://codeforces.com/${prefix}/${parsed.contestId}/submit?problemIndex=${encodeURIComponent(parsed.index)}`;
      return {
        platform: "codeforces",
        problemKey: problem.problemKey,
        submitUrl,
        canonicalUrl: parsed.canonicalUrl,
        supportsAutoVerdictPoll: true,
        notes:
          "Submit manually in your browser; if your public Codeforces handle is configured, Algo Coach can poll official verdicts via the public user.status API."
      };
    }

    case "atcoder": {
      const urlMatch = problem.canonicalUrl?.match(
        /^https:\/\/atcoder\.jp\/contests\/([a-z0-9_-]+)\/tasks\/([a-z0-9_-]+)/i
      );
      let contestId = urlMatch?.[1]?.toLowerCase();
      let taskId = urlMatch?.[2]?.toLowerCase();

      if (!contestId || !taskId) {
        const parts = problem.sourceId.toLowerCase().split("/");
        if (parts.length === 2 && parts[0] && parts[1]) {
          contestId = parts[0];
          taskId = parts[1];
        } else {
          const inferred = problem.sourceId.toLowerCase().match(/^([a-z0-9-]+?)_[a-z0-9]+$/);
          if (inferred?.[1]) {
            contestId = inferred[1];
            taskId = problem.sourceId.toLowerCase();
          }
        }
      }

      if (!contestId || !taskId || !/^[a-z0-9_-]+$/.test(contestId) || !/^[a-z0-9_-]+$/.test(taskId)) {
        return null;
      }

      const canonicalUrl = `https://atcoder.jp/contests/${contestId}/tasks/${taskId}`;
      const submitUrl = `https://atcoder.jp/contests/${contestId}/submit?taskScreenName=${encodeURIComponent(taskId)}`;
      return {
        platform: "atcoder",
        problemKey: problem.problemKey,
        submitUrl,
        canonicalUrl,
        supportsAutoVerdictPoll: false,
        notes: "Paste code on AtCoder's submit form and click Submit manually."
      };
    }

    case "nowcoder": {
      if (problem.canonicalUrl && isAllowedSubmitUrl(problem.canonicalUrl, "nowcoder")) {
        return {
          platform: "nowcoder",
          problemKey: problem.problemKey,
          submitUrl: problem.canonicalUrl,
          canonicalUrl: problem.canonicalUrl,
          supportsAutoVerdictPoll: false,
          notes: "Open the NowCoder problem page in your browser, paste your code, and submit manually."
        };
      }
      const acmMatch = problem.sourceId.match(/^acm-(\d+)$/i);
      if (acmMatch?.[1]) {
        const url = `https://ac.nowcoder.com/acm/problem/${acmMatch[1]}`;
        return {
          platform: "nowcoder",
          problemKey: problem.problemKey,
          submitUrl: url,
          canonicalUrl: url,
          supportsAutoVerdictPoll: false,
          notes: "Open the NowCoder ACM problem page in your browser and submit manually."
        };
      }
      const contestMatch = problem.sourceId.match(/^contest-(\d+)-([A-Za-z0-9]+)$/i);
      if (contestMatch?.[1] && contestMatch?.[2]) {
        const url = `https://ac.nowcoder.com/acm/contest/${contestMatch[1]}/${contestMatch[2].toUpperCase()}`;
        return {
          platform: "nowcoder",
          problemKey: problem.problemKey,
          submitUrl: url,
          canonicalUrl: url,
          supportsAutoVerdictPoll: false,
          notes: "Open the NowCoder contest problem page in your browser and submit manually."
        };
      }
      const practiceMatch = problem.sourceId.match(/^practice-([a-f0-9]+)$/i);
      if (practiceMatch?.[1]) {
        const url = `https://www.nowcoder.com/practice/${practiceMatch[1].toLowerCase()}`;
        return {
          platform: "nowcoder",
          problemKey: problem.problemKey,
          submitUrl: url,
          canonicalUrl: url,
          supportsAutoVerdictPoll: false,
          notes: "Open the NowCoder practice page in your browser and submit manually."
        };
      }
      return null;
    }

    default:
      return null;
  }
}

import { parseCodeforcesProblemUrl } from "./codeforcesTarget";
import type {
  AtCoderTarget,
  SubmissionPlatform,
  SubmissionPlatformCapability,
  SubmissionTarget
} from "./types";

const atCoderTaskPath = /^\/contests\/([a-z0-9][a-z0-9_-]*)\/tasks\/([a-z0-9][a-z0-9_-]*)\/?$/i;

const platformCapabilities: Record<SubmissionPlatform, SubmissionPlatformCapability> = {
  codeforces: {
    platform: "codeforces",
    displayName: "Codeforces",
    loginUrl: "https://codeforces.com/",
    verdictPolling: "public_api"
  },
  atcoder: {
    platform: "atcoder",
    displayName: "AtCoder",
    loginUrl: "https://atcoder.jp/",
    verdictPolling: "submission_url"
  }
};

export function getSubmissionPlatformCapability(
  platform: SubmissionPlatform
): SubmissionPlatformCapability {
  return { ...platformCapabilities[platform] };
}

export function listSubmissionPlatformCapabilities(): SubmissionPlatformCapability[] {
  return (Object.keys(platformCapabilities) as SubmissionPlatform[])
    .map((platform) => getSubmissionPlatformCapability(platform));
}

export function parseSubmissionTarget(value: string): SubmissionTarget {
  const parsed = parseHttpsUrl(value);
  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "codeforces.com" || hostname === "www.codeforces.com") {
    return parseCodeforcesProblemUrl(value);
  }
  if (hostname === "atcoder.jp" || hostname === "www.atcoder.jp") {
    return parseAtCoderTaskUrl(parsed);
  }

  throw new Error("当前真实提交仅支持 Codeforces 和 AtCoder。");
}

function parseHttpsUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("请输入完整的 HTTPS 题目链接。");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("题目链接必须使用 HTTPS。");
  }
  return parsed;
}

function parseAtCoderTaskUrl(parsed: URL): AtCoderTarget {
  const match = parsed.pathname.match(atCoderTaskPath);
  if (!match) {
    throw new Error("请输入具体的 AtCoder 题目链接，例如 /contests/abc350/tasks/abc350_a。");
  }
  const contestId = match[1].toLowerCase();
  const taskId = match[2].toLowerCase();
  return {
    platform: "atcoder",
    contestId,
    taskId,
    canonicalUrl: `https://atcoder.jp/contests/${contestId}/tasks/${taskId}`
  };
}

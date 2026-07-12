import type { CodeforcesTarget, OfficialOjVerdict } from "./types";

export interface CodeforcesPollInput {
  handle: string;
  target: CodeforcesTarget;
  submittedAfterSeconds: number;
  maxAttempts?: number;
  intervalMs?: number;
}

export type CodeforcesPollResult =
  | {
      status: "judged";
      verdict: OfficialOjVerdict;
      submissionId: number;
      passedTestCount?: number;
      creationTimeSeconds: number;
      submissionUrl: string;
    }
  | { status: "timeout"; verdict: "UNKNOWN" };

export interface CodeforcesPollDependencies {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface CodeforcesSubmission {
  id?: unknown;
  contestId?: unknown;
  creationTimeSeconds?: unknown;
  problem?: { index?: unknown };
  verdict?: unknown;
  passedTestCount?: unknown;
}

interface ParsedCodeforcesSubmission {
  id: number;
  contestId: number;
  creationTimeSeconds: number;
  problemIndex: string;
  verdict?: string;
  passedTestCount?: number;
}

interface CodeforcesApiResponse {
  status?: unknown;
  result?: unknown;
}

export function normalizeCodeforcesVerdict(value: string | undefined): OfficialOjVerdict | undefined {
  if (!value || value === "TESTING" || value === "SUBMITTED") {
    return undefined;
  }

  const mapping: Record<string, OfficialOjVerdict> = {
    OK: "AC",
    WRONG_ANSWER: "WA",
    COMPILATION_ERROR: "CE",
    RUNTIME_ERROR: "RE",
    FAILED: "RE",
    CRASHED: "RE",
    SECURITY_VIOLATED: "RE",
    TIME_LIMIT_EXCEEDED: "TLE",
    IDLENESS_LIMIT_EXCEEDED: "TLE",
    MEMORY_LIMIT_EXCEEDED: "MLE",
    OUTPUT_LIMIT_EXCEEDED: "OLE",
    PRESENTATION_ERROR: "PE",
    PARTIAL: "PARTIAL",
    SKIPPED: "SKIPPED",
    CHALLENGED: "SKIPPED",
    REJECTED: "SKIPPED"
  };
  return mapping[value] ?? "UNKNOWN";
}

export async function pollCodeforcesVerdict(
  input: CodeforcesPollInput,
  dependencies: CodeforcesPollDependencies = {}
): Promise<CodeforcesPollResult> {
  const handle = input.handle.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(handle)) {
    throw new Error("Codeforces handle 格式不正确。");
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const sleep = dependencies.sleep ?? delay;
  const maxAttempts = Math.max(1, input.maxAttempts ?? 24);
  const intervalMs = Math.max(2_500, input.intervalMs ?? 2_500);
  const endpoint = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=20`;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetchImpl(endpoint);
    if (!response.ok) {
      throw new Error(`Codeforces 判题状态查询失败：HTTP ${response.status}。`);
    }

    const payload = (await response.json()) as CodeforcesApiResponse;
    if (payload.status !== "OK" || !Array.isArray(payload.result)) {
      throw new Error("Codeforces 判题状态查询返回了无法识别的数据。");
    }

    const submission = payload.result
      .map(parseSubmission)
      .find(
        (candidate) =>
          candidate?.contestId === input.target.contestId &&
          candidate.creationTimeSeconds >= input.submittedAfterSeconds - 5 &&
          candidate.problemIndex === input.target.problemIndex
      );

    const verdict = normalizeCodeforcesVerdict(typeof submission?.verdict === "string" ? submission.verdict : undefined);
    if (submission && verdict) {
      return {
        status: "judged",
        verdict,
        submissionId: submission.id,
        ...(typeof submission.passedTestCount === "number" ? { passedTestCount: submission.passedTestCount } : {}),
        creationTimeSeconds: submission.creationTimeSeconds,
        submissionUrl: submissionUrl(input.target, submission.id)
      };
    }

    if (attempt + 1 < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  return { status: "timeout", verdict: "UNKNOWN" };
}

function parseSubmission(value: unknown): ParsedCodeforcesSubmission | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const submission = value as CodeforcesSubmission;
  if (
    typeof submission.id !== "number" ||
    typeof submission.contestId !== "number" ||
    typeof submission.creationTimeSeconds !== "number" ||
    typeof submission.problem?.index !== "string"
  ) {
    return undefined;
  }

  return {
    id: submission.id,
    contestId: submission.contestId,
    creationTimeSeconds: submission.creationTimeSeconds,
    problemIndex: submission.problem.index.toUpperCase(),
    ...(typeof submission.verdict === "string" ? { verdict: submission.verdict } : {}),
    ...(typeof submission.passedTestCount === "number" ? { passedTestCount: submission.passedTestCount } : {})
  };
}

function submissionUrl(target: CodeforcesTarget, submissionId: number): string {
  const prefix = target.contestKind === "gym" ? "gym" : "contest";
  return `https://codeforces.com/${prefix}/${target.contestId}/submission/${submissionId}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

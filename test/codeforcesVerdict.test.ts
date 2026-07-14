import { describe, expect, test } from "vitest";
import {
  normalizeCodeforcesVerdict,
  pollCodeforcesVerdict,
  type CodeforcesPollResult
} from "../src/submission/codeforcesVerdict";
import type { CodeforcesTarget } from "../src/submission/types";

const target: CodeforcesTarget = {
  platform: "codeforces",
  contestKind: "contest",
  contestId: 1200,
  problemIndex: "F",
  canonicalUrl: "https://codeforces.com/contest/1200/problem/F"
};

function apiResponse(result: unknown[]): Response {
  return new Response(JSON.stringify({ status: "OK", result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("Codeforces verdict polling", () => {
  test("maps Codeforces verdicts into official OJ verdicts", () => {
    expect(normalizeCodeforcesVerdict("OK")).toBe("AC");
    expect(normalizeCodeforcesVerdict("WRONG_ANSWER")).toBe("WA");
    expect(normalizeCodeforcesVerdict("COMPILATION_ERROR")).toBe("CE");
    expect(normalizeCodeforcesVerdict("RUNTIME_ERROR")).toBe("RE");
    expect(normalizeCodeforcesVerdict("TIME_LIMIT_EXCEEDED")).toBe("TLE");
    expect(normalizeCodeforcesVerdict("MEMORY_LIMIT_EXCEEDED")).toBe("MLE");
    expect(normalizeCodeforcesVerdict("OUTPUT_LIMIT_EXCEEDED")).toBe("OLE");
    expect(normalizeCodeforcesVerdict("PARTIAL")).toBe("PARTIAL");
    expect(normalizeCodeforcesVerdict("TESTING")).toBeUndefined();
  });

  test("polls until the matching submission has a final verdict", async () => {
    const requested: string[] = [];
    const sleeps: number[] = [];
    let requestCount = 0;
    const fetchImpl: typeof fetch = async (input) => {
      requested.push(String(input));
      requestCount += 1;
      return apiResponse([
        {
          id: 77,
          contestId: 1200,
          creationTimeSeconds: 1_005,
          problem: { index: "F" },
          verdict: requestCount === 1 ? "TESTING" : "OK",
          passedTestCount: requestCount === 1 ? 2 : 20
        }
      ]);
    };

    const result = await pollCodeforcesVerdict(
      { handle: "tourist", target, submittedAfterSeconds: 1_000, maxAttempts: 3 },
      { fetchImpl, sleep: async (milliseconds) => void sleeps.push(milliseconds) }
    );

    expect(result).toEqual<CodeforcesPollResult>({
      status: "judged",
      verdict: "AC",
      submissionId: 77,
      passedTestCount: 20,
      creationTimeSeconds: 1_005,
      submissionUrl: "https://codeforces.com/contest/1200/submission/77"
    });
    expect(requested[0]).toBe("https://codeforces.com/api/user.status?handle=tourist&from=1&count=20");
    expect(sleeps).toEqual([2_500]);
  });

  test("ignores older or different-problem submissions and returns UNKNOWN on timeout", async () => {
    const fetchImpl: typeof fetch = async () =>
      apiResponse([
        { id: 1, contestId: 1200, creationTimeSeconds: 900, problem: { index: "F" }, verdict: "OK" },
        { id: 2, contestId: 1200, creationTimeSeconds: 1_005, problem: { index: "A" }, verdict: "OK" }
      ]);

    const result = await pollCodeforcesVerdict(
      { handle: "tourist", target, submittedAfterSeconds: 1_000, maxAttempts: 2 },
      { fetchImpl, sleep: async () => undefined }
    );

    expect(result).toEqual({ status: "timeout", verdict: "UNKNOWN" });
  });

  test("rejects an invalid public handle before calling the API", async () => {
    let called = false;
    await expect(
      pollCodeforcesVerdict(
        { handle: "bad handle", target, submittedAfterSeconds: 1_000, maxAttempts: 1 },
        {
          fetchImpl: async () => {
            called = true;
            return apiResponse([]);
          },
          sleep: async () => undefined
        }
      )
    ).rejects.toThrow("Codeforces handle");
    expect(called).toBe(false);
  });
});

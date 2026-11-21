import { describe, expect, it, vi } from "vitest";
import type { ProblemDocument } from "../../src/core/contracts";
import {
  createManualVerdictEvent,
  isAllowedSubmitUrl,
  normalizeCodeforcesVerdict,
  pollCodeforcesOfficialVerdict,
  prepareSubmitPayload,
  resolveSubmitTarget,
  stripLocalDebugAndHarness,
  validateSubmissionUrl
} from "../../src/submitBridge";

function docFor(
  source: ProblemDocument["source"],
  sourceId: string,
  extra?: Partial<ProblemDocument>
): ProblemDocument {
  return {
    schemaVersion: "problem-doc/v2",
    problemKey: `${source}:${sourceId}`,
    source,
    sourceId,
    title: "Test Problem",
    locale: "en-US",
    completeness: "full",
    ioMode: source === "leetcode-cn" || source === "leetcode-global" ? "function" : "stdio",
    samples: [],
    rawTags: [],
    provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() },
    ...extra
  };
}

describe("targetRegistry", () => {
  it("enforces strict HTTPS domain whitelist and blocks phishing/non-HTTPS URLs", () => {
    expect(isAllowedSubmitUrl("https://leetcode.com/problems/two-sum/", "leetcode-global")).toBe(true);
    expect(isAllowedSubmitUrl("https://leetcode.cn/problems/two-sum/", "leetcode-cn")).toBe(true);
    expect(isAllowedSubmitUrl("https://www.luogu.com.cn/problem/P1001#submit", "luogu")).toBe(true);
    expect(isAllowedSubmitUrl("https://codeforces.com/contest/1433/submit?problemIndex=G", "codeforces")).toBe(true);
    expect(isAllowedSubmitUrl("https://atcoder.jp/contests/abc300/submit?taskScreenName=abc300_a", "atcoder")).toBe(true);
    expect(isAllowedSubmitUrl("https://ac.nowcoder.com/acm/problem/14362", "nowcoder")).toBe(true);

    // Reject insecure / lookalike / credential / wrong-platform URLs
    expect(isAllowedSubmitUrl("http://codeforces.com/contest/1433/submit")).toBe(false);
    expect(isAllowedSubmitUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedSubmitUrl("https://codeforces.com.evil.org/contest/1/submit", "codeforces")).toBe(false);
    expect(isAllowedSubmitUrl("https://user:pass@leetcode.com/problems/two-sum/")).toBe(false);
    expect(isAllowedSubmitUrl("https://leetcode.com:8443/problems/two-sum/")).toBe(false);
    expect(isAllowedSubmitUrl("https://leetcode.cn/problems/two-sum/", "leetcode-global")).toBe(false);
  });

  it("generates exact submit URLs for all 5 platforms", () => {
    expect(resolveSubmitTarget(docFor("leetcode-global", "two-sum"))?.submitUrl).toBe(
      "https://leetcode.com/problems/two-sum/"
    );
    expect(resolveSubmitTarget(docFor("leetcode-cn", "two-sum"))?.submitUrl).toBe(
      "https://leetcode.cn/problems/two-sum/"
    );
    expect(resolveSubmitTarget(docFor("luogu", "1001"))?.submitUrl).toBe(
      "https://www.luogu.com.cn/problem/P1001#submit"
    );
    expect(resolveSubmitTarget(docFor("codeforces", "1433G"))?.submitUrl).toBe(
      "https://codeforces.com/contest/1433/submit?problemIndex=G"
    );
    expect(resolveSubmitTarget(docFor("codeforces", "gym:102951A"))?.submitUrl).toBe(
      "https://codeforces.com/gym/102951/submit?problemIndex=A"
    );
    expect(
      resolveSubmitTarget(
        docFor("atcoder", "abc300_a", {
          canonicalUrl: "https://atcoder.jp/contests/abc300/tasks/abc300_a"
        })
      )?.submitUrl
    ).toBe("https://atcoder.jp/contests/abc300/submit?taskScreenName=abc300_a");
    expect(resolveSubmitTarget(docFor("nowcoder", "acm-14362"))?.submitUrl).toBe(
      "https://ac.nowcoder.com/acm/problem/14362"
    );
  });
});

describe("copyAndOpen", () => {
  it("strips local debug macros, marker blocks, and LeetCode local drivers while preserving stdio main", () => {
    const cppStdio = `#include <iostream>
using namespace std;

#ifdef LOCAL
#define dbg(x) cerr << #x << " = " << x << endl
#else
#define dbg(x)
#endif

// algo-coach:local-only-start
void dumpDebug() {}
// algo-coach:local-only-end

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << "\\n";
    return 0;
}
`;
    const strippedCpp = stripLocalDebugAndHarness(cppStdio, "cpp", "stdio");
    expect(strippedCpp.removedBlocks).toBe(2);
    expect(strippedCpp.cleanedCode).not.toContain("LOCAL");
    expect(strippedCpp.cleanedCode).not.toContain("dumpDebug");
    expect(strippedCpp.cleanedCode).toContain("#define dbg(x)");
    expect(strippedCpp.cleanedCode).toContain("int main()");

    const pyLeetCode = `class Solution:
    def twoSum(self, nums, target):
        return [0, 1]

if __name__ == "__main__":
    print(Solution().twoSum([2, 7], 9))
`;
    const strippedLcPy = stripLocalDebugAndHarness(pyLeetCode, "python", "function");
    expect(strippedLcPy.removedBlocks).toBe(1);
    expect(strippedLcPy.cleanedCode).toContain("class Solution:");
    expect(strippedLcPy.cleanedCode).not.toContain("__main__");

    // In stdio mode, Python __main__ MUST be preserved!
    const preservedStdioPy = stripLocalDebugAndHarness(pyLeetCode, "python", "stdio");
    expect(preservedStdioPy.cleanedCode).toContain("__main__");

    const prepared = prepareSubmitPayload(docFor("leetcode-cn", "two-sum"), pyLeetCode, "python");
    expect(prepared.target?.submitUrl).toBe("https://leetcode.cn/problems/two-sum/");
    expect(prepared.cleanedCode).not.toContain("__main__");

    // In function mode, C++ local int main() driver is stripped while class Solution stays intact
    const cppLeetCode = `class Solution {
public:
    int add(int a, int b) { return a + b; }
};

int main() {
    Solution s;
    return s.add(1, 2);
}
`;
    const strippedLcCpp = stripLocalDebugAndHarness(cppLeetCode, "cpp", "function");
    expect(strippedLcCpp.removedBlocks).toBe(1);
    expect(strippedLcCpp.cleanedCode).toContain("class Solution");
    expect(strippedLcCpp.cleanedCode).not.toContain("int main()");
  });

  it("sanitizes manual verdict submissionUrl against platform whitelist", () => {
    const safeEvent = createManualVerdictEvent({
      problemKey: "luogu:P1001",
      platform: "luogu",
      verdict: "AC",
      submissionUrl: "https://www.luogu.com.cn/record/123456"
    });
    expect(safeEvent.submissionUrl).toBe("https://www.luogu.com.cn/record/123456");
    expect(safeEvent.source).toBe("official_oj");
    expect(safeEvent.observedVia).toBe("manual_report");

    const blockedEvent = createManualVerdictEvent({
      problemKey: "luogu:P1001",
      platform: "luogu",
      verdict: "AC",
      submissionUrl: "https://evil.example/phish"
    });
    expect(blockedEvent.submissionUrl).toBeUndefined();
    expect(validateSubmissionUrl("https://evil.example/phish", "luogu")).toBe(false);
  });
});

describe("codeforcesPublicPoller", () => {
  it("normalizes official Codeforces verdict codes accurately", () => {
    expect(normalizeCodeforcesVerdict("OK")).toBe("AC");
    expect(normalizeCodeforcesVerdict("WRONG_ANSWER")).toBe("WA");
    expect(normalizeCodeforcesVerdict("TIME_LIMIT_EXCEEDED")).toBe("TLE");
    expect(normalizeCodeforcesVerdict("MEMORY_LIMIT_EXCEEDED")).toBe("MLE");
    expect(normalizeCodeforcesVerdict("COMPILATION_ERROR")).toBe("CE");
    expect(normalizeCodeforcesVerdict("RUNTIME_ERROR")).toBe("RE");
    expect(normalizeCodeforcesVerdict("PRESENTATION_ERROR")).toBe("OTHER");
    expect(normalizeCodeforcesVerdict("TESTING")).toBeUndefined();
    expect(normalizeCodeforcesVerdict(undefined)).toBeUndefined();
  });

  it("polls public user.status API without login until verdict transitions from TESTING to OK", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "OK",
            result: [
              {
                id: 987654,
                contestId: 1433,
                creationTimeSeconds: 1700000010,
                problem: { index: "G" },
                verdict: "TESTING"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "OK",
            result: [
              {
                id: 987654,
                contestId: 1433,
                creationTimeSeconds: 1700000010,
                problem: { index: "G" },
                verdict: "OK",
                passedTestCount: 42,
                timeConsumingMillis: 124,
                memoryConsumedBytes: 6553600
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const sleep = vi.fn(async () => {});
    const result = await pollCodeforcesOfficialVerdict(
      {
        handle: "tourist",
        target: { contestId: 1433, problemIndex: "g" },
        submittedAfterSeconds: 1700000000,
        maxAttempts: 3,
        intervalMs: 2500
      },
      { fetchImpl: mockFetch, sleep }
    );

    expect(result.status).toBe("judged");
    if (result.status === "judged") {
      expect(result.submissionId).toBe(987654);
      expect(result.event.schemaVersion).toBe("official-verdict/v2");
      expect(result.event.source).toBe("official_oj");
      expect(result.event.observedVia).toBe("public_api");
      expect(result.event.problemKey).toBe("cf:1433G");
      expect(result.event.verdict).toBe("AC");
      expect(result.event.passedTests).toBe(42);
      expect(result.event.runtimeMs).toBe(124);
      expect(result.event.memoryKb).toBe(6400);
      expect(result.event.submissionUrl).toBe("https://codeforces.com/contest/1433/submission/987654");
    }
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed handles, handles timeouts cleanly, and respects AbortSignal", async () => {
    await expect(
      pollCodeforcesOfficialVerdict({
        handle: "bad handle!",
        target: { contestId: 4, problemIndex: "A" },
        submittedAfterSeconds: 1700000000
      })
    ).rejects.toThrow("Invalid Codeforces handle");

    const emptyFetch = vi.fn<typeof fetch>().mockImplementation(
      async () => new Response(JSON.stringify({ status: "OK", result: [] }), { status: 200 })
    );
    const timeoutRes = await pollCodeforcesOfficialVerdict(
      {
        handle: "demo_user",
        target: { contestId: 4, problemIndex: "A" },
        submittedAfterSeconds: 1700000000,
        maxAttempts: 2
      },
      { fetchImpl: emptyFetch, sleep: async () => {} }
    );
    expect(timeoutRes.status).toBe("timeout");
    expect(emptyFetch).toHaveBeenCalledTimes(2);

    const controller = new AbortController();
    controller.abort();
    const abortedRes = await pollCodeforcesOfficialVerdict(
      {
        handle: "demo_user",
        target: { contestId: 102951, problemIndex: "A", contestKind: "gym" },
        submittedAfterSeconds: 1700000000,
        signal: controller.signal
      },
      { fetchImpl: emptyFetch, sleep: async () => {} }
    );
    expect(abortedRes.status).toBe("aborted");
  });
});

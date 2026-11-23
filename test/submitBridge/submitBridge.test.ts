import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import type { ProblemDocument } from "../../src/core/contracts";
import {
  buildCompanionUserscript,
  createManualVerdictEvent,
  extractAtCoderTask,
  extractLeetCodeSlug,
  fetchLatestAtCoderVerdict,
  fetchLatestLeetCodeCnVerdict,
  fetchLatestLeetCodeGlobalVerdict,
  fetchLatestPublicVerdict,
  isAllowedSubmitUrl,
  normalizeAtCoderResult,
  normalizeCodeforcesVerdict,
  normalizeLeetCodeCnStatus,
  normalizeLeetCodeGlobalStatus,
  pollCodeforcesOfficialVerdict,
  pollPublicOfficialVerdict,
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

    // Mixed-case CN slug preservation, multi-underscore AtCoder taskId, and new allowed hosts
    expect(isAllowedSubmitUrl("https://m.codeforces.com/contest/1900/submit", "codeforces")).toBe(true);
    expect(isAllowedSubmitUrl("https://nowcoder.com/practice/abc123", "nowcoder")).toBe(true);
    expect(resolveSubmitTarget(docFor("leetcode-cn", "1fGaJU"))?.submitUrl).toBe(
      "https://leetcode.cn/problems/1fGaJU/"
    );
    expect(resolveSubmitTarget(docFor("atcoder", "tessoku_book_a"))?.submitUrl).toBe(
      "https://atcoder.jp/contests/tessoku-book/submit?taskScreenName=tessoku_book_a"
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

  it("handles C/C++ strings/comments/raw-strings/preprocessor branches, Python triple quotes, and C/Rust/Java function drivers", () => {
    // 1. C++ function-mode: strings/chars/comments/raw-strings inside main(), byte-0 main, block-commented main, signed main()
    const trickyCpp = `/*
int main() {
  broken();
}
*/
signed main() {
    string s = "}";
    char c = '}';
    // }
    auto raw = R"delim( } )delim";
    return 0;
}
class Solution {
public:
    int solve() { return 42; }
};
`;
    const strippedTrickyCpp = stripLocalDebugAndHarness(trickyCpp, "cpp", "function");
    expect(strippedTrickyCpp.removedBlocks).toBe(1);
    expect(strippedTrickyCpp.cleanedCode).toContain("/*\nint main()");
    expect(strippedTrickyCpp.cleanedCode).toContain("class Solution");
    expect(strippedTrickyCpp.cleanedCode).not.toContain("signed main()");
    expect(strippedTrickyCpp.cleanedCode).not.toContain('R"delim(');

    // 2. C++ preprocessor: /* #ifdef LOCAL */, #elif, !defined(ONLINE_JUDGE), #ifdef ONLINE_JUDGE..#else, compound guard, unclosed EOF
    const preprocCpp = `/* #ifdef LOCAL */
#if defined(LOCAL) || defined(USE_FAST_HASH)
int fast_hash = 1;
#endif
#if !defined(ONLINE_JUDGE)
int debug_only = 1;
#endif
#ifdef ONLINE_JUDGE
int oj_fast = 1;
#else
freopen("in.txt", "r", stdin);
#endif
#ifdef LOCAL
int local_branch = 1;
#elif defined(BENCH)
int bench_branch = 2;
#else
int prod_branch = 3;
#endif
#ifdef LOCAL
int unclosed_at_eof = 9;
`;
    const preprocRes = stripLocalDebugAndHarness(preprocCpp, "cpp", "stdio");
    expect(preprocRes.cleanedCode).toContain("/* #ifdef LOCAL */");
    expect(preprocRes.cleanedCode).toContain("#if defined(LOCAL) || defined(USE_FAST_HASH)");
    expect(preprocRes.cleanedCode).toContain("int fast_hash = 1;");
    expect(preprocRes.cleanedCode).not.toContain("debug_only");
    expect(preprocRes.cleanedCode).toContain("int oj_fast = 1;");
    expect(preprocRes.cleanedCode).not.toContain("freopen");
    expect(preprocRes.cleanedCode).toContain("#if defined(BENCH)\nint bench_branch = 2;");
    expect(preprocRes.cleanedCode).toContain("int prod_branch = 3;");
    expect(preprocRes.cleanedCode).not.toContain("local_branch");
    expect(preprocRes.cleanedCode).not.toContain("unclosed_at_eof");

    // 3. Python triple-quoted strings inside __main__ with col-0 lines
    const pyTriple = `class Solution:
    def solve(self):
        return 1

if __name__ == "__main__":
    raw = """1 2
3 4"""
    print(Solution().solve())
`;
    const pyTripleRes = stripLocalDebugAndHarness(pyTriple, "python", "function");
    expect(pyTripleRes.removedBlocks).toBe(1);
    expect(pyTripleRes.cleanedCode).toBe("class Solution:\n    def solve(self):\n        return 1\n");

    // 4. C, Rust, and Java function-mode driver stripping
    const cFn = `int add(int a, int b) { return a + b; }\nint main(void) { return add(1, 2); }\n`;
    const cRes = stripLocalDebugAndHarness(cFn, "c", "function");
    expect(cRes.removedBlocks).toBe(1);
    expect(cRes.cleanedCode).toBe("int add(int a, int b) { return a + b; }\n");

    const rustFn = `impl Solution {
    pub fn f<'a>(s: &'a str) -> &'a str { s }
}
pub fn main() {
    let x = r#"}"#;
    println!("{}", Solution::f(x));
}
`;
    const rustRes = stripLocalDebugAndHarness(rustFn, "rust", "function");
    expect(rustRes.removedBlocks).toBe(1);
    expect(rustRes.cleanedCode).toContain("impl Solution");
    expect(rustRes.cleanedCode).not.toContain("fn main()");

    const javaInsideSolution = `class Solution {
    public int add(int a, int b) { return a + b; }
    public static void main(String[] args) {
        System.out.println(new Solution().add(1, 2));
    }
}
`;
    const javaRes1 = stripLocalDebugAndHarness(javaInsideSolution, "java", "function");
    expect(javaRes1.removedBlocks).toBe(1);
    expect(javaRes1.cleanedCode).toContain("class Solution");
    expect(javaRes1.cleanedCode).not.toContain("static void main");

    const javaSeparateClass = `class Solution {
    public int add(int a, int b) { return a + b; }
}
class Main {
    public static void main(String[] args) {
        System.out.println(new Solution().add(1, 2));
    }
}
`;
    const javaRes2 = stripLocalDebugAndHarness(javaSeparateClass, "java", "function");
    expect(javaRes2.removedBlocks).toBe(1);
    expect(javaRes2.cleanedCode).not.toContain("class Main");
    expect(javaRes2.cleanedCode).toContain("class Solution");
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

describe("publicVerdictPollers & companionUserscript", () => {
  it("normalizes LeetCode CN, LeetCode Global, and AtCoder statuses accurately", () => {
    expect(normalizeLeetCodeCnStatus("A_10")).toBe("AC");
    expect(normalizeLeetCodeCnStatus("A_11")).toBe("WA");
    expect(normalizeLeetCodeCnStatus("A_12")).toBe("MLE");
    expect(normalizeLeetCodeCnStatus("A_14")).toBe("TLE");
    expect(normalizeLeetCodeCnStatus("A_15")).toBe("RE");
    expect(normalizeLeetCodeCnStatus("A_20")).toBe("CE");
    expect(normalizeLeetCodeCnStatus("PENDING")).toBeUndefined();

    expect(normalizeLeetCodeGlobalStatus("Accepted")).toBe("AC");
    expect(normalizeLeetCodeGlobalStatus("Wrong Answer")).toBe("WA");
    expect(normalizeLeetCodeGlobalStatus("Time Limit Exceeded")).toBe("TLE");
    expect(normalizeLeetCodeGlobalStatus("Pending")).toBeUndefined();

    expect(normalizeAtCoderResult("AC")).toBe("AC");
    expect(normalizeAtCoderResult("WA")).toBe("WA");
    expect(normalizeAtCoderResult("WJ")).toBeUndefined();
    expect(normalizeAtCoderResult("12/40")).toBeUndefined();
  });

  it("fetches LeetCode CN recentSubmissions via GraphQL without login", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            recentSubmissions: [
              {
                id: "550011",
                status: "A_10",
                lang: "cpp",
                submitTime: 1700000020,
                question: { questionFrontendId: "1", titleSlug: "two-sum" }
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const res = await fetchLatestLeetCodeCnVerdict(
      { handle: "endlesscheng", titleSlug: "two-sum", submittedAfterSeconds: 1700000000 },
      { fetchImpl: mockFetch }
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://leetcode.cn/graphql/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ origin: "https://leetcode.cn" })
      })
    );
    expect(res.status).toBe("judged");
    if (res.status === "judged") {
      expect(res.dedupKey).toBe("lccn-sub-550011");
      expect(res.event.verdict).toBe("AC");
      expect(res.event.observedVia).toBe("public_api");
      expect(res.event.submissionUrl).toBe("https://leetcode.cn/problems/two-sum/submissions/");
    }
  });

  it("fetches LeetCode Global & AtCoder verdicts and polls with timeout/abort support", async () => {
    const lcGlobalFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            recentSubmissionList: [
              {
                id: "998877",
                title: "Two Sum",
                titleSlug: "two-sum",
                statusDisplay: "Wrong Answer",
                lang: "python3",
                timestamp: "1700000030"
              }
            ]
          }
        }),
        { status: 200 }
      )
    );
    const gl = await fetchLatestLeetCodeGlobalVerdict(
      { handle: "lee215", titleSlug: "two-sum", submittedAfterSeconds: 1700000000 },
      { fetchImpl: lcGlobalFetch }
    );
    expect(gl.status).toBe("judged");
    if (gl.status === "judged") {
      expect(gl.dedupKey).toBe("lc-sub-998877");
      expect(gl.event.verdict).toBe("WA");
      expect(gl.event.submissionUrl).toBe("https://leetcode.com/submissions/detail/998877/");
    }

    const atFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 7771,
              epoch_second: 1700000010,
              problem_id: "abc300_a",
              contest_id: "abc300",
              result: "WJ",
              execution_time: null
            }
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 7771,
              epoch_second: 1700000010,
              problem_id: "abc300_a",
              contest_id: "abc300",
              result: "AC",
              execution_time: 18
            }
          ]),
          { status: 200 }
        )
      );

    const directAt = await fetchLatestAtCoderVerdict(
      { handle: "chokudai", taskId: "abc300_a", submittedAfterSeconds: 1700000000 },
      { fetchImpl: atFetch }
    );
    expect(directAt.status).toBe("pending");
    expect(atFetch.mock.calls[0]?.[0]).toContain("from_second=1699999995");

    const polled = await pollPublicOfficialVerdict(
      {
        problem: docFor("atcoder", "abc300/abc300_a", {
          canonicalUrl: "https://atcoder.jp/contests/abc300/tasks/abc300_a"
        }),
        handles: { atcoder: "chokudai" },
        submittedAfterSeconds: 1700000000,
        maxAttempts: 2,
        intervalMs: 1
      },
      { fetchImpl: atFetch, sleep: async () => {} }
    );
    expect(polled.status).toBe("judged");
    if (polled.status === "judged") {
      expect(polled.dedupKey).toBe("ac-sub-7771");
      expect(polled.event.verdict).toBe("AC");
      expect(polled.event.runtimeMs).toBe(18);
      expect(polled.event.submissionUrl).toBe("https://atcoder.jp/contests/abc300/submissions/7771");
    }

    await expect(
      fetchLatestPublicVerdict({
        problem: docFor("luogu", "P1001"),
        handle: "user",
        submittedAfterSeconds: 1700000000
      })
    ).rejects.toThrow("not supported");
  });

  it("builds a zero-cookie 6-OJ companion userscript targeting localhost /verdict", async () => {
    const script = buildCompanionUserscript({ port: 27888, token: "tok-secret-42" });
    expect(script).toContain("https://leetcode.cn/problems/*");
    expect(script).toContain("https://leetcode.com/problems/*");
    expect(script).toContain("https://www.luogu.com.cn/record/*");
    expect(script).toContain("https://codeforces.com/*/submission/*");
    expect(script).toContain("https://atcoder.jp/contests/*/submissions/*");
    expect(script).toContain("https://ac.nowcoder.com/acm/contest/view-submission*");
    expect(script).toContain('"http://127.0.0.1:27888/verdict"');
    expect(script).toContain('"tok-secret-42"');
    expect(script).toContain("x-algo-coach-token");
    expect(script).not.toContain("document.cookie");
    expect(script).toContain("https://leetcode.cn/submissions/*");
    expect(script).toContain("https://codeforces.com/problemset/submission/*");
    expect(script).toContain("https://codeforces.com/*/my*");

    // Verify canonical key prefixes, CN slug case, and multi-underscore AtCoder taskIds in pollers
    expect(extractLeetCodeSlug(docFor("leetcode-cn", "1fGaJU"))).toBe("1fGaJU");
    expect(extractAtCoderTask(docFor("atcoder", "tessoku_book_a"))).toEqual({
      contestId: "tessoku-book",
      taskId: "tessoku_book_a"
    });

    const cnMixedFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            recentSubmissions: [
              {
                id: "77001",
                status: "A_10",
                submitTime: 1700000050,
                question: { titleSlug: "1fGaJU" }
              }
            ]
          }
        }),
        { status: 200 }
      )
    );
    const cnMixedRes = await fetchLatestLeetCodeCnVerdict(
      { handle: "user", titleSlug: "1fGaJU", submittedAfterSeconds: 1700000000 },
      { fetchImpl: cnMixedFetch }
    );
    expect(cnMixedRes.status).toBe("judged");
    if (cnMixedRes.status === "judged") {
      expect(cnMixedRes.event.problemKey).toBe("lc-cn:1fGaJU");
      expect(cnMixedRes.event.submissionUrl).toBe("https://leetcode.cn/problems/1fGaJU/submissions/");
    }

    // Verify synced static resource userscript executes cleanly across routes and rejects false AC
    const staticUserscript = readFileSync(
      resolve(__dirname, "../../resources/companion/algo-coach-verdict-bridge.user.js"),
      "utf8"
    );
    const defaultGenerated = buildCompanionUserscript({
      port: 27121,
      token: "REPLACE_WITH_TOKEN_COPIED_FROM_ALGO_COACH"
    });
    const stripStaticComment = (s: string) =>
      s
        .replace(/\r\n/g, "\n")
        .replace(/\/\/ Template placeholder:.*\n\/\/ to copy.*\n/, "");
    expect(stripStaticComment(staticUserscript)).toBe(stripStaticComment(defaultGenerated));

    const runUserscriptProbe = (opts: {
      url: string;
      elements: Record<string, Array<{ textContent: string; attrs?: Record<string, string>; inNav?: boolean }>>;
      gmStatus?: number;
    }) => {
      const posted: Array<Record<string, unknown>> = [];
      const warns: string[] = [];
      const u = new URL(opts.url);
      const makeEl = (spec: { textContent: string; attrs?: Record<string, string>; inNav?: boolean }) => ({
        textContent: spec.textContent,
        getAttribute: (k: string) => spec.attrs?.[k] ?? null,
        closest: (sel: string) => (spec.inNav && /nav|header/.test(sel) ? {} : null),
        querySelector: (sel: string) => {
          const hit = opts.elements[`row:${sel}`]?.[0];
          return hit ? makeEl(hit) : null;
        },
        querySelectorAll: (sel: string) => (opts.elements[sel] ?? []).map(makeEl)
      });
      const documentMock = {
        documentElement: {},
        querySelector: (sel: string) => {
          const hit = opts.elements[sel]?.[0];
          return hit ? makeEl(hit) : null;
        },
        querySelectorAll: (sel: string) => (opts.elements[sel] ?? []).map(makeEl)
      };
      const sandbox = {
        location: { hostname: u.hostname, pathname: u.pathname, search: u.search, origin: u.origin, href: u.href },
        URL,
        Set,
        Array,
        String,
        console: { warn: (...args: unknown[]) => warns.push(args.map(String).join(" ")) },
        document: documentMock,
        window: { addEventListener: () => {} },
        MutationObserver: class { observe() {} },
        setTimeout: (fn: () => void) => {
          fn();
          return 1;
        },
        clearTimeout: () => {},
        GM_xmlhttpRequest: (req: { data: string; onload?: (r: { status: number }) => void }) => {
          posted.push(JSON.parse(req.data) as Record<string, unknown>);
          req.onload?.({ status: opts.gmStatus ?? 200 });
        }
      };
      vm.runInNewContext(script, sandbox);
      return { posted, warns };
    };

    // Negative Chinese status ("未通过", "通过率") must NEVER fire AC
    const falseAcProbe = runUserscriptProbe({
      url: "https://www.nowcoder.com/practice/a0c09a7e0da04e728810a8aca7226b7b",
      elements: {
        ".result-tag, .submission-status, .judge-status, .submit-result .status, [data-e2e='submission-result']": [
          { textContent: "通过率 48%" },
          { textContent: "部分通过" }
        ]
      }
    });
    expect(falseAcProbe.posted).toHaveLength(0);

    // Codeforces /contest/1900/my status table + 401 console warning
    const cfMyProbe = runUserscriptProbe({
      url: "https://codeforces.com/contest/1900/my",
      gmStatus: 401,
      elements: {
        "table.status-frame-datatable tr[data-submission-id], #pageContent tr[data-submission-id]": [
          { textContent: "", attrs: { "data-submission-id": "445566" } }
        ],
        "row:.verdict-accepted, .verdict-rejected, span[class*='verdict-']": [{ textContent: "Accepted" }],
        'row:a[href*="/problem/"]': [{ textContent: "A", attrs: { href: "/contest/1900/problem/A" } }],
        'row:a[href*="/submission/"]': [{ textContent: "445566", attrs: { href: "/contest/1900/submission/445566" } }]
      }
    });
    expect(cfMyProbe.posted[0]).toMatchObject({
      platform: "codeforces",
      sourceId: "1900A",
      submissionId: "445566",
      verdict: "AC"
    });
    expect(cfMyProbe.warns.some((w) => w.includes("401"))).toBe(true);

    // AtCoder /submissions/me + NowCoder /acm/contest/<cid>/<letter> with submissionId
    const acMeProbe = runUserscriptProbe({
      url: "https://atcoder.jp/contests/abc300/submissions/me",
      elements: {
        "#main-container table tbody tr, table tbody tr": [{ textContent: "" }],
        "row:span.label": [{ textContent: "AC" }],
        'row:a[href*="/tasks/"]': [{ textContent: "A", attrs: { href: "/contests/abc300/tasks/abc300_a" } }],
        'row:a[href*="/submissions/"]': [{ textContent: "Detail", attrs: { href: "/contests/abc300/submissions/9988" } }]
      }
    });
    expect(acMeProbe.posted[0]).toMatchObject({
      platform: "atcoder",
      sourceId: "abc300_a",
      submissionId: "9988",
      verdict: "AC"
    });

    const ncProbe = runUserscriptProbe({
      url: "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=321654",
      elements: {
        ".result-tag, .status-name, .submission-status, .judge-status, .submit-result .status, [data-e2e='submission-result']": [
          { textContent: "答案正确" }
        ],
        'a[href*="/acm/problem/"], a[href*="/acm/contest/"], a[href*="/practice/"]': [
          { textContent: "Problem A", attrs: { href: "/acm/contest/11253/A" } }
        ]
      }
    });
    expect(ncProbe.posted[0]).toMatchObject({
      platform: "nowcoder",
      sourceId: "contest-11253-A",
      submissionId: "321654",
      verdict: "AC"
    });

    // LeetCode CN /submissions/detail/* skips navbar links and preserves mixed-case slug; Luogu skips /problem/list
    const lcSubProbe = runUserscriptProbe({
      url: "https://leetcode.cn/submissions/detail/98765/",
      elements: {
        '[data-e2e-locator="submission-result"]': [{ textContent: "通过" }],
        '[data-e2e-locator="submission-detail"], main, [class*="submission"]': [
          { textContent: "" }
        ],
        'a[href*="/problems/"]': [
          { textContent: "All", attrs: { href: "/problems/all" }, inNav: true },
          { textContent: "3Sum", attrs: { href: "/problems/1fGaJU/" } }
        ]
      }
    });
    expect(lcSubProbe.posted[0]).toMatchObject({
      platform: "leetcode-cn",
      sourceId: "1fGaJU",
      submissionId: "98765",
      verdict: "AC"
    });

    const lgProbe = runUserscriptProbe({
      url: "https://www.luogu.com.cn/record/555444",
      elements: {
        ".status-name, .record-status .lfe-caption, .info-rows .lfe-caption, [class*='record'] .status-name": [
          { textContent: "Accepted" }
        ],
        'a[href^="/problem/"]': [
          { textContent: "List", attrs: { href: "/problem/list" }, inNav: true },
          { textContent: "P1001", attrs: { href: "/problem/P1001" } }
        ]
      }
    });
    expect(lgProbe.posted[0]).toMatchObject({
      platform: "luogu",
      sourceId: "P1001",
      submissionId: "555444",
      verdict: "AC"
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { ProblemAdapterError } from "../../src/core/contracts";
import {
  AtCoderAdapter,
  CURATED_SHEETS,
  CodeforcesAdapter,
  LuoguAdapter,
  NowCoderAdapter,
  createLeetCodeCnAdapter,
  createLeetCodeGlobalAdapter,
  curatedEntryToMetadataDocument,
  getCuratedSheet,
  listCuratedSheets
} from "../../src/problems";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

describe("curatedSheets", () => {
  it("provides Hot 100, Blind 75, and NeetCode 150 lightweight slug indexes without statement text", () => {
    const sheets = listCuratedSheets();
    expect(sheets.map((s) => s.id)).toEqual(["hot-100", "blind-75", "neetcode-150"]);
    expect(getCuratedSheet("hot100")?.id).toBe("hot-100");
    expect(getCuratedSheet("blind-75")?.items.length).toBeGreaterThanOrEqual(65);
    expect(getCuratedSheet("neetcode-150")?.items.length).toBeGreaterThan(
      CURATED_SHEETS["blind-75"].items.length
    );

    const first = CURATED_SHEETS["hot-100"].items[0]!;
    const doc = curatedEntryToMetadataDocument(first, "leetcode-cn");
    expect(doc.completeness).toBe("metadata_only");
    expect(doc.statementMarkdown).toBeUndefined();
    expect(doc.problemKey).toBe(`lc-cn:${first.slug}`);
  });
});

describe("LeetCodeAdapter (global & cn)", () => {
  it("fetches public problem via Guest GraphQL with codeSnippets, metaData, and samples", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: {
          question: {
            questionId: "1",
            questionFrontendId: "1",
            title: "Two Sum",
            titleSlug: "two-sum",
            content:
              "<p>Given an array <code>nums</code> and <code>target</code>.</p><pre><strong>Input:</strong> nums = [2,7,11,15], target = 9\n<strong>Output:</strong> [0,1]</pre>",
            isPaidOnly: false,
            difficulty: "Easy",
            topicTags: [{ name: "Array", slug: "array" }],
            codeSnippets: [
              {
                lang: "Python3",
                langSlug: "python3",
                code: "class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass"
              }
            ],
            metaData: JSON.stringify({
              name: "twoSum",
              params: [
                { name: "nums", type: "integer[]" },
                { name: "target", type: "integer" }
              ],
              return: { type: "integer[]" }
            }),
            exampleTestcaseList: ["[2,7,11,15]\n9"]
          }
        }
      })
    );

    const adapter = createLeetCodeGlobalAdapter({ fetchImpl: mockFetch });
    expect(adapter.canHandleUrl("https://leetcode.com/problems/two-sum/description/")).toBe(true);
    expect(adapter.canHandleUrl("https://leetcode.cn/problems/two-sum/")).toBe(false);

    const doc = await adapter.fetchProblem("https://leetcode.com/problems/two-sum/");
    expect(doc.problemKey).toBe("lc-global:two-sum");
    expect(doc.completeness).toBe("full");
    expect(doc.ioMode).toBe("function");
    expect(doc.functionMeta?.entryName).toBe("twoSum");
    expect(doc.functionMeta?.codeSnippets.python3).toContain("def twoSum");
    expect(doc.samples).toHaveLength(1);
    expect(doc.samples[0]?.input).toBe("[2,7,11,15]\n9");
    expect(doc.samples[0]?.expectedOutput).toBe("[0,1]");
    expect(doc.difficulty?.normalizedTier).toBe(1);
  });

  it("supports LeetCode CN daily question and translated content", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            todayRecord: [{ date: "2026-11-22", question: { titleSlug: "climbing-stairs" } }]
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            question: {
              title: "Climbing Stairs",
              translatedTitle: "爬楼梯",
              titleSlug: "climbing-stairs",
              translatedContent: "<p>每次可以爬 1 或 2 个台阶。</p><p><strong>输出：</strong> 2</p>",
              isPaidOnly: false,
              difficulty: "Easy",
              topicTags: [{ slug: "dynamic-programming" }],
              codeSnippets: [{ langSlug: "python3", code: "class Solution:\n    def climbStairs(self, n: int) -> int:\n        pass" }],
              metaData: JSON.stringify({
                name: "climbStairs",
                params: [{ name: "n", type: "integer" }],
                return: { type: "integer" }
              }),
              exampleTestcaseList: ["2"]
            }
          }
        })
      );

    const adapter = createLeetCodeCnAdapter({ fetchImpl: mockFetch });
    const doc = await adapter.fetchProblem("daily");
    expect(doc.problemKey).toBe("lc-cn:climbing-stairs");
    expect(doc.title).toBe("爬楼梯");
    expect(doc.locale).toBe("zh-CN");
    expect(doc.samples[0]?.expectedOutput).toBe("2");
  });

  it("throws PAID_ONLY for paid-only problem and ANTIBOT_BLOCKED on HTTP 403", async () => {
    const paidFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: {
          question: {
            title: "Meeting Rooms II",
            titleSlug: "meeting-rooms-ii",
            content: null,
            isPaidOnly: true,
            difficulty: "Medium"
          }
        }
      })
    );
    const adapter = createLeetCodeGlobalAdapter({ fetchImpl: paidFetch });
    await expect(adapter.fetchProblem("meeting-rooms-ii")).rejects.toMatchObject({
      name: "ProblemAdapterError",
      code: "PAID_ONLY",
      source: "leetcode-global"
    } satisfies Partial<ProblemAdapterError>);

    const blockedFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse("Forbidden", 403));
    const blockedAdapter = createLeetCodeCnAdapter({ fetchImpl: blockedFetch });
    await expect(blockedAdapter.fetchProblem("two-sum")).rejects.toMatchObject({
      code: "ANTIBOT_BLOCKED",
      source: "leetcode-cn"
    });
  });

  it("searches public problems and loads curated problem lists", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: {
          problemsetQuestionList: {
            total: 1,
            questions: [
              {
                title: "Two Sum",
                titleSlug: "two-sum",
                difficulty: "Easy",
                isPaidOnly: false,
                topicTags: [{ slug: "array" }]
              }
            ]
          }
        }
      })
    );
    const adapter = createLeetCodeGlobalAdapter({ fetchImpl: mockFetch });
    const res = await adapter.search({ keyword: "two sum", maxTier: 2 });
    expect(res.total).toBe(1);
    expect(res.items[0]?.completeness).toBe("metadata_only");

    const list = await adapter.fetchProblemList("blind-75");
    expect(list.id).toBe("blind-75");
    expect(list.items.length).toBeGreaterThan(50);
  });
});

describe("LuoguAdapter", () => {
  it("supports modern LentilleDataResponse with x-lentille-request header", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: {
          problem: {
            pid: "P1001",
            difficulty: 1,
            tags: [1, 2],
            limits: { time: [1000], memory: [131072] },
            contenu: {
              name: "A+B Problem",
              description: "输入两个整数 $a, b$，输出它们的和。",
              formatI: "两个以空格分开的整数。",
              formatO: "一个整数。",
              hint: "$|a|, |b| \\le 10^9$"
            },
            samples: [["20 30", "50"]]
          }
        }
      })
    );

    const adapter = new LuoguAdapter({ fetchImpl: mockFetch });
    const doc = await adapter.fetchProblem("1001");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callInit = mockFetch.mock.calls[0]?.[1];
    expect((callInit?.headers as Record<string, string>)["x-lentille-request"]).toBe("content-only");

    expect(doc.problemKey).toBe("luogu:P1001");
    expect(doc.title).toBe("A+B Problem");
    expect(doc.completeness).toBe("full");
    expect(doc.constraints).toEqual({ timeLimitMs: 1000, memoryLimitMb: 128 });
    expect(doc.samples).toEqual([
      { id: "sample-1", input: "20 30", expectedOutput: "50", isOriginal: true }
    ]);
  });

  it("supports legacy DataResponse (currentData.problem) leniently", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        currentData: {
          problem: {
            pid: "B2002",
            title: "Hello,World!",
            difficulty: 1,
            description: "输出 Hello,World!",
            inputFormat: "无",
            outputFormat: "Hello,World!",
            samples: [{ input: "", output: "Hello,World!" }]
          }
        }
      })
    );

    const adapter = new LuoguAdapter({ fetchImpl: mockFetch });
    const doc = await adapter.fetchProblem("https://www.luogu.com.cn/problem/B2002");
    expect(doc.problemKey).toBe("luogu:B2002");
    expect(doc.title).toBe("Hello,World!");
    expect(doc.samples[0]?.expectedOutput).toBe("Hello,World!");
  });

  it("maps 404 and 418 properly", async () => {
    const fetch404 = vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse("Not Found", 404));
    await expect(new LuoguAdapter({ fetchImpl: fetch404 }).fetchProblem("P999999")).rejects.toMatchObject({
      code: "NOT_FOUND"
    });

    const fetch418 = vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse("Blocked", 418));
    await expect(new LuoguAdapter({ fetchImpl: fetch418 }).fetchProblem("P1001")).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
  });

  it("searches Luogu problems and loads Luogu training lists", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            problems: {
              count: 1,
              result: [{ pid: "P1001", title: "A+B Problem", difficulty: 1, tags: [1] }]
            }
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            training: {
              id: 100,
              title: "入门1 顺序结构",
              problems: [{ problem: { pid: "P1001", title: "A+B Problem", difficulty: 1, tags: [] } }]
            }
          }
        })
      );

    const adapter = new LuoguAdapter({ fetchImpl: mockFetch });
    const searchRes = await adapter.search({ keyword: "A+B" });
    expect(searchRes.total).toBe(1);
    expect(searchRes.items[0]?.problemKey).toBe("luogu:P1001");

    const training = await adapter.fetchProblemList("100");
    expect(training.title).toBe("入门1 顺序结构");
    expect(training.items[0]?.sourceId).toBe("P1001");
  });
});

describe("AtCoderAdapter", () => {
  const sampleHtml = `
    <html>
      <head><title>A - N-choice question</title></head>
      <body>
        <span class="h2">A - N-choice question</span>
        <p>Time Limit: 2 sec / Memory Limit: 1024 MB</p>
        <div id="task-statement">
          <span class="lang">
            <span class="lang-ja">
              <div class="part"><section><h3>問題文</h3><p>日本語</p></section></div>
            </span>
            <span class="lang-en">
              <div class="part"><section><h3>Problem Statement</h3><p>Given <var>N</var>, <var>A</var>, <var>B</var>, find <var>i</var> with <var>C_i = A + B</var>.</p></section></div>
              <div class="part"><section><h3>Sample Input 1</h3><pre>3 125 175
200 300 400
</pre></section></div>
              <div class="part"><section><h3>Sample Output 1</h3><pre>2
</pre></section></div>
            </span>
          </span>
        </div>
      </body>
    </html>
  `;

  it("searches kenkoooo static index and fetches/parses public #task-statement HTML", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("problems.json")) {
        return jsonResponse([
          { id: "abc300_a", contest_id: "abc300", title: "A - N-choice question" },
          { id: "abc300_g", contest_id: "abc300", title: "G - P-smooth number" }
        ]);
      }
      if (url.includes("problem-models.json")) {
        return jsonResponse({
          abc300_a: { difficulty: 50 },
          abc300_g: { difficulty: 2300 }
        });
      }
      return textResponse(sampleHtml, 200);
    });

    const adapter = new AtCoderAdapter({ fetchImpl: mockFetch });
    const searchRes = await adapter.search({ keyword: "choice", maxTier: 1 });
    expect(searchRes.total).toBe(1);
    expect(searchRes.items[0]?.problemKey).toBe("atcoder:abc300_a");

    const doc = await adapter.fetchProblem("abc300_a");
    expect(doc.completeness).toBe("full");
    expect(doc.locale).toBe("en-US");
    expect(doc.constraints).toEqual({ timeLimitMs: 2000, memoryLimitMb: 1024 });
    expect(doc.statementMarkdown).toContain("$N$");
    expect(doc.samples).toHaveLength(1);
    expect(doc.samples[0]?.input).toBe("3 125 175\n200 300 400");
    expect(doc.samples[0]?.expectedOutput).toBe("2");
    expect(doc.difficulty?.normalizedTier).toBe(1);
  });

  it("throws ANTIBOT_BLOCKED on Turnstile challenge without attempting bypass", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      textResponse("<html><body>Just a moment... cf-turnstile</body></html>", 200)
    );
    const adapter = new AtCoderAdapter({ fetchImpl: mockFetch });
    await expect(adapter.fetchProblem("abc300_a")).rejects.toMatchObject({
      code: "ANTIBOT_BLOCKED",
      source: "atcoder"
    });
  });
});

describe("CodeforcesAdapter", () => {
  it("uses official problemset.problems API only and marks completeness as metadata_only", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        status: "OK",
        result: {
          problems: [
            {
              contestId: 1433,
              index: "G",
              name: "Reducing Delivery Cost",
              rating: 2100,
              tags: ["graphs", "shortest paths"]
            },
            {
              contestId: 4,
              index: "A",
              name: "Watermelon",
              rating: 800,
              tags: ["brute force", "math"]
            }
          ]
        }
      })
    );

    const adapter = new CodeforcesAdapter({ fetchImpl: mockFetch });
    const doc = await adapter.fetchProblem("https://codeforces.com/contest/1433/problem/G");
    expect(doc.problemKey).toBe("cf:1433G");
    expect(doc.completeness).toBe("metadata_only");
    expect(doc.samples).toEqual([]);
    expect(doc.difficulty?.numericRating).toBe(2100);
    expect(doc.difficulty?.normalizedTier).toBe(5);
    expect(doc.rawTags).toEqual(["graphs", "shortest paths"]);

    // Subsequent search uses cached index with zero extra network requests
    const search = await adapter.search({ keyword: "watermelon", tags: ["math"] });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(search.total).toBe(1);
    expect(search.items[0]?.problemKey).toBe("cf:4A");
    expect(search.items[0]?.completeness).toBe("metadata_only");
  });
});

describe("NowCoderAdapter", () => {
  it("recognizes NowCoder URLs and returns honest guided L2/L3 errors and health info", async () => {
    const adapter = new NowCoderAdapter();
    expect(adapter.canHandleUrl("https://ac.nowcoder.com/acm/problem/14362")).toBe(true);
    expect(adapter.canHandleUrl("https://ac.nowcoder.com/acm/contest/11166/A")).toBe(true);
    expect(adapter.canHandleUrl("https://www.nowcoder.com/practice/abc123def456")).toBe(true);
    expect(adapter.canHandleUrl("https://codeforces.com/contest/4/problem/A")).toBe(false);

    expect(adapter.resolveRef("nowcoder:14362")).toEqual({
      sourceId: "acm-14362",
      canonicalUrl: "https://ac.nowcoder.com/acm/problem/14362"
    });

    await expect(
      adapter.fetchProblem("https://ac.nowcoder.com/acm/problem/14362")
    ).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      source: "nowcoder"
    });

    const health = await adapter.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.message).toContain("Competitive Companion");
  });
});

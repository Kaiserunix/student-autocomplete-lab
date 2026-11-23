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
  extractLeetCodeExampleOutputs,
  extractLuoguEnvelopeFromHtml,
  fetchLuoguRemoteProblem,
  fetchWithTimeout,
  getCuratedSheet,
  htmlToMarkdown,
  isAntiBotChallenge,
  listCuratedSheets,
  mapHttpStatusError,
  parseAtCoderTaskHtml,
  parseCodeforcesRef,
  parseNowCoderHtml
} from "../../src/problems";

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders }
  });
}

function textResponse(body: string, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders }
  });
}

describe("httpClient utilities", () => {
  it("aborts slow requests on timeout and cleans up properly", async () => {
    const slowFetch = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              reject(new Error("aborted"));
            },
            { once: true }
          );
        })
    );

    await expect(
      fetchWithTimeout(slowFetch, "https://example.com/slow", undefined, 25)
    ).rejects.toThrow(/timed out after 25ms/i);
  });

  it("propagates caller AbortSignal without misreporting a timeout", async () => {
    const controller = new AbortController();
    const pendingFetch = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new Error("caller-aborted"));
            return;
          }
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("caller-aborted")),
            { once: true }
          );
        })
    );

    controller.abort();
    await expect(
      fetchWithTimeout(pendingFetch, "https://example.com/cancel", { signal: controller.signal }, 5000)
    ).rejects.toThrow("caller-aborted");
  });

  it("accurately distinguishes real anti-bot challenges from benign Luogu jsd telemetry", () => {
    const cfChallengeRes = textResponse("<html><title>Just a moment...</title></html>", 403, {
      "cf-mitigated": "challenge"
    });
    expect(isAntiBotChallenge(cfChallengeRes, "<html><title>Just a moment...</title></html>")).toBe(
      true
    );

    const turnstileRes = textResponse(
      "<html><body>Just a moment... <div class='cf-turnstile'></div></body></html>",
      200
    );
    expect(
      isAntiBotChallenge(
        turnstileRes,
        "<html><body>Just a moment... <div class='cf-turnstile'></div></body></html>"
      )
    ).toBe(true);

    // Benign Luogu HTML page containing lentille-context AND `/cdn-cgi/challenge-platform/scripts/jsd`
    const luoguHtml = `
      <html>
        <head><title>P1001 A+B Problem</title></head>
        <body>
          <script id="lentille-context" type="application/json">{"status":200,"data":{"problem":{"pid":"P1001"}}}</script>
          <script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
          <script src="/cdn-cgi/challenge-platform/h/b/scripts/jsd/main.js"></script>
        </body>
      </html>
    `;
    expect(isAntiBotChallenge(textResponse(luoguHtml, 200), luoguHtml)).toBe(false);

    // Normal problem statement mentioning "Just a moment" inside #task-statement
    const atcoderHtml = '<div id="task-statement"><p>Just a moment ago, Takahashi had N apples.</p></div>';
    expect(
      isAntiBotChallenge(textResponse(atcoderHtml, 200), atcoderHtml, ["task-statement"])
    ).toBe(false);
  });

  it("maps HTTP status codes into standardized ProblemAdapterError codes", () => {
    expect(mapHttpStatusError("luogu", 404, "https://example.com").code).toBe("NOT_FOUND");
    expect(mapHttpStatusError("luogu", 401, "https://example.com").code).toBe("AUTH_REQUIRED");
    expect(mapHttpStatusError("luogu", 403, "https://example.com").code).toBe("ANTIBOT_BLOCKED");
    expect(mapHttpStatusError("luogu", 418, "https://example.com").code).toBe("RATE_LIMITED");
    expect(mapHttpStatusError("codeforces", 429, "https://example.com").code).toBe("RATE_LIMITED");
    expect(mapHttpStatusError("codeforces", 503, "https://example.com").code).toBe("RATE_LIMITED");
    expect(mapHttpStatusError("atcoder", 500, "https://example.com").code).toBe("NETWORK_ERROR");
  });
});

describe("htmlUtils", () => {
  it("converts NowCoder equation images to inline LaTeX and handles nested strong/code cleanly", () => {
    const html = `
      <p>给定整数 <img src="https://www.nowcoder.com/equation?tex=1%20%3C%20n%20%3C%2010%5E5&amp;preview=true" />，求 <strong><code>nums</code></strong> 中满足 <strong><code>a &lt; b &amp;&amp; b &gt; 0</code></strong> 的对数。</p>
      <p>范围：<code>1 &lt;= n &lt;= 10<sup>9</sup></code>，空标签：<strong><code></code></strong>，反转嵌套：<code><strong>Output:</strong></code></p>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain("$1 < n < 10^5$");
    expect(md).toContain("**`nums`**");
    expect(md).toContain("**`a < b && b > 0`**");
    expect(md).toContain("`1 <= n <= 10^9`");
    expect(md).toContain("`Output:`");
    expect(md).not.toContain("****");
  });

  it("unwraps NowCoder prose <pre><div>...</div></pre> with equations, decodes extended entities, and preserves bold/code inside <li>", () => {
    const html = `
      <pre><div>The first line contains an integer <img src="https://www.nowcoder.com/equation?tex=%7BT%7D" /> &mdash; test cases.</div></pre>
      <p>Bounds: a &leq; b, c &geq; d, x &middot; y, &plusmn;1, A &rarr; B.</p>
      <ul>
        <li><strong>Important</strong>: keep <code>x &lt; y</code> and check $a < b$ and $c > d$.</li>
      </ul>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain("${T}$");
    expect(md).not.toContain("```\nThe first line");
    expect(md).toContain("a <= b, c >= d, x · y, ±1, A → B");
    expect(md).toContain("- **Important**: keep `x < y` and check $a < b$ and $c > d$.");
  });
});

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

  it("supports numeric and prefixed frontend IDs on CN (/api/problems/all/ + GraphQL fallback)", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/problems/all/")) {
        return jsonResponse({
          stat_status_pairs: [
            { stat: { frontend_question_id: "1", question__title_slug: "two-sum" } },
            { stat: { frontend_question_id: "146", question__title_slug: "lru-cache" } }
          ]
        });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query?: string;
        variables?: Record<string, unknown>;
      };
      if (body.query?.includes("problemsetQuestionList")) {
        return jsonResponse({
          data: {
            problemsetQuestionList: {
              total: 1,
              questions: [
                {
                  frontendQuestionId: "LCR 007",
                  title: "3Sum",
                  titleCn: "数组中和为 0 的三个数",
                  titleSlug: "1fGaJU",
                  difficulty: "MEDIUM"
                }
              ]
            }
          }
        });
      }
      const slug = String(body.variables?.titleSlug ?? "");
      return jsonResponse({
        data: {
          question: {
            title: slug,
            translatedTitle: slug === "two-sum" ? "两数之和" : slug === "lru-cache" ? "LRU 缓存" : "三数之和",
            titleSlug: slug,
            translatedContent: "<p>示例</p><p><strong>输出：</strong><br/>[0,1]</p>",
            isPaidOnly: false,
            difficulty: "Easy",
            topicTags: [],
            codeSnippets: [],
            exampleTestcaseList: ["[2,7,11,15]\n9"]
          }
        }
      });
    });

    const cn = createLeetCodeCnAdapter({ fetchImpl: mockFetch });
    expect(cn.resolveRef("1")?.sourceId).toBe("#1");
    expect(cn.resolveRef("#1")?.sourceId).toBe("#1");
    expect(cn.resolveRef("#146")?.sourceId).toBe("#146");
    expect(cn.resolveRef("lc#1")?.sourceId).toBe("#1");
    expect(cn.resolveRef("力扣1")?.sourceId).toBe("#1");
    expect(cn.resolveRef("力扣 146")?.sourceId).toBe("#146");
    expect(cn.resolveRef("LC1")?.sourceId).toBe("#1");
    expect(cn.resolveRef("LC-146")?.sourceId).toBe("#146");
    expect(cn.resolveRef("lc:1")?.sourceId).toBe("#1");
    expect(cn.resolveRef("lc-cn:146")?.sourceId).toBe("#146");
    expect(cn.resolveRef("lc-global:1")).toBeNull();
    expect(cn.resolveRef("LCR 007")?.sourceId).toBe("#LCR 007");

    const doc1 = await cn.fetchProblem("1");
    expect(doc1.problemKey).toBe("lc-cn:two-sum");
    expect(doc1.title).toBe("两数之和");
    expect(doc1.samples[0]?.expectedOutput).toBe("[0,1]");

    // Second numeric lookup reuses cached `/api/problems/all/` without extra REST request
    const doc146 = await cn.fetchProblem("LC-146");
    expect(doc146.problemKey).toBe("lc-cn:lru-cache");
    const restCalls = mockFetch.mock.calls.filter(([u]) => String(u).includes("/api/problems/all/"));
    expect(restCalls).toHaveLength(1);

    // LCR 007 not in REST list -> falls back cleanly to GraphQL `problemsetQuestionList`
    const docLcr = await cn.fetchProblem("LCR 007");
    expect(docLcr.problemKey).toBe("lc-cn:1fGaJU");
  });

  it("resolves numeric frontend IDs on Global via GraphQL questionList without hitting /api/problems/all/", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      expect(url).not.toContain("/api/problems/all/");
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query?: string;
        variables?: Record<string, unknown>;
      };
      if (body.query?.includes("questionList")) {
        return jsonResponse({
          data: {
            problemsetQuestionList: {
              total: 2,
              questions: [
                { questionFrontendId: "10", title: "Regex", titleSlug: "regular-expression-matching" },
                { questionFrontendId: "1", title: "Two Sum", titleSlug: "two-sum" }
              ]
            }
          }
        });
      }
      return jsonResponse({
        data: {
          question: {
            title: "Two Sum",
            titleSlug: "two-sum",
            content: "<p>Find two numbers.</p><p><strong>Output:</strong></p><pre>[0,1]</pre>",
            isPaidOnly: false,
            difficulty: "Easy",
            topicTags: [{ slug: "array" }],
            codeSnippets: [],
            exampleTestcaseList: ["[2,7,11,15]\n9"]
          }
        }
      });
    });

    const globalAdapter = createLeetCodeGlobalAdapter({ fetchImpl: mockFetch });
    expect(globalAdapter.resolveRef("lc-global:1")?.sourceId).toBe("#1");
    expect(globalAdapter.resolveRef("lc-cn:1")).toBeNull();

    const doc = await globalAdapter.fetchProblem("lc-global:1");
    expect(doc.problemKey).toBe("lc-global:two-sum");
    expect(doc.samples[0]?.expectedOutput).toBe("[0,1]");
  });

  it("extracts example outputs across newline-after-Output, inline code, fenced blocks, and Chinese labels", () => {
    const md = [
      "**Example 1:**",
      "**Input:** nums = [2,7,11,15], target = 9",
      "**Output:** `[0,1]`",
      "",
      "**Example 2:**",
      "**Output:**",
      "```",
      "[1,2]",
      "```",
      "",
      "**示例 3：**",
      "**输出：**",
      "true",
      "**解释：** 满足条件",
      "",
      "**输出**：`42`"
    ].join("\n");

    expect(extractLeetCodeExampleOutputs(md)).toEqual(["[0,1]", "[1,2]", "true", "42"]);
  });

  it("extracts colon-less Output/输出, multiline bracket-balanced arrays, and safely aligns mismatched example lists", async () => {
    const designMd = [
      "```",
      "输入",
      '["LRUCache", "put", "get"]',
      "[[2], [1, 1], [1]]",
      "输出",
      "[null, null, 1]",
      "",
      "解释",
      "LRUCache lRUCache = new LRUCache(2);",
      "```",
      "",
      "**Example 2:**",
      "**Input:** matrix = [[1,2,3],[4,5,6],[7,8,9]]",
      "**Output:** [[7,4,1],",
      " [8,5,2],",
      " [9,6,3]]"
    ].join("\n");

    expect(extractLeetCodeExampleOutputs(designMd)).toEqual([
      "[null, null, 1]",
      "[[7,4,1],\n[8,5,2],\n[9,6,3]]"
    ]);

    // Simulate binary-tree-inorder-traversal on CN: 4 testcases in exampleTestcaseList vs 3 examples in translatedContent
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: {
          question: {
            title: "Binary Tree Inorder Traversal",
            translatedTitle: "二叉树的中序遍历",
            titleSlug: "binary-tree-inorder-traversal",
            translatedContent: [
              "<pre><strong>输入：</strong>root = [1,null,2,3]\n<strong>输出：</strong>[1,3,2]</pre>",
              "<pre><strong>输入：</strong>root = []\n<strong>输出：</strong>[]</pre>",
              "<pre><strong>输入：</strong>root = [1]\n<strong>输出：</strong>[1]</pre>"
            ].join("\n"),
            isPaidOnly: false,
            difficulty: "Easy",
            topicTags: [],
            codeSnippets: [],
            exampleTestcaseList: [
              "[1,null,2,3]",
              "[1,2,3,4,5,null,8,null,null,6,7,9]",
              "[]",
              "[1]"
            ]
          }
        }
      })
    );

    const cn = createLeetCodeCnAdapter({ fetchImpl: mockFetch });
    const doc = await cn.fetchProblem("https://leetcode.cn/contest/weekly-1/problems/binary-tree-inorder-traversal/");
    expect(doc.samples).toEqual([
      { id: "sample-1", input: "[1,null,2,3]", expectedOutput: "[1,3,2]", isOriginal: true },
      { id: "sample-2", input: "[1,2,3,4,5,null,8,null,null,6,7,9]", isOriginal: true },
      { id: "sample-3", input: "[]", expectedOutput: "[]", isOriginal: true },
      { id: "sample-4", input: "[1]", expectedOutput: "[1]", isOriginal: true }
    ]);

    // CN 面试题 & 剑指 Offer frontend IDs
    const mockSeriesFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        stat_status_pairs: [
          { stat: { frontend_question_id: "面试题 01.01", question__title_slug: "is-unique-lcci" } },
          { stat: { frontend_question_id: "剑指 Offer 03", question__title_slug: "shu-zu-zhong-zhong-fu-de-shu-zi-lcof" } }
        ]
      })
    );
    const cnSeries = createLeetCodeCnAdapter({ fetchImpl: mockSeriesFetch });
    expect(cnSeries.resolveRef("面试题 01.01")?.sourceId).toBe("#面试题 01.01");
    expect(cnSeries.resolveRef("剑指 Offer 03")?.sourceId).toBe("#剑指 Offer 03");
    expect(cnSeries.canHandleUrl("https://leetcode.cn/contest/biweekly-100/problems/two-sum/")).toBe(true);
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
              codeSnippets: [
                {
                  langSlug: "python3",
                  code: "class Solution:\n    def climbStairs(self, n: int) -> int:\n        pass"
                }
              ],
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
  it("supports modern LentilleDataResponse, resolves /_lfe/tags with caching, decodes entities, and falls back to content.hint", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/_lfe/tags")) {
        return jsonResponse({
          tags: [
            { id: 1, name: "模拟" },
            { id: 2, name: "字符串" }
          ]
        });
      }
      return jsonResponse({
        status: 200,
        data: {
          problem: {
            pid: "P1001",
            difficulty: 1,
            tags: [1, 2],
            limits: { time: [1000], memory: [131072] },
            contenu: {
              name: "A+B Problem",
              description: "输入两个整数 $a, b$，输出 &quot;a+b&quot; (it&#039;s easy)。",
              formatI: "两个以空格分开的整数。",
              formatO: "一个整数。",
              hint: ""
            },
            content: {
              hint: "$|a|, |b| \\le 10^9$"
            },
            samples: [["20 30", "50"]]
          }
        }
      });
    });

    const adapter = new LuoguAdapter({ fetchImpl: mockFetch });
    const doc = await adapter.fetchProblem("1001");

    const problemCall = mockFetch.mock.calls.find(([u]) => String(u).includes("/problem/P1001"));
    expect((problemCall?.[1]?.headers as Record<string, string>)["x-lentille-request"]).toBe(
      "content-only"
    );

    expect(doc.problemKey).toBe("luogu:P1001");
    expect(doc.title).toBe("A+B Problem");
    expect(doc.completeness).toBe("full");
    expect(doc.constraints).toEqual({ timeLimitMs: 1000, memoryLimitMb: 128 });
    expect(doc.rawTags).toEqual(["模拟", "字符串"]);
    expect(doc.statementMarkdown).toContain('"a+b" (it\'s easy)');
    expect(doc.statementMarkdown).toContain("$|a|, |b| \\le 10^9$");
    expect(doc.samples).toEqual([
      { id: "sample-1", input: "20 30", expectedOutput: "50", isOriginal: true }
    ]);

    // Second fetch reuses cached /_lfe/tags
    await adapter.fetchProblem("P1001");
    const tagCalls = mockFetch.mock.calls.filter(([u]) => String(u).includes("/_lfe/tags"));
    expect(tagCalls).toHaveLength(1);
  });

  it("supports HTML fallback via <script id='lentille-context'> and legacy window._feInjection", async () => {
    const lentilleHtml = `
      <html>
        <body>
          <script id="lentille-context" type="application/json">
            ${JSON.stringify({
              status: 200,
              data: {
                problem: {
                  pid: "P1873",
                  difficulty: 3,
                  tags: [],
                  contenu: { name: "砍树", description: "二分答案求最大高度。" },
                  samples: [["4 7\n20 15 10 17", "15"]]
                }
              }
            })}
          </script>
          <script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
        </body>
      </html>
    `;
    const fetchLentilleHtml = vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse(lentilleHtml));
    const doc1 = await new LuoguAdapter({ fetchImpl: fetchLentilleHtml }).fetchProblem("P1873");
    expect(doc1.problemKey).toBe("luogu:P1873");
    expect(doc1.title).toBe("砍树");
    expect(doc1.samples[0]?.expectedOutput).toBe("15");

    const legacyPayload = encodeURIComponent(
      JSON.stringify({
        currentData: {
          problem: {
            pid: "B2002",
            title: "Hello,World!",
            difficulty: 1,
            description: "输出 Hello,World!",
            samples: [{ input: "", output: "Hello,World!" }]
          }
        }
      })
    );
    const legacyHtml = `<html><script>window._feInjection = JSON.parse(decodeURIComponent("${legacyPayload}"));</script></html>`;
    expect(extractLuoguEnvelopeFromHtml(legacyHtml)?.currentData?.problem?.pid).toBe("B2002");

    const fetchLegacyHtml = vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse(legacyHtml));
    const doc2 = await new LuoguAdapter({ fetchImpl: fetchLegacyHtml }).fetchProblem(
      "https://www.luogu.com.cn/problem/B2002"
    );
    expect(doc2.problemKey).toBe("luogu:B2002");
    expect(doc2.samples[0]?.expectedOutput).toBe("Hello,World!");
  });

  it("maps HTTP 404/418 and Lentille status/data.errorCode errors properly", async () => {
    const fetch404 = vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse("Not Found", 404));
    await expect(new LuoguAdapter({ fetchImpl: fetch404 }).fetchProblem("P999999")).rejects.toMatchObject({
      code: "NOT_FOUND"
    });

    const fetch418 = vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse("Blocked", 418));
    await expect(new LuoguAdapter({ fetchImpl: fetch418 }).fetchProblem("P1001")).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });

    const fetchJsonStatus404 = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ status: 404, data: { errorMessage: "题目未找到" } }));
    await expect(
      new LuoguAdapter({ fetchImpl: fetchJsonStatus404 }).fetchProblem("P999999")
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const fetchErrorCode403 = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ status: 200, data: { errorCode: 403 } }));
    await expect(
      new LuoguAdapter({ fetchImpl: fetchErrorCode403 }).fetchProblem("P1001")
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("searches Luogu problems and reads training.name || training.title in fetchProblemList", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/_lfe/tags")) {
        return textResponse("unavailable", 500);
      }
      if (url.includes("/problem/list")) {
        return jsonResponse({
          data: {
            problems: {
              count: 1,
              result: [{ pid: "P1001", title: "A+B Problem", difficulty: 1, tags: [7] }]
            }
          }
        });
      }
      return jsonResponse({
        data: {
          training: {
            id: 100,
            name: "【入门1】顺序结构",
            problems: [{ problem: { pid: "P1001", title: "A+B Problem", difficulty: 1, tags: [] } }]
          }
        }
      });
    });

    const adapter = new LuoguAdapter({ fetchImpl: mockFetch });
    const searchRes = await adapter.search({ keyword: "A+B" });
    expect(searchRes.total).toBe(1);
    expect(searchRes.items[0]?.problemKey).toBe("luogu:P1001");
    // Graceful fallback when /_lfe/tags fails
    expect(searchRes.items[0]?.rawTags).toEqual(["tag-7"]);

    const training = await adapter.fetchProblemList("100");
    expect(training.title).toBe("【入门1】顺序结构");
    expect(training.items[0]?.sourceId).toBe("P1001");
  });

  it("exports fetchLuoguRemoteProblem returning English statement, samples, and limits", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        status: 200,
        data: {
          problem: {
            pid: "CF1900A",
            limits: { time: [1000], memory: [262144] },
            translations: {
              en: {
                name: "Cover in Water",
                description: "Filip has a row of cells. It&#039;s a water puzzle.",
                formatI: "Each test contains multiple test cases.",
                formatO: "Output one integer.",
                hint: ""
              }
            },
            content: {
              hint: "Three consecutive empty cells yield infinite water."
            },
            samples: [["5\n3\n...\n7\n##....#", "2\n2"]]
          }
        }
      })
    );

    const remote = await fetchLuoguRemoteProblem("cf1900a", { fetchImpl: mockFetch });
    expect(remote.pid).toBe("CF1900A");
    expect(remote.locale).toBe("en-US");
    expect(remote.statementMarkdown).toContain("It's a water puzzle.");
    expect(remote.statementMarkdown).toContain("Three consecutive empty cells");
    expect(remote.samples).toHaveLength(1);
    expect(remote.constraints).toEqual({ timeLimitMs: 1000, memoryLimitMb: 256 });
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

  it("supports no-underscore shorthand, AT_ prefix, and lazy Kenkoooo contest lookup for non-standard tasks", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("problems.json")) {
        return jsonResponse([
          { id: "practice2_a", contest_id: "practice2", title: "A - Disjoint Set Union" },
          { id: "tessoku_book_a", contest_id: "tessoku-book", title: "A01 - The First Problem" },
          { id: "panasonic2020_a", contest_id: "panasonic2020", title: "A - Kth Term" }
        ]);
      }
      if (url.includes("problem-models.json")) {
        return jsonResponse({ tessoku_book_a: { difficulty: 10 } });
      }
      if (url === "https://atcoder.jp/contests/tessoku-book/tasks/tessoku_book_a") {
        return textResponse(sampleHtml, 200);
      }
      return textResponse("Not Found", 404);
    });

    const adapter = new AtCoderAdapter({ fetchImpl: mockFetch });
    expect(adapter.resolveRef("abc350c")).toEqual({
      sourceId: "abc350/abc350_c",
      canonicalUrl: "https://atcoder.jp/contests/abc350/tasks/abc350_c"
    });
    expect(adapter.resolveRef("ABC350C")?.sourceId).toBe("abc350/abc350_c");
    expect(adapter.resolveRef("arc160b")?.sourceId).toBe("arc160/arc160_b");
    expect(adapter.resolveRef("agc050a")?.sourceId).toBe("agc050/agc050_a");
    expect(adapter.resolveRef("AT_abc350_c")?.sourceId).toBe("abc350/abc350_c");
    expect(adapter.resolveRef("practice2_a")).toEqual({ sourceId: "practice2_a" });
    expect(adapter.resolveRef("panasonic2020_a")).toEqual({ sourceId: "panasonic2020_a" });

    // Lazily looks up `tessoku_book_a` -> contest `tessoku-book` via Kenkoooo problems.json
    const doc = await adapter.fetchProblem("tessoku_book_a");
    expect(doc.problemKey).toBe("atcoder:tessoku_book_a");
    expect(doc.canonicalUrl).toBe("https://atcoder.jp/contests/tessoku-book/tasks/tessoku_book_a");
    expect(doc.rawTags).toEqual(["tessoku-book"]);
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
  it("parses all Codeforces reference formats (CF1900A, cf-1900a, 1900/A, URLs, gym)", () => {
    expect(parseCodeforcesRef("CF1900A")?.sourceId).toBe("1900A");
    expect(parseCodeforcesRef("cf1900a")?.sourceId).toBe("1900A");
    expect(parseCodeforcesRef("CF-1900A")?.sourceId).toBe("1900A");
    expect(parseCodeforcesRef("cf:1900A")?.sourceId).toBe("1900A");
    expect(parseCodeforcesRef("1900A")?.sourceId).toBe("1900A");
    expect(parseCodeforcesRef("1900/A")?.sourceId).toBe("1900A");
    expect(parseCodeforcesRef("1900-A")?.sourceId).toBe("1900A");
    expect(parseCodeforcesRef("https://codeforces.com/problemset/problem/1900/A")?.canonicalUrl).toBe(
      "https://codeforces.com/contest/1900/problem/A"
    );
    expect(parseCodeforcesRef("https://codeforces.com/gym/102951/problem/A")).toMatchObject({
      isGym: true,
      sourceId: "gym:102951A"
    });
  });

  it("uses official problemset.problems API only by default and marks completeness as metadata_only", async () => {
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

  it("enriches statement, samples, and limits via luogu-public mirror while preserving CF identity, and falls back gracefully", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      // Must NEVER scrape Cloudflare-protected codeforces.com HTML pages
      expect(url).not.toMatch(/codeforces\.com\/(?:contest|problemset)\//);

      if (url.includes("codeforces.com/api/problemset.problems")) {
        return jsonResponse({
          status: "OK",
          result: {
            problems: [
              {
                contestId: 1900,
                index: "A",
                name: "Cover in Water",
                rating: 800,
                tags: ["constructive algorithms", "greedy"]
              },
              {
                contestId: 2999,
                index: "A",
                name: "Brand New Round Problem",
                rating: 1200,
                tags: ["math"]
              }
            ]
          }
        });
      }
      if (url.includes("luogu.com.cn/problem/CF1900A")) {
        return jsonResponse({
          status: 200,
          data: {
            problem: {
              pid: "CF1900A",
              limits: { time: [1000], memory: [262144] },
              translations: {
                en: {
                  name: "Cover in Water",
                  description: "Find the minimum number of action 1 operations.",
                  formatI: "Multiple test cases.",
                  formatO: "Single integer per test case."
                }
              },
              samples: [["2\n3\n...\n3\n#.#", "2\n2"]]
            }
          }
        });
      }
      return textResponse("Not Found", 404);
    });

    const adapter = new CodeforcesAdapter({
      fetchImpl: mockFetch,
      statementMirror: "luogu-public"
    });
    expect(adapter.capabilities.directStatementFetch).toBe(true);

    const enriched = await adapter.fetchProblem("CF1900A");
    expect(enriched.source).toBe("codeforces");
    expect(enriched.problemKey).toBe("cf:1900A");
    expect(enriched.canonicalUrl).toBe("https://codeforces.com/contest/1900/problem/A");
    expect(enriched.title).toBe("Cover in Water");
    expect(enriched.difficulty?.numericRating).toBe(800);
    expect(enriched.rawTags).toEqual(["constructive algorithms", "greedy"]);
    expect(enriched.completeness).toBe("full");
    expect(enriched.statementMarkdown).toContain("minimum number of action 1 operations");
    expect(enriched.samples).toHaveLength(1);
    expect(enriched.constraints).toEqual({ timeLimitMs: 1000, memoryLimitMb: 256 });

    // Brand new problem missing from Luogu mirror gracefully falls back to metadata_only
    const fallback = await adapter.fetchProblem("CF2999A");
    expect(fallback.problemKey).toBe("cf:2999A");
    expect(fallback.completeness).toBe("metadata_only");
    expect(fallback.samples).toEqual([]);
  });
});

describe("NowCoderAdapter", () => {
  const acmHtml = `
    <html>
      <head><title>牛牛的序列 - 牛客竞赛OJ</title></head>
      <body>
        <div class="terminal-topic-title">牛牛的序列</div>
        <div class="question-intr">
          时间限制：C/C++ 1秒，其他语言2秒<br/>
          空间限制：C/C++ 262144K，其他语言524288K
        </div>
        <div class="subject-describe">
          <h2>题目描述</h2>
          <p>给定长度 <img src="https://www.nowcoder.com/equation?tex=1%20%5Cle%20n%20%5Cle%2010%5E5" /> 的数组，求总和。</p>
          <h2>输入描述:</h2>
          <p>第一行一个整数 <img src="/equation?tex=n" />。</p>
          <div class="question-oi">
            <textarea data-clipboard-text-id="input1">3
1 2 3</textarea>
            <textarea data-clipboard-text-id="output1">6</textarea>
            <div class="question-oi-cont"><pre>3\n1 2 3</pre></div>
            <div class="question-oi-cont"><pre>6</pre></div>
          </div>
        </div>
      </body>
    </html>
  `;

  const practiceHtml = `
    <html>
      <head><title>反转链表_牛客题霸_牛客网</title></head>
      <body>
        <script>
          window.pageInfo = {
            questionTitle: '反转链表',
            difficulty_var: '简单',
            timeLimit: 1,
            memoryLimit: 65536
          };
        </script>
        <div style="display:none">
          <h2>题目描述</h2>
          <p>输入一个链表，反转链表后输出新链表的表头。</p>
          <div class="question-oi">
            <div class="question-oi-cont"><pre>{1,2,3}</pre></div>
            <div class="question-oi-cont"><pre>{3,2,1}</pre></div>
          </div>
        </div>
      </body>
    </html>
  `;

  it("recognizes NC IDs and URLs and parses ACM/Contest SSR HTML natively", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse(acmHtml, 200));
    const adapter = new NowCoderAdapter({ fetchImpl: mockFetch });

    expect(adapter.capabilities.directStatementFetch).toBe(true);
    expect(adapter.capabilities.directSamplesFetch).toBe(true);
    expect(adapter.canHandleUrl("https://ac.nowcoder.com/acm/problem/14362")).toBe(true);
    expect(adapter.canHandleUrl("https://ac.nowcoder.com/acm/contest/11166/A")).toBe(true);
    expect(adapter.canHandleUrl("https://www.nowcoder.com/practice/a0c09a7e0da04e728810a8aca7226b7b")).toBe(true);
    expect(adapter.canHandleUrl("https://www.nowcoder.com/questionTerminal/a0c09a7e0da04e728810a8aca7226b7b")).toBe(true);
    expect(adapter.canHandleUrl("https://codeforces.com/contest/4/problem/A")).toBe(false);

    expect(adapter.resolveRef("NC14362")).toEqual({
      sourceId: "acm-14362",
      canonicalUrl: "https://ac.nowcoder.com/acm/problem/14362"
    });
    expect(adapter.resolveRef("nowcoder:14362")?.sourceId).toBe("acm-14362");
    expect(adapter.resolveRef("nc:14362")?.sourceId).toBe("acm-14362");

    const doc = await adapter.fetchProblem("NC14362");
    expect(doc.problemKey).toBe("nowcoder:acm-14362");
    expect(doc.title).toBe("牛牛的序列");
    expect(doc.completeness).toBe("full");
    expect(doc.constraints).toEqual({ timeLimitMs: 1000, memoryLimitMb: 256 });
    expect(doc.statementMarkdown).toContain("$1 \\le n \\le 10^5$");
    expect(doc.statementMarkdown).toContain("$n$");
    expect(doc.samples).toEqual([
      { id: "sample-1", input: "3\n1 2 3", expectedOutput: "6", isOriginal: true }
    ]);
  });

  it("parses NowCoder Practice SSR pages via window.pageInfo and fallback .question-oi-cont pre samples", async () => {
    const parsed = parseNowCoderHtml(practiceHtml, "practice-fallback");
    expect(parsed.title).toBe("反转链表");
    expect(parsed.difficulty).toEqual({ rawLabel: "简单", normalizedTier: 2 });
    expect(parsed.constraints).toEqual({ timeLimitMs: 1000, memoryLimitMb: 64 });
    expect(parsed.statementMarkdown).toContain("反转链表后输出新链表的表头");
    expect(parsed.samples).toEqual([
      { id: "sample-1", input: "{1,2,3}", expectedOutput: "{3,2,1}", isOriginal: true }
    ]);

    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse(practiceHtml, 200));
    const adapter = new NowCoderAdapter({ fetchImpl: mockFetch });
    const doc = await adapter.fetchProblem(
      "https://www.nowcoder.com/practice/a0c09a7e0da04e728810a8aca7226b7b"
    );
    expect(doc.problemKey).toBe("nowcoder:practice-a0c09a7e0da04e728810a8aca7226b7b");
    expect(doc.completeness).toBe("full");
  });

  it("honestly throws AUTH_REQUIRED or ANTIBOT_BLOCKED with Competitive Companion guidance on gated pages", async () => {
    const loginFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        textResponse("<html><title>登录 - 牛客网</title><body>请先登录后查看题目</body></html>", 200)
      );
    const loginAdapter = new NowCoderAdapter({ fetchImpl: loginFetch });
    await expect(
      loginAdapter.fetchProblem("https://ac.nowcoder.com/acm/contest/11166/A")
    ).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      source: "nowcoder"
    });

    const wafFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        textResponse("<html><title>安全验证</title><body>请完成安全验证 waf-captcha</body></html>", 200)
      );
    const wafAdapter = new NowCoderAdapter({ fetchImpl: wafFetch });
    await expect(wafAdapter.fetchProblem("NC14362")).rejects.toMatchObject({
      code: "ANTIBOT_BLOCKED",
      source: "nowcoder"
    });

    const healthyFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse(acmHtml, 200));
    const health = await new NowCoderAdapter({ fetchImpl: healthyFetch }).healthCheck();
    expect(health.ok).toBe(true);
    expect(health.message).toContain("Competitive Companion");
  });

  it("handles off-screen -1000000px SSR div, C/C++/Rust/Pascal limits, and 试题不存在 soft-404 on NowCoder", async () => {
    const offscreenPracticeHtml = `
      <html>
        <head><title>BM1 反转链表</title></head>
        <body>
          <div class="question-intr">
            时间限制：C/C++/Rust/Pascal 1秒，其他语言2秒<br/>
            空间限制：C/C++/Rust/Pascal 256 M，其他语言512 M
          </div>
          <div style="position:absolute;top:-1000000px;left:-1000000px;">
            <h2>题目描述</h2>
            <p>给定一个单链表，反转链表。</p>
            <div class="question-oi">
              <div class="question-oi-cont"><pre>{1,2,3}</pre></div>
              <div class="question-oi-cont"><pre>{3,2,1}</pre></div>
            </div>
          </div>
        </body>
      </html>
    `;
    const parsed = parseNowCoderHtml(offscreenPracticeHtml, "practice-bm1");
    expect(parsed.statementMarkdown).toContain("反转链表");
    expect(parsed.constraints).toEqual({ timeLimitMs: 1000, memoryLimitMb: 256 });
    expect(parsed.samples).toEqual([
      { id: "sample-1", input: "{1,2,3}", expectedOutput: "{3,2,1}", isOriginal: true }
    ]);

    const notFoundFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        textResponse('<html><title>牛客网-试题不存在_牛客网</title><a href="/login">登录</a></html>', 200)
      );
    await expect(
      new NowCoderAdapter({ fetchImpl: notFoundFetch }).fetchProblem(
        "https://www.nowcoder.com/practice/75a6ab5124d9464396763858a78eb667"
      )
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      source: "nowcoder"
    });
  });

  it("covers hardened AtCoder, Luogu, and Codeforces edge cases (abc001_1, ?lang=ja, edpc/Ex, search filters, CF mirror fallback)", async () => {
    // 1. AtCoder legacy layout (<h3> outside <section>) + JA locale detection + ?lang=ja
    const legacyJaHtml = `
      <html>
        <head><title>A - 積雪深差</title></head>
        <body>
          <span class="h2">A - 積雪深差</span>
          <div id="task-statement">
            <div class="part"><h3>問題文</h3><section><p>積雪深の差を求めよ。</p></section></div>
            <div class="part"><h3>入力例 1</h3><section><pre>15000\n10000\n</pre></section></div>
            <div class="part"><h3>出力例 1</h3><section><pre>5000\n</pre></section></div>
          </div>
        </body>
      </html>
    `;
    const parsedJa = parseAtCoderTaskHtml(legacyJaHtml, "abc001_1");
    expect(parsedJa.locale).toBe("ja-JP");
    expect(parsedJa.samples).toEqual([
      { id: "sample-1", input: "15000\n10000", expectedOutput: "5000", isOriginal: true }
    ]);

    const bilingualHtml = `
      <html>
        <head><title>A - Test</title></head>
        <body>
          <div id="task-statement">
            <span class="lang">
              <span class="lang-ja"><div class="part"><section><h3>問題文</h3><p>日本語テスト</p></section></div></span>
              <span class="lang-en"><div class="part"><section><h3>Problem Statement</h3><p>English test</p></section></div></span>
            </span>
          </div>
        </body>
      </html>
    `;
    const atFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("problems.json")) {
        return jsonResponse([
          { id: "arc058_a", contest_id: "abc042", problem_index: "C", title: "C - Iroha's Obsession" }
        ]);
      }
      if (url.includes("problem-models.json")) {
        return jsonResponse({});
      }
      if (url === "https://atcoder.jp/contests/abc042/tasks/abc042_c") {
        return textResponse("Not Found", 404);
      }
      if (url === "https://atcoder.jp/contests/abc042/tasks/arc058_a") {
        return textResponse(bilingualHtml, 200);
      }
      if (url === "https://atcoder.jp/contests/abc300/tasks/abc300_a") {
        return textResponse(bilingualHtml, 200);
      }
      return textResponse("Not Found", 404);
    });
    const atAdapter = new AtCoderAdapter({ fetchImpl: atFetch });
    expect(atAdapter.resolveRef("edpc_a")?.sourceId).toBe("dp/dp_a");
    expect(atAdapter.resolveRef("abc233ex")?.sourceId).toBe("abc233/abc233_h");
    expect(atAdapter.resolveRef("abc318_ex")?.sourceId).toBe("abc318/abc318_h");
    expect(atAdapter.resolveRef("ABC350 A")?.sourceId).toBe("abc350/abc350_a");

    const jaDoc = await atAdapter.fetchProblem("https://atcoder.jp/contests/abc300/tasks/abc300_a?lang=ja");
    expect(jaDoc.locale).toBe("ja-JP");
    expect(jaDoc.statementMarkdown).toContain("日本語テスト");

    const sharedDoc = await atAdapter.fetchProblem("abc042c");
    expect(sharedDoc.problemKey).toBe("atcoder:arc058_a");
    expect(sharedDoc.canonicalUrl).toBe("https://atcoder.jp/contests/abc042/tasks/arc058_a");

    // 2. Luogu: reject /problem/list, honor maxTier/tag filtering, and fix English locale fallback
    const lgFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/problem/list")) {
        return jsonResponse({
          data: {
            problems: {
              count: 3,
              result: [
                { pid: "P1001", title: "A+B", difficulty: 1, tags: ["模拟"] },
                { pid: "P1002", title: "A+B Hard", difficulty: 4, tags: ["动态规划"] },
                { pid: "P1003", title: "A+B Easy DP", difficulty: 1, tags: ["动态规划"] }
              ]
            }
          }
        });
      }
      if (url.includes("/problem/CF1900A")) {
        return jsonResponse({
          status: 200,
          data: {
            problem: {
              pid: "CF1900A",
              translations: {
                en: {
                  name: "Cover in Water",
                  description: "Filip has a row of cells."
                }
              },
              samples: [["1\n3\n...", "2"]]
            }
          }
        });
      }
      return textResponse("Not Found", 404);
    });
    const lgAdapter = new LuoguAdapter({ fetchImpl: lgFetch });
    expect(lgAdapter.canHandleUrl("https://www.luogu.com.cn/problem/list")).toBe(false);
    expect(lgAdapter.resolveRef("P 1001")?.sourceId).toBe("P1001");

    const lgSearch = await lgAdapter.search({ keyword: "A+B", maxTier: 1, tags: ["动态规划"] });
    expect(lgSearch.items.map((i) => i.sourceId)).toEqual(["P1003"]);
    expect(lgSearch.total).toBe(1);

    const lgRemoteEn = await lgAdapter.fetchProblem("CF1900A");
    expect(lgRemoteEn.locale).toBe("en-US");

    // 3. Codeforces: trailing /en, mirror host, and luogu-public fallback when problemset.problems fails
    expect(parseCodeforcesRef("https://codeforces.com/problemset/problem/1900/A/en")?.sourceId).toBe("1900A");
    expect(parseCodeforcesRef("https://mirror.codeforces.com/contest/1900/problem/A")?.sourceId).toBe("1900A");
    expect(parseCodeforcesRef("CF 1900 A")?.sourceId).toBe("1900A");

    const cfOutageFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("codeforces.com/api/problemset.problems")) {
        return textResponse("Service Unavailable", 503);
      }
      if (url.includes("luogu.com.cn/problem/CF1900A")) {
        return jsonResponse({
          status: 200,
          data: {
            problem: {
              pid: "CF1900A",
              limits: { time: [1000], memory: [262144] },
              translations: {
                en: { name: "Cover in Water", description: "Fill empty cells." }
              },
              samples: [["1\n3\n...", "2"]]
            }
          }
        });
      }
      return textResponse("Not Found", 404);
    });
    const cfFallback = await new CodeforcesAdapter({
      fetchImpl: cfOutageFetch,
      statementMirror: "luogu-public"
    }).fetchProblem("CF1900A");
    expect(cfFallback.problemKey).toBe("cf:1900A");
    expect(cfFallback.completeness).toBe("full");
    expect(cfFallback.statementMarkdown).toContain("Fill empty cells");
  });
});

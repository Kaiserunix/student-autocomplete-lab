import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProblemDocument } from "../../src/core/contracts";
import {
  ProblemRepository,
  generateStarterTemplate,
  mergeProblemDocuments,
  normalizeCompetitiveCompanionPayload,
  parseMarkdownProblem
} from "../../src/problems";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe("markdownParser & mergeProblemDocuments", () => {
  it("parses structured Chinese Markdown with multiple samples and metadata", () => {
    const md = `# 两数之和（Stdio）
- 难度：简单
- 标签：数组，哈希表
- 时间限制：1000ms
- 内存限制：256MB

## 题目描述
给定 n 和目标值 target，输出满足条件的两个下标。

## 样例输入 1
\`\`\`
4 9
2 7 11 15
\`\`\`

## 样例输出 1
\`\`\`
0 1
\`\`\`

## 样例 2
### 输入
\`\`\`
3 6
3 2 4
\`\`\`
### 输出
\`\`\`
1 2
\`\`\`
`;

    const doc = parseMarkdownProblem(md);
    expect(doc.title).toBe("两数之和（Stdio）");
    expect(doc.completeness).toBe("full");
    expect(doc.locale).toBe("zh-CN");
    expect(doc.difficulty?.normalizedTier).toBe(1);
    expect(doc.rawTags).toEqual(["数组", "哈希表"]);
    expect(doc.constraints).toEqual({ timeLimitMs: 1000, memoryLimitMb: 256 });
    expect(doc.samples).toHaveLength(2);
    expect(doc.samples[0]?.input).toBe("4 9\n2 7 11 15");
    expect(doc.samples[0]?.expectedOutput).toBe("0 1");
    expect(doc.samples[1]?.expectedOutput).toBe("1 2");
  });

  it("merges clipboard statement with L2 Competitive Companion samples_only doc into completeness=full", () => {
    const ccDoc = normalizeCompetitiveCompanionPayload({
      name: "A. Watermelon",
      group: "Codeforces - Beta Round 4",
      url: "https://codeforces.com/contest/4/problem/A",
      timeLimit: 1000,
      memoryLimit: 64,
      tests: [{ input: "8\n", output: "YES\n" }]
    });

    expect(ccDoc.completeness).toBe("samples_only");
    expect(ccDoc.problemKey).toBe("cf:4A");

    const clipboardText = `
A. Watermelon
time limit per test 1 second
memory limit per test 64 megabytes

Pete and Billy are great fans of even numbers, so they want to divide a watermelon of weight w into two positive even parts.
Print YES if possible, otherwise NO.
`;

    const merged = mergeProblemDocuments(ccDoc, clipboardText);
    expect(merged.completeness).toBe("full");
    expect(merged.problemKey).toBe("cf:4A");
    expect(merged.source).toBe("codeforces");
    expect(merged.samples).toEqual(ccDoc.samples);
    expect(merged.statementMarkdown).toContain("divide a watermelon");
    expect(merged.constraints).toEqual({ timeLimitMs: 1000, memoryLimitMb: 64 });
  });
});

describe("ProblemRepository & templateGenerator", () => {
  it("routes cross-platform problem references accurately without colliding on CF/AT/numeric IDs", () => {
    const repo = new ProblemRepository();

    // Codeforces (bare, CF-prefixed, slash/hyphen variants)
    expect(repo.resolveInput("CF1900A")?.adapter.id).toBe("codeforces");
    expect(repo.resolveInput("CF1900A")?.sourceId).toBe("1900A");
    expect(repo.resolveInput("cf1900a")?.adapter.id).toBe("codeforces");
    expect(repo.resolveInput("CF-1900A")?.adapter.id).toBe("codeforces");
    expect(repo.resolveInput("1900A")?.adapter.id).toBe("codeforces");
    expect(repo.resolveInput("1900/A")?.adapter.id).toBe("codeforces");
    expect(repo.resolveInput("1900-A")?.adapter.id).toBe("codeforces");

    // Explicit Luogu prefix & Luogu URL still route to Luogu even for CF/AT RemoteJudge IDs
    expect(repo.resolveInput("luogu:CF1900A")?.adapter.id).toBe("luogu");
    expect(repo.resolveInput("https://www.luogu.com.cn/problem/CF1900A")?.adapter.id).toBe("luogu");
    expect(repo.resolveInput("luogu:AT_abc350_c")?.adapter.id).toBe("luogu");
    expect(repo.resolveInput("P1873")?.adapter.id).toBe("luogu");

    // Preferred Luogu + bare numeric routes to Luogu (while Auto bare numeric routes to LeetCode)
    expect(repo.resolveInput("1001", "luogu")).toMatchObject({
      adapter: expect.objectContaining({ id: "luogu" }),
      sourceId: "P1001"
    });
    expect(repo.resolveInput("1")?.adapter.id).toBe("leetcode-cn");
    expect(repo.resolveInput("146")?.adapter.id).toBe("leetcode-cn");
    expect(repo.resolveInput("LC1")?.adapter.id).toBe("leetcode-cn");
    expect(repo.resolveInput("LC-146")?.adapter.id).toBe("leetcode-cn");
    expect(repo.resolveInput("LCR 007")?.adapter.id).toBe("leetcode-cn");
    expect(repo.resolveInput("two-sum")?.adapter.id).toBe("leetcode-cn");
    expect(repo.resolveInput("lc-global:1")?.adapter.id).toBe("leetcode-global");

    // AtCoder shorthand, AT_ prefix, and non-standard task IDs
    expect(repo.resolveInput("abc350c")?.adapter.id).toBe("atcoder");
    expect(repo.resolveInput("ABC350C")?.sourceId).toBe("abc350/abc350_c");
    expect(repo.resolveInput("abc350_c")?.adapter.id).toBe("atcoder");
    expect(repo.resolveInput("AT_abc350_c")?.adapter.id).toBe("atcoder");
    expect(repo.resolveInput("practice2_a")?.adapter.id).toBe("atcoder");
    expect(repo.resolveInput("tessoku_book_a")?.adapter.id).toBe("atcoder");

    // NowCoder bare NC ID and prefixed refs
    expect(repo.resolveInput("NC14362")?.adapter.id).toBe("nowcoder");
    expect(repo.resolveInput("nc:14362")?.adapter.id).toBe("nowcoder");
    expect(repo.resolveInput("nowcoder:14362")?.adapter.id).toBe("nowcoder");
  });

  it("enables luogu-public statement mirror for Codeforces and passes fetchImpl to NowCoderAdapter", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("codeforces.com/api/problemset.problems")) {
        return new Response(
          JSON.stringify({
            status: "OK",
            result: {
              problems: [
                {
                  contestId: 1900,
                  index: "A",
                  name: "Cover in Water",
                  rating: 800,
                  tags: ["greedy"]
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("luogu.com.cn/problem/CF1900A")) {
        return new Response(
          JSON.stringify({
            status: 200,
            data: {
              problem: {
                pid: "CF1900A",
                limits: { time: [1000], memory: [262144] },
                translations: {
                  en: { name: "Cover in Water", description: "Fill empty cells with water." }
                },
                samples: [["1\n3\n...", "2"]]
              }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("ac.nowcoder.com/acm/problem/14362")) {
        return new Response(
          `<html><title>A+B</title><div class="subject-describe"><p>求两数之和。</p><textarea data-clipboard-text-id="input1">1 2</textarea><textarea data-clipboard-text-id="output1">3</textarea></div></html>`,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const repo = new ProblemRepository({ fetchImpl: mockFetch });
    const cfDoc = await repo.importProblem("CF1900A");
    expect(cfDoc.source).toBe("codeforces");
    expect(cfDoc.problemKey).toBe("cf:1900A");
    expect(cfDoc.canonicalUrl).toBe("https://codeforces.com/contest/1900/problem/A");
    expect(cfDoc.completeness).toBe("full");
    expect(cfDoc.samples[0]?.expectedOutput).toBe("2");

    const ncDoc = await repo.importProblem("NC14362");
    expect(ncDoc.source).toBe("nowcoder");
    expect(ncDoc.problemKey).toBe("nowcoder:acm-14362");
    expect(ncDoc.completeness).toBe("full");
    expect(ncDoc.samples[0]?.expectedOutput).toBe("3");
  });

  it("orchestrates adapters, caches locally to JSON, and merges clipboard statement", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "algo-coach-repo-"));
    tempDirs.push(cacheDir);

    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            problem: {
              pid: "P1001",
              difficulty: 1,
              contenu: {
                name: "A+B Problem",
                description: "求两个整数的和。"
              },
              samples: [["1 2", "3"]]
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const repo = new ProblemRepository({ cacheDir, fetchImpl: mockFetch });
    const first = await repo.importProblem("P1001");
    expect(first.problemKey).toBe("luogu:P1001");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // New repository instance reads from persistent disk JSON cache without network call
    const repo2 = new ProblemRepository({ cacheDir, fetchImpl: mockFetch });
    const second = await repo2.importProblem("P1001");
    expect(second.title).toBe("A+B Problem");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Ingest bridge samples_only doc and merge clipboard statement
    const ccDoc = normalizeCompetitiveCompanionPayload({
      name: "B. Demo",
      url: "https://codeforces.com/contest/100/problem/B",
      tests: [{ input: "3\n", output: "6\n" }]
    });
    await repo2.ingestFromBridge(ccDoc);
    const completed = await repo2.mergeClipboardStatement(
      "cf:100B",
      "Given integer n, print 2 * n."
    );
    expect(completed.completeness).toBe("full");
    expect(completed.samples).toHaveLength(1);
    expect(completed.statementMarkdown).toContain("print 2 * n");
  });

  it("generates ACM stdio templates and LeetCode codeSnippets without leaking statementMarkdown", () => {
    const lcDoc: ProblemDocument = {
      schemaVersion: "problem-doc/v2",
      problemKey: "lc-cn:two-sum",
      source: "leetcode-cn",
      sourceId: "two-sum",
      canonicalUrl: "https://leetcode.cn/problems/two-sum/",
      title: "两数之和",
      locale: "zh-CN",
      completeness: "full",
      ioMode: "function",
      statementMarkdown: "SECRET_STATEMENT_DO_NOT_LEAK_INTO_CODE",
      samples: [],
      functionMeta: {
        entryName: "twoSum",
        params: [
          { name: "nums", type: "integer[]" },
          { name: "target", type: "integer" }
        ],
        returnType: "integer[]",
        codeSnippets: {
          python3:
            "class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass",
          cpp: "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        \n    }\n};"
        }
      },
      rawTags: ["array"],
      provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() }
    };

    const pyTpl = generateStarterTemplate(lcDoc, "python");
    expect(pyTpl.mode).toBe("function");
    expect(pyTpl.filename).toBe("lc-cn_two-sum.py");
    expect(pyTpl.content).toContain("from typing import List");
    expect(pyTpl.content).toContain("def twoSum");
    expect(pyTpl.content).not.toContain("SECRET_STATEMENT_DO_NOT_LEAK_INTO_CODE");

    const cppTpl = generateStarterTemplate(lcDoc, "cpp");
    expect(cppTpl.mode).toBe("function");
    expect(cppTpl.content).toContain("vector<int> twoSum");

    // Stdio templates for all 5 languages
    const stdioDoc: ProblemDocument = {
      ...lcDoc,
      problemKey: "luogu:P1001",
      source: "luogu",
      sourceId: "P1001",
      ioMode: "stdio",
      functionMeta: undefined
    };

    for (const lang of ["python", "cpp", "c", "rust", "java"] as const) {
      const tpl = generateStarterTemplate(stdioDoc, lang);
      expect(tpl.mode).toBe("stdio");
      expect(tpl.content).not.toContain("SECRET_STATEMENT_DO_NOT_LEAK_INTO_CODE");
    }
    const javaStdioTpl = generateStarterTemplate(stdioDoc, "java");
    expect(javaStdioTpl.filename).toBe("Main.java");
    expect(javaStdioTpl.content).toContain("class Main {");
    expect(javaStdioTpl.content).not.toContain("public class Main");
  });

  it("handles messy NFKC/full-width/spaced Omnibar inputs, preserves CN slug case in cache, and keeps richer Companion samples", async () => {
    const repo = new ProblemRepository();

    // Spaced & full-width messy inputs across all 6 OJs
    expect(repo.resolveInput("CF 1900 A")).toMatchObject({
      adapter: expect.objectContaining({ id: "codeforces" }),
      sourceId: "1900A"
    });
    expect(repo.resolveInput("ＣＦ１９００Ａ")).toMatchObject({
      adapter: expect.objectContaining({ id: "codeforces" }),
      sourceId: "1900A"
    });
    expect(repo.resolveInput("https://codeforces.com/problemset/problem/1900/A/en")?.sourceId).toBe("1900A");
    expect(repo.resolveInput("https://mirror.codeforces.com/contest/1900/problem/A")?.sourceId).toBe("1900A");

    expect(repo.resolveInput("ABC350 A")?.sourceId).toBe("abc350/abc350_a");
    expect(repo.resolveInput("abc 350 a")?.sourceId).toBe("abc350/abc350_a");

    expect(repo.resolveInput("LC  1")?.sourceId).toBe("#1");
    expect(repo.resolveInput("LC #1")?.sourceId).toBe("#1");
    expect(repo.resolveInput("力扣 #1")?.sourceId).toBe("#1");
    expect(repo.resolveInput("＃１")?.sourceId).toBe("#1");
    expect(repo.resolveInput("ＬＣ　１")?.sourceId).toBe("#1");
    expect(repo.resolveInput("ｌｃ：ｔｗｏ－ｓｕｍ")?.sourceId).toBe("two-sum");
    expect(repo.resolveInput("面试题 01.01")?.sourceId).toBe("#面试题 01.01");
    expect(repo.resolveInput("剑指 Offer 03")?.sourceId).toBe("#剑指 Offer 03");
    expect(
      repo.resolveInput("https://leetcode.cn/contest/weekly-contest-400/problems/two-sum/")?.sourceId
    ).toBe("two-sum");

    expect(repo.resolveInput("P 1001")?.sourceId).toBe("P1001");
    expect(repo.resolveInput("Ｐ１００１")?.sourceId).toBe("P1001");
    expect(repo.resolveInput("NC 14362")?.sourceId).toBe("acm-14362");
    expect(repo.resolveInput("https://www.luogu.com.cn/problem/list")).toBeNull();

    // Mixed-case CN slug cache hit + preserving Companion expectedOutput on re-import
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { variables?: { titleSlug?: string } };
      const slug = body.variables?.titleSlug ?? "";
      if (slug === "1fGaJU") {
        return new Response(
          JSON.stringify({
            data: {
              question: {
                title: "3Sum",
                translatedTitle: "三数之和",
                titleSlug: "1fGaJU",
                translatedContent: "<p>找出所有和为 0 的三元组。</p><p><strong>输出：</strong>[[-1,0,1]]</p>",
                isPaidOnly: false,
                difficulty: "Medium",
                exampleTestcaseList: ["[-1,0,1,2,-1,-4]"]
              }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            question: {
              title: "LRU Cache",
              translatedTitle: "LRU 缓存",
              titleSlug: "lru-cache",
              translatedContent: "<p>请你设计并实现一个满足 LRU 缓存约束的数据结构。</p>",
              isPaidOnly: false,
              difficulty: "Medium",
              exampleTestcaseList: ['["LRUCache","get"]\n[[2],[1]]']
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const repo2 = new ProblemRepository({ fetchImpl: mockFetch });
    const first = await repo2.importProblem("https://leetcode.cn/problems/1fGaJU/");
    const second = await repo2.importProblem("https://leetcode.cn/problems/1fGaJU/");
    expect(first.problemKey).toBe("lc-cn:1fGaJU");
    expect(second.problemKey).toBe("lc-cn:1fGaJU");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Seed Companion sample with expectedOutput, then re-import full statement lacking output
    await repo2.ingestFromBridge(
      normalizeCompetitiveCompanionPayload({
        name: "LRU Cache",
        url: "https://leetcode.cn/problems/lru-cache/",
        tests: [{ input: '["LRUCache","get"]\n[[2],[1]]', output: "[null,-1]" }]
      })
    );
    const reimported = await repo2.importProblem("https://leetcode.cn/problems/lru-cache/", {
      forceRefresh: true
    });
    expect(reimported.completeness).toBe("full");
    expect(reimported.samples[0]?.expectedOutput).toBe("[null,-1]");
  });
});

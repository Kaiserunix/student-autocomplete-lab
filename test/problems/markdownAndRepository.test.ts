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
    expect(generateStarterTemplate(stdioDoc, "java").filename).toBe("Main.java");
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { ProblemRecord } from "../src/problemBank/types";
import {
  buildTeacherPackPrompt,
  findTeacherPack,
  requestMimoTeacherPack,
  teacherPackKey,
  upsertTeacherPack
} from "../src/teaching/teacherPack";

const problem: ProblemRecord = {
  platform: "luogu",
  id: "P5730",
  title: "显示屏",
  sourceUrl: "https://www.luogu.com.cn/problem/P5730",
  tags: ["模拟", "字符串"],
  statement: "给定若干数字，请用 5x3 字符矩阵显示。",
  inputFormat: "第一行是数字个数，第二行是数字串。",
  outputFormat: "输出拼接后的显示屏。",
  samples: [{ input: "3\n123\n", output: "..X.XXX.XXX\n" }]
};

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("teacher pack", () => {
  test("builds a hidden-reference prompt from problem details", () => {
    const prompt = buildTeacherPackPrompt(problem);

    expect(prompt).toContain("Teacher Pack");
    expect(prompt).toContain("标准思路");
    expect(prompt).toContain("是否适合暴力");
    expect(prompt).toContain("P5730");
    expect(prompt).toContain("样例输入 1");
  });

  test("requests a teacher pack and normalizes required fields", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "用固定字模逐行拼接数字。",
                  constraints: "数字个数较小，输出规模固定。",
                  standard_approach: "建立 0-9 的 5 行字模，按行拼接。",
                  expected_algorithm: "simulation_with_digit_font_table",
                  expected_complexity: { time: "O(n)", space: "O(1) except output" },
                  key_invariants: ["每个数字始终输出 5 行", "数字之间的列间隔一致"],
                  common_pitfalls: [
                    { label: "format_output", description: "数字之间多输出或少输出分隔列。" }
                  ],
                  minimal_counterexamples: [
                    { input: "1\n1\n", expected_output: "..X\n..X\n..X\n..X\n..X\n", reason: "检查单个数字不应带额外间隔。" }
                  ],
                  brute_force: {
                    suitable: true,
                    acceptable_complexity: "O(n)",
                    reason: "本题核心就是按固定表模拟输出。"
                  }
                })
              }
            }
          ],
          usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const usage: unknown[] = [];

    const pack = await requestMimoTeacherPack(
      {
        baseUrl: "https://mimo.example.test/v1",
        apiKey: "secret",
        model: "mimo-v2.5"
      },
      problem,
      fakeFetch as typeof fetch,
      (event) => usage.push(event)
    );

    expect(pack.problemKey).toBe("luogu:P5730");
    expect(pack.standardApproach).toContain("字模");
    expect(pack.expectedComplexity.time).toBe("O(n)");
    expect(pack.commonPitfalls[0].label).toBe("format_output");
    expect(pack.bruteForce.suitable).toBe(true);
    expect(usage).toHaveLength(1);
    expect(calls[0].url).toBe("https://mimo.example.test/v1/chat/completions");
  });

  test("upserts and finds cached packs by platform and id", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "teacher-pack-"));
    const storagePath = path.join(tempDir, "teacherPacks.jsonl");
    const pack = {
      problemKey: teacherPackKey("luogu", "P5730"),
      platform: "luogu" as const,
      id: "P5730",
      title: "显示屏",
      sourceUrl: problem.sourceUrl,
      tags: ["模拟"],
      generatedAt: "2026-05-01T00:00:00.000Z",
      model: "mimo-v2.5",
      summary: "固定字模模拟。",
      constraints: "小规模输出。",
      standardApproach: "预设字模。",
      expectedAlgorithm: "simulation",
      expectedComplexity: { time: "O(n)", space: "O(1)" },
      keyInvariants: ["五行输出"],
      commonPitfalls: [{ label: "format_output", description: "间隔错。" }],
      minimalCounterexamples: [{ input: "1\n1\n", expectedOutput: "..X\n", reason: "单数字。" }],
      bruteForce: { suitable: true, acceptableComplexity: "O(n)", reason: "模拟题。" }
    };

    await upsertTeacherPack(storagePath, pack);
    await upsertTeacherPack(storagePath, { ...pack, summary: "更新后的摘要。" });

    const cached = await findTeacherPack(storagePath, "luogu", "P5730");
    expect(cached?.summary).toBe("更新后的摘要。");
  });
});

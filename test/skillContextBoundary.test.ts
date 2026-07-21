import { describe, expect, test } from "vitest";
import { buildAutocompleteInputFromText } from "../src/autocomplete/context";
import { requestMimoAutocompleteDetailed } from "../src/autocomplete/mimoAutocomplete";
import { shouldRequestInlineCompletion } from "../src/autocomplete/triggerPolicy";
import { buildTeachingDiagnosisPrompt } from "../src/teaching/teachingPrompt";
import { createEmptyStudentSkill } from "../src/teaching/studentSkill";

describe("skill route context boundary", () => {
  test("removes forbidden problem and learner text before the provider request", async () => {
    const text = [
      "# 题面：LEAK-PROBLEM-991",
      "# 标准答案：LEAK-ANSWER-992",
      "# ===== 学生代码开始 =====",
      "def solve():",
      "    total = 0",
      "    ",
      "# ===== 学生代码结束 =====",
      "# AI 讲解：LEAK-COACH-995"
    ].join("\n");
    const input = buildAutocompleteInputFromText({
      text,
      offset: text.indexOf("    ", text.indexOf("total = 0")) + 4,
      language: "python",
      filePath: "C:\\LEAK-PATH-993\\P991.py"
    });
    const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
    skill.codeHabits.globalRules = ["LEAK-HABIT-994"];
    const calls: Array<{ init?: RequestInit }> = [];
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ init });
      return new Response(JSON.stringify({
        choices: [{ text: "return total" }]
      }), { status: 200 });
    };

    await requestMimoAutocompleteDetailed(
      {
        format: "openai-completions",
        baseUrl: "https://api.deepseek.com/beta",
        apiKey: "test-key",
        model: "deepseek-v4-flash"
      },
      {
        ...input,
        studentSkill: skill
      },
      fakeFetch as typeof fetch
    );

    const requestBody = String(calls[0].init?.body);
    expect(requestBody).toContain("def solve");
    expect(requestBody).not.toContain("LEAK-PROBLEM-991");
    expect(requestBody).not.toContain("LEAK-ANSWER-992");
    expect(requestBody).not.toContain("LEAK-PATH-993");
    expect(requestBody).not.toContain("LEAK-HABIT-994");
    expect(requestBody).not.toContain("LEAK-COACH-995");
  });

  test("keeps problem context on coach while excluding it from autocomplete", () => {
    const prompt = buildTeachingDiagnosisPrompt({
      problem: {
        id: "P991",
        title: "Coach-visible problem",
        summary: "COACH-PROBLEM-ALLOWED"
      },
      language: "python",
      studentCode: "return total",
      ojVerdict: { status: "WA" },
      localEvidence: [],
      studentProfile: { painPointCounts: {}, activeSkills: [] }
    });

    expect(prompt).toContain("COACH-PROBLEM-ALLOWED");
  });

  test("does not automatically trigger on problem comments", () => {
    expect(shouldRequestInlineCompletion(
      "# 题面：LEAK-PROBLEM-991",
      { languageId: "python" }
    )).toBe(false);
    expect(shouldRequestInlineCompletion(
      "// Reference Solution: LEAK-ANSWER-992",
      { languageId: "cpp" }
    )).toBe(false);
  });
});

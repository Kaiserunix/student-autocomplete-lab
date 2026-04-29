import { describe, expect, test } from "vitest";
import { buildPracticeGenerationPrompt } from "../src/practice/practicePrompt";

describe("practice generation prompt", () => {
  test("asks for reference solution, wrong submissions, and pain points as JSON", () => {
    const prompt = buildPracticeGenerationPrompt({
      problemId: "P1427",
      title: "小鱼的数字游戏",
      statement: "输入一串整数，以 0 结束，倒序输出 0 之前的数。",
      language: "python",
      targetPainPoints: ["input_output", "loop_boundary"]
    });

    expect(prompt).toContain("P1427");
    expect(prompt).toContain("reference_solution");
    expect(prompt).toContain("wrong_submissions");
    expect(prompt).toContain("pain_points");
    expect(prompt).toContain("JSON only");
    expect(prompt).not.toContain("markdown");
  });
});

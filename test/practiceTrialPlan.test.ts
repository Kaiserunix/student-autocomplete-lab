import { describe, expect, test } from "vitest";
import { buildPracticeTrialPlan } from "../src/practice/trialPlan";

describe("practice trial plan", () => {
  test("defaults to dry-run with gpt-4.1-nano and stays inside a tiny budget", () => {
    const plan = buildPracticeTrialPlan({
      problemId: "P1427",
      title: "小鱼的数字游戏",
      statement: "输入一串整数，以 0 结束，倒序输出 0 之前的数。",
      language: "python",
      targetPainPoints: ["output_order"]
    });

    expect(plan.model).toBe("gpt-4.1-nano");
    expect(plan.dryRun).toBe(true);
    expect(plan.allowedToSpend).toBe(false);
    expect(plan.estimatedUsd).toBeLessThan(0.01);
  });

  test("requires an explicit spend flag before allowing a paid run", () => {
    const plan = buildPracticeTrialPlan({
      problemId: "P1427",
      title: "小鱼的数字游戏",
      statement: "输入一串整数，以 0 结束，倒序输出 0 之前的数。",
      language: "python",
      targetPainPoints: ["output_order"],
      spend: true,
      apiKeyPresent: true,
      maxUsd: 0.02
    });

    expect(plan.allowedToSpend).toBe(true);
    expect(plan.dryRun).toBe(false);
  });
});

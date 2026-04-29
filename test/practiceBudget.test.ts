import { describe, expect, test } from "vitest";
import { assertWithinBudget, estimateUsd, getGptPricing } from "../src/practice/budget";

describe("practice budget guard", () => {
  test("estimates gpt-4.1-nano cost from input and output tokens", () => {
    const pricing = getGptPricing("gpt-4.1-nano");

    expect(pricing).toEqual({
      inputPerMillion: 0.1,
      cachedInputPerMillion: 0.025,
      outputPerMillion: 0.4
    });
    expect(estimateUsd("gpt-4.1-nano", { inputTokens: 10_000, outputTokens: 5_000 })).toBeCloseTo(0.003);
  });

  test("throws before a paid run exceeds budget", () => {
    expect(() =>
      assertWithinBudget({
        model: "gpt-5.4-nano",
        inputTokens: 100_000,
        outputTokens: 100_000,
        maxUsd: 0.01
      })
    ).toThrow(/exceeds budget/);
  });
});

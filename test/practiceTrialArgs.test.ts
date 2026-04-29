import { describe, expect, test } from "vitest";
import { readPracticeTrialArgs } from "../src/practice/trialArgs";

describe("practice trial CLI args", () => {
  test("parses spend, budget, model, and pain-point flags", () => {
    const parsed = readPracticeTrialArgs(
      ["--spend", "--model", "gpt-5-nano", "--max-usd", "0.02", "--pain-points", "output_order,loop_boundary"],
      {
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://api.openai.test/v1"
      }
    );

    expect(parsed.model).toBe("gpt-5-nano");
    expect(parsed.maxUsd).toBe(0.02);
    expect(parsed.spend).toBe(true);
    expect(parsed.apiKeyPresent).toBe(true);
    expect(parsed.targetPainPoints).toEqual(["output_order", "loop_boundary"]);
    expect(parsed.baseUrl).toBe("https://api.openai.test/v1");
  });
});

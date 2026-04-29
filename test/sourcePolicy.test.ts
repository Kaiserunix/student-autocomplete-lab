import { describe, expect, test } from "vitest";
import { getSourcePolicy } from "../src/problemBank/sourcePolicy";

describe("problem source policy", () => {
  test("uses public Luogu import before manual paste fallback", () => {
    const policy = getSourcePolicy("luogu");

    expect(policy.primary).toBe("public-fetch");
    expect(policy.fallback).toBe("manual-paste");
    expect(policy.defaultEnabled).toBe(true);
  });

  test("keeps LeetCode on adapter/manual fallback until GraphQL is configured", () => {
    const policy = getSourcePolicy("leetcode");

    expect(policy.primary).toBe("optional-adapter");
    expect(policy.fallback).toBe("manual-paste");
    expect(policy.defaultEnabled).toBe(false);
  });
});

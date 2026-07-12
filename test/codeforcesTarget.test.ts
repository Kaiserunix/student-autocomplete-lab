import { describe, expect, test } from "vitest";
import { parseCodeforcesProblemUrl } from "../src/submission/codeforcesTarget";

describe("Codeforces submission target", () => {
  test("normalizes contest and problemset URLs", () => {
    expect(parseCodeforcesProblemUrl("https://codeforces.com/contest/1200/problem/F")).toMatchObject({
      contestId: 1200,
      problemIndex: "F",
      contestKind: "contest",
      canonicalUrl: "https://codeforces.com/contest/1200/problem/F"
    });
    expect(parseCodeforcesProblemUrl("https://codeforces.com/problemset/problem/1200/f").canonicalUrl).toBe(
      "https://codeforces.com/contest/1200/problem/F"
    );
  });

  test("accepts gym targets and rejects non-Codeforces or non-problem URLs", () => {
    expect(parseCodeforcesProblemUrl("https://codeforces.com/gym/104976/problem/A")).toMatchObject({
      contestId: 104976,
      problemIndex: "A",
      contestKind: "gym",
      canonicalUrl: "https://codeforces.com/gym/104976/problem/A"
    });
    expect(() => parseCodeforcesProblemUrl("https://example.com/contest/1200/problem/F")).toThrow(
      "只支持 codeforces.com"
    );
    expect(() => parseCodeforcesProblemUrl("http://codeforces.com/contest/1200/problem/F")).toThrow("HTTPS");
    expect(() => parseCodeforcesProblemUrl("https://codeforces.com/contest/1200")).toThrow("题目链接");
  });
});

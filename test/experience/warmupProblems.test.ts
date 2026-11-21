import { describe, expect, it } from "vitest";
import {
  getWarmupProblemByKey,
  getWarmupProblems,
  getWarmupStarterCode,
  isWarmupProblemKey,
  WARMUP_PROBLEM_KEYS,
  WARMUP_PROBLEMS
} from "../../src/experience";

const EMOJI_RE = /\p{Extended_Pictographic}/u;

describe("warmupProblems (3 built-in offline sandbox problems)", () => {
  it("exports all 3 complete offline ProblemDocuments with original samples", () => {
    expect(WARMUP_PROBLEM_KEYS).toEqual([
      "warmup:stdio-sum",
      "warmup:two-sum",
      "warmup:binary-search-first"
    ]);
    expect(WARMUP_PROBLEMS).toHaveLength(3);

    const problems = getWarmupProblems();
    for (const doc of problems) {
      expect(doc.schemaVersion).toBe("problem-doc/v2");
      expect(doc.source).toBe("warmup-pack");
      expect(doc.completeness).toBe("full");
      expect(doc.provenance.ingestChannel).toBe("warmup-builtin");
      expect(doc.statementMarkdown?.length).toBeGreaterThan(80);
      expect(EMOJI_RE.test(doc.title)).toBe(false);
      expect(EMOJI_RE.test(doc.statementMarkdown ?? "")).toBe(false);
      expect(doc.samples.length).toBeGreaterThanOrEqual(3);
      for (const sample of doc.samples) {
        expect(sample.isOriginal).toBe(true);
        expect(sample.input.length).toBeGreaterThan(0);
        expect(sample.expectedOutput?.length).toBeGreaterThan(0);
      }
    }
  });

  it("configures warmup:two-sum with function-harness metadata and Python/C++ code snippets", () => {
    const twoSum = getWarmupProblemByKey("warmup:two-sum");
    expect(twoSum).toBeDefined();
    expect(twoSum?.ioMode).toBe("function");
    expect(twoSum?.functionMeta?.entryName).toBe("twoSum");
    expect(twoSum?.functionMeta?.params).toHaveLength(2);
    expect(twoSum?.functionMeta?.codeSnippets.python).toContain("def twoSum");
    expect(twoSum?.functionMeta?.codeSnippets.python3).toContain("def twoSum");
    expect(twoSum?.functionMeta?.codeSnippets.cpp).toContain("vector<int> twoSum");
  });

  it("configures stdio-sum and binary-search-first as stdio with rich edge-case samples", () => {
    const stdioSum = getWarmupProblemByKey("warmup:stdio-sum");
    expect(stdioSum?.ioMode).toBe("stdio");
    expect(stdioSum?.samples.some((s) => s.input.includes("1000000000000"))).toBe(true);

    const bs = getWarmupProblemByKey("warmup:binary-search-first");
    expect(bs?.ioMode).toBe("stdio");
    expect(bs?.samples.length).toBeGreaterThanOrEqual(4);
    expect(bs?.samples.some((s) => s.expectedOutput?.includes("-1"))).toBe(true);
  });

  it("returns defensive clones so external mutation never corrupts built-in originals", () => {
    const copy = getWarmupProblemByKey("warmup:stdio-sum");
    expect(copy).toBeDefined();
    copy!.samples.pop();
    copy!.title = "MUTATED";

    const fresh = getWarmupProblemByKey("warmup:stdio-sum");
    expect(fresh?.samples).toHaveLength(3);
    expect(fresh?.title).not.toBe("MUTATED");
  });

  it("provides Python and C++ starter templates for all 3 warmup keys", () => {
    for (const key of WARMUP_PROBLEM_KEYS) {
      expect(isWarmupProblemKey(key)).toBe(true);
      expect(getWarmupStarterCode(key, "python")).toBeTruthy();
      expect(getWarmupStarterCode(key, "cpp")).toBeTruthy();
    }
    expect(isWarmupProblemKey("luogu:P1001")).toBe(false);
    expect(getWarmupStarterCode("luogu:P1001", "python")).toBeUndefined();
  });
});

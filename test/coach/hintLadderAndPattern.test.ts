import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalRunResult, ProblemDocument } from "../../src/core/contracts";
import {
  FileHintLadderStore,
  HINT_LEVEL_SPECS,
  HintLadderMachine,
  STRICTNESS_PERSONA_SPECS,
  STUCK_CATEGORY_SPECS,
  analyzeProblemPattern,
  buildDryRunPrompt,
  inferScaleComplexityBudget
} from "../../src/core/coach";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

function makeProblem(partial: Partial<ProblemDocument> & { problemKey: string; title: string }): ProblemDocument {
  return {
    schemaVersion: "problem-doc/v2",
    source: "luogu",
    sourceId: partial.problemKey,
    locale: "zh-CN",
    completeness: "full",
    ioMode: "stdio",
    samples: [],
    rawTags: [],
    provenance: { ingestChannel: "builtin-adapter", fetchedAt: "2026-11-22T00:00:00.000Z" },
    ...partial
  };
}

describe("HintLadderMachine (5-level deterministic Socratic state machine)", () => {
  it("progresses strictly L0 -> L1 -> L2 -> L3 -> L4 -> L5 without skipping and clamps at L5", async () => {
    const machine = new HintLadderMachine();
    const key = "luogu:P2249";

    const init = await machine.getState(key);
    expect(init.currentLevel).toBe(0);
    expect(init.giveUpUnlocked).toBe(false);

    // Attempt to skip directly to L4 from L0 -> clamped to L1
    const step1 = await machine.requestNextHint(key, {
      requestedLevel: 4,
      stuckCategory: "no_idea",
      strictness: "strict"
    });
    expect(step1.state.currentLevel).toBe(1);
    expect(step1.skippedAttempted).toBe(true);
    expect(step1.spec.allowsAlgorithmName).toBe(false);
    expect(step1.spec.allowsDataStructureName).toBe(false);

    const step2 = await machine.requestNextHint(key, { stuckCategory: "tle" });
    expect(step2.state.currentLevel).toBe(2);
    expect(step2.spec.allowsAlgorithmName).toBe(false);

    const step3 = await machine.requestNextHint(key, { stuckCategory: "partial_wa" });
    expect(step3.state.currentLevel).toBe(3);
    expect(step3.spec.allowsDataStructureName).toBe(false);

    const step4 = await machine.requestNextHint(key, { stuckCategory: "implementation" });
    expect(step4.state.currentLevel).toBe(4);
    expect(step4.spec.allowsAlgorithmName).toBe(true);
    expect(step4.spec.allowsDataStructureName).toBe(true);
    expect(step4.spec.allowsPseudocodeSkeleton).toBe(false);

    const step5 = await machine.requestNextHint(key);
    expect(step5.state.currentLevel).toBe(5);
    expect(step5.spec.allowsPseudocodeSkeleton).toBe(true);
    expect(step5.spec.allowsFullCode).toBe(false);

    // Further hint requests stay at L5 and never auto-unlock giveUp
    const step6 = await machine.requestNextHint(key);
    expect(step6.state.currentLevel).toBe(5);
    expect(step6.state.giveUpUnlocked).toBe(false);
    expect(step6.state.hintsRequestedCount).toBe(6);
  });

  it("persists state per problemKey on disk and NEVER resets to L0 when conversation reopens", async () => {
    const dir = await mkdtemp(join(tmpdir(), "algo-coach-ladder-"));
    tempDirs.push(dir);
    const storePath = join(dir, "hintLadder.v2.json");

    const machine1 = new HintLadderMachine({ store: new FileHintLadderStore(storePath) });
    await machine1.requestNextHint("lc-cn:two-sum", { stuckCategory: "no_idea", strictness: "strict" });
    await machine1.requestNextHint("lc-cn:two-sum", { stuckCategory: "tle" });
    await machine1.requestNextHint("luogu:P1030", { stuckCategory: "partial_wa" });

    // Simulate restarting extension / reopening chat with a fresh machine instance
    const machine2 = new HintLadderMachine({ store: new FileHintLadderStore(storePath) });
    const reopened = await machine2.reopenSession("lc-cn:two-sum");
    expect(reopened.currentLevel).toBe(2);
    expect(reopened.sessionReopenCount).toBe(1);
    expect(reopened.strictness).toBe("strict");

    // Next hint continues from L2 -> L3, NOT L0 -> L1
    const next = await machine2.requestNextHint("lc-cn:two-sum");
    expect(next.state.currentLevel).toBe(3);

    // Other problemKey remains isolated at L1
    const other = await machine2.getState("luogu:P1030");
    expect(other.currentLevel).toBe(1);
  });

  it("requires explicit confirmation to unlock giveUp and defines all 4 stuck categories + 3 personas", async () => {
    const machine = new HintLadderMachine();
    const denied = await machine.unlockGiveUp("cf:1433G", false);
    expect(denied.unlocked).toBe(false);
    expect(denied.state.giveUpUnlocked).toBe(false);

    const granted = await machine.unlockGiveUp("cf:1433G", true);
    expect(granted.unlocked).toBe(true);
    expect(granted.state.giveUpUnlocked).toBe(true);
    expect(granted.state.giveUpUnlockedAt).toBeTruthy();

    expect(Object.keys(STUCK_CATEGORY_SPECS)).toEqual(["no_idea", "tle", "partial_wa", "implementation"]);
    expect(Object.keys(STRICTNESS_PERSONA_SPECS)).toEqual(["gentle", "standard", "strict"]);
    expect(STRICTNESS_PERSONA_SPECS.strict.systemDirectiveEn).toContain("zero-sycophancy");
    expect(HINT_LEVEL_SPECS[5].allowsFullCode).toBe(false);
  });
});

describe("30-second Pattern Mapper engine", () => {
  it("infers complexity budgets from constraint scales while ignoring modulo 10^9 + 7", () => {
    expect(inferScaleComplexityBudget("1 <= n <= 20, find all subsets").targetComplexity).toContain("2^n");
    expect(inferScaleComplexityBudget("1 <= n <= 3000, count ways mod 10^9 + 7").targetComplexity).toBe("O(n^2)");
    expect(inferScaleComplexityBudget("n <= 2 * 10^5, sorted array").targetComplexity).toBe("O(n log n) or O(n)");
    expect(inferScaleComplexityBudget("1 <= X <= 10^12").targetComplexity).toContain("O(log n)");
  });

  it("identifies candidate patterns, builds decision tree, and surfaces confusable disambiguation pairs", () => {
    const windowProblem = makeProblem({
      problemKey: "lc-cn:longest-substring",
      title: "最长无重复连续子串",
      statementMarkdown: "给定长度 n <= 10^5 的字符串，求不含重复字符的最长连续子串（longest substring）长度。",
      rawTags: ["sliding-window"]
    });
    const winMap = analyzeProblemPattern(windowProblem);
    expect(winMap.candidates[0]?.patternId).toBe("sliding_window");
    expect(winMap.decisionTree.length).toBeGreaterThanOrEqual(2);
    expect(winMap.confusablePairs.some((p) => p.id === "two_pointers_vs_sliding_window")).toBe(true);

    const dpGreedyProblem = makeProblem({
      problemKey: "luogu:P1048",
      title: "采药（背包方案）",
      statementMarkdown: "容量 W <= 1000，物品数 n <= 100，求最大总价值（knapsack maximum profit）。",
      rawTags: ["dp", "greedy"]
    });
    const dpMap = analyzeProblemPattern(dpGreedyProblem);
    expect(dpMap.candidates.some((c) => c.patternId === "dp")).toBe(true);
    expect(dpMap.confusablePairs.some((p) => p.id === "dp_vs_greedy")).toBe(true);

    const bfsProblem = makeProblem({
      problemKey: "lc-cn:shortest-path-grid",
      title: "迷宫最少步数",
      statementMarkdown: "在 n <= 1000 的网格迷宫中求起点到终点的最少步数（shortest path in unweighted grid）。",
      rawTags: ["bfs"]
    });
    const bfsMap = analyzeProblemPattern(bfsProblem);
    expect(bfsMap.candidates[0]?.patternId).toBe("bfs");
    expect(bfsMap.confusablePairs.some((p) => p.id === "bfs_vs_dfs")).toBe(true);
  });
});

describe("WA / RE / TLE / CE Dry-Run Builder", () => {
  function baseRun(partial: Partial<LocalRunResult>): LocalRunResult {
    return {
      schemaVersion: "local-run/v2",
      source: "local_runner",
      problemKey: "luogu:P2249",
      language: "python",
      mode: "stdio",
      codeHash: "abc123",
      compileOk: true,
      allPassed: false,
      originalTotal: 1,
      originalPassed: 0,
      customTotal: 0,
      customPassed: 0,
      cases: [],
      memoryNote: "local reference only",
      timestamp: "2026-11-22T00:00:00.000Z",
      ...partial
    };
  }

  it("constructs targeted WA off-by-one dry-run prompt with extracted trace columns", () => {
    const run = baseRun({
      cases: [
        {
          id: "sample-1",
          isOriginal: true,
          verdict: "WA",
          durationMs: 12,
          input: "4 3\n1 3 3 3\n1 3 5",
          expected: "1 2 -1",
          actual: "1 3 -1",
          stderr: ""
        }
      ]
    });

    const dry = buildDryRunPrompt({
      runResult: run,
      studentCode: "while l <= r:\n    mid = (l + r) // 2\n    if a[mid] == x:\n        ans = mid + 1\n        break"
    });

    expect(dry.hasFailureEvidence).toBe(true);
    expect(dry.verdict).toBe("WA");
    expect(dry.stuckCategory).toBe("partial_wa");
    expect(dry.minimalInput).toContain("1 3 3 3");
    expect(dry.traceTableColumns).toContain("l");
    expect(dry.traceTableColumns).toContain("r");
    expect(dry.traceTableColumns).toContain("mid");
    expect(dry.suggestedMisconceptionIds).toContain("loop.off_by_one");
    expect(dry.suggestedMisconceptionIds).toContain("binary_search.boundary_invariant");
  });

  it("detects sentinel WA, unsigned underflow RE, binary search TLE, and CE", () => {
    const sentinelDry = buildDryRunPrompt({
      runResult: baseRun({
        cases: [
          {
            id: "s1",
            isOriginal: true,
            verdict: "WA",
            durationMs: 5,
            input: "1 2 3 0",
            expected: "3 2 1",
            actual: "0 3 2 1",
            stderr: ""
          }
        ]
      }),
      studentCode: "nums = list(map(int, input().split()))"
    });
    expect(sentinelDry.suggestedMisconceptionIds).toContain("input.sentinel_included");

    const reDry = buildDryRunPrompt({
      runResult: baseRun({
        language: "cpp",
        cases: [
          {
            id: "s2",
            isOriginal: true,
            verdict: "RE",
            durationMs: 3,
            input: "0",
            expected: "",
            actual: "",
            stderr: "Segmentation fault (SIGSEGV)"
          }
        ]
      }),
      studentCode: "for (int i = 0; i <= a.size() - 1; ++i) cout << a[i];"
    });
    expect(reDry.verdict).toBe("RE");
    expect(reDry.stuckCategory).toBe("implementation");
    expect(reDry.suggestedMisconceptionIds).toContain("loop.unsigned_underflow");

    const tleDry = buildDryRunPrompt({
      runResult: baseRun({
        cases: [
          {
            id: "s3",
            isOriginal: true,
            verdict: "TLE",
            durationMs: 3001,
            input: "2\n1 2",
            expected: "1",
            actual: "",
            stderr: ""
          }
        ]
      }),
      studentCode: "while l < r:\n    mid = (l + r) // 2\n    l = mid"
    });
    expect(tleDry.verdict).toBe("TLE");
    expect(tleDry.stuckCategory).toBe("tle");
    expect(tleDry.suggestedMisconceptionIds).toContain("binary_search.infinite_loop");

    const ceDry = buildDryRunPrompt({
      runResult: baseRun({
        compileOk: false,
        compileStderr: "solution.cpp:12:5: error: 'vec' was not declared in this scope"
      }),
      studentCode: "vec.push_back(1);"
    });
    expect(ceDry.verdict).toBe("CE");
    expect(ceDry.divergenceSummaryEn).toContain("was not declared");
  });
});

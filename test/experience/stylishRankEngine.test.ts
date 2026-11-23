import { describe, expect, it } from "vitest";
import type { LocalRunResult, OfficialVerdictEvent, ProblemSample } from "../../src/core/contracts";
import {
  formatStylishRankTooltip,
  hintCeilingForLevel,
  isHeaderOrFastIoTemplate,
  isValidCodingLine,
  PRE_SAMPLE_SCORE_CAP,
  rankFromScore,
  STYLISH_RANK_ORDER,
  STYLISH_RANK_TABLE,
  StylishRankEngine
} from "../../src/experience";

const EMOJI_RE = /\p{Extended_Pictographic}/u;

const BASE_ORIGINAL_SAMPLES: ProblemSample[] = [
  { id: "orig-1", input: "3\n1 2 3\n", expectedOutput: "6\n", isOriginal: true },
  { id: "orig-2", input: "2\n-5 5\n", expectedOutput: "0\n", isOriginal: true }
];

function makeRunResult(overrides: Partial<LocalRunResult> = {}): LocalRunResult {
  const cases = overrides.cases ?? [
    {
      id: "orig-1",
      isOriginal: true,
      verdict: "AC",
      durationMs: 12,
      input: "3\n1 2 3\n",
      expected: "6\n",
      actual: "6\n",
      stderr: ""
    },
    {
      id: "orig-2",
      isOriginal: true,
      verdict: "AC",
      durationMs: 11,
      input: "2\n-5 5\n",
      expected: "0\n",
      actual: "0\n",
      stderr: ""
    }
  ];
  const origCases = cases.filter((c) => c.isOriginal);
  const customCases = cases.filter((c) => !c.isOriginal);
  return {
    schemaVersion: "local-run/v2",
    source: "local_runner",
    problemKey: "warmup:stdio-sum",
    language: "cpp",
    mode: "stdio",
    codeHash: "hash-v1",
    compileOk: true,
    allPassed: cases.every((c) => c.verdict === "AC"),
    originalTotal: origCases.length,
    originalPassed: origCases.filter((c) => c.verdict === "AC").length,
    customTotal: customCases.length,
    customPassed: customCases.filter((c) => c.verdict === "AC").length,
    cases,
    memoryNote: "local-node-runner",
    timestamp: "2026-11-22T00:00:00.000Z",
    ...overrides
  };
}

function makeDistinctLines(count: number, prefix = "var"): string[] {
  return Array.from({ length: count }, (_, i) => `long long ${prefix}_${i} = arr[${i}] + ${i};`);
}

describe("StylishRankEngine (Neon #16 DMC Stylish Rank Contract)", () => {
  it("matches exact 7-tier table, score boundaries, and zero-Emoji monospace status labels", () => {
    expect(STYLISH_RANK_ORDER).toEqual(["D", "C", "B", "A", "S", "SS", "SSS"]);
    expect(STYLISH_RANK_TABLE.D.statusBarLabel).toBe("D · Draft");
    expect(STYLISH_RANK_TABLE.C.statusBarLabel).toBe("C · Clean");
    expect(STYLISH_RANK_TABLE.B.statusBarLabel).toBe("B · Built");
    expect(STYLISH_RANK_TABLE.A.statusBarLabel).toBe("A · Assert");
    expect(STYLISH_RANK_TABLE.S.statusBarLabel).toBe("S · Sharp");
    expect(STYLISH_RANK_TABLE.SS.statusBarLabel).toBe("SS · Surgical");
    expect(STYLISH_RANK_TABLE.SSS.statusBarLabel).toBe("SSS · Spotless");

    for (const rank of STYLISH_RANK_ORDER) {
      const label = STYLISH_RANK_TABLE[rank].statusBarLabel;
      expect(EMOJI_RE.test(label)).toBe(false);
      expect(label).not.toContain("[");
      expect(label).not.toContain("■");
    }

    expect(rankFromScore(0)).toBe("D");
    expect(rankFromScore(119)).toBe("D");
    expect(rankFromScore(120)).toBe("C");
    expect(rankFromScore(249)).toBe("C");
    expect(rankFromScore(250)).toBe("B");
    expect(rankFromScore(399)).toBe("B");
    expect(rankFromScore(400)).toBe("A");
    expect(rankFromScore(579)).toBe("A");
    expect(rankFromScore(580)).toBe("S");
    expect(rankFromScore(749)).toBe("S");
    expect(rankFromScore(750)).toBe("SS");
    expect(rankFromScore(899)).toBe("SS");
    expect(rankFromScore(900)).toBe("SSS");
    expect(rankFromScore(1000)).toBe("SSS");
  });

  it("enforces hand-typed validity, line caps (+360), word-accept (+64), micro-friction (+135), and pre-sample 399/B ceiling", () => {
    const engine = new StylishRankEngine({
      problemKey: "warmup:stdio-sum",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 1_000
    });

    // Invalid lines earn zero points
    expect(isValidCodingLine("")).toBe(false);
    expect(isValidCodingLine("// comment with many tokens")).toBe(false);
    expect(isValidCodingLine("# python comment")).toBe(false);
    expect(isValidCodingLine("i++;")).toBe(false); // < 6 non-ws chars
    expect(isValidCodingLine("abcdefghij")).toBe(false); // 1 lexical token
    expect(isValidCodingLine("}}}}}}};")).toBe(false); // no identifier/literal
    expect(isValidCodingLine("return ans")).toBe(true);

    // LSP errors block credit and C gate
    engine.recordHandTypedLines({
      lines: makeDistinctLines(5),
      lspErrorCount: 2,
      nowMs: 1_100
    });
    expect(engine.getState().score).toBe(0);
    expect(engine.getState().effectiveRank).toBe("D");

    // 7 distinct valid lines with 0 LSP errors -> 126 pts -> C (needs >= 3 lines) -> wait 7 lines >= 5 lines -> gate B, score 126 -> C
    engine.recordHandTypedLines({
      lines: makeDistinctLines(7),
      lspErrorCount: 0,
      nowMs: 1_200
    });
    expect(engine.getState().score).toBe(126);
    expect(engine.getState().effectiveRank).toBe("C");

    // Re-submitting identical lines earns 0 (duplicate anti-farming)
    engine.recordHandTypedLines({
      lines: makeDistinctLines(7),
      lspErrorCount: 0,
      nowMs: 1_300
    });
    expect(engine.getState().score).toBe(126);

    // 25 more distinct lines: hand-typed capped at +360 total (20 lines * 18)
    engine.recordHandTypedLines({
      lines: makeDistinctLines(25, "extra"),
      lspErrorCount: 0,
      nowMs: 1_400
    });
    expect(engine.getState().score).toBe(360);
    expect(engine.getState().effectiveRank).toBe("B");

    // Add word-by-word accepts (+8 x 10) and micro-friction (+45 x 4) -> still hard-locked at 399 (B) before passing samples
    for (let i = 0; i < 10; i += 1) {
      engine.recordGhostTextAccept({
        text: "push_back",
        shownAtMs: 1_500 + i * 100,
        acceptedAtMs: 1_520 + i * 100,
        mode: "word"
      });
    }
    for (let i = 0; i < 4; i += 1) {
      engine.recordMicroFrictionResult(true, 3_000 + i * 100);
    }
    expect(engine.getState().score).toBe(PRE_SAMPLE_SCORE_CAP);
    expect(engine.getState().effectiveRank).toBe("B");
    expect(engine.getState().gateCeiling).toBe("B");
  });

  it("progresses cleanly from D through C, B, A, S, SS to SSS · Spotless with first-try clean bonus and Official AC", () => {
    const engine = new StylishRankEngine({
      problemKey: "lc-cn:two-sum",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });

    // 14 valid hand-typed lines -> 252 pts (B · Built)
    const bTrans = engine.recordHandTypedLines({
      lines: makeDistinctLines(14),
      lspErrorCount: 0,
      nowMs: 1_000
    });
    expect(bTrans.currentRank).toBe("B");
    expect(bTrans.state.score).toBe(252);

    // First-try all-green local run: +400 (150+250) + 80 (First-Try Bonus) = +480 -> 732 (S · Sharp)
    const sTrans = engine.recordLocalRun(makeRunResult({ codeHash: "sol-1" }), { nowMs: 2_000 });
    expect(sTrans.milestonesAwarded).toEqual([
      "MILESTONE_PARTIAL_PASS",
      "MILESTONE_ALL_ORIGINAL_PASS",
      "MILESTONE_FIRST_TRY_CLEAN_BONUS"
    ]);
    expect(sTrans.state.score).toBe(732);
    expect(sTrans.currentRank).toBe("S");
    expect(sTrans.state.meta.statusBarLabel).toBe("S · Sharp");

    // Re-running identical passing code does NOT double-award milestones
    const repeatTrans = engine.recordLocalRun(makeRunResult({ codeHash: "sol-1" }), {
      nowMs: 3_000
    });
    expect(repeatTrans.scoreDelta).toBe(0);
    expect(repeatTrans.milestonesAwarded).toEqual([]);

    // Pass 1 distinct custom edge case -> +70 -> 802 (SS · Surgical)
    const ssTrans = engine.recordLocalRun(
      makeRunResult({
        codeHash: "sol-1",
        cases: [
          ...makeRunResult().cases,
          {
            id: "custom-1",
            isOriginal: false,
            verdict: "AC",
            durationMs: 5,
            input: "1\n0\n",
            expected: "0\n",
            actual: "0\n",
            stderr: ""
          }
        ]
      }),
      { nowMs: 4_000 }
    );
    expect(ssTrans.milestonesAwarded).toEqual(["MILESTONE_CUSTOM_EDGE_PASS"]);
    expect(ssTrans.state.score).toBe(802);
    expect(ssTrans.currentRank).toBe("SS");

    // Official AC -> +160 -> 962 (SSS · Spotless)
    const acEvent: OfficialVerdictEvent = {
      schemaVersion: "official-verdict/v2",
      source: "official_oj",
      problemKey: "lc-cn:two-sum",
      platform: "leetcode-cn",
      verdict: "AC",
      observedVia: "browser_extension",
      timestamp: "2026-11-22T00:01:00.000Z"
    };
    const sssTrans = engine.recordOfficialVerdict(acEvent, 5_000);
    expect(sssTrans.milestonesAwarded).toEqual(["MILESTONE_VERIFIED_SOLVE"]);
    expect(sssTrans.state.score).toBe(962);
    expect(sssTrans.currentRank).toBe("SSS");
    expect(sssTrans.state.meta.statusBarLabel).toBe("SSS · Spotless");
  });

  it("supports offline verified solve for SSS when all original + >= 2 custom edge cases pass", () => {
    const engine = new StylishRankEngine({
      problemKey: "warmup:binary-search-first",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      isOfflineOrReadOnly: true,
      now: () => 0
    });

    engine.recordHandTypedLines({ lines: makeDistinctLines(15), lspErrorCount: 0, nowMs: 1_000 }); // 270
    // First-try all green + 2 custom edge cases -> 270 + 480 + 140 = 890 (SS)
    engine.recordLocalRun(
      makeRunResult({
        cases: [
          ...makeRunResult().cases,
          {
            id: "custom-1",
            isOriginal: false,
            verdict: "AC",
            durationMs: 5,
            input: "1\n999999\n",
            expected: "999999\n",
            actual: "999999\n",
            stderr: ""
          },
          {
            id: "custom-2",
            isOriginal: false,
            verdict: "AC",
            durationMs: 5,
            input: "1\n-999999\n",
            expected: "-999999\n",
            actual: "-999999\n",
            stderr: ""
          }
        ]
      }),
      { nowMs: 2_000 }
    );
    expect(engine.getState().score).toBe(890);
    expect(engine.getState().effectiveRank).toBe("SS");

    // 3rd custom edge case does NOT add more points (cap 2 * 70 = 140)
    const thirdEdge = engine.recordLocalRun(
      makeRunResult({
        cases: [
          ...makeRunResult().cases,
          {
            id: "custom-3",
            isOriginal: false,
            verdict: "AC",
            durationMs: 5,
            input: "1\n42\n",
            expected: "42\n",
            actual: "42\n",
            stderr: ""
          }
        ]
      }),
      { nowMs: 2_500 }
    );
    expect(thirdEdge.scoreDelta).toBe(0);

    // Offline verified solve awards +160 (capped at 1000) and unlocks SSS
    const verified = engine.markOfflineVerifiedSolve(3_000);
    expect(verified.milestonesAwarded).toEqual(["MILESTONE_VERIFIED_SOLVE"]);
    expect(verified.state.score).toBe(1000);
    expect(verified.currentRank).toBe("SSS");
  });

  it("blocks S+ rank if original samples are deleted or modified (Original Sample Integrity)", () => {
    const engine = new StylishRankEngine({
      problemKey: "warmup:stdio-sum",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });

    engine.recordHandTypedLines({ lines: makeDistinctLines(18), lspErrorCount: 0, nowMs: 1_000 }); // 324

    // User deletes orig-2 and passes only orig-1 -> tampered!
    const deletedRun = engine.recordLocalRun(
      makeRunResult({
        codeHash: "h1",
        allPassed: true,
        originalTotal: 1,
        originalPassed: 1,
        cases: [makeRunResult().cases[0]!]
      }),
      { nowMs: 2_000 }
    );
    expect(deletedRun.milestonesAwarded).not.toContain("MILESTONE_ALL_ORIGINAL_PASS");
    expect(deletedRun.state.gateCeiling).toBe("A");
    expect(deletedRun.currentRank).toBe("A");
    expect(deletedRun.state.ceilingReason).toContain("Original samples modified");

    // User modifies orig-2's expected output to cheat -> still tampered!
    const alteredRun = engine.recordLocalRun(
      makeRunResult({
        codeHash: "h2",
        cases: [
          makeRunResult().cases[0]!,
          {
            ...makeRunResult().cases[1]!,
            expected: "999\n",
            actual: "999\n",
            verdict: "AC"
          }
        ]
      }),
      { nowMs: 3_000 }
    );
    expect(alteredRun.state.gateCeiling).toBe("A");
    expect(alteredRun.currentRank).toBe("A");
  });

  it("penalizes Blind Tab (fast <450ms or 3x drifting in 15s) and locks SS/SSS while sparing short tokens and Ctrl+Right", () => {
    const engine = new StylishRankEngine({
      problemKey: "warmup:stdio-sum",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });

    engine.recordHandTypedLines({ lines: makeDistinctLines(15), lspErrorCount: 0, nowMs: 1_000 }); // 270
    engine.recordLocalRun(makeRunResult({ codeHash: "h1" }), { nowMs: 2_000 }); // +480 -> 750 (S, needs custom/AC for SS)

    // Short 1-token boilerplate accepted quickly (< 450ms) -> NEVER penalized
    const shortAccept = engine.recordGhostTextAccept({
      text: "nullptr",
      shownAtMs: 2_500,
      acceptedAtMs: 2_600,
      mode: "full"
    });
    expect(shortAccept.penaltyTriggered).toBeUndefined();
    expect(shortAccept.state.blindTabCount).toBe(0);

    // Word-by-word accept quickly -> NEVER penalized (+8 pts)
    const wordAccept = engine.recordGhostTextAccept({
      text: "unordered_map<int, int>",
      shownAtMs: 2_700,
      acceptedAtMs: 2_750,
      mode: "word"
    });
    expect(wordAccept.penaltyTriggered).toBeUndefined();
    expect(wordAccept.state.blindTabCount).toBe(0);
    expect(wordAccept.scoreDelta).toBe(8);

    // Substantial completion (>= 16 chars) accepted in 200ms (< 450ms) -> Blind Tab (-120, blindTabCount=1)
    const fastBlind = engine.recordGhostTextAccept({
      text: "for (int i = 0; i < n; ++i) ans += a[i];",
      shownAtMs: 3_000,
      acceptedAtMs: 3_200,
      mode: "full"
    });
    expect(fastBlind.penaltyTriggered).toBe("blind_tab");
    expect(fastBlind.scoreDelta).toBe(-120);
    expect(fastBlind.state.blindTabCount).toBe(1);

    // Even with Official AC (+160 -> score 798 >= 750), Blind Tab permanently locks out SS/SSS (capped at S)
    const acAfterBlind = engine.recordOfficialVerdict(
      {
        schemaVersion: "official-verdict/v2",
        source: "official_oj",
        problemKey: "warmup:stdio-sum",
        platform: "codeforces",
        verdict: "AC",
        observedVia: "public_api",
        timestamp: "2026-11-22T00:05:00.000Z"
      },
      4_000
    );
    expect(acAfterBlind.state.score).toBe(798);
    expect(acAfterBlind.state.gateCeiling).toBe("S");
    expect(acAfterBlind.currentRank).toBe("S");

    // Drifting: 3 deliberate (>= 500ms) multi-token full accepts within 15s without manual edit
    const driftEngine = new StylishRankEngine({ problemKey: "p2", now: () => 0 });
    driftEngine.recordHandTypedLines({ lines: makeDistinctLines(10), lspErrorCount: 0, nowMs: 100 }); // 180
    driftEngine.recordGhostTextAccept({
      text: "int a = b + c + d;",
      shownAtMs: 1_000,
      acceptedAtMs: 2_000,
      mode: "full"
    });
    driftEngine.recordGhostTextAccept({
      text: "int e = f + g + h;",
      shownAtMs: 3_000,
      acceptedAtMs: 4_000,
      mode: "full"
    });
    const thirdDrift = driftEngine.recordGhostTextAccept({
      text: "int x = y + z + w;",
      shownAtMs: 5_000,
      acceptedAtMs: 6_000,
      mode: "full"
    });
    expect(thirdDrift.penaltyTriggered).toBe("blind_tab");
    expect(thirdDrift.state.blindTabCount).toBe(1);
    expect(thirdDrift.state.score).toBe(60);
  });

  it("caps micro-friction wrong penalty at -60 and never demotes from >= C back to D", () => {
    const engine = new StylishRankEngine({ problemKey: "p-mf", now: () => 0 });
    // 8 lines -> 144 pts (C · Clean)
    engine.recordHandTypedLines({ lines: makeDistinctLines(8), lspErrorCount: 0, nowMs: 1_000 });
    expect(engine.getState().effectiveRank).toBe("C");
    expect(engine.getState().score).toBe(144);

    // Wrong micro-friction: 144 - 60 = 84, but floored at 120 (C) -> NEVER drops to D
    const wrong = engine.recordMicroFrictionResult(false, 2_000);
    expect(wrong.penaltyTriggered).toBe("micro_friction_wrong");
    expect(wrong.state.score).toBe(120);
    expect(wrong.currentRank).toBe("C");
    expect(wrong.demoted).toBe(false);
  });

  it("detects Shotgun Run (3 fails in 60s with <5 char diff) -> -80 pts + 30s scoring freeze", () => {
    const engine = new StylishRankEngine({
      problemKey: "p-shotgun",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });

    engine.recordHandTypedLines({ lines: makeDistinctLines(15), lspErrorCount: 0, nowMs: 1_000 }); // 270 (B)

    const failCase = {
      ...makeRunResult().cases[0]!,
      verdict: "WA" as const,
      actual: "999\n"
    };
    const makeFail = (hash: string) =>
      makeRunResult({
        codeHash: hash,
        allPassed: false,
        originalPassed: 0,
        cases: [failCase, { ...makeRunResult().cases[1]!, verdict: "WA", actual: "1\n" }]
      });

    // 3 consecutive failed runs within 25s with 1-char edits
    engine.recordLocalRun(makeFail("h1"), { sourceCode: "int x = 1;", nowMs: 10_000 });
    engine.recordLocalRun(makeFail("h2"), { sourceCode: "int x = 2;", nowMs: 20_000 });
    const third = engine.recordLocalRun(makeFail("h3"), { sourceCode: "int x = 3;", nowMs: 30_000 });

    expect(third.penaltyTriggered).toBe("shotgun_run");
    expect(third.scoreDelta).toBe(-80);
    expect(third.state.score).toBe(190); // 270 - 80
    expect(third.state.frozenUntilMs).toBe(60_000);
    expect(third.demoted).toBe(true); // B -> C

    // During 30s freeze (t = 45_000): new valid hand-typed lines earn 0 points
    const duringFreeze = engine.recordHandTypedLines({
      lines: ["int frozenLineOne = arr[0] + 10;"],
      lspErrorCount: 0,
      nowMs: 45_000
    });
    expect(duringFreeze.scoreDelta).toBe(0);
    expect(duringFreeze.state.score).toBe(190);

    // After 30s freeze expires (t = 61_000): scoring resumes
    const afterFreeze = engine.recordHandTypedLines({
      lines: ["int unfrozenLine = arr[1] + 20;"],
      lspErrorCount: 0,
      nowMs: 61_000
    });
    expect(afterFreeze.scoreDelta).toBe(18);
    expect(afterFreeze.state.score).toBe(208);

    // Furthermore, failedRuns === 3 permanently disqualifies SSS (caps at SS)
    expect(afterFreeze.state.failedRuns).toBe(3);
  });

  it("enforces Paste Cap (-100 & ceiling C) while exempting pre-first-run header/fast-IO templates", () => {
    const cppHeaderAndFastIo = [
      "#include <bits/stdc++.h>",
      "using namespace std;",
      "using ll = long long;",
      "typedef pair<int, int> pii;",
      "const int MOD = 1000000007;",
      "inline long long read() {",
      "    long long x = 0, f = 1;",
      "    char ch = getchar();",
      "    while (ch < '0' || ch > '9') { if (ch == '-') f = -1; ch = getchar(); }",
      "    while (ch >= '0' && ch <= '9') { x = x * 10 + ch - '0'; ch = getchar(); }",
      "    return x * f;",
      "}"
    ].join("\n");

    expect(isHeaderOrFastIoTemplate(cppHeaderAndFastIo)).toBe(true);
    expect(
      isHeaderOrFastIoTemplate(
        "class Solution {\npublic:\n  int solve(vector<int>& a) { return a[0]; }\n};"
      )
    ).toBe(false);

    const engine = new StylishRankEngine({
      problemKey: "p-paste",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });

    // 1. Pre-first-run top-level header + fast-IO paste (> 6 lines, > 180 chars) -> EXEMPT (0 pts, no cap!)
    const headerPaste = engine.recordPaste({
      text: cppHeaderAndFastIo,
      inSolutionBody: false,
      nowMs: 1_000
    });
    expect(headerPaste.penaltyTriggered).toBeUndefined();
    expect(headerPaste.state.pasteCeiling).toBe("SSS");
    expect(headerPaste.scoreDelta).toBe(0);

    // 2. Plugin stub & undo/redo pastes are also exempt
    expect(
      engine.recordPaste({
        text: makeDistinctLines(10).join("\n"),
        source: "plugin_stub",
        nowMs: 1_500
      }).penaltyTriggered
    ).toBeUndefined();

    // 3. Hand-type and reach S · Sharp
    engine.recordHandTypedLines({ lines: makeDistinctLines(15), lspErrorCount: 0, nowMs: 2_000 });
    engine.recordLocalRun(makeRunResult({ codeHash: "clean-1" }), { nowMs: 3_000 });
    expect(engine.getState().effectiveRank).toBe("S");

    // 4. Pasting 6 lines of solution logic inside solution body -> -100 pts & pasteCeiling = C!
    const solutionPaste = engine.recordPaste({
      text: makeDistinctLines(6, "copied").join("\n"),
      inSolutionBody: true,
      nowMs: 4_000
    });
    expect(solutionPaste.penaltyTriggered).toBe("paste_cap");
    expect(solutionPaste.scoreDelta).toBe(-100);
    expect(solutionPaste.state.pasteCeiling).toBe("C");
    expect(solutionPaste.currentRank).toBe("C");
    expect(solutionPaste.demoted).toBe(true);

    // 5. Ratio > 35% also triggers Paste Cap even on a shorter (< 6 lines, < 180 chars) paste
    const ratioEngine = new StylishRankEngine({ problemKey: "p-ratio", now: () => 0 });
    const smallSolutionPaste = ratioEngine.recordPaste({
      text: "return dp[n][m] + ans;",
      inSolutionBody: true,
      totalSolutionChars: 50, // 22 / 50 = 44% > 35%
      nowMs: 1_000
    });
    expect(smallSolutionPaste.penaltyTriggered).toBe("paste_cap");
    expect(smallSolutionPaste.state.pasteCeiling).toBe("C");
  });

  it("enforces Hint Ceiling L0->SSS, L1-L2->SS, L3->A, L4->B, L5->C", () => {
    expect(hintCeilingForLevel(0)).toBe("SSS");
    expect(hintCeilingForLevel(1)).toBe("SS");
    expect(hintCeilingForLevel(2)).toBe("SS");
    expect(hintCeilingForLevel(3)).toBe("A");
    expect(hintCeilingForLevel(4)).toBe("B");
    expect(hintCeilingForLevel(5)).toBe("C");

    const engine = new StylishRankEngine({
      problemKey: "p-hint",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });
    engine.recordHandTypedLines({ lines: makeDistinctLines(15), lspErrorCount: 0, nowMs: 1_000 });
    engine.recordLocalRun(makeRunResult({ codeHash: "h1" }), { nowMs: 2_000 }); // 750
    engine.recordOfficialVerdict(
      {
        schemaVersion: "official-verdict/v2",
        source: "official_oj",
        problemKey: "p-hint",
        platform: "leetcode-cn",
        verdict: "AC",
        observedVia: "manual_report",
        timestamp: "2026-11-22T00:01:00.000Z"
      },
      3_000
    );
    expect(engine.getState().effectiveRank).toBe("SSS");

    engine.recordHintUsed(1, 4_000);
    expect(engine.getState().effectiveRank).toBe("SS");
    engine.recordHintUsed(2, 5_000);
    expect(engine.getState().effectiveRank).toBe("SS");
    engine.recordHintUsed(3, 6_000);
    expect(engine.getState().effectiveRank).toBe("A");
    engine.recordHintUsed(4, 7_000);
    expect(engine.getState().effectiveRank).toBe("B");
    engine.recordHintUsed(5, 8_000);
    expect(engine.getState().effectiveRank).toBe("C");
  });

  it("applies Think-Friendly Decay (0-90s zero, >90s -15/30s) and never demotes below current rank floor", () => {
    const engine = new StylishRankEngine({
      problemKey: "p-decay",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });
    engine.recordHandTypedLines({ lines: makeDistinctLines(10), lspErrorCount: 0, nowMs: 0 }); // 180
    engine.recordLocalRun(makeRunResult({ codeHash: "h1" }), { nowMs: 0 }); // +480 -> 660 (S, floor 580)
    expect(engine.getState().score).toBe(660);
    expect(engine.getState().effectiveRank).toBe("S");

    // 0..90s: zero decay
    expect(engine.applyIdleDecay(90_000).scoreDelta).toBe(0);
    expect(engine.getState().score).toBe(660);

    // 120s (90s + 30s = 1 tick): -15 -> 645
    const tick1 = engine.applyIdleDecay(120_000);
    expect(tick1.scoreDelta).toBe(-15);
    expect(tick1.state.score).toBe(645);

    // Calling again at same timestamp is idempotent
    expect(engine.applyIdleDecay(120_000).scoreDelta).toBe(0);

    // After 2 hours of quiet thinking: hard-locked at S floor (580), NEVER demotes to A
    const longThink = engine.applyIdleDecay(2 * 60 * 60 * 1_000);
    expect(longThink.state.score).toBe(580);
    expect(longThink.currentRank).toBe("S");
    expect(longThink.demoted).toBe(false);
  });

  it("generates zero-Emoji hover tooltip with score, next rank, ceilings, and freeze status", () => {
    const engine = new StylishRankEngine({
      problemKey: "p-tip",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });
    engine.recordHandTypedLines({ lines: makeDistinctLines(14), lspErrorCount: 0, nowMs: 1_000 });
    engine.recordLocalRun(makeRunResult({ codeHash: "h1" }), { nowMs: 2_000 });
    engine.recordHintUsed(2, 3_000);

    const zhTooltip = formatStylishRankTooltip(engine.getState(), { locale: "zh-CN", nowMs: 3_000 });
    const enTooltip = engine.getTooltip("en-US", 3_000);

    expect(zhTooltip).toContain("S · Sharp");
    expect(zhTooltip).toContain("732 / 1000");
    expect(zhTooltip).toContain("SS · Surgical");
    expect(zhTooltip).toContain("提示上限 SS");
    expect(EMOJI_RE.test(zhTooltip)).toBe(false);

    expect(enTooltip).toContain("S · Sharp — 732 / 1000");
    expect(enTooltip).toContain("Next rank: SS · Surgical");
    expect(EMOJI_RE.test(enTooltip)).toBe(false);
  });

  it("enforces structural gates (<3 lines blocks C, <5 lines blocks B, failedRuns > 2 blocks SSS)", () => {
    const engine = new StylishRankEngine({
      problemKey: "p-gates",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });

    // Only 2 lines (+36) + 2 micro-friction (+90) = 126 pts (score rank C), but < 3 lines -> gateCeiling D
    engine.recordHandTypedLines({ lines: makeDistinctLines(2), lspErrorCount: 0, nowMs: 1_000 });
    engine.recordMicroFrictionResult(true, 1_100);
    engine.recordMicroFrictionResult(true, 1_200);
    expect(engine.getState().score).toBe(126);
    expect(engine.getState().gateCeiling).toBe("D");
    expect(engine.getState().effectiveRank).toBe("D");

    // Add 2 more lines (total 4 valid lines) + 1 more micro-friction + 8 word accepts -> score >= 250 (B), but < 5 lines -> gateCeiling C
    engine.recordHandTypedLines({ lines: makeDistinctLines(2, "more"), lspErrorCount: 0, nowMs: 1_300 });
    engine.recordMicroFrictionResult(true, 1_400);
    for (let i = 0; i < 8; i += 1) {
      engine.recordGhostTextAccept({
        text: "size",
        shownAtMs: 1_500 + i * 10,
        acceptedAtMs: 1_505 + i * 10,
        mode: "word"
      });
    }
    expect(engine.getState().score).toBeGreaterThanOrEqual(250);
    expect(engine.getState().gateCeiling).toBe("C");
    expect(engine.getState().effectiveRank).toBe("C");

    // 5th line unlocks B; LSP error re-locks to D until fixed
    engine.recordHandTypedLines({ lines: makeDistinctLines(1, "fifth"), lspErrorCount: 0, nowMs: 2_000 });
    expect(engine.getState().effectiveRank).toBe("B");
    engine.updateDiagnostics(1, 2_100);
    expect(engine.getState().gateCeiling).toBe("D");
    expect(engine.getState().effectiveRank).toBe("D");
    engine.updateDiagnostics(0, 2_200);
    expect(engine.getState().effectiveRank).toBe("B");

    // 3 failed runs (> 2) with substantive code changes (no shotgun), then all pass + Official AC -> capped at SS (not SSS)
    const makeFail = (hash: string) =>
      makeRunResult({
        codeHash: hash,
        allPassed: false,
        originalPassed: 0,
        cases: [
          { ...makeRunResult().cases[0]!, verdict: "WA", actual: "1\n" },
          { ...makeRunResult().cases[1]!, verdict: "WA", actual: "1\n" }
        ]
      });
    engine.recordLocalRun(makeFail("f1"), { codeNetChangeChars: 20, nowMs: 3_000 });
    engine.recordLocalRun(makeFail("f2"), { codeNetChangeChars: 20, nowMs: 4_000 });
    engine.recordLocalRun(makeFail("f3"), { codeNetChangeChars: 20, nowMs: 5_000 });

    engine.recordHandTypedLines({ lines: makeDistinctLines(10, "fix"), lspErrorCount: 0, nowMs: 6_000 });
    engine.recordLocalRun(makeRunResult({ codeHash: "pass-all" }), { nowMs: 7_000 });
    const acRes = engine.recordOfficialVerdict(
      {
        schemaVersion: "official-verdict/v2",
        source: "official_oj",
        problemKey: "p-gates",
        platform: "atcoder",
        verdict: "AC",
        observedVia: "manual_report",
        timestamp: "2026-11-22T00:05:00.000Z"
      },
      8_000
    );

    expect(acRes.state.score).toBeGreaterThanOrEqual(900);
    expect(acRes.state.failedRuns).toBe(3);
    expect(acRes.state.gateCeiling).toBe("SS");
    expect(acRes.currentRank).toBe("SS");
    expect(acRes.state.ceilingReason).toContain("SSS requires <= 2");
  });

  it("handles two-step partial (+150) then all-green (+250, no first-try bonus) and requires codeHash change after fail", () => {
    const engine = new StylishRankEngine({
      problemKey: "p-two-step",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });

    // Run 1: partial pass (1/2) -> +150 pts, failedRuns = 1
    const partial = engine.recordLocalRun(
      makeRunResult({
        codeHash: "h1",
        allPassed: false,
        originalPassed: 1,
        cases: [
          makeRunResult().cases[0]!,
          { ...makeRunResult().cases[1]!, verdict: "WA", actual: "99\n" }
        ]
      }),
      { nowMs: 1_000 }
    );
    expect(partial.milestonesAwarded).toEqual(["MILESTONE_PARTIAL_PASS"]);
    expect(partial.state.score).toBe(150);

    // Run 2 with IDENTICAL codeHash after fail -> rejected for all-original milestone
    const sameHash = engine.recordLocalRun(makeRunResult({ codeHash: "h1" }), { nowMs: 2_000 });
    expect(sameHash.milestonesAwarded).toEqual([]);
    expect(sameHash.state.score).toBe(150);

    // Run 3 with changed codeHash -> +250 pts (no +80 first-try bonus because prior fail occurred)
    const allGreen = engine.recordLocalRun(makeRunResult({ codeHash: "h2" }), { nowMs: 3_000 });
    expect(allGreen.milestonesAwarded).toEqual(["MILESTONE_ALL_ORIGINAL_PASS"]);
    expect(allGreen.state.score).toBe(400);
  });

  it("exempts Python fast-IO template before first run, but enforces Paste Cap after first run and clears Drifting on manual edit", () => {
    const pyTemplate = [
      "import sys",
      "from collections import defaultdict, deque",
      "from bisect import bisect_left",
      "input = sys.stdin.readline",
      "sys.setrecursionlimit(200000)",
      "def fast_read():",
      "    return list(map(int, input().split()))"
    ].join("\n");
    expect(isHeaderOrFastIoTemplate(pyTemplate)).toBe(true);

    const engine = new StylishRankEngine({
      problemKey: "p-py-exempt",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });

    // Exempt before first run
    expect(
      engine.recordPaste({ text: pyTemplate, inSolutionBody: false, nowMs: 1_000 }).penaltyTriggered
    ).toBeUndefined();

    // Manual edit breaks Ghost Text Drifting streak
    engine.recordGhostTextAccept({
      text: "int a = b + c + d;",
      shownAtMs: 2_000,
      acceptedAtMs: 3_000,
      mode: "full"
    });
    engine.recordGhostTextAccept({
      text: "int e = f + g + h;",
      shownAtMs: 4_000,
      acceptedAtMs: 5_000,
      mode: "full"
    });
    engine.recordHandTypedLines({
      lines: ["int manualBridge = a + e;"],
      lspErrorCount: 0,
      nowMs: 5_500
    });
    const afterManual = engine.recordGhostTextAccept({
      text: "int x = y + z + w;",
      shownAtMs: 6_000,
      acceptedAtMs: 7_000,
      mode: "full"
    });
    expect(afterManual.penaltyTriggered).toBeUndefined();
    expect(afterManual.state.blindTabCount).toBe(0);

    // After first run, pasting large block is NO LONGER exempt even if header-like
    engine.recordLocalRun(makeRunResult({ codeHash: "run-1" }), { nowMs: 8_000 });
    const postRunPaste = engine.recordPaste({
      text: pyTemplate,
      inSolutionBody: false,
      nowMs: 9_000
    });
    expect(postRunPaste.penaltyTriggered).toBe("paste_cap");
    expect(postRunPaste.state.pasteCeiling).toBe("C");
  });

  it("exempts single-line placeholder accepts from fast Blind Tab penalty and skips skippedReason runs", () => {
    const engine = new StylishRankEngine({
      problemKey: "p-exempt-skip",
      originalSamples: BASE_ORIGINAL_SAMPLES,
      now: () => 0
    });

    const placeholderAccept = engine.recordGhostTextAccept({
      text: "if (/* 条件 */) return ans;",
      shownAtMs: 1_000,
      acceptedAtMs: 1_200,
      mode: "full"
    });
    expect(placeholderAccept.penaltyTriggered).toBeUndefined();
    expect(placeholderAccept.state.blindTabCount).toBe(0);

    const skippedRes = engine.recordLocalRun(
      makeRunResult({
        compileOk: false,
        allPassed: false,
        skippedReason: "missing_toolchain",
        cases: []
      }),
      { nowMs: 2_000 }
    );
    expect(skippedRes.state.failedRuns).toBe(0);
    expect(skippedRes.state.score).toBe(0);
    expect(skippedRes.penaltyTriggered).toBeUndefined();
  });
});

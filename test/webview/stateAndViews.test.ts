import { describe, expect, it, vi } from "vitest";
import type { SidebarStateSnapshot } from "../../src/core/contracts";
import { renderAppShell } from "../../src/webview/main";
import {
  appendCoachStreamDelta,
  applyStateSync,
  clearDirtyAiDrafts,
  createInitialSnapshot,
  createInitialWebviewState,
  escapeHtml,
  escapeMultilineHtml,
  sanitizeExternalUrl,
  setActiveTab,
  setDraftValue,
  setGiveUpConfirmPending,
  WebviewStore
} from "../../src/webview/state";
import { renderCoachView } from "../../src/webview/views/coachView";
import { renderDossierView } from "../../src/webview/views/dossierView";
import { renderProblemsView } from "../../src/webview/views/problemsView";
import { renderSettingsView } from "../../src/webview/views/settingsView";
import { renderWorkspaceView } from "../../src/webview/views/workspaceView";

function makeRichSnapshot(): SidebarStateSnapshot {
  const base = createInitialSnapshot();
  return {
    ...base,
    activeProblem: {
      schemaVersion: "problem-doc/v2",
      problemKey: "codeforces:1900A",
      source: "codeforces",
      sourceId: "1900A",
      canonicalUrl: "https://codeforces.com/problemset/problem/1900/A",
      title: 'Cover in Water <script>alert("xss")</script>',
      locale: "en-US",
      completeness: "full",
      ioMode: "stdio",
      statementMarkdown: "Line1\n<img src=x onerror=alert(1)>",
      samples: [
        { id: "s1", input: "3\n...", expectedOutput: "2\n", isOriginal: true },
        { id: "c1", input: "1\n.", expectedOutput: "1\n", isOriginal: false }
      ],
      constraints: { timeLimitMs: 1000, memoryLimitMb: 256 },
      difficulty: { rawLabel: "800", numericRating: 800, normalizedTier: 1 },
      rawTags: ["greedy"],
      conceptTags: ["greedy"],
      provenance: { ingestChannel: "builtin-adapter", fetchedAt: "2026-11-22T00:00:00Z" }
    },
    activeLanguage: "cpp",
    problems: [
      {
        schemaVersion: "problem-doc/v2",
        problemKey: "codeforces:1900A",
        source: "codeforces",
        sourceId: "1900A",
        title: "Cover in Water",
        locale: "en-US",
        completeness: "full",
        ioMode: "stdio",
        samples: [{ id: "s1", input: "3\n...", expectedOutput: "2\n", isOriginal: true }],
        rawTags: ["greedy"],
        provenance: { ingestChannel: "builtin-adapter", fetchedAt: "2026-11-22T00:00:00Z" }
      }
    ],
    lastRun: {
      schemaVersion: "local-run/v2",
      source: "local_runner",
      problemKey: "codeforces:1900A",
      language: "cpp",
      mode: "stdio",
      codeHash: "abc123",
      compileOk: true,
      allPassed: false,
      originalTotal: 1,
      originalPassed: 0,
      customTotal: 1,
      customPassed: 1,
      cases: [
        {
          id: "s1",
          isOriginal: true,
          verdict: "WA",
          durationMs: 14,
          input: "3\n...",
          expected: "2\n",
          actual: "3\n<script>bad()</script>",
          stderr: "",
          diffSummary: "Line 1 differs"
        },
        {
          id: "c1",
          isOriginal: false,
          verdict: "AC",
          durationMs: 9,
          input: "1\n.",
          expected: "1\n",
          actual: "1\n",
          stderr: ""
        }
      ],
      memoryNote: "Peak RSS best-effort",
      timestamp: "2026-11-22T00:01:00Z"
    },
    stylishRank: {
      problemKey: "codeforces:1900A",
      score: 680,
      effectiveRank: "S",
      meta: {
        rank: "S",
        codeName: "Sharp",
        zhName: "锋利",
        minScore: 650,
        maxScore: 799,
        statusBarLabel: "S · Sharp"
      },
      hintCeiling: "S",
      pasteCeiling: "SSS",
      gateCeiling: "SSS",
      ceilingReason: "L1 hint ceiling",
      blindTabCount: 0,
      failedRuns: 1,
      originalSamplesPassed: 0,
      originalSamplesTotal: 1,
      customEdgePassedCount: 1,
      officialAc: false,
      frozenUntilMs: 0,
      lastEventSummary: "Verified edge case"
    },
    hintLevel: 2,
    coachHistory: [
      {
        action: "hint",
        hintLevel: 2,
        strictness: "standard",
        headline: "Check consecutive empty cells",
        guidance: 'Observe <b>"..."</b><script>evil()</script>',
        guidingQuestion: "What happens once you have 3 empty cells in a row?",
        misconceptionIds: ["off_by_one"],
        conceptTags: ["greedy"],
        spoilerSafe: true,
        violations: [],
        audit: {
          route: "coach",
          language: "cpp",
          renderer: "chat-messages",
          includedRuleIds: ["r1", "r2"],
          excludedRules: [],
          projectedItems: [
            {
              id: "m1",
              kind: "active_misconception",
              label: "Boundary off-by-one on consecutive segments",
              sourceKey: "off_by_one",
              muteable: true
            },
            {
              id: "c1",
              kind: "concept_level",
              label: "greedy: tier 2",
              muteable: false
            }
          ],
          characterBudgetUsed: 92,
          characterBudgetMax: 400
        }
      }
    ],
    learnerSnapshot: {
      schemaVersion: "2.0",
      derivedAt: "2026-11-22T12:00:00Z",
      totalTerminalEvents: 4,
      conceptMastery: {
        "array.binary_search": {
          conceptTag: "array.binary_search",
          attemptedCount: 5,
          independentAcCount: 4,
          assistedAcCount: 1,
          highestIndependentTier: 3,
          masteryScore: 0.82,
          fsrsCard: {
            due: "2026-11-25T00:00:00Z",
            stability: 4,
            difficulty: 5,
            elapsedDays: 1,
            scheduledDays: 4,
            reps: 3,
            lapses: 0,
            state: 2
          }
        }
      },
      mistakeNotebook: {
        "codeforces:1900A": {
          problemKey: "codeforces:1900A",
          title: "Cover in Water",
          conceptTags: ["greedy"],
          difficultyTier: 1,
          lastStatus: "unresolved",
          misconceptionIds: ["off_by_one"],
          takeaway: "Count segments of length >= 3",
          lastAttemptAt: "2026-11-21T10:00:00Z",
          fsrsCard: {
            due: "2026-11-22T08:00:00Z",
            stability: 1,
            difficulty: 6,
            elapsedDays: 1,
            scheduledDays: 1,
            reps: 1,
            lapses: 1,
            state: 1
          }
        }
      },
      misconceptionStats: {
        off_by_one: {
          misconceptionId: "off_by_one",
          recentWeightedCount: 2.5,
          uniqueProblemKeys: ["codeforces:1900A"],
          lastSeenAt: "2026-11-21T10:00:00Z",
          muted: false
        }
      },
      recentTrajectory: {
        last7dAttempts: 6,
        independentAcRate: 0.67,
        avgHintLevel: 1.5
      }
    },
    recommendations: [
      {
        problemKey: "codeforces:1900A",
        title: "Cover in Water",
        bucket: "fsrs_due",
        difficultyTier: 1,
        score: 0.95,
        rationale: "Due for FSRS recall"
      },
      {
        problemKey: "leetcode-cn:binary-search",
        title: "Binary Search",
        bucket: "targeted_transfer",
        targetTag: "array.binary_search",
        difficultyTier: 2,
        score: 0.8,
        rationale: "Transfer binary search invariant"
      }
    ],
    bridgeStatus: { listening: true, port: 27121 },
    toolchains: [
      { language: "cpp", available: true, command: "g++", version: "13.2.0", installHint: "" },
      { language: "rust", available: false, installHint: "Install rustup" }
    ],
    lastHealthCheck: {
      ranAt: "2026-11-22T00:00:00Z",
      ok: false,
      steps: [
        { step: "models", ok: true, latencyMs: 110, message: "2 models found" },
        { step: "chat", ok: true, latencyMs: 240, message: "Chat ok" },
        {
          step: "fim",
          ok: false,
          latencyMs: 90,
          code: "deepseek-fim-beta-required",
          message: "DeepSeek FIM requires /beta endpoint",
          remediation: "Set FIM baseUrl to https://api.deepseek.com/beta"
        }
      ]
    }
  };
}

describe("escapeHtml & URL sanitization XSS defenses", () => {
  it("escapes all HTML special characters including quotes and backticks", () => {
    const payload = `<script>alert("x" & 'y' + \`z\`)</script>`;
    const escaped = escapeHtml(payload);
    expect(escaped).toBe(
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39; + &#96;z&#96;)&lt;/script&gt;"
    );
    expect(escaped).not.toContain("<script>");
  });

  it("escapes multiline payloads before inserting <br>", () => {
    const out = escapeMultilineHtml("<img onerror=alert(1)>\nline2");
    expect(out).toBe("&lt;img onerror=alert(1)&gt;<br>line2");
  });

  it("blocks javascript: and data: URLs while allowing https URLs", () => {
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeExternalUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(sanitizeExternalUrl("https://leetcode.cn/problems/two-sum/")).toBe(
      "https://leetcode.cn/problems/two-sum/"
    );
  });
});

describe("WebviewState & WebviewStore immutable transitions", () => {
  it("accumulates streaming deltas per requestId and resets when coachBusy becomes false", () => {
    let state = createInitialWebviewState();
    state = appendCoachStreamDelta(state, "req-1", "Step 1: ");
    state = appendCoachStreamDelta(state, "req-1", "Check bounds.");
    expect(state.stream).toEqual({ requestId: "req-1", text: "Step 1: Check bounds." });

    state = appendCoachStreamDelta(state, "req-2", "New response");
    expect(state.stream).toEqual({ requestId: "req-2", text: "New response" });

    const syncedBusy = applyStateSync(state, { ...state.snapshot, coachBusy: true });
    expect(syncedBusy.stream?.text).toBe("New response");

    const syncedDone = applyStateSync(syncedBusy, { ...state.snapshot, coachBusy: false });
    expect(syncedDone.stream).toBeNull();
  });

  it("supports silent draft updates without notifying render subscribers and clears dirty AI fields", () => {
    const store = new WebviewStore(createInitialWebviewState());
    const listener = vi.fn();
    store.subscribe(listener);

    store.updateSilent((prev) => setDraftValue(prev, "ai.chat.apiKey", "sk-secret"));
    expect(listener).not.toHaveBeenCalled();
    expect(store.getState().drafts["ai.chat.apiKey"]).toBe("sk-secret");
    expect(store.getState().dirtyAiFields["ai.chat.apiKey"]).toBe(true);

    store.update((prev) => clearDirtyAiDrafts(prev));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().drafts["ai.chat.apiKey"]).toBeUndefined();
    expect(store.getState().dirtyAiFields).toEqual({});
  });

  it("clears giveUp confirmation when switching tabs or changing active problem", () => {
    let state = createInitialWebviewState(makeRichSnapshot());
    state = setGiveUpConfirmPending(state, true);
    expect(state.giveUpConfirmPending).toBe(true);

    const switched = setActiveTab(state, "dossier");
    expect(switched.giveUpConfirmPending).toBe(false);

    const changedProblem = applyStateSync(state, {
      ...state.snapshot,
      activeProblem: { ...state.snapshot.activeProblem!, problemKey: "luogu:P1001" }
    });
    expect(changedProblem.giveUpConfirmPending).toBe(false);
  });
});

describe("5 sidebar views rendering, feature gating, and XSS safety", () => {
  it("workspaceView renders rank badge, WA diff, verdict bar, CF sync, and escapes XSS", () => {
    const snap = makeRichSnapshot();
    const html = renderWorkspaceView(createInitialWebviewState(snap));

    expect(html).toContain("S · Sharp");
    expect(html).toContain("L1 hint ceiling");
    expect(html).toContain("ac-diff-del");
    expect(html).toContain("ac-diff-add");
    expect(html).toContain('data-action="submit-verdict" data-verdict="AC"');
    expect(html).toContain('data-action="submit-sync-cf"');
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<script>bad()");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");

    // Respects stylishRankEnabled: false
    const hiddenRankHtml = renderWorkspaceView(
      createInitialWebviewState({
        ...snap,
        flags: { ...snap.flags, stylishRankEnabled: false }
      })
    );
    expect(hiddenRankHtml).not.toContain("S · Sharp");
  });

  it("problemsView gates Starter 3-Problem Warmup Pack behind starterPackEnabled", () => {
    const snap = makeRichSnapshot();
    const hiddenHtml = renderProblemsView(createInitialWebviewState(snap));
    expect(hiddenHtml).not.toContain('data-action="starter-load-warmup"');
    expect(hiddenHtml).toContain("127.0.0.1:27121");
    expect(hiddenHtml).toContain("Hot 100");

    const shownHtml = renderProblemsView(
      createInitialWebviewState({
        ...snap,
        flags: { ...snap.flags, starterPackEnabled: true }
      })
    );
    expect(shownHtml).toContain('data-action="starter-load-warmup"');
    expect(shownHtml).toContain('data-action="starter-open-walkthrough"');
  });

  it("coachView gates Pattern Mapper, escapes LLM XSS, and renders audit receipt with mute button", () => {
    const snap = makeRichSnapshot();
    const html = renderCoachView(createInitialWebviewState(snap));

    expect(html).toContain("L1");
    expect(html).toContain("L5");
    expect(html).toContain('data-action="coach-pattern-map"');
    expect(html).toContain('data-action="coach-dry-run"');
    expect(html).toContain('data-action="learner-mute-misconception"');
    expect(html).toContain('data-misconception-id="off_by_one"');
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).toContain("&lt;script&gt;evil()&lt;/script&gt;");

    const noPatternHtml = renderCoachView(
      createInitialWebviewState({
        ...snap,
        flags: { ...snap.flags, patternMapperEnabled: false }
      })
    );
    expect(noPatternHtml).not.toContain('data-action="coach-pattern-map"');

    const armedHtml = renderCoachView(setGiveUpConfirmPending(createInitialWebviewState(snap), true));
    expect(armedHtml).toContain('data-action="coach-giveup-confirm"');
  });

  it("dossierView renders FSRS due items, concept mastery table, misconceptions, 3-bucket recs, and code habits", () => {
    const html = renderDossierView(createInitialWebviewState(makeRichSnapshot()));
    expect(html).toContain("array.binary_search");
    expect(html).toContain("82%");
    expect(html).toContain("off_by_one");
    expect(html).toContain('data-action="learner-mute-misconception"');
    expect(html).toContain("Binary Search");
    expect(html).toContain('data-action="habit-add"');
  });

  it("settingsView renders presets, atomic switches, audio unlock button, DeepSeek /beta helper, health check, and toolchains", () => {
    const html = renderSettingsView(createInitialWebviewState(makeRichSnapshot()));
    expect(html).toContain('data-action="preset-select" data-preset="starter"');
    expect(html).toContain('data-action="preset-select" data-preset="focus"');
    expect(html).toContain('data-action="preset-select" data-preset="contest"');
    expect(html).toContain('data-action="audio-preview-unlock"');
    expect(html).toContain('data-action="ai-fill-deepseek"');
    expect(html).toContain("deepseek-fim-beta-required");
    expect(html).toContain("g++");
    expect(html).toContain("Install rustup");

    const shell = renderAppShell(setActiveTab(createInitialWebviewState(makeRichSnapshot()), "settings"));
    expect(shell).toContain('role="tablist"');
  });
});

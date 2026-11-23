import { afterEach, describe, expect, it, vi } from "vitest";
import type { SidebarStateSnapshot } from "../../src/core/contracts";
import { ojIconImg, rankCrestImg, setAssetsBaseUri } from "../../src/webview/assets";
import { buildRenderCache, mountWebview, planSidebarPatch, renderAppShell } from "../../src/webview/main";
import { mountReaderWebview, renderReaderShell } from "../../src/webview/readerMain";
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

  it("problemsView gates Starter 3-Problem Warmup Pack behind starterPackEnabled in Sheets sub-tab", () => {
    const snap = makeRichSnapshot();
    const savedHtml = renderProblemsView(createInitialWebviewState(snap));
    expect(savedHtml).toContain("127.0.0.1:27121");
    expect(savedHtml).toContain('data-action="sub-tab" data-sub-key="problems" data-sub-val="sheets"');

    const hiddenSheetsHtml = renderProblemsView({
      ...createInitialWebviewState(snap),
      drafts: { "sub.problems": "sheets" }
    });
    expect(hiddenSheetsHtml).not.toContain('data-action="starter-load-warmup"');
    expect(hiddenSheetsHtml).toContain("127.0.0.1:27121");
    expect(hiddenSheetsHtml).toContain("Hot 100");

    const shownSheetsHtml = renderProblemsView({
      ...createInitialWebviewState({
        ...snap,
        flags: { ...snap.flags, starterPackEnabled: true }
      }),
      drafts: { "sub.problems": "sheets" }
    });
    expect(shownSheetsHtml).toContain('data-action="starter-load-warmup"');
    expect(shownSheetsHtml).toContain('data-action="starter-open-walkthrough"');
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

  it("dossierView renders pure analytics (concept mastery, misconceptions, recentEvents void) while Today Plan lives in Problems and Habits in Settings", () => {
    const snap = makeRichSnapshot();
    snap.recentEvents = [
      { eventId: "ev-1", title: "Cover in Water", verdict: "AC", timestamp: "2026-11-23T04:00:00.000Z" }
    ];
    const html = renderDossierView(createInitialWebviewState(snap));
    expect(html).toContain("array.binary_search");
    expect(html).toContain("82%");
    expect(html).toContain("off_by_one");
    expect(html).toContain('data-action="learner-mute-misconception"');
    expect(html).toContain('data-action="learner-void-id" data-event-id="ev-1"');
    expect(html).not.toContain('data-action="habit-add"');

    const todayHtml = renderProblemsView({
      ...createInitialWebviewState(snap),
      drafts: { "sub.problems": "today" }
    });
    expect(todayHtml).toContain("Binary Search");
    expect(todayHtml).toContain("Cover in Water");

    const expSettingsHtml = renderSettingsView({
      ...createInitialWebviewState(snap),
      drafts: { "sub.settings": "exp" }
    });
    expect(expSettingsHtml).toContain('data-action="habit-add"');
  });

  it("settingsView renders presets, env sub-tab (DeepSeek/Ollama/CF/toolchains), and exp sub-tab (flags/habits/audio)", () => {
    const snap = makeRichSnapshot();
    const envHtml = renderSettingsView(createInitialWebviewState(snap));
    expect(envHtml).toContain('data-action="preset-select" data-preset="starter"');
    expect(envHtml).toContain('data-action="preset-select" data-preset="focus"');
    expect(envHtml).toContain('data-action="preset-select" data-preset="contest"');
    expect(envHtml).toContain('data-action="ai-fill-deepseek"');
    expect(envHtml).toContain('data-action="ai-fill-ollama"');
    expect(envHtml).toContain('data-draft="ai.codeforcesHandle"');
    expect(envHtml).toContain("deepseek-fim-beta-required");
    expect(envHtml).toContain("g++");
    expect(envHtml).toContain("Install rustup");

    const expHtml = renderSettingsView({
      ...createInitialWebviewState(snap),
      drafts: { "sub.settings": "exp" }
    });
    expect(expHtml).toContain('data-action="audio-preview-unlock"');
    expect(expHtml).toContain('data-drawer="settings-habits"');

    const shell = renderAppShell(setActiveTab(createInitialWebviewState(snap), "settings"));
    expect(shell).toContain('role="tablist"');
    expect(shell).toContain('class="tab tab-gear tab-a"');
  });

  it("renders compact Problem Anchor collapsed by default (samples above rank), DMC rank plaque, failure-loop buttons, and full untruncated Markdown+Math when expanded", () => {
    const snap = makeRichSnapshot();
    const longTail = "TAIL_MARKER_BEYOND_2400";
    snap.activeProblem = {
      ...snap.activeProblem!,
      statementMarkdown: `### 题目描述\n给定 $1 \\le n \\le 10^5$。\n\n${"数据描述。".repeat(600)}\n\n${longTail}`
    };
    snap.stylishRank = {
      ...snap.stylishRank!,
      effectiveRank: "B",
      score: 320,
      ceilingReason: "Pass >= 1 original sample to unlock A"
    };

    const collapsedHtml = renderWorkspaceView(createInitialWebviewState(snap));
    expect(collapsedHtml).toContain('data-action="problem-open-reader"');
    expect(collapsedHtml).toContain('data-action="toggle-panel" data-panel="stmtFull"');
    expect(collapsedHtml).toContain('data-action="coach-dry-run-case"');
    expect(collapsedHtml).toContain('data-action="coach-hint-case"');
    expect(collapsedHtml).toContain('data-action="copy-text"');
    expect(collapsedHtml).toContain("rk-rail");
    expect(collapsedHtml).toContain("需通过原题样例解锁 A · 破题");
    expect(collapsedHtml).not.toContain('class="stmt-box');
    // Samples card comes before Rank card for immediate first-screen actionability
    expect(collapsedHtml.indexOf('data-patch="samples-card"')).toBeLessThan(
      collapsedHtml.indexOf('data-patch="rank-card"')
    );

    const expandedHtml = renderWorkspaceView({
      ...createInitialWebviewState(snap),
      panels: { stmtFull: true }
    });
    expect(expandedHtml).toContain("&le;");
    expect(expandedHtml).toContain("<sup>5</sup>");
    expect(expandedHtml).toContain(longTail);
    expect(expandedHtml).not.toContain("<details class=\"dt\"");
  });

  it("plans non-destructive partial DOM patches when rank or toast changes without touching problem statement", () => {
    const snap = makeRichSnapshot();
    const state1 = createInitialWebviewState(snap);
    const cache1 = buildRenderCache(state1);

    // Background rank score tick on workspace tab -> ONLY rank-card changes, problem-card is untouched!
    const state2 = applyStateSync(state1, {
      ...snap,
      stylishRank: { ...snap.stylishRank!, score: 712 }
    });
    const planRank = planSidebarPatch(cache1, state2);
    expect(planRank.mode).toBe("workspace-regions");
    expect(planRank.changedRegions).toEqual(["rank-card"]);
    expect(planRank.changedRegions).not.toContain("problem-card");

    // Background rank tick while user is reading Coach tab -> pure noop, zero DOM mutation!
    const coachState1 = setActiveTab(state1, "coach");
    const coachCache = buildRenderCache(coachState1);
    const coachState2 = applyStateSync(coachState1, {
      ...snap,
      stylishRank: { ...snap.stylishRank!, score: 740 }
    });
    const planCoach = planSidebarPatch(coachCache, coachState2);
    expect(planCoach.mode).toBe("noop");
    expect(planCoach.tabsChanged).toBe(false);
  });

  it("renders wide Split Problem Reader shell with full Markdown+Math, sample copy buttons, and strict XSS defense", () => {
    const snap = makeRichSnapshot();
    const html = renderReaderShell({
      problem: {
        ...snap.activeProblem!,
        statementMarkdown: "## 输入格式\n满足 $1 \\le n \\le 10^5$。\n<img src=x onerror=alert(1)>"
      },
      uiLanguage: "zh-CN",
      activeLanguage: "cpp",
      lastRun: snap.lastRun,
      hintLevel: 1,
      runnerBusy: false,
      coachBusy: false
    });

    expect(html).toContain("rd-bar");
    expect(html).toContain("rd-stmt-card");
    expect(html).toContain("rd-io-grid");
    expect(html).toContain("&le;");
    expect(html).toContain('data-action="copy-text"');
    expect(html).toContain('data-action="coach-dry-run-case"');
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
  });

  it("enforces Phase 3 UI contract across views (single primary CTA, flattened wells, zh-CN copy purity, table wrapper, reader empty state)", () => {
    const snap = makeRichSnapshot();
    const countPrimary = (html: string) => (html.match(/\bb-p\b/g) ?? []).length;

    // Workspace: single primary CTA, tonal reader/dry-run buttons, no full-statement or ready noise, localized SSS cap
    const wsHtml = renderWorkspaceView(
      createInitialWebviewState({
        ...snap,
        lastRun: undefined,
        stylishRank: { ...snap.stylishRank!, ceilingReason: "Official AC on OJ required to unlock SSS" }
      })
    );
    expect(countPrimary(wsHtml)).toBe(1);
    expect(wsHtml).toContain('class="b b-t b-sm" type="button" data-action="problem-open-reader"');
    expect(wsHtml).not.toContain("完整题面");
    expect(wsHtml).not.toContain("待运行");
    expect(wsHtml).toContain("解锁 SSS · 无瑕");
    expect(wsHtml).not.toContain("stmt-box well");

    // Workspace with WA diff: still only 1 primary CTA (dry-run is tonal b-t)
    const wsRunHtml = renderWorkspaceView(createInitialWebviewState(snap));
    expect(countPrimary(wsRunHtml)).toBe(1);
    expect(wsRunHtml).toContain('class="b b-t b-xs" type="button" data-action="coach-dry-run-case"');

    // Problems: single primary CTA across all sub-tabs, bridge address appears once, deduped fsrs_due in today
    for (const sub of ["saved", "today", "sheets"] as const) {
      const probHtml = renderProblemsView({
        ...createInitialWebviewState({ ...snap, flags: { ...snap.flags, starterPackEnabled: true } }),
        drafts: { "sub.problems": sub }
      });
      expect(countPrimary(probHtml)).toBe(1);
      expect(probHtml.match(/127\.0\.0\.1:27121/g)?.length).toBe(1);
      expect(probHtml).not.toContain("已开启");
      expect(probHtml).not.toContain("完整题面");
      expect(probHtml).not.toContain("sub well");
      if (sub === "today") {
        // Cover in Water is in FSRS Due card with localized status, so it must NOT duplicate inside Recommended Next
        expect(probHtml.match(/>Cover in Water</g)?.length).toBe(1);
        expect(probHtml).toContain("待攻克");
        expect(probHtml).not.toContain("unresolved");
      }
    }

    // Coach: merged ladder (no extra card), single primary CTA, compact teaching prefs drawer, no nested well around dryRunPrompt
    const coachSnap: SidebarStateSnapshot = {
      ...snap,
      coachHistory: [
        {
          ...snap.coachHistory[0]!,
          dryRunPrompt: { minimalInput: "3\n...", question: "Trace index 1" }
        }
      ]
    };
    const coachHtml = renderCoachView(createInitialWebviewState(coachSnap));
    expect(countPrimary(coachHtml)).toBe(1);
    expect(coachHtml).toContain('data-drawer="coach-prefs"');
    expect(coachHtml).toContain('class="sel sm"');
    expect(coachHtml).not.toContain("苏格拉底提示阶梯");
    expect(coachHtml).not.toContain("sub well");

    // Dossier: .tb-wrap scroll table, flat kpi-strip, localized status, pure 3-card analytics
    const dossierHtml = renderDossierView(createInitialWebviewState(snap));
    expect(dossierHtml).toContain('class="tb-wrap"');
    expect(dossierHtml).toContain('class="kpi-strip"');
    expect(dossierHtml).not.toContain("kp well");
    expect(dossierHtml).not.toContain("unresolved");

    // Settings: single primary CTA in env & zero extra primary in exp, flat AI roles, zero zh-CN English parenthetical leaks
    const settingsEnvHtml = renderSettingsView(createInitialWebviewState(snap));
    const settingsExpHtml = renderSettingsView({
      ...createInitialWebviewState(snap),
      drafts: { "sub.settings": "exp" }
    });
    expect(countPrimary(settingsEnvHtml)).toBe(1);
    expect(countPrimary(settingsExpHtml)).toBe(0);
    for (const settingsHtml of [settingsEnvHtml, settingsExpHtml]) {
      expect(settingsHtml).not.toContain("sub well");
      expect(settingsHtml).not.toContain("(strictWordAccept)");
      expect(settingsHtml).not.toContain("(Toolchain Doctor)");
      expect(settingsHtml).not.toContain("(Muted Brown)");
    }

    // Reader: single primary CTA, native editor canvas (no card border on stmt/sample), centered empty state
    const readerHtml = renderReaderShell({
      problem: snap.activeProblem,
      uiLanguage: "zh-CN",
      activeLanguage: "cpp",
      lastRun: snap.lastRun,
      hintLevel: 1,
      runnerBusy: false,
      coachBusy: false
    });
    expect(countPrimary(readerHtml)).toBe(1);
    expect(readerHtml).not.toContain("card rd-stmt-card");
    expect(readerHtml).not.toContain("card rd-sample-card");
    expect(readerHtml).not.toContain("输入 (Input)");
    expect(readerHtml).not.toContain("期望输出 (Expected)");

    const emptyReaderHtml = renderReaderShell({
      uiLanguage: "zh-CN",
      hintLevel: 0,
      runnerBusy: false,
      coachBusy: false
    });
    expect(emptyReaderHtml).toContain("rd-empty");
    expect(emptyReaderHtml).toContain("尚未打开题目");
    expect(emptyReaderHtml).not.toContain("Competitive Companion");
  });
});

describe("Round 1 UX, patching, draft lifecycle, and a11y fixes", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("guards Coach empty state (always keeps warmup CTA + coach-prefs), disables L5 hint without hiding Give Up until giveUpUnlocked, and shows CE diagnosis badge", () => {
    const emptySnap = createInitialSnapshot();
    const emptyCoach = renderCoachView(createInitialWebviewState(emptySnap));
    expect(emptyCoach).toContain('data-action="switch-tab" data-tab="problems"');
    expect(emptyCoach).not.toContain('data-action="coach-hint"');
    expect(emptyCoach).toContain('data-action="starter-load-warmup"');
    expect(emptyCoach).toContain('data-drawer="coach-prefs"');

    const snap = makeRichSnapshot();
    const l5Locked = renderCoachView(
      createInitialWebviewState({ ...snap, hintLevel: 5, giveUpUnlocked: false })
    );
    expect(l5Locked).toContain("已达最高提示 L5");
    expect(l5Locked).toMatch(/data-action="coach-hint"[^>]*disabled/);
    expect(l5Locked).toContain('data-action="coach-giveup-arm"');

    const l5Unlocked = renderCoachView(
      createInitialWebviewState({
        ...snap,
        hintLevel: 5,
        giveUpUnlocked: true,
        lastRun: { ...snap.lastRun!, compileOk: false, compileStderr: "error: missing ;" },
        coachHistory: [
          {
            ...snap.coachHistory[0]!,
            action: "dryRun",
            stuckCategory: "implementation",
            headline: "编译错误诊断（CE）",
            dryRunPrompt: undefined
          }
        ]
      })
    );
    expect(l5Unlocked).not.toContain('data-action="coach-giveup-arm"');
    expect(l5Unlocked).toContain("编译诊断");
    expect(l5Unlocked).toContain("解读 CE 报错");
    expect(l5Unlocked).not.toContain("最小反例输入");

    const enCeCoach = renderCoachView(
      createInitialWebviewState({
        ...snap,
        flags: { ...snap.flags, uiLanguage: "en-US" },
        lastRun: { ...snap.lastRun!, compileOk: false, compileStderr: "error: missing ;" }
      })
    );
    expect(enCeCoach).toContain("Explain CE");

    const readerL5 = renderReaderShell({
      problem: snap.activeProblem,
      uiLanguage: "zh-CN",
      activeLanguage: "cpp",
      lastRun: { ...snap.lastRun!, compileOk: false, compileStderr: "error: missing ;" },
      hintLevel: 5,
      runnerBusy: false,
      coachBusy: false
    });
    expect(readerL5).toContain("已达 L5");
    expect(readerL5).toMatch(/data-action="coach-hint"[^>]*disabled/);
    expect(readerL5).toContain("让教练解读报错");
    expect(readerL5).toContain('data-case-id="compile-error" data-verdict="CE"');
  });

  it("patches Coach controls independently from Coach history without touching audit disclosures", () => {
    const snap = makeRichSnapshot();
    const coachState1 = setActiveTab(createInitialWebviewState(snap), "coach");
    const cache1 = buildRenderCache(coachState1);

    const coachState2 = { ...coachState1, stuck: "tle" as const };
    const plan = planSidebarPatch(cache1, coachState2);
    expect(plan.mode).toBe("coach-regions");
    expect(plan.changedRegions).toEqual(["coach-controls"]);
    expect(plan.changedRegions).not.toContain("coach-history");
    expect(renderCoachView(coachState1)).toContain('data-drawer="audit-0"');
  });

  it("gates CF sync strictly to Codeforces, unifies post-run samples, aligns diff legend, and supports metadata_only merge", () => {
    const snap = makeRichSnapshot();
    const nonCfSnap: SidebarStateSnapshot = {
      ...snap,
      aiConfig: { ...snap.aiConfig, codeforcesHandle: "tourist" },
      activeProblem: {
        ...snap.activeProblem!,
        problemKey: "lc-cn:two-sum",
        source: "leetcode-cn",
        ioMode: "function",
        completeness: "metadata_only",
        statementMarkdown: undefined,
        samples: [
          { id: "s1", input: "[2,7]\n9", expectedOutput: "[0,1]", isOriginal: true },
          { id: "c1", input: "[3,3]\n6", expectedOutput: "[0,1]", isOriginal: false },
          { id: "c2", input: "[1,2]\n3", expectedOutput: "[0,1]", isOriginal: false }
        ]
      },
      lastRun: {
        ...snap.lastRun!,
        problemKey: "lc-cn:two-sum"
      }
    };

    const wsState = { ...createInitialWebviewState(nonCfSnap), panels: { sample: true } };
    const wsHtml = renderWorkspaceView(wsState);
    expect(wsHtml).not.toContain('data-action="submit-sync-cf"');
    expect(wsHtml).toContain('title="1900A"');
    expect(wsHtml).toContain('data-action="problem-merge-clipboard"');
    expect(wsHtml).toContain("函数参数（每行一个 JSON 值）");
    expect(wsHtml).toContain("- 实际 · + 预期");
    expect(wsHtml).toContain('<details class="si-io"');
    expect(wsHtml).not.toContain('<details class="dt"');
    expect(wsHtml).not.toContain("待运行");
    // Unrun newly added custom sample c2 stays visible with its I/O even when lastRun exists
    expect(wsHtml).toContain("[1,2]");
    // WA diff puts actual output in ac-diff-del and expected in ac-diff-add
    expect(wsHtml).toMatch(/ac-diff-del[\s\S]*3[\s\S]*ac-diff-add[\s\S]*2/);

    const probHtml = renderProblemsView(createInitialWebviewState(nonCfSnap));
    expect(probHtml).toContain('class="b b-t b-sm" type="button" data-action="problem-import-clipboard" data-merge="true"');

    const readerMeta = renderReaderShell({
      problem: nonCfSnap.activeProblem,
      uiLanguage: "zh-CN",
      hintLevel: 0,
      runnerBusy: false,
      coachBusy: false
    });
    expect(readerMeta).toContain('data-action="problem-merge-clipboard"');
    expect(readerMeta).toContain("剪贴板与桥接");
  });

  it("splits Settings into AI & Env (auto-open Toolchain, visible CF handle, Ollama preset, folded FIM) and Experience (Flags, Habits, Audio, Visual)", () => {
    const snap = makeRichSnapshot();
    const envHtml = renderSettingsView(
      createInitialWebviewState({
        ...snap,
        toolchains: [],
        flags: { ...snap.flags, preset: "starter" }
      })
    );
    expect(envHtml).toMatch(/data-drawer="settings-toolchain" open/);
    expect(envHtml).toContain('data-drawer="settings-ai-extra"');
    expect(envHtml).toContain('data-draft="ai.codeforcesHandle"');
    expect(envHtml).toContain("DeepSeek 预设");
    expect(envHtml).toContain("Ollama 本地");
    expect(envHtml).toContain("模型列表");
    expect(envHtml).toContain("deepseek-fim-beta-required");
    expect(envHtml).not.toContain("(FIM)");

    const expHtml = renderSettingsView({
      ...createInitialWebviewState(snap),
      drafts: { "sub.settings": "exp" }
    });
    expect(expHtml).toContain('data-drawer="settings-habits"');
    expect(expHtml).toContain('data-drawer="settings-audio"');
    expect(expHtml).toContain('data-drawer="settings-visual"');
  });

  it("prevents dismissed toast resurrection on background state/sync, auto-dismisses info toast, and clears live DOM value on Enter", () => {
    vi.useFakeTimers();

    // 1. State-level non-resurrection check
    const s0 = createInitialWebviewState(makeRichSnapshot());
    const s1 = applyStateSync(s0, { ...s0.snapshot, statusBanner: { level: "info", text: "Saved" } });
    expect(s1.toast).toEqual({ level: "info", text: "Saved" });
    const dismissed = { ...s1, toast: null };
    const s2 = applyStateSync(dismissed, { ...s1.snapshot, statusBanner: { level: "info", text: "Saved" } });
    expect(s2.toast).toBeNull();
    const s3 = applyStateSync(s2, { ...s2.snapshot, statusBanner: { level: "warn", text: "Changed" } });
    expect(s3.toast).toEqual({ level: "warn", text: "Changed" });
    // Switching tabs clears stale toast and subsequent unchanged state/sync does not resurrect it
    const switchedTab = setActiveTab(s3, "coach");
    expect(switchedTab.toast).toBeNull();
    const afterResync = applyStateSync(switchedTab, { ...s3.snapshot });
    expect(afterResync.toast).toBeNull();

    // 2. Live DOM clearDraftDom, setDraftDom (ai-fill-deepseek), CE dry-run stuckCategory, & toast timers
    class FakeElement {
      dataset: Record<string, string> = {};
      attrs = new Map<string, string>();
      getAttribute(k: string) { return this.attrs.get(k) ?? null; }
      closest(sel: string) { return sel === "[data-action]" && this.dataset.action ? this : null; }
      focus() { /* noop */ }
    }
    class FakeInput extends FakeElement {
      value = "";
    }
    class FakeTextarea extends FakeElement { value = ""; }
    class FakeSelect extends FakeElement { value = ""; }

    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("HTMLInputElement", FakeInput);
    vi.stubGlobal("HTMLTextAreaElement", FakeTextarea);
    vi.stubGlobal("HTMLSelectElement", FakeSelect);
    vi.stubGlobal("document", { activeElement: null, readyState: "complete", addEventListener: vi.fn() });
    const winListeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      addEventListener: (ev: string, fn: EventListener) => winListeners.set(ev, fn),
      removeEventListener: (ev: string) => winListeners.delete(ev)
    });

    const draftInputs = new Map<string, FakeInput>();
    for (const k of ["ask", "ai.chat.provider", "ai.chat.baseUrl", "ai.chat.model", "ai.fim.provider", "ai.fim.baseUrl", "ai.fim.model"]) {
      const el = new FakeInput();
      el.attrs.set("data-draft", k);
      draftInputs.set(k, el);
    }
    const askInput = draftInputs.get("ask")!;
    const rootListeners = new Map<string, EventListener>();
    const toastSlot = { innerHTML: "" };
    const root = {
      innerHTML: "",
      addEventListener: (ev: string, fn: EventListener) => rootListeners.set(ev, fn),
      removeEventListener: (ev: string) => rootListeners.delete(ev),
      querySelector: (sel: string) => {
        const m = sel.match(/^\[data-draft="([^"]+)"\]$/);
        if (m) return draftInputs.get(m[1]!) ?? null;
        if (sel === '[data-patch="toast"]') return toastSlot;
        return null;
      },
      querySelectorAll: () => []
    } as unknown as HTMLElement;

    const posted: unknown[] = [];
    const mounted = mountWebview(root, { postMessage: (m) => posted.push(m) });

    // Simulate typing into ask input, pressing Enter, then firing blur/change
    askInput.value = "Why does mid overflow?";
    rootListeners.get("input")?.({ target: askInput } as unknown as Event);
    expect(mounted.store.getState().drafts.ask).toBe("Why does mid overflow?");

    rootListeners.get("keydown")?.({
      key: "Enter",
      isComposing: false,
      target: askInput,
      preventDefault: vi.fn()
    } as unknown as Event);

    // Live DOM value MUST be cleared immediately so a subsequent change event cannot resurrect it
    expect(askInput.value).toBe("");
    rootListeners.get("change")?.({ target: askInput } as unknown as Event);
    expect(mounted.store.getState().drafts.ask || "").toBe("");
    expect(posted.some((m) => (m as { type?: string }).type === "coach/request")).toBe(true);

    // DeepSeek preset updates live DOM fields even after silent input edits & emits 4s info toast
    const chatUrlEl = draftInputs.get("ai.chat.baseUrl")!;
    const fimUrlEl = draftInputs.get("ai.fim.baseUrl")!;
    chatUrlEl.value = "https://custom.invalid/v1";
    rootListeners.get("input")?.({ target: chatUrlEl } as unknown as Event);
    const presetBtn = new FakeElement();
    presetBtn.dataset.action = "ai-fill-deepseek";
    rootListeners.get("click")?.({ target: presetBtn } as unknown as Event);
    expect(chatUrlEl.value).toBe("https://api.deepseek.com/v1");
    expect(fimUrlEl.value).toBe("https://api.deepseek.com/beta");
    expect(mounted.store.getState().toast?.level).toBe("info");
    expect(mounted.store.getState().toast?.text).toContain("DeepSeek");

    // Coach toolbar dry-run button dispatches stuckCategory="implementation" on compile error (CE)
    const ceSnap = makeRichSnapshot();
    ceSnap.lastRun = { ...ceSnap.lastRun!, compileOk: false, compileStderr: "error: missing ;" };
    mounted.handleHostMessage({ type: "state/sync", payload: ceSnap });
    const dryRunBtn = new FakeElement();
    dryRunBtn.dataset.action = "coach-dry-run";
    rootListeners.get("click")?.({ target: dryRunBtn } as unknown as Event);
    expect(posted[posted.length - 1]).toEqual({
      type: "coach/request",
      payload: { action: "dryRun", stuckCategory: "implementation" }
    });

    // Info toast auto-dismisses at 4000ms, warn at 7000ms, error remains sticky past 10000ms
    mounted.handleHostMessage({ type: "toast/inline", payload: { level: "info", text: "Copied." } });
    expect(mounted.store.getState().toast?.text).toBe("Copied.");
    vi.advanceTimersByTime(4000);
    expect(mounted.store.getState().toast).toBeNull();

    mounted.handleHostMessage({ type: "toast/inline", payload: { level: "warn", text: "Check failed" } });
    vi.advanceTimersByTime(6999);
    expect(mounted.store.getState().toast?.text).toBe("Check failed");
    vi.advanceTimersByTime(1);
    expect(mounted.store.getState().toast).toBeNull();

    mounted.handleHostMessage({ type: "toast/inline", payload: { level: "error", text: "Fatal host error" } });
    vi.advanceTimersByTime(15000);
    expect(mounted.store.getState().toast?.text).toBe("Fatal host error");

    mounted.dispose();

    // 3. Empty Reader updates language cleanly when uiLanguage toggles zh-CN -> en-US (ISSUE-R2-NOV-2)
    const rdArticle = { className: "", innerHTML: "" };
    const rdBar = { innerHTML: "" };
    const rdToast = { innerHTML: "" };
    const rdShell = { className: "" };
    const rdMain = { scrollTop: 0 };
    const rdRoot = {
      innerHTML: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      querySelector: (sel: string) => {
        if (sel === '[data-patch="rd-article"]') return rdArticle;
        if (sel === '[data-patch="rd-bar"]') return rdBar;
        if (sel === '[data-patch="rd-toast"]') return rdToast;
        if (sel === ".rd-shell") return rdShell;
        if (sel === ".rd-main") return rdMain;
        return null;
      }
    } as unknown as HTMLElement;

    const reader = mountReaderWebview(rdRoot, { postMessage: vi.fn() });
    expect(rdRoot.innerHTML).toContain("尚未打开题目");
    reader.handleHostMessage({
      type: "reader/sync",
      payload: { uiLanguage: "en-US", hintLevel: 0, runnerBusy: false, coachBusy: false }
    });
    expect(rdArticle.innerHTML).toContain("No Problem Selected");
    expect(rdArticle.innerHTML).not.toContain("尚未打开题目");
    reader.dispose();
  });

  it("wipes live password inputs on ai-save-config and preserves keyboard focus across Sidebar and Reader re-renders (Round 3)", () => {
    class FakeEl {
      dataset: Record<string, string> = {};
      attrs = new Map<string, string>();
      disabled = false;
      focusCalls: Array<FocusOptions | undefined> = [];
      getAttribute(k: string) { return this.attrs.get(k) ?? null; }
      closest(sel: string) { return sel === "[data-action]" && this.dataset.action ? this : null; }
      focus(opts?: FocusOptions) { this.focusCalls.push(opts); doc.activeElement = this; }
    }
    class FakeInput extends FakeEl { value = ""; }
    class FakeTextarea extends FakeEl { value = ""; }
    class FakeSelect extends FakeEl { value = ""; }

    const doc: { activeElement: FakeEl | null; readyState: string; addEventListener: ReturnType<typeof vi.fn> } = {
      activeElement: null,
      readyState: "complete",
      addEventListener: vi.fn()
    };
    vi.stubGlobal("Element", FakeEl);
    vi.stubGlobal("HTMLInputElement", FakeInput);
    vi.stubGlobal("HTMLTextAreaElement", FakeTextarea);
    vi.stubGlobal("HTMLSelectElement", FakeSelect);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });

    // 1. Sidebar: ai-save-config wipes ONLY apiKey password DOM inputs + focus preservation & editor-focus guard
    const chatKey = new FakeInput(); chatKey.attrs.set("data-draft", "ai.chat.apiKey");
    const fimKey = new FakeInput(); fimKey.attrs.set("data-draft", "ai.fim.apiKey");
    const chatUrl = new FakeInput(); chatUrl.attrs.set("data-draft", "ai.chat.baseUrl");
    chatUrl.value = "https://api.deepseek.com/v1";

    const settingsTabBefore = new FakeEl();
    settingsTabBefore.dataset.action = "switch-tab";
    settingsTabBefore.dataset.tab = "settings";
    settingsTabBefore.attrs.set("data-action", "switch-tab");
    settingsTabBefore.attrs.set("data-tab", "settings");

    const settingsTabAfter = new FakeEl();
    settingsTabAfter.attrs.set("data-action", "switch-tab");
    settingsTabAfter.attrs.set("data-tab", "settings");

    const activeTabFallback = new FakeEl();
    let attached = new Set<FakeEl>([chatKey, fimKey, chatUrl, settingsTabBefore, activeTabFallback]);
    const rootListeners = new Map<string, EventListener>();
    const tabsSlot = {
      _html: "",
      set innerHTML(v: string) {
        this._html = v;
        attached.delete(settingsTabBefore);
        attached.add(settingsTabAfter);
        if (doc.activeElement === settingsTabBefore) doc.activeElement = null;
      },
      get innerHTML() { return this._html; }
    };
    const mainSlot = { scrollTop: 0, innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
    const root = {
      innerHTML: "",
      contains: (node: unknown) => node instanceof FakeEl && attached.has(node),
      addEventListener: (ev: string, fn: EventListener) => rootListeners.set(ev, fn),
      removeEventListener: (ev: string) => rootListeners.delete(ev),
      querySelector: (sel: string) => {
        if (sel === '[data-draft="ai.chat.apiKey"]') return chatKey;
        if (sel === '[data-draft="ai.fim.apiKey"]') return fimKey;
        if (sel === '[data-draft="ai.chat.baseUrl"]') return chatUrl;
        if (sel === '[data-patch="tabs"]') return tabsSlot;
        if (sel === '[data-patch="main"]') return mainSlot;
        if (sel === '[data-action="switch-tab"][data-tab="settings"]') return settingsTabAfter;
        if (sel === ".tab-a") return activeTabFallback;
        return null;
      },
      querySelectorAll: () => []
    } as unknown as HTMLElement;

    const posted: unknown[] = [];
    const mounted = mountWebview(root, { postMessage: (m) => posted.push(m) });

    // Background sync while focus is null (outside webview) MUST NOT steal focus
    doc.activeElement = null;
    mounted.handleHostMessage({ type: "state/sync", payload: makeRichSnapshot() });
    expect(doc.activeElement).toBeNull();
    expect(activeTabFallback.focusCalls).toHaveLength(0);

    // Clicking switch-tab while focused on live attached tab restores focus to replaced tab with preventScroll: true
    attached.add(settingsTabBefore);
    doc.activeElement = settingsTabBefore;
    rootListeners.get("click")?.({ target: settingsTabBefore } as unknown as Event);
    expect(settingsTabAfter.focusCalls).toEqual([{ preventScroll: true }]);
    expect(doc.activeElement).toBe(settingsTabAfter);

    // ai-save-config wipes ONLY ai.chat.apiKey & ai.fim.apiKey live inputs, keeping baseUrl intact
    chatKey.value = "sk-chat-secret";
    fimKey.value = "sk-fim-secret";
    rootListeners.get("input")?.({ target: chatKey } as unknown as Event);
    rootListeners.get("input")?.({ target: fimKey } as unknown as Event);
    const saveBtn = new FakeEl();
    saveBtn.dataset.action = "ai-save-config";
    rootListeners.get("click")?.({ target: saveBtn } as unknown as Event);
    expect(chatKey.value).toBe("");
    expect(fimKey.value).toBe("");
    expect(chatUrl.value).toBe("https://api.deepseek.com/v1");
    expect(posted.some((m) => (m as { type?: string }).type === "ai/saveConfig")).toBe(true);
    mounted.dispose();

    // 2. Reader: font-inc boundary falls back to enabled font-dec without dropping focus to BODY
    const fontIncBefore = new FakeEl();
    fontIncBefore.dataset.action = "font-inc";
    fontIncBefore.attrs.set("data-action", "font-inc");
    const fontIncAfter = new FakeEl();
    fontIncAfter.attrs.set("data-action", "font-inc");
    fontIncAfter.disabled = true; // reached max scale "lg"
    const fontDecAfter = new FakeEl();
    fontDecAfter.attrs.set("data-action", "font-dec");

    let barAttached = new Set<FakeEl>([fontIncBefore]);
    const rdListeners = new Map<string, EventListener>();
    const rdBar = {
      _html: "",
      contains: (node: unknown) => node instanceof FakeEl && barAttached.has(node),
      set innerHTML(v: string) {
        this._html = v;
        barAttached = new Set([fontIncAfter, fontDecAfter]);
        if (doc.activeElement === fontIncBefore) doc.activeElement = null;
      },
      get innerHTML() { return this._html; },
      querySelector: (sel: string) => {
        if (sel === '[data-action="font-inc"]') return fontIncAfter;
        if (sel === '[data-action="font-dec"]') return fontDecAfter;
        if (sel === "button:not(:disabled)") return fontDecAfter;
        return null;
      }
    };
    const rdRoot = {
      innerHTML: "",
      addEventListener: (ev: string, fn: EventListener) => rdListeners.set(ev, fn),
      removeEventListener: (ev: string) => rdListeners.delete(ev),
      querySelector: (sel: string) => {
        if (sel === '[data-patch="rd-bar"]') return rdBar;
        if (sel === ".rd-shell") return { className: "" };
        if (sel === '[data-patch="rd-toast"]') return { innerHTML: "" };
        return null;
      }
    } as unknown as HTMLElement;

    const reader = mountReaderWebview(rdRoot, { postMessage: vi.fn() });
    doc.activeElement = fontIncBefore;
    rdListeners.get("click")?.({ target: fontIncBefore } as unknown as Event);
    expect(fontDecAfter.focusCalls).toEqual([{ preventScroll: true }]);
    expect(doc.activeElement).toBe(fontDecAfter);
    reader.dispose();
  });

  it("covers Round 5 fixes: zombie-free live sample counts, cross-problem reset, vid Enter + empty focus, provider baseUrl sync, summary focus, and sheet badge", () => {
    const snap = makeRichSnapshot();

    // 1. INT-1: Deleted samples produce zero zombie rows & hide stale summary, custom-only avoids 0/0, CE banner stays visible
    const zeroSamplesHtml = renderWorkspaceView(
      createInitialWebviewState({
        ...snap,
        activeProblem: { ...snap.activeProblem!, samples: [] },
        lastRun: { ...snap.lastRun!, compileOk: true, allPassed: true }
      })
    );
    expect(zeroSamplesHtml).toContain("当前题目暂无样例");
    expect(zeroSamplesHtml).not.toContain("ac-diff-del");
    expect(zeroSamplesHtml).not.toContain("全部通过");

    const customOnlySnap: SidebarStateSnapshot = {
      ...snap,
      flags: { ...snap.flags, uiLanguage: "en-US" },
      activeProblem: {
        ...snap.activeProblem!,
        samples: [{ id: "c1", input: "1\n.", expectedOutput: "1\n", isOriginal: false }]
      },
      lastRun: { ...snap.lastRun!, compileOk: true, allPassed: true, originalTotal: 0, originalPassed: 0 }
    };
    const customWs = renderWorkspaceView(createInitialWebviewState(customOnlySnap));
    expect(customWs).toContain("1/1 custom");
    expect(customWs).not.toContain("0/0");

    const customReader = renderReaderShell({
      problem: customOnlySnap.activeProblem,
      uiLanguage: "en-US",
      lastRun: customOnlySnap.lastRun,
      hintLevel: 0,
      runnerBusy: false,
      coachBusy: false
    });
    expect(customReader).toContain("Passed 1/1");
    expect(customReader).not.toContain("0/0");

    const ceZeroSamples = renderWorkspaceView(
      createInitialWebviewState({
        ...snap,
        activeProblem: { ...snap.activeProblem!, samples: [] },
        lastRun: { ...snap.lastRun!, compileOk: false, compileStderr: "syntax error", cases: [] }
      })
    );
    expect(ceZeroSamples).toContain("编译错误 CE");
    expect(ceZeroSamples).toContain("syntax error");

    // 2. INT-2 / CON-2: Switching problemKey resets per-problem state/drafts while preserving global drafts & initial boot
    const bootInit = { ...createInitialWebviewState(createInitialSnapshot()), stuck: "tle" as const, drafts: { ask: "boot" } };
    const afterBoot = applyStateSync(bootInit, snap);
    expect(afterBoot.stuck).toBe("tle"); // initial undefined -> A does not wipe state

    const dirtyProblemState = {
      ...afterBoot,
      stuck: "tle" as const,
      giveUpConfirmPending: true,
      panels: { sample: true, stmtFull: true, clip: true },
      drafts: { sin: "1 2", sex: "3", ask: "why WA?", imp: "P1001", hab: "use long long" }
    };
    const afterSwitch = applyStateSync(dirtyProblemState, {
      ...snap,
      activeProblem: { ...snap.activeProblem!, problemKey: "luogu:P1001" }
    });
    expect(afterSwitch.stuck).toBe("no_idea");
    expect(afterSwitch.giveUpConfirmPending).toBe(false);
    expect(afterSwitch.panels).toEqual({ sample: false, stmtFull: false, clip: true });
    expect(afterSwitch.drafts.sin).toBeUndefined();
    expect(afterSwitch.drafts.sex).toBeUndefined();
    expect(afterSwitch.drafts.ask).toBeUndefined();
    expect(afterSwitch.drafts.imp).toBe("P1001");
    expect(afterSwitch.drafts.hab).toBe("use long long");

    // 3. INT-3 & A11Y-1: en-US sheet count separator & 4+Gear .tab title tooltip
    const enProb = renderProblemsView({
      ...createInitialWebviewState({ ...snap, flags: { ...snap.flags, uiLanguage: "en-US" } }),
      drafts: { "sub.problems": "sheets" }
    });
    expect(enProb).toContain("· 100");
    expect(renderAppShell(createInitialWebviewState(snap))).toContain('title="做题"');

    // 4. DOM harness: CON-3 (vid Enter), NOV-2 (empty focus), NOV-1 (provider baseUrl sync), A11Y-2 (summary focus)
    class FakeEl {
      tagName = "BUTTON";
      parentElement: FakeEl | null = null;
      dataset: Record<string, string> = {};
      attrs = new Map<string, string>();
      disabled = false;
      focusCalls: Array<FocusOptions | undefined> = [];
      getAttribute(k: string) { return this.attrs.get(k) ?? null; }
      closest(sel: string) { return sel === "[data-action]" && this.dataset.action ? this : null; }
      focus(opts?: FocusOptions) { this.focusCalls.push(opts); doc.activeElement = this; }
    }
    class FakeInput extends FakeEl { override tagName = "INPUT"; value = ""; }
    class FakeTextarea extends FakeEl { override tagName = "TEXTAREA"; value = ""; }
    class FakeSelect extends FakeEl { override tagName = "SELECT"; value = ""; }

    const doc: { activeElement: FakeEl | null; readyState: string; addEventListener: ReturnType<typeof vi.fn> } = {
      activeElement: null,
      readyState: "complete",
      addEventListener: vi.fn()
    };
    vi.stubGlobal("Element", FakeEl);
    vi.stubGlobal("HTMLInputElement", FakeInput);
    vi.stubGlobal("HTMLTextAreaElement", FakeTextarea);
    vi.stubGlobal("HTMLSelectElement", FakeSelect);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });

    const vidInput = new FakeInput(); vidInput.attrs.set("data-draft", "vid");
    const impInput = new FakeInput(); impInput.attrs.set("data-draft", "imp");
    const chatProv = new FakeSelect(); chatProv.attrs.set("data-draft", "ai.chat.provider");
    const chatUrl = new FakeInput(); chatUrl.attrs.set("data-draft", "ai.chat.baseUrl");
    chatUrl.value = "https://api.deepseek.com/v1";
    const chatModel = new FakeInput(); chatModel.attrs.set("data-draft", "ai.chat.model");
    chatModel.value = "deepseek-chat";
    const fimProv = new FakeSelect(); fimProv.attrs.set("data-draft", "ai.fim.provider");
    const fimUrl = new FakeInput(); fimUrl.attrs.set("data-draft", "ai.fim.baseUrl");
    fimUrl.value = "http://localhost:11434/v1";

    const drawerEl = new FakeEl();
    drawerEl.tagName = "DETAILS";
    drawerEl.attrs.set("data-drawer", "settings-toolchain");
    const summaryBefore = new FakeEl();
    summaryBefore.tagName = "SUMMARY";
    summaryBefore.parentElement = drawerEl;
    const summaryAfter = new FakeEl();
    summaryAfter.tagName = "SUMMARY";

    const attached = new Set<FakeEl>([vidInput, impInput, chatProv, chatUrl, chatModel, fimProv, fimUrl, summaryBefore]);
    const rootListeners = new Map<string, EventListener>();
    const mainSlot = {
      scrollTop: 0,
      _html: "",
      set innerHTML(v: string) {
        this._html = v;
        attached.delete(summaryBefore);
        attached.add(summaryAfter);
        if (doc.activeElement === summaryBefore) doc.activeElement = null;
      },
      get innerHTML() { return this._html; },
      querySelectorAll: () => [],
      querySelector: () => null
    };
    const root = {
      innerHTML: "",
      contains: (node: unknown) => node instanceof FakeEl && attached.has(node),
      addEventListener: (ev: string, fn: EventListener) => rootListeners.set(ev, fn),
      removeEventListener: (ev: string) => rootListeners.delete(ev),
      querySelector: (sel: string) => {
        if (sel === '[data-draft="vid"]') return vidInput;
        if (sel === '[data-draft="imp"]') return impInput;
        if (sel === '[data-draft="ai.chat.baseUrl"]') return chatUrl;
        if (sel === '[data-draft="ai.fim.baseUrl"]') return fimUrl;
        if (sel === '[data-patch="main"]') return mainSlot;
        if (sel === 'details[data-drawer="settings-toolchain"]>summary') return summaryAfter;
        return null;
      },
      querySelectorAll: () => []
    } as unknown as HTMLElement;

    const posted: unknown[] = [];
    const mounted = mountWebview(root, { postMessage: (m) => posted.push(m) });

    // NOV-2: empty Import click focuses the empty imp input instead of silently no-oping
    const impBtn = new FakeEl();
    impBtn.dataset.action = "problem-import-ref";
    rootListeners.get("click")?.({ target: impBtn } as unknown as Event);
    expect(impInput.focusCalls).toHaveLength(1);

    // CON-3: vid Enter submits learner/voidEvent and clears live DOM value
    vidInput.value = "cf-sub-123";
    rootListeners.get("input")?.({ target: vidInput } as unknown as Event);
    rootListeners.get("keydown")?.({ key: "Enter", isComposing: false, target: vidInput, preventDefault: vi.fn() } as unknown as Event);
    expect(vidInput.value).toBe("");
    expect(posted).toContainEqual({ type: "learner/voidEvent", payload: { eventId: "cf-sub-123" } });

    // NOV-1: switching provider to ollama updates default DeepSeek baseUrl without touching model, and preserves custom URLs
    chatProv.value = "ollama";
    rootListeners.get("change")?.({ target: chatProv } as unknown as Event);
    expect(chatUrl.value).toBe("http://localhost:11434/v1");
    expect(mounted.store.getState().drafts["ai.chat.baseUrl"]).toBe("http://localhost:11434/v1");
    expect(chatModel.value).toBe("deepseek-chat");

    chatUrl.value = "https://custom.proxy/v1";
    rootListeners.get("input")?.({ target: chatUrl } as unknown as Event);
    chatProv.value = "openai";
    rootListeners.get("change")?.({ target: chatProv } as unknown as Event);
    expect(chatUrl.value).toBe("https://custom.proxy/v1"); // custom URL preserved!

    fimProv.value = "openai-compatible";
    rootListeners.get("change")?.({ target: fimProv } as unknown as Event);
    expect(fimUrl.value).toBe("https://api.deepseek.com/beta");

    // A11Y-2: details[data-drawer] > summary preserves keyboard focus across replace-main re-renders
    mounted.store.update((p) => setActiveTab(p, "settings"));
    attached.add(summaryBefore);
    doc.activeElement = summaryBefore;
    mounted.handleHostMessage({ type: "state/sync", payload: snap });
    expect(summaryAfter.focusCalls).toEqual([{ preventScroll: true }]);
    expect(doc.activeElement).toBe(summaryAfter);

    mounted.dispose();
  });

  it("renders Nano Banana crests, empty-state vignettes, and OJ SVG emblems when <meta name=\"ac-assets\"> is set, omits gracefully when absent, and filters NowCoder from search", () => {
    const snap = makeRichSnapshot();
    const emptySnap = createInitialSnapshot();

    // 1. Without <meta name="ac-assets">: graceful omission (zero <img> tags, fallback letter & book icon)
    setAssetsBaseUri(undefined);
    const wsNoAssets = renderWorkspaceView(createInitialWebviewState(snap));
    const wsEmptyNoAssets = renderWorkspaceView(createInitialWebviewState(emptySnap));
    const coachEmptyNoAssets = renderCoachView(createInitialWebviewState(emptySnap));
    const probNoAssets = renderProblemsView(createInitialWebviewState(snap));
    const readerEmptyNoAssets = renderReaderShell({
      uiLanguage: "zh-CN",
      hintLevel: 0,
      runnerBusy: false,
      coachBusy: false
    });

    for (const html of [wsNoAssets, wsEmptyNoAssets, coachEmptyNoAssets, probNoAssets, readerEmptyNoAssets]) {
      expect(html).not.toContain("<img ");
      expect(html).not.toMatch(/\bstyle\s*=\s*["']/i);
      expect(html).not.toMatch(/\bon(?:error|load|click)\s*=\s*["']/i);
    }
    expect(wsNoAssets).toContain('<div class="rk-emblem mo">S</div>');
    expect(readerEmptyNoAssets).toContain("rd-empty-ic");

    // Problems view: import mode select includes nowcoder, search mode select omits non-searchable nowcoder
    const probSearchNoAssets = renderProblemsView({
      ...createInitialWebviewState(snap),
      drafts: { "sub.pmode": "qry" }
    });
    const importSel = probNoAssets.match(/<select[^>]*data-draft="isrc"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? "";
    const searchSel = probSearchNoAssets.match(/<select[^>]*data-draft="ssrc"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(importSel).toContain('value="nowcoder"');
    expect(searchSel).not.toContain('value="nowcoder"');
    expect(searchSel).toContain('value="leetcode-cn"');
    expect(searchSel).toContain('value="codeforces"');

    // 2. With <meta name="ac-assets"> in document: renders WebP crests, vignettes, and SVG OJ icons
    vi.stubGlobal("document", {
      querySelector: (sel: string) =>
        sel === 'meta[name="ac-assets"]'
          ? { getAttribute: (attr: string) => (attr === "content" ? "vscode-webview://test/resources/ui/" : null) }
          : null
    });

    try {
      // Rank tier mapping across D/C -> iron, B/A -> alloy, S/SS -> gold, SSS -> apex
      expect(rankCrestImg("D")).toContain('src="vscode-webview://test/resources/ui/rank-iron.webp"');
      expect(rankCrestImg("C")).toContain('src="vscode-webview://test/resources/ui/rank-iron.webp"');
      expect(rankCrestImg("B")).toContain('src="vscode-webview://test/resources/ui/rank-alloy.webp"');
      expect(rankCrestImg("A")).toContain('src="vscode-webview://test/resources/ui/rank-alloy.webp"');
      expect(rankCrestImg("S")).toContain('src="vscode-webview://test/resources/ui/rank-gold.webp"');
      expect(rankCrestImg("SS")).toContain('src="vscode-webview://test/resources/ui/rank-gold.webp"');
      expect(rankCrestImg("SSS")).toContain('src="vscode-webview://test/resources/ui/rank-apex.webp"');

      // OJ SVG icon mapping across all built-in and local/external sources
      expect(ojIconImg("leetcode-cn")).toContain("oj-leetcode.svg");
      expect(ojIconImg("leetcode-global")).toContain("oj-leetcode.svg");
      expect(ojIconImg("codeforces")).toContain("oj-codeforces.svg");
      expect(ojIconImg("luogu")).toContain("oj-luogu.svg");
      expect(ojIconImg("atcoder")).toContain("oj-atcoder.svg");
      expect(ojIconImg("nowcoder")).toContain("oj-nowcoder.svg");
      expect(ojIconImg("local-markdown")).toContain("oj-local.svg");
      expect(ojIconImg("warmup-pack")).toContain("oj-local.svg");

      const wsWithAssets = renderWorkspaceView(createInitialWebviewState(snap));
      expect(wsWithAssets).toContain('<img class="rk-crest" src="vscode-webview://test/resources/ui/rank-gold.webp" width="52" height="52" alt="">');
      expect(wsWithAssets).toContain("S · Sharp");
      expect(wsWithAssets).toContain('<img class="oj-ic" src="vscode-webview://test/resources/ui/oj-codeforces.svg" width="14" height="14" alt="">');

      const wsEmptyWithAssets = renderWorkspaceView(createInitialWebviewState(emptySnap));
      expect(wsEmptyWithAssets).toContain('<div class="empty-art"><img class="empty-art-img" src="vscode-webview://test/resources/ui/empty-workbench.webp" width="480" height="270" alt=""></div>');

      const coachEmptyWithAssets = renderCoachView(createInitialWebviewState(emptySnap));
      expect(coachEmptyWithAssets).toContain('<div class="empty-art"><img class="empty-art-img" src="vscode-webview://test/resources/ui/empty-workbench.webp" width="480" height="270" alt=""></div>');

      const probWithAssets = renderProblemsView(createInitialWebviewState(snap));
      expect(probWithAssets).toContain('<img class="oj-ic" src="vscode-webview://test/resources/ui/oj-codeforces.svg" width="14" height="14" alt="">');

      const readerWithAssets = renderReaderShell({
        problem: snap.activeProblem,
        uiLanguage: "zh-CN",
        activeLanguage: "cpp",
        hintLevel: 1,
        runnerBusy: false,
        coachBusy: false
      });
      expect(readerWithAssets).toContain('<img class="oj-ic" src="vscode-webview://test/resources/ui/oj-codeforces.svg" width="14" height="14" alt="">');

      const readerEmptyWithAssets = renderReaderShell({
        uiLanguage: "zh-CN",
        hintLevel: 0,
        runnerBusy: false,
        coachBusy: false
      });
      expect(readerEmptyWithAssets).toContain('<div class="rd-empty-art"><img class="rd-empty-art-img" src="vscode-webview://test/resources/ui/empty-reader.webp" width="640" height="360" alt=""></div>');
      expect(readerEmptyWithAssets).not.toContain("rd-empty-ic");

      for (const html of [wsWithAssets, wsEmptyWithAssets, coachEmptyWithAssets, probWithAssets, readerWithAssets, readerEmptyWithAssets]) {
        expect(html).not.toMatch(/\bstyle\s*=\s*["']/i);
        expect(html).not.toMatch(/\bon(?:error|load|click)\s*=\s*["']/i);
      }
    } finally {
      setAssetsBaseUri(undefined);
      vi.unstubAllGlobals();
    }
  });

  it("enforces Option C 4+Gear IA shell, AC interview review shortcut, Coach offline banner, Ollama Local badge, undo toast, and sub-tab actions", () => {
    const snap = makeRichSnapshot();
    const zhShell = renderAppShell(createInitialWebviewState(snap));
    expect(zhShell).toContain("做题");
    expect(zhShell).toContain("教练");
    expect(zhShell).toContain("选题");
    expect(zhShell).toContain("成长");
    expect(zhShell).toContain('class="tab tab-gear"');
    expect(zhShell).toContain('<span class="tab-n mo">1</span>');

    const enShell = renderAppShell(
      createInitialWebviewState({ ...snap, flags: { ...snap.flags, uiLanguage: "en-US" } })
    );
    expect(enShell).toContain(">Solve<");
    expect(enShell).toContain(">Coach<");
    expect(enShell).toContain(">Bank");
    expect(enShell).toContain(">Stats<");

    // Workspace: AC run reveals 1-click interview complexity review button; WA uses de-jargonized label
    const acSnap: SidebarStateSnapshot = {
      ...snap,
      lastRun: { ...snap.lastRun!, allPassed: true, originalPassed: 1 }
    };
    const acWs = renderWorkspaceView(createInitialWebviewState(acSnap));
    expect(acWs).toContain('data-action="coach-review-open"');
    const waWs = renderWorkspaceView(createInitialWebviewState(snap));
    expect(waWs).toContain("手推这组错例");

    // Workspace empty state: permanently exposes 3-problem warmup pack & walkthrough even when starterPackEnabled=false
    const emptyWs = renderWorkspaceView(createInitialWebviewState(createInitialSnapshot()));
    expect(emptyWs).toContain('data-action="starter-load-warmup"');
    expect(emptyWs).toContain('data-action="starter-open-walkthrough"');

    // Coach: offline AI shows 1-click setup banner; active problem shows context bar
    const offlineCoach = renderCoachView(
      createInitialWebviewState({
        ...snap,
        aiConfig: {
          ...snap.aiConfig,
          chat: { ...snap.aiConfig.chat, provider: "openai-compatible", hasApiKey: false }
        }
      })
    );
    expect(offlineCoach).toContain('data-action="settings-open-env"');
    expect(offlineCoach).toContain("coach-ctx");

    // Settings: Ollama provider shows Local/no-key badge & Coding Habits defaults to activeLanguage
    const ollamaSettings = renderSettingsView(
      createInitialWebviewState({
        ...snap,
        aiConfig: {
          ...snap.aiConfig,
          chat: { ...snap.aiConfig.chat, provider: "ollama", hasApiKey: false }
        }
      })
    );
    expect(ollamaSettings).toContain("免密本地");

    const expPySettings = renderSettingsView({
      ...createInitialWebviewState({ ...snap, activeLanguage: "python" }),
      drafts: { "sub.settings": "exp" }
    });
    expect(expPySettings).toMatch(/<option value="python" selected>/);

    // Toast with undoEventId renders 1-click undo button
    const undoShell = renderAppShell({
      ...createInitialWebviewState(snap),
      toast: { level: "info", text: "Recorded AC", undoEventId: "ev-manual-9" }
    });
    expect(undoShell).toContain('data-action="learner-void-id" data-event-id="ev-manual-9"');
  });
});

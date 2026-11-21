import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  CoachResponsePayload,
  HintLevel,
  LearningEventV2,
  ProjectionAudit,
  RecommendationCandidate
} from "../../src/core/contracts";
import { enforceCoachSpoilerPolicy } from "../../src/core/coach";
import {
  JsonUserOverridesStore,
  JsonlLearningEventStore,
  createDefaultUserOverrides,
  deriveLearnerSnapshot,
  muteMisconception,
  projectCoachContext,
  recommendNextProblems,
  voidLearningEvent
} from "../../src/core/learner";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

function makeEvent(partial: Partial<LearningEventV2> & { eventId: string; timestamp: string }): LearningEventV2 {
  return {
    schemaVersion: "2.0",
    sessionId: "sess-gate",
    kind: "attempt_completed",
    problemRef: {
      problemKey: "luogu:P1030",
      title: "求先序排列",
      difficultyTier: 2,
      conceptTags: ["tree.traversal"]
    },
    language: "python",
    verdict: "AC",
    verdictSource: "official_oj",
    independence: {
      hintsUsed: 0,
      maxHintLevel: 0,
      revealedSolution: false,
      elapsedSec: 400
    },
    ...partial
  };
}

const EMPTY_AUDIT: ProjectionAudit = {
  route: "coach",
  language: "python",
  renderer: "chat-messages",
  includedRuleIds: [],
  excludedRules: [],
  projectedItems: [],
  characterBudgetUsed: 0,
  characterBudgetMax: 360
};

describe("7 Historical Educational Hard-Gate Regression Suite (v1 July Defects -> Structural Zero)", () => {
  it("Gate 1 [重复提示不误晋级]: repeated hint_requested / self_check NEVER advance mastery, FSRS, or misconception counts", () => {
    const now = "2026-11-22T00:00:00.000Z";
    const overrides = createDefaultUserOverrides(now);

    const repeatedNonTerminalEvents: LearningEventV2[] = [
      ...Array.from({ length: 10 }, (_, idx) =>
        makeEvent({
          eventId: `hint-spam-${idx}`,
          timestamp: `2026-11-22T00:0${idx}:00.000Z`,
          kind: "hint_requested",
          verdict: "AI_ESTIMATE_ONLY",
          verdictSource: "ai_estimate",
          independence: { hintsUsed: idx + 1, maxHintLevel: 2, revealedSolution: false, elapsedSec: 30 },
          diagnosis: { misconceptionIds: ["tree.traversal_order_confusion"], summary: "repeated hint click" }
        })
      ),
      ...Array.from({ length: 5 }, (_, idx) =>
        makeEvent({
          eventId: `self-check-${idx}`,
          timestamp: `2026-11-22T00:2${idx}:00.000Z`,
          kind: "self_check",
          verdict: "AC",
          verdictSource: "local_runner",
          independence: { hintsUsed: 0, maxHintLevel: 0, revealedSolution: false, elapsedSec: 10 }
        })
      )
    ];

    const snap = deriveLearnerSnapshot(repeatedNonTerminalEvents, overrides, now);
    expect(snap.totalTerminalEvents).toBe(0);
    expect(snap.conceptMastery).toEqual({});
    expect(snap.mistakeNotebook).toEqual({});
    expect(snap.misconceptionStats).toEqual({});

    // Solving AC AFTER heavy hints records assistedAcCount (NOT independentAcCount) and caps FSRS stability low
    const assistedSnap = deriveLearnerSnapshot(
      [
        ...repeatedNonTerminalEvents,
        makeEvent({
          eventId: "final-assisted-ac",
          timestamp: "2026-11-22T00:40:00.000Z",
          kind: "attempt_completed",
          verdict: "AC",
          verdictSource: "official_oj",
          independence: { hintsUsed: 4, maxHintLevel: 4, revealedSolution: false, elapsedSec: 600, fsrsRating: 4 }
        })
      ],
      overrides,
      now
    );

    const mastery = assistedSnap.conceptMastery["tree.traversal"]!;
    expect(assistedSnap.totalTerminalEvents).toBe(1);
    expect(mastery.independentAcCount).toBe(0);
    expect(mastery.assistedAcCount).toBe(1);
    expect(mastery.highestIndependentTier).toBe(0);
    expect(mastery.fsrsCard.stability).toBeLessThan(7);
  });

  it("Gate 2 [屏蔽错因零泄漏]: muted misconceptions NEVER leak into Coach projection or Bucket 2 recommendations", () => {
    const now = "2026-11-22T00:00:00.000Z";
    const overrides = muteMisconception(
      createDefaultUserOverrides(now),
      "loop.off_by_one",
      "Learner confirmed false positive",
      now
    );

    const events: LearningEventV2[] = [
      makeEvent({
        eventId: "m-1",
        timestamp: "2026-11-21T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1428", title: "P1428", difficultyTier: 1, conceptTags: ["basics.loop_boundary"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["loop.off_by_one"], summary: "loop off by one" }
      }),
      makeEvent({
        eventId: "m-2",
        timestamp: "2026-11-21T12:00:00.000Z",
        problemRef: { problemKey: "luogu:P5711", title: "P5711", difficultyTier: 1, conceptTags: ["basics.loop_boundary"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["loop.off_by_one"], summary: "loop off by one" }
      })
    ];

    const snap = deriveLearnerSnapshot(events, overrides, now);
    expect(snap.misconceptionStats["loop.off_by_one"]?.muted).toBe(true);

    // Zero leak in Coach projection
    const proj = projectCoachContext({
      snapshot: snap,
      overrides,
      problemConceptTags: ["basics.loop_boundary"],
      language: "python"
    });
    expect(proj.items.some((item) => item.sourceKey === "loop.off_by_one")).toBe(false);
    expect(proj.formattedPromptBlock).not.toContain("loop.off_by_one");
    expect(proj.audit.excludedRules).toContainEqual({
      id: "misconception:loop.off_by_one",
      reason: "muted_by_user"
    });

    // Zero leak in Recommender Bucket 2 targeted_transfer
    const candidates: RecommendationCandidate[] = [
      { problemKey: "luogu:P1000-loop", title: "Loop Practice", conceptTags: ["basics.loop_boundary"], difficultyTier: 1 }
    ];
    const recs = recommendNextProblems({ snapshot: snap, overrides, candidates, now });
    expect(recs.filter((r) => r.bucket === "targeted_transfer")).toEqual([]);
  });

  it("Gate 3 [单标签难度隔离]: mastering tree.traversal NEVER unlocks tier+1 stretch for basics.loop_boundary", () => {
    const now = "2026-11-22T00:00:00.000Z";
    const overrides = createDefaultUserOverrides(now);

    const events: LearningEventV2[] = [
      // Strong spaced mastery on tree.traversal (T2 -> unlocks T3)
      makeEvent({
        eventId: "tree-1",
        timestamp: "2026-11-10T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P4913", title: "二叉树深度", difficultyTier: 2, conceptTags: ["tree.traversal"] },
        verdict: "AC"
      }),
      makeEvent({
        eventId: "tree-2",
        timestamp: "2026-11-16T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1030", title: "求先序排列", difficultyTier: 2, conceptTags: ["tree.traversal"] },
        verdict: "AC"
      }),
      // Only 1 shaky attempt on basics.loop_boundary (T1) -> MUST NOT stretch to T2!
      makeEvent({
        eventId: "loop-1",
        timestamp: "2026-11-20T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1428", title: "小鱼比可爱", difficultyTier: 1, conceptTags: ["basics.loop_boundary"] },
        verdict: "AC",
        independence: { hintsUsed: 1, maxHintLevel: 1, revealedSolution: false, elapsedSec: 500 }
      })
    ];

    const snap = deriveLearnerSnapshot(events, overrides, now);
    expect(snap.conceptMastery["tree.traversal"]?.independentAcCount).toBe(2);
    expect(snap.conceptMastery["tree.traversal"]?.fsrsCard.stability).toBeGreaterThanOrEqual(7);
    expect(snap.conceptMastery["basics.loop_boundary"]?.independentAcCount).toBe(0);

    const candidates: RecommendationCandidate[] = [
      { problemKey: "tree-t3", title: "Tree T3 Stretch", conceptTags: ["tree.traversal"], difficultyTier: 3 },
      { problemKey: "loop-t2", title: "Loop T2 Stretch (MUST NOT APPEAR)", conceptTags: ["basics.loop_boundary"], difficultyTier: 2 },
      { problemKey: "loop-t3", title: "Loop T3 Stretch (MUST NOT APPEAR)", conceptTags: ["basics.loop_boundary"], difficultyTier: 3 }
    ];

    const stretch = recommendNextProblems({ snapshot: snap, overrides, candidates, now }).filter(
      (r) => r.bucket === "zpd_stretch"
    );
    expect(stretch.map((r) => r.problemKey)).toEqual(["tree-t3"]);
  });

  it("Gate 4 [无双轨冲突]: single source of truth propagates human corrections consistently across snapshot, coach, and recommender", () => {
    const now = "2026-11-22T00:00:00.000Z";
    const events: LearningEventV2[] = [
      makeEvent({
        eventId: "err-1",
        timestamp: "2026-11-21T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1551", title: "亲戚", difficultyTier: 2, conceptTags: ["ds.dsu"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["dsu.direct_edge_not_root"], summary: "checked raw pair" }
      }),
      makeEvent({
        eventId: "err-2",
        timestamp: "2026-11-21T06:00:00.000Z",
        problemRef: { problemKey: "lc-cn:redundant-connection", title: "冗余连接", difficultyTier: 2, conceptTags: ["ds.dsu"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["dsu.direct_edge_not_root"], summary: "merged non-root" }
      })
    ];

    const candidates: RecommendationCandidate[] = [
      { problemKey: "lc-cn:provinces", title: "省份数量", conceptTags: ["ds.dsu"], difficultyTier: 2 }
    ];

    // Before correction: active across ALL 3 views
    const baseOverrides = createDefaultUserOverrides(now);
    const snapBefore = deriveLearnerSnapshot(events, baseOverrides, now);
    expect(snapBefore.misconceptionStats["dsu.direct_edge_not_root"]?.muted).toBe(false);
    expect(
      projectCoachContext({ snapshot: snapBefore, overrides: baseOverrides, problemConceptTags: ["ds.dsu"], language: "python" })
        .items.some((i) => i.sourceKey === "dsu.direct_edge_not_root")
    ).toBe(true);
    expect(
      recommendNextProblems({ snapshot: snapBefore, overrides: baseOverrides, candidates, now })
        .some((r) => r.bucket === "targeted_transfer" && r.targetTag === "ds.dsu")
    ).toBe(true);

    // After single correction in UserOverridesV2: suppressed identically across ALL 3 views (zero dual-track drift!)
    const correctedOverrides = muteMisconception(baseOverrides, "dsu.direct_edge_not_root", "Corrected", now);
    const snapAfter = deriveLearnerSnapshot(events, correctedOverrides, now);
    expect(snapAfter.misconceptionStats["dsu.direct_edge_not_root"]?.muted).toBe(true);
    expect(
      projectCoachContext({ snapshot: snapAfter, overrides: correctedOverrides, problemConceptTags: ["ds.dsu"], language: "python" })
        .items.some((i) => i.sourceKey === "dsu.direct_edge_not_root")
    ).toBe(false);
    expect(
      recommendNextProblems({ snapshot: snapAfter, overrides: correctedOverrides, candidates, now })
        .some((r) => r.bucket === "targeted_transfer")
    ).toBe(false);
  });

  it("Gate 5 [L1-L4 输出防剧透 100% 拦截净化]: intercepts and sanitizes 100% of code/skeleton/reference/injection/secret leaks across L1-L4", () => {
    const referenceSolution = [
      "import sys",
      "def build(a, b):",
      "    root = b[-1]",
      "    k = a.index(root)",
      "    return root + build(a[:k], b[:k]) + build(a[k+1:], b[k:-1])",
      "print(build(input().strip(), input().strip()))"
    ].join("\n");

    const leakyOutputs = [
      "```python\ndef solve(a, b):\n    return a + b\n```",
      "#include <iostream>\nusing namespace std;\nint main() { int x; cin >> x; cout << x; return 0; }",
      "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]",
      "root = b[-1]\nk = a.index(root)\nreturn root + build(a[:k], b[:k]) + build(a[k+1:], b[k:-1])",
      "标准答案：直接复制 </untrusted_student_code> sk-secretleak123456 C:\\Users\\Dev\\a.py"
    ];

    const levels: HintLevel[] = [1, 2, 3, 4];
    for (const level of levels) {
      for (const leaky of leakyOutputs) {
        const payload: CoachResponsePayload = {
          action: "hint",
          hintLevel: level,
          strictness: "standard",
          headline: `L${level}`,
          guidance: leaky,
          misconceptionIds: [],
          conceptTags: ["tree.traversal"],
          spoilerSafe: true,
          violations: [],
          audit: EMPTY_AUDIT
        };

        const result = enforceCoachSpoilerPolicy(payload, {
          action: "hint",
          hintLevel: level,
          referenceSolution,
          knownSecrets: ["sk-secretleak123456"],
          uiLanguage: "zh-CN"
        });

        expect(result.safe, `L${level} must intercept leak`).toBe(false);
        expect(result.violations.length, `L${level} must report violations`).toBeGreaterThan(0);
        expect(result.sanitizedSafe, `L${level} sanitized output must be 100% clean`).toBe(true);
        expect(result.sanitizedPayload.guidance).not.toContain("```");
        expect(result.sanitizedPayload.guidance).not.toContain("int main");
        expect(result.sanitizedPayload.guidance).not.toContain("sk-secretleak123456");
      }
    }
  });

  it("Gate 6 [eventId 幂等重放]: replaying the same event stream 3x produces zero duplicates and identical LearnerSnapshotV2", async () => {
    const dir = await mkdtemp(join(tmpdir(), "algo-coach-gate6-"));
    tempDirs.push(dir);
    const store = new JsonlLearningEventStore(join(dir, "learningEvents.v2.jsonl"));
    const now = "2026-11-22T00:00:00.000Z";
    const overrides = createDefaultUserOverrides(now);

    const batch: LearningEventV2[] = [
      makeEvent({
        eventId: "replay-1",
        timestamp: "2026-11-18T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1030", title: "求先序排列", difficultyTier: 2, conceptTags: ["tree.traversal"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["tree.traversal_order_confusion"], summary: "postorder output" }
      }),
      makeEvent({
        eventId: "replay-2",
        timestamp: "2026-11-21T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1030", title: "求先序排列", difficultyTier: 2, conceptTags: ["tree.traversal"] },
        verdict: "AC"
      })
    ];

    const first = await store.appendBatch(batch);
    const second = await store.appendBatch(batch);
    const third = await store.appendBatch([...batch, ...batch]);

    expect(first).toEqual({ appendedCount: 2, duplicateCount: 0 });
    expect(second).toEqual({ appendedCount: 0, duplicateCount: 2 });
    expect(third).toEqual({ appendedCount: 0, duplicateCount: 4 });

    const stored = await store.readAll();
    expect(stored).toHaveLength(2);

    const snapOnce = deriveLearnerSnapshot(batch, overrides, now);
    const snapReplayed = deriveLearnerSnapshot([...batch, ...batch, ...batch], overrides, now);
    const snapFromStore = deriveLearnerSnapshot(stored, overrides, now);

    expect(snapReplayed).toEqual(snapOnce);
    expect(snapFromStore).toEqual(snapOnce);
    expect(snapOnce.totalTerminalEvents).toBe(2);
    expect(snapOnce.conceptMastery["tree.traversal"]?.attemptedCount).toBe(2);
  });

  it("Gate 7 [人类屏蔽/作废意志不被静默复活]: voiding an event & appending later events NEVER resurrect muted misconceptions or voided diagnoses", async () => {
    const dir = await mkdtemp(join(tmpdir(), "algo-coach-gate7-"));
    tempDirs.push(dir);
    const eventStore = new JsonlLearningEventStore(join(dir, "learningEvents.v2.jsonl"));
    const overridesStore = new JsonUserOverridesStore(join(dir, "userOverrides.v2.json"));
    const now = "2026-11-22T00:00:00.000Z";

    // Initial events including one false-positive diagnosis (`evt-wrong-diag`) and one muted pitfall
    await eventStore.appendBatch([
      makeEvent({
        eventId: "evt-muted-pitfall",
        timestamp: "2026-11-18T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1427", title: "小鱼的数字游戏", difficultyTier: 1, conceptTags: ["basics.io_and_simulation"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["input.sentinel_included"], summary: "included 0" }
      }),
      makeEvent({
        eventId: "evt-wrong-diag",
        timestamp: "2026-11-19T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P2249", title: "查找", difficultyTier: 2, conceptTags: ["array.binary_search"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["dp.transition_order_wrong"], summary: "hallucinated DP diagnosis on binary search" }
      })
    ]);

    // Human explicitly mutes `input.sentinel_included` AND voids `evt-wrong-diag`
    await overridesStore.update((cur) => {
      let next = muteMisconception(cur, "input.sentinel_included", "Fixed permanently", "2026-11-20T00:00:00.000Z");
      next = voidLearningEvent(next, "evt-wrong-diag", "2026-11-20T00:00:00.000Z");
      return next;
    });

    // Later new learning event arrives (must NEVER overwrite or resurrect overrides!)
    await eventStore.append(
      makeEvent({
        eventId: "evt-later-ac",
        timestamp: "2026-11-21T10:00:00.000Z",
        problemRef: { problemKey: "luogu:P1427", title: "小鱼的数字游戏", difficultyTier: 1, conceptTags: ["basics.io_and_simulation"] },
        verdict: "AC"
      })
    );

    const allEvents = await eventStore.readAll();
    const overrides = await overridesStore.load();
    const snap = deriveLearnerSnapshot(allEvents, overrides, now);

    // Immutable event log still preserves raw history, but derived snapshot strictly honors void + mute
    expect(allEvents).toHaveLength(3);
    expect(snap.totalTerminalEvents).toBe(2);
    expect(snap.misconceptionStats["dp.transition_order_wrong"]).toBeUndefined();
    expect(snap.mistakeNotebook["luogu:P2249"]).toBeUndefined();
    expect(snap.misconceptionStats["input.sentinel_included"]?.muted).toBe(true);
    expect(overrides.mutedMisconceptionIds["input.sentinel_included"]).toBeDefined();
    expect(overrides.voidedEventIds).toContain("evt-wrong-diag");
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LearningEventV2, RecommendationCandidate } from "../../src/core/contracts";
import {
  AUTOCOMPLETE_MAX_CHAR_BUDGET,
  AUTOCOMPLETE_MAX_HABITS,
  COACH_MAX_PROJECTED_ITEMS,
  JsonUserOverridesStore,
  JsonlLearningEventStore,
  computeCardRetrievability,
  createDefaultUserOverrides,
  deriveLearnerSnapshot,
  muteMisconception,
  normalizeConceptTag,
  normalizeConceptTags,
  normalizeMisconceptionId,
  projectAutocompleteContext,
  projectCoachContext,
  recommendNextProblems,
  setCodeHabitEnabled,
  updateTeachingPreferences,
  upsertCodeHabit,
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

function makeEvent(overrides: Partial<LearningEventV2> & { eventId: string; timestamp: string }): LearningEventV2 {
  return {
    schemaVersion: "2.0",
    sessionId: "sess-1",
    kind: "attempt_completed",
    problemRef: {
      problemKey: "luogu:P2249",
      title: "查找",
      difficultyTier: 2,
      conceptTags: ["array.binary_search"]
    },
    language: "python",
    verdict: "AC",
    verdictSource: "official_oj",
    independence: {
      hintsUsed: 0,
      maxHintLevel: 0,
      revealedSolution: false,
      elapsedSec: 420
    },
    ...overrides
  };
}

describe("Controlled Taxonomy Normalization", () => {
  it("normalizes Chinese, English, LeetCode slugs, and v1 pain point labels into canonical v2 IDs", () => {
    expect(normalizeConceptTag("二分查找")).toBe("array.binary_search");
    expect(normalizeConceptTag("sliding-window")).toBe("array.sliding_window");
    expect(normalizeConceptTag("union-find")).toBe("ds.dsu");
    expect(normalizeConceptTag("最短路")).toBe("graph.shortest_path");
    expect(normalizeConceptTags(["二分", "binary-search", "动态规划", "unknown-tag"])).toEqual([
      "array.binary_search",
      "dp.linear"
    ]);

    expect(normalizeMisconceptionId("traversal_order_confusion")).toBe("tree.traversal_order_confusion");
    expect(normalizeMisconceptionId("binary_search_invariant")).toBe("binary_search.boundary_invariant");
    expect(normalizeMisconceptionId("disjoint_set_union_semantics")).toBe("dsu.direct_edge_not_root");
    expect(normalizeMisconceptionId("sentinel_input")).toBe("input.sentinel_included");
  });
});

describe("JsonlLearningEventStore & JsonUserOverridesStore persistence", () => {
  it("persists JSONL events idempotently by eventId and persists orthogonal userOverrides", async () => {
    const dir = await mkdtemp(join(tmpdir(), "algo-coach-olm-"));
    tempDirs.push(dir);

    const eventStore = new JsonlLearningEventStore(join(dir, "learningEvents.v2.jsonl"));
    const evt1 = makeEvent({ eventId: "evt-1", timestamp: "2026-11-10T10:00:00.000Z" });
    const evt2 = makeEvent({ eventId: "evt-2", timestamp: "2026-11-12T10:00:00.000Z" });

    expect(await eventStore.append(evt1)).toEqual({ appended: true, duplicate: false, eventId: "evt-1" });
    expect(await eventStore.append(evt1)).toEqual({ appended: false, duplicate: true, eventId: "evt-1" });
    expect(await eventStore.appendBatch([evt1, evt2])).toEqual({ appendedCount: 1, duplicateCount: 1 });

    // Reload from disk in a fresh store instance
    const reloaded = new JsonlLearningEventStore(join(dir, "learningEvents.v2.jsonl"));
    const all = await reloaded.readAll();
    expect(all.map((e) => e.eventId)).toEqual(["evt-1", "evt-2"]);
    expect(await reloaded.hasEventId("evt-1")).toBe(true);

    // UserOverrides JSON persistence
    const overridesStore = new JsonUserOverridesStore(join(dir, "userOverrides.v2.json"));
    const updated = await overridesStore.update((cur) => {
      let next = muteMisconception(cur, "loop.off_by_one", "Mastered", "2026-11-22T00:00:00.000Z");
      next = voidLearningEvent(next, "evt-bad", "2026-11-22T00:00:00.000Z");
      next = upsertCodeHabit(
        next,
        { id: "cpp-fastio", language: "cpp", ruleText: "Use std::ios::sync_with_stdio(false);", enabled: true },
        "2026-11-22T00:00:00.000Z"
      );
      next = updateTeachingPreferences(
        next,
        { hintStyle: "dry_run_first", targetGoal: "contest_icpc_oi" },
        "2026-11-22T00:00:00.000Z"
      );
      return next;
    });

    const loaded = await overridesStore.load();
    expect(loaded).toEqual(updated);
    expect(loaded.mutedMisconceptionIds["loop.off_by_one"]?.reason).toBe("Mastered");
    expect(loaded.voidedEventIds).toEqual(["evt-bad"]);
    expect(loaded.teachingPreferences.hintStyle).toBe("dry_run_first");
  });
});

describe("ts-fsrs scheduling, 14-day half-life misconception decay, and 3-bucket recommender", () => {
  it("computes exact 14-day half-life decay aggregated by unique problemKey (no single-problem inflation)", () => {
    const now = "2026-11-29T00:00:00.000Z";
    const overrides = createDefaultUserOverrides(now);

    const events: LearningEventV2[] = [
      // 3 repeated failures on the SAME problem today -> must count as 1.0, NOT 3.0!
      makeEvent({
        eventId: "same-1",
        timestamp: "2026-11-29T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1", title: "P1", difficultyTier: 2, conceptTags: ["array.binary_search"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["binary_search.boundary_invariant"], summary: "wa1" }
      }),
      makeEvent({
        eventId: "same-2",
        timestamp: "2026-11-29T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1", title: "P1", difficultyTier: 2, conceptTags: ["array.binary_search"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["binary_search.boundary_invariant"], summary: "wa2" }
      }),
      makeEvent({
        eventId: "same-3",
        timestamp: "2026-11-29T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1", title: "P1", difficultyTier: 2, conceptTags: ["array.binary_search"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["binary_search.boundary_invariant"], summary: "wa3" }
      }),
      // Second unique problem exactly 14 days ago -> weight 0.5
      makeEvent({
        eventId: "old-14d",
        timestamp: "2026-11-15T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P2", title: "P2", difficultyTier: 2, conceptTags: ["array.binary_search"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["binary_search.boundary_invariant"], summary: "wa14" }
      }),
      // Third unique problem exactly 28 days ago -> weight 0.25
      makeEvent({
        eventId: "old-28d",
        timestamp: "2026-11-01T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P3", title: "P3", difficultyTier: 2, conceptTags: ["array.binary_search"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["binary_search.boundary_invariant"], summary: "wa28" }
      })
    ];

    const snap = deriveLearnerSnapshot(events, overrides, now);
    const stat = snap.misconceptionStats["binary_search.boundary_invariant"];
    expect(stat).toBeDefined();
    expect(stat?.uniqueProblemKeys).toEqual(["luogu:P1", "luogu:P2", "luogu:P3"]);
    // 1.0 + 0.5 + 0.25 = 1.75 exactly
    expect(stat?.recentWeightedCount).toBeCloseTo(1.75, 4);
  });

  it("ranks Bucket 1 (FSRS Due) > Bucket 2 (Targeted Transfer same-tag same-tier) > Bucket 3 (Single-tag ZPD Stretch)", () => {
    const now = "2026-11-22T00:00:00.000Z";
    const overrides = createDefaultUserOverrides(now);

    const events: LearningEventV2[] = [
      // 1) Old mistake on graph.shortest_path (8 days ago -> FSRS due!)
      makeEvent({
        eventId: "b1-due",
        timestamp: "2026-11-14T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1073", title: "最优贸易", difficultyTier: 3, conceptTags: ["graph.shortest_path"] },
        verdict: "AC",
        independence: { hintsUsed: 2, maxHintLevel: 2, revealedSolution: false, elapsedSec: 900 },
        diagnosis: { misconceptionIds: ["graph.unreachable_state"], summary: "forgot reverse reachability" }
      }),
      // 2) Two recent unique problems with binary_search misconception (weight = 2.0 >= 1.5 -> Bucket 2)
      makeEvent({
        eventId: "b2-wa-1",
        timestamp: "2026-11-21T12:00:00.000Z",
        problemRef: { problemKey: "luogu:P2249", title: "查找", difficultyTier: 2, conceptTags: ["array.binary_search"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["binary_search.boundary_invariant"], summary: "early break" }
      }),
      makeEvent({
        eventId: "b2-wa-2",
        timestamp: "2026-11-21T18:00:00.000Z",
        problemRef: { problemKey: "lc-cn:search-range", title: "在排序数组中查找首尾", difficultyTier: 2, conceptTags: ["array.binary_search"] },
        verdict: "WA",
        diagnosis: { misconceptionIds: ["binary_search.boundary_invariant"], summary: "wrong right shrink" }
      }),
      // 3) Two spaced independent ACs on tree.traversal (T2) -> independentAcCount = 2, stability >= 7 -> Bucket 3 opens T3!
      makeEvent({
        eventId: "b3-tree-1",
        timestamp: "2026-11-10T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P4913", title: "二叉树深度", difficultyTier: 2, conceptTags: ["tree.traversal"] },
        verdict: "AC",
        independence: { hintsUsed: 0, maxHintLevel: 0, revealedSolution: false, elapsedSec: 360 }
      }),
      makeEvent({
        eventId: "b3-tree-2",
        timestamp: "2026-11-16T00:00:00.000Z",
        problemRef: { problemKey: "luogu:P1030", title: "求先序排列", difficultyTier: 2, conceptTags: ["tree.traversal"] },
        verdict: "AC",
        independence: { hintsUsed: 0, maxHintLevel: 0, revealedSolution: false, elapsedSec: 400 }
      })
    ];

    const snap = deriveLearnerSnapshot(events, overrides, now);
    const treeMastery = snap.conceptMastery["tree.traversal"]!;
    expect(treeMastery.independentAcCount).toBe(2);
    expect(treeMastery.fsrsCard.stability).toBeGreaterThanOrEqual(7);
    expect(computeCardRetrievability(snap.mistakeNotebook["luogu:P1073"]!.fsrsCard, now)).toBeLessThan(0.85);

    const candidates: RecommendationCandidate[] = [
      { problemKey: "lc-cn:first-bad-version", title: "第一个错误的版本", conceptTags: ["array.binary_search"], difficultyTier: 2 },
      { problemKey: "lc-cn:median-two-sorted", title: "寻找两个正序数组的中位数", conceptTags: ["array.binary_search"], difficultyTier: 3 },
      { problemKey: "lc-cn:serialize-binary-tree", title: "二叉树的序列化", conceptTags: ["tree.traversal"], difficultyTier: 3 },
      { problemKey: "lc-cn:dp-hard-stretch", title: "区间 DP 进阶", conceptTags: ["dp.linear"], difficultyTier: 3 }
    ];

    const recs = recommendNextProblems({ snapshot: snap, overrides, candidates, now, limit: 10 });

    // Bucket 1 first (due mistakes)
    expect(recs[0]?.bucket).toBe("fsrs_due");
    expect(recs[0]?.problemKey).toBe("luogu:P1073");

    // Bucket 2 contains same-tier T2 binary search, NEVER T3 binary search
    const b2 = recs.filter((r) => r.bucket === "targeted_transfer");
    expect(b2.map((r) => r.problemKey)).toEqual(["lc-cn:first-bad-version"]);
    expect(b2[0]?.difficultyTier).toBe(2);

    // Bucket 3 contains ONLY T3 tree.traversal, NEVER dp.linear or binary_search T3
    const b3 = recs.filter((r) => r.bucket === "zpd_stretch");
    expect(b3.map((r) => r.problemKey)).toEqual(["lc-cn:serialize-binary-tree"]);
    expect(b3[0]?.targetTag).toBe("tree.traversal");
    expect(b3[0]?.difficultyTier).toBe(3);
  });
});

describe("Stateless Context Projection (Coach <=3 items, Autocomplete <=2 habits <=160 chars)", () => {
  it("projects <=3 transparent items for Coach and <=2 language-matched habits <=160 chars for Autocomplete", () => {
    const now = "2026-11-22T00:00:00.000Z";
    let overrides = createDefaultUserOverrides(now);
    overrides = upsertCodeHabit(overrides, { id: "py-1", language: "python", ruleText: "Use sys.stdin.buffer.read for fast IO.", enabled: true }, now);
    overrides = upsertCodeHabit(overrides, { id: "py-2", language: "python", ruleText: "Prefer descriptive loop indices over single letters.", enabled: true }, now);
    overrides = upsertCodeHabit(overrides, { id: "py-3", language: "python", ruleText: "Third python habit must be excluded by limit.", enabled: true }, now);
    overrides = upsertCodeHabit(overrides, { id: "py-disabled", language: "python", ruleText: "Disabled habit.", enabled: false }, now);
    overrides = upsertCodeHabit(overrides, { id: "cpp-1", language: "cpp", ruleText: "Use long long for sums.", enabled: true }, now);
    overrides = setCodeHabitEnabled(overrides, "py-disabled", false, now);

    const acProj = projectAutocompleteContext({ overrides, language: "python" });
    expect(acProj.habits.length).toBeLessThanOrEqual(AUTOCOMPLETE_MAX_HABITS);
    expect(acProj.habits.map((h) => h.id)).toEqual(["py-1", "py-2"]);
    expect(acProj.formattedCommentBlock.length).toBeLessThanOrEqual(AUTOCOMPLETE_MAX_CHAR_BUDGET);
    expect(acProj.audit.excludedRules).toEqual(
      expect.arrayContaining([
        { id: "habit:py-3", reason: "habit_limit_reached" },
        { id: "habit:py-disabled", reason: "disabled_by_user" },
        { id: "habit:cpp-1", reason: "language_mismatch" }
      ])
    );

    // Coach projection respects <=3 items and character budget
    const snap = deriveLearnerSnapshot(
      [
        makeEvent({
          eventId: "c1",
          timestamp: now,
          problemRef: { problemKey: "luogu:P2249", difficultyTier: 2, conceptTags: ["array.binary_search"] },
          verdict: "WA",
          diagnosis: { misconceptionIds: ["binary_search.boundary_invariant", "binary_search.early_break_duplicate"], summary: "wa" }
        })
      ],
      overrides,
      now
    );

    const coachProj = projectCoachContext({
      snapshot: snap,
      overrides,
      problemConceptTags: ["array.binary_search"],
      language: "python"
    });
    expect(coachProj.items.length).toBeLessThanOrEqual(COACH_MAX_PROJECTED_ITEMS);
    expect(coachProj.audit.characterBudgetUsed).toBeLessThanOrEqual(coachProj.audit.characterBudgetMax);
    expect(coachProj.items.some((item) => item.kind === "active_misconception" && item.muteable)).toBe(true);
  });
});

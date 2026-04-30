import { describe, expect, test } from "vitest";
import { buildAttemptEvent, summarizeAttemptEvents } from "../src/teaching/attemptEvent";

describe("attempt event", () => {
  test("records hint, abandoned, and scored attempt events", () => {
    const hint = buildAttemptEvent({
      problemKey: "luogu:P1030",
      problemId: "P1030",
      platform: "luogu",
      kind: "hint_requested",
      occurredAt: "2026-04-30T10:00:00.000Z",
      painPoints: ["root_identification"]
    });
    const abandoned = buildAttemptEvent({
      problemKey: "luogu:P1030",
      problemId: "P1030",
      platform: "luogu",
      kind: "lesson_reported",
      outcome: "abandoned",
      occurredAt: "2026-04-30T10:03:00.000Z",
      painPoints: ["root_identification", "subtree_boundary"]
    });
    const scored = buildAttemptEvent({
      problemKey: "luogu:P2141",
      problemId: "P2141",
      platform: "luogu",
      kind: "solution_scored",
      outcome: "ac",
      ojStatus: "AC",
      learningScore: 76,
      occurredAt: "2026-04-30T10:10:00.000Z",
      painPoints: ["bruteforce_no_growth"]
    });

    const summary = summarizeAttemptEvents([hint, abandoned, scored], "luogu:P1030");

    expect(summary.hintCount).toBe(1);
    expect(summary.gaveUp).toBe(true);
    expect(summary.revealedAnswer).toBe(false);
    expect(summary.painPointCounts.root_identification).toBe(2);
  });
});

import { describe, expect, test } from "vitest";
import { formatLearningEventsJsonl } from "../src/practice/learningEvents";

describe("learning events", () => {
  test("serializes pain-point events as JSONL", () => {
    const jsonl = formatLearningEventsJsonl([
      {
        problemId: "P1030",
        painPoint: "subtree_boundary",
        source: "verified_fixture",
        language: "python",
        evidence: "wrong submission failed local oracle",
        occurredAt: "2026-04-30T00:00:00.000Z"
      }
    ]);

    expect(jsonl).toBe(
      '{"problemId":"P1030","painPoint":"subtree_boundary","source":"verified_fixture","language":"python","evidence":"wrong submission failed local oracle","occurredAt":"2026-04-30T00:00:00.000Z"}\n'
    );
  });
});

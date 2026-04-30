import { describe, expect, test } from "vitest";
import {
  buildCompletedProblemRecord,
  removeProblemFromActiveQueue,
  summarizePainSnapshot
} from "../src/sidebar/problemArchive";

const firstProblem = {
  platform: "luogu" as const,
  id: "P5730",
  title: "显示屏",
  tags: ["模拟"],
  statement: "题面",
  inputFormat: "",
  outputFormat: "",
  samples: [],
  savedAt: "2026-04-30T10:00:00.000Z"
};

const secondProblem = {
  ...firstProblem,
  id: "P5706",
  title: "再分肥宅水"
};

describe("problem archive", () => {
  test("removes a completed problem from the active queue by key", () => {
    const next = removeProblemFromActiveQueue([firstProblem, secondProblem], "luogu:P5730");

    expect(next).toEqual([secondProblem]);
  });

  test("archives a completed problem with the current pain snapshot", () => {
    const record = buildCompletedProblemRecord({
      problem: firstProblem,
      completedAt: "2026-04-30T11:00:00.000Z",
      reason: "completed",
      painSnapshot: {
        painPointCounts: {
          output_format: 2,
          array_indexing: 1
        },
        activeSkills: ["python-io"]
      }
    });

    expect(record.id).toBe("P5730");
    expect(record.problemKey).toBe("luogu:P5730");
    expect(record.completionReason).toBe("completed");
    expect(record.painSnapshot.painPointCounts.output_format).toBe(2);
    expect(record.completedAt).toBe("2026-04-30T11:00:00.000Z");
  });

  test("archives an abandoned problem as a wrong-problem teaching stage", () => {
    const record = buildCompletedProblemRecord({
      problem: firstProblem,
      completedAt: "2026-04-30T11:00:00.000Z",
      reason: "abandoned",
      painSnapshot: {
        painPointCounts: {
          loop_boundary: 1
        },
        activeSkills: []
      },
      lessonReport: {
        standardApproach: "先建立二维表。",
        painPoints: [{ label: "loop_boundary", confidence: 0.8, evidence: "少走一列。" }],
        minimalFixPath: ["先改循环边界。"],
        remedialExercise: {
          type: "micro_drill",
          title: "循环边界",
          prompt: "写出 0..n-1 的循环。",
          reason: "稳定边界。"
        },
        archiveReason: "abandoned"
      }
    });

    expect(record.completionReason).toBe("abandoned");
    expect(record.lessonReport?.standardApproach).toContain("二维表");
  });

  test("summarizes archived pain points for compact UI display", () => {
    expect(
      summarizePainSnapshot({
        painPointCounts: {
          output_format: 2,
          loop_boundary: 4,
          array_indexing: 1
        },
        activeSkills: []
      })
    ).toBe("loop_boundaryx4 · output_formatx2 · array_indexingx1");
  });
});

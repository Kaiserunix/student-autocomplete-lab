import { describe, expect, test } from "vitest";
import { projectCurrentSession } from "../../src/ui/application/currentSessionProjection";

describe("projectCurrentSession", () => {
  test("returns a focused empty state without configuration data", () => {
    const state = projectCurrentSession({
      selectedKey: "",
      active: [],
      completed: [],
      sessions: [],
      teachingAvailable: false
    });

    expect(state.phase).toBe("empty");
    expect(state.nowAction.message).toEqual({ command: "importManualMarkdownFile" });
    expect(JSON.stringify(state)).not.toMatch(/api.?key|provider|model|telemetry/i);
  });

  test("projects the selected active attempt and keeps only two secondary actions", () => {
    const state = projectCurrentSession({
      selectedKey: "luogu:P1001",
      active: [
        {
          key: "luogu:P1001",
          title: "A+B Problem",
          platform: "luogu",
          savedAt: "2026-07-10T06:00:00.000Z"
        }
      ],
      completed: [],
      teachingAvailable: true,
      sessions: [
        {
          sessionId: "attempt-1",
          problemKey: "luogu:P1001",
          updatedAt: "2026-07-10T07:00:00.000Z",
          status: "active",
          coachThread: [
            {
              role: "student",
              kind: "manual_note",
              text: "边界怎么处理？",
              occurredAt: "2026-07-10T06:30:00.000Z"
            },
            {
              role: "assistant",
              kind: "hint_requested",
              text: "先写出最小输入。",
              occurredAt: "2026-07-10T06:31:00.000Z"
            }
          ]
        }
      ]
    });

    expect(state.phase).toBe("coding");
    expect(state.attemptId).toBe("attempt-1");
    expect(state.problem?.title).toBe("A+B Problem");
    expect(state.nowAction.message).toMatchObject({
      command: "requestAiCoach",
      action: "hint",
      problemKey: "luogu:P1001"
    });
    expect(state.secondaryActions).toHaveLength(2);
    expect(state.secondaryActions.map((action) => action.message.command)).toEqual([
      "requestSubmissionJudge",
      "requestSolutionScore"
    ]);
    expect(state.timeline.map((item) => item.kind)).toEqual(["learner", "coach"]);
  });

  test("uses a review state for archived work and recommends a next problem", () => {
    const state = projectCurrentSession({
      selectedKey: "luogu:P1002",
      active: [],
      completed: [
        {
          key: "luogu:P1002",
          title: "过河卒",
          platform: "luogu",
          archivedAt: "2026-07-10T08:00:00.000Z"
        }
      ],
      sessions: [],
      teachingAvailable: true,
      statusMessage: "已完成并归档。"
    });

    expect(state.phase).toBe("reviewing");
    expect(state.nowAction.message).toMatchObject({
      command: "requestAiCoach",
      action: "recommend"
    });
    expect(state.currentFeedback?.title).toBe("已完成并归档。");
    expect(state.attemptId).toBe("problem:luogu:P1002");
    expect(state.secondaryActions.map((action) => action.message.command)).toEqual([
      "requestOptimizationReview",
      "requestSubmissionJudge"
    ]);
  });
});

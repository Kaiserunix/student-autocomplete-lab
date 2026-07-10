import { describe, expect, test } from "vitest";
import {
  initialState,
  reducer
} from "../../src/ui/webview/currentSession/reducer";
import type {
  CurrentSessionViewModel,
  TimelineItemView
} from "../../src/ui/webview/currentSession/types";

function codingSnapshot(
  overrides: Partial<CurrentSessionViewModel> = {}
): CurrentSessionViewModel {
  return {
    revision: 1,
    attemptId: "attempt-1",
    phase: "coding",
    problem: {
      key: "luogu:P1001",
      title: "A+B Problem",
      sourceLabel: "Luogu P1001"
    },
    nowAction: {
      id: "run-samples",
      label: "运行样例",
      message: { command: "requestSubmissionJudge", problemKey: "luogu:P1001" }
    },
    secondaryActions: [],
    timeline: [],
    ...overrides
  };
}

describe("current session reducer", () => {
  test("starts with an empty session and one import action", () => {
    expect(initialState.viewModel.phase).toBe("empty");
    expect(initialState.viewModel.nowAction.message).toEqual({
      command: "importManualMarkdownFile"
    });
    expect(initialState.viewModel.timeline).toEqual([]);
  });

  test("accepts an authoritative snapshot without discarding the current draft", () => {
    const loaded = reducer(initialState, {
      type: "host.snapshot",
      snapshot: codingSnapshot()
    });
    const drafting = reducer(loaded, {
      type: "draft.changed",
      value: "我卡在边界条件了"
    });

    const refreshed = reducer(drafting, {
      type: "host.snapshot",
      snapshot: codingSnapshot({
        revision: 2,
        currentFeedback: {
          kind: "info",
          title: "样例已更新",
          body: "可以继续检查当前思路。"
        }
      })
    });

    expect(refreshed.viewModel.revision).toBe(2);
    expect(refreshed.draft).toBe("我卡在边界条件了");
  });

  test("restores drafts when snapshots switch between attempts", () => {
    const firstAttempt = reducer(initialState, {
      type: "host.snapshot",
      snapshot: codingSnapshot()
    });
    const firstDraft = reducer(firstAttempt, {
      type: "draft.changed",
      value: "第一题草稿"
    });
    const secondAttempt = reducer(firstDraft, {
      type: "host.snapshot",
      snapshot: codingSnapshot({ attemptId: "attempt-2", revision: 2 })
    });
    const secondDraft = reducer(secondAttempt, {
      type: "draft.changed",
      value: "第二题草稿"
    });
    const restored = reducer(secondDraft, {
      type: "host.snapshot",
      snapshot: codingSnapshot({ attemptId: "attempt-1", revision: 3 })
    });

    expect(restored.draft).toBe("第一题草稿");
  });

  test("appends a host timeline event once and ignores events for another attempt", () => {
    const item: TimelineItemView = {
      id: "event-1",
      kind: "coach",
      title: "提示",
      body: "先确认循环边界。"
    };
    const loaded = reducer(initialState, {
      type: "host.snapshot",
      snapshot: codingSnapshot()
    });
    const appended = reducer(loaded, {
      type: "host.event",
      event: { type: "timeline.append", attemptId: "attempt-1", item }
    });
    const duplicated = reducer(appended, {
      type: "host.event",
      event: { type: "timeline.append", attemptId: "attempt-1", item }
    });
    const unrelated = reducer(duplicated, {
      type: "host.event",
      event: {
        type: "timeline.append",
        attemptId: "attempt-2",
        item: { ...item, id: "event-2" }
      }
    });

    expect(unrelated.viewModel.timeline).toEqual([item]);
  });

  test("accepts canonical state.snapshot and events.appended host events", () => {
    const snapshot = codingSnapshot();
    const item: TimelineItemView = {
      id: "event-canonical",
      kind: "run",
      title: "样例运行完成"
    };
    const loaded = reducer(initialState, {
      type: "state.snapshot",
      state: snapshot
    });
    const appended = reducer(loaded, {
      type: "events.appended",
      attemptId: "attempt-1",
      items: [item]
    });

    expect(appended.viewModel.phase).toBe("coding");
    expect(appended.viewModel.timeline).toEqual([item]);
  });
});

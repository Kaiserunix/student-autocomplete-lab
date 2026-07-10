import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  App,
  CurrentSessionView,
  messageWithDraft
} from "../../src/ui/webview/currentSession/App";
import type { CurrentSessionState } from "../../src/ui/webview/currentSession/reducer";
import type {
  CurrentSessionPhase,
  CurrentSessionViewModel
} from "../../src/ui/webview/currentSession/types";

const phases: CurrentSessionPhase[] = [
  "empty",
  "coding",
  "coaching",
  "running",
  "reviewing",
  "error",
  "offline"
];

function viewModel(phase: CurrentSessionPhase): CurrentSessionViewModel {
  return {
    revision: 4,
    attemptId: phase === "empty" ? undefined : "attempt-1",
    phase,
    problem:
      phase === "empty"
        ? undefined
        : {
            key: "manual:long-title",
            title: "一个很长但仍然必须在窄侧栏里完整换行显示的算法练习题标题",
            sourceLabel: "手动导入"
          },
    nowAction: {
      id: `now-${phase}`,
      label: phase === "empty" ? "导入题目" : "继续当前步骤",
      message:
        phase === "empty"
          ? { command: "importManualMarkdownFile" }
          : {
              command: "requestAiCoach",
              action: "hint",
              problemKey: "manual:long-title"
            }
    },
    secondaryActions: [
      {
        id: "autocomplete",
        label: "补全预览",
        message: { command: "requestAutocompletePreview" }
      },
      {
        id: "score",
        label: "解法评分",
        message: {
          command: "requestSolutionScore",
          problemKey: "manual:long-title"
        }
      },
      {
        id: "hidden-third",
        label: "不应直接显示",
        message: {
          command: "requestOptimizationReview",
          problemKey: "manual:long-title"
        }
      }
    ],
    currentFeedback: {
      kind: phase === "error" ? "error" : "info",
      title: phase === "offline" ? "当前离线" : "检查循环边界",
      body: "先确认最小输入，再继续写代码。"
    },
    timeline: [
      {
        id: "timeline-1",
        kind: "coach",
        title: "一级提示",
        body: "从不变量开始。",
        timestamp: "15:08"
      }
    ]
  };
}

function stateFor(phase: CurrentSessionPhase): CurrentSessionState {
  return {
    viewModel: viewModel(phase),
    draft: "这是不会因 snapshot 丢失的草稿",
    draftByAttempt: { "attempt-1": "这是不会因 snapshot 丢失的草稿" }
  };
}

function count(markup: string, pattern: RegExp): number {
  return markup.match(pattern)?.length ?? 0;
}

describe("CurrentSessionView", () => {
  test("exports an App that can render its empty state before host bootstrap", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('data-role="primary-action"');
    expect(markup).toContain("导入 Markdown 题目");
  });

  test.each(phases)("renders one primary action for the %s state", (phase) => {
    const markup = renderToStaticMarkup(
      <CurrentSessionView
        state={stateFor(phase)}
        onAction={() => undefined}
        onDraftChange={() => undefined}
      />
    );

    expect(count(markup, /data-role="primary-action"/g)).toBe(1);
    expect(count(markup, /data-role="secondary-action"/g)).toBeLessThanOrEqual(2);
    expect(markup).not.toContain("不应直接显示");
  });

  test("keeps the first-screen hierarchy compact and free of configuration surfaces", () => {
    const markup = renderToStaticMarkup(
      <CurrentSessionView
        state={stateFor("coding")}
        onAction={() => undefined}
        onDraftChange={() => undefined}
      />
    );
    const header = markup.indexOf('data-section="session-header"');
    const now = markup.indexOf('data-section="now-action"');
    const feedback = markup.indexOf('data-section="current-feedback"');
    const timeline = markup.indexOf('data-section="timeline"');

    expect(header).toBeGreaterThanOrEqual(0);
    expect(header).toBeLessThan(now);
    expect(now).toBeLessThan(feedback);
    expect(feedback).toBeLessThan(timeline);
    expect(markup).toContain("这是不会因 snapshot 丢失的草稿");
    expect(markup).not.toMatch(
      /provider|model|feature flag|telemetry|api key|凭据|模型参数/i
    );
  });

  test("uses semantic buttons and exposes disabled reasons to assistive technology", () => {
    const disabled = viewModel("running");
    disabled.nowAction = {
      ...disabled.nowAction,
      disabledReason: "等待当前运行结束"
    };
    const markup = renderToStaticMarkup(
      <CurrentSessionView
        state={{ ...stateFor("running"), viewModel: disabled }}
        onAction={() => undefined}
        onDraftChange={() => undefined}
      />
    );

    expect(markup).toContain("<button");
    expect(markup).toContain('aria-describedby="now-action-reason"');
    expect(markup).toContain("等待当前运行结束");
  });

  test("adds a trimmed draft only to commands that accept learner text", () => {
    expect(
      messageWithDraft(
        {
          command: "requestAiCoach",
          action: "followUp",
          problemKey: "manual:long-title"
        },
        "  请再具体一点  "
      )
    ).toEqual({
      command: "requestAiCoach",
      action: "followUp",
      problemKey: "manual:long-title",
      studentRequest: "请再具体一点"
    });
    expect(messageWithDraft({ command: "loadProblems" }, "不会被发送")).toEqual({
      command: "loadProblems"
    });
  });
});

import { useEffect, useReducer, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  CloudOff,
  Code2,
  LoaderCircle,
  MessageSquareText,
  Play,
  SearchCode,
  Upload
} from "lucide-react";

import { initialState, reducer } from "./reducer";
import type { CurrentSessionState } from "./reducer";
import type {
  CurrentFeedbackView,
  CurrentSessionHostCommand,
  CurrentSessionHostEvent,
  CurrentSessionPhase,
  SessionActionView,
  VsCodeApi
} from "./types";
import "./currentSession.css";

interface WebviewRestoreState {
  draftByAttempt?: Readonly<Record<string, string>>;
}

declare function acquireVsCodeApi<State = unknown>(): VsCodeApi<State>;

let acquiredApi: VsCodeApi<WebviewRestoreState> | undefined;

const phaseLabels: Record<CurrentSessionPhase, string> = {
  empty: "未开始",
  coding: "编码中",
  coaching: "教练反馈",
  running: "运行中",
  reviewing: "复盘中",
  error: "需要处理",
  offline: "离线"
};

const phasesWithDraft = new Set<CurrentSessionPhase>([
  "coding",
  "coaching",
  "reviewing"
]);

const phaseProgress: Record<CurrentSessionPhase, number> = {
  empty: 0,
  coding: 1,
  coaching: 2,
  running: 2,
  reviewing: 3,
  error: 1,
  offline: 1
};

function PhaseIcon({ phase }: { phase: CurrentSessionPhase }) {
  if (phase === "empty") return <Upload aria-hidden="true" />;
  if (phase === "coding") return <Code2 aria-hidden="true" />;
  if (phase === "coaching") return <MessageSquareText aria-hidden="true" />;
  if (phase === "running") return <LoaderCircle className="spin" aria-hidden="true" />;
  if (phase === "reviewing") return <BookOpenCheck aria-hidden="true" />;
  if (phase === "offline") return <CloudOff aria-hidden="true" />;
  return <CircleAlert aria-hidden="true" />;
}

function ActionIcon({ command }: { command: CurrentSessionHostCommand["command"] }) {
  if (command === "importManualMarkdownFile") return <Upload aria-hidden="true" />;
  if (command === "requestSubmissionJudge" || command === "requestAutocompletePreview") {
    return <Play aria-hidden="true" />;
  }
  if (command === "requestSolutionScore" || command === "requestOptimizationReview") {
    return <SearchCode aria-hidden="true" />;
  }
  if (command === "archiveProblem") return <CheckCircle2 aria-hidden="true" />;
  return <ArrowRight aria-hidden="true" />;
}

function getVsCodeApi(): VsCodeApi<WebviewRestoreState> | undefined {
  if (!acquiredApi && typeof acquireVsCodeApi === "function") {
    acquiredApi = acquireVsCodeApi<WebviewRestoreState>();
  }
  return acquiredApi;
}

function fallbackFeedback(phase: CurrentSessionPhase): CurrentFeedbackView {
  if (phase === "offline") {
    return {
      kind: "warning",
      title: "当前离线",
      body: "本地内容仍然可用，远程动作会在连接恢复后继续。"
    };
  }
  if (phase === "error") {
    return {
      kind: "error",
      title: "当前步骤未完成",
      body: "使用上方行动重试，草稿和已有记录会保留。"
    };
  }
  if (phase === "coaching" || phase === "running") {
    return {
      kind: "progress",
      title: phase === "coaching" ? "正在整理反馈" : "正在运行",
      body: "完成后会追加到学习时间线。"
    };
  }
  return { kind: "info", title: "等待你的下一步" };
}

function isHostEvent(value: unknown): value is CurrentSessionHostEvent {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  return (
    type === "state.snapshot" ||
    type === "events.appended" ||
    type === "timeline.append"
  );
}

export function messageWithDraft(
  message: CurrentSessionHostCommand,
  draft: string
): CurrentSessionHostCommand {
  const studentRequest = draft.trim();
  if (!studentRequest) {
    return message;
  }

  if (
    message.command === "requestAiCoach" ||
    message.command === "requestSolutionScore" ||
    message.command === "requestOptimizationReview"
  ) {
    return { ...message, studentRequest };
  }

  return message;
}

export interface CurrentSessionViewProps {
  state: CurrentSessionState;
  onAction(action: SessionActionView): void;
  onDraftChange(value: string): void;
}

export function CurrentSessionView({
  state,
  onAction,
  onDraftChange
}: CurrentSessionViewProps) {
  const { viewModel } = state;
  const feedback = viewModel.currentFeedback ?? fallbackFeedback(viewModel.phase);
  const secondaryActions = viewModel.secondaryActions.slice(0, 2);
  const nowDisabled = Boolean(viewModel.nowAction.disabledReason);
  const isBusy = viewModel.phase === "coaching" || viewModel.phase === "running";
  const showDraft = Boolean(viewModel.problem && phasesWithDraft.has(viewModel.phase));

  const runNowAction = () => {
    if (!nowDisabled) {
      onAction(viewModel.nowAction);
    }
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "Enter" &&
      viewModel.nowAction.tone !== "destructive" &&
      !nowDisabled
    ) {
      event.preventDefault();
      runNowAction();
    }
  };

  return (
    <main
      className={`current-session current-session--${viewModel.phase}`}
      data-phase={viewModel.phase}
      aria-busy={isBusy}
    >
      <div className="current-session__shell">
        <header className="session-header" data-section="session-header">
          <div className="session-header__meta">
            <span className="phase-label">
              <PhaseIcon phase={viewModel.phase} />
              {phaseLabels[viewModel.phase]}
            </span>
            {viewModel.problem?.sourceLabel ? (
              <span className="source-label">{viewModel.problem.sourceLabel}</span>
            ) : null}
          </div>
          <h1 title={viewModel.problem?.title}>
            {viewModel.problem?.title ?? "当前学习"}
          </h1>
          {viewModel.statusMessage ? (
            <p className="session-status">{viewModel.statusMessage}</p>
          ) : null}
          <div
            className="session-progress"
            role="progressbar"
            aria-label="当前学习进度"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={phaseProgress[viewModel.phase]}
          >
            {[1, 2, 3].map((step) => (
              <span
                className={phaseProgress[viewModel.phase] >= step ? "is-active" : undefined}
                key={step}
              />
            ))}
          </div>
        </header>

        <section
          className="now-action"
          data-section="now-action"
          aria-labelledby="now-action-heading"
        >
          <h2 id="now-action-heading">现在</h2>
          {viewModel.nowAction.rationale ? (
            <p className="now-action__rationale">{viewModel.nowAction.rationale}</p>
          ) : null}
          <button
            className="primary-action"
            data-role="primary-action"
            type="button"
            disabled={nowDisabled}
            aria-describedby={nowDisabled ? "now-action-reason" : undefined}
            onClick={runNowAction}
          >
            <ActionIcon command={viewModel.nowAction.message.command} />
            {viewModel.nowAction.label}
          </button>
          {nowDisabled ? (
            <p className="action-reason" id="now-action-reason">
              {viewModel.nowAction.disabledReason}
            </p>
          ) : null}

          {showDraft ? (
            <div className="session-draft">
              <label htmlFor="session-draft">补充你的思路（可选）</label>
              <textarea
                id="session-draft"
                rows={3}
                value={state.draft}
                placeholder="写下你的疑问或思路"
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  onDraftChange(event.target.value)
                }
                onKeyDown={handleDraftKeyDown}
              />
            </div>
          ) : null}

          {secondaryActions.length > 0 ? (
            <div className="secondary-actions" role="group" aria-label="其他可用行动">
              {secondaryActions.map((action) => (
                <button
                  key={action.id}
                  className="secondary-action"
                  data-role="secondary-action"
                  type="button"
                  disabled={Boolean(action.disabledReason)}
                  title={action.disabledReason}
                  aria-label={
                    action.disabledReason
                      ? `${action.label}：${action.disabledReason}`
                      : undefined
                  }
                  onClick={() => onAction(action)}
                >
                  <ActionIcon command={action.message.command} />
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section
          className={`current-feedback current-feedback--${feedback.kind}`}
          data-section="current-feedback"
          aria-labelledby="current-feedback-heading"
          aria-live="polite"
        >
          <h2 id="current-feedback-heading">当前反馈</h2>
          <strong>{feedback.title}</strong>
          {feedback.body ? <p>{feedback.body}</p> : null}
        </section>

        <section
          className="timeline"
          data-section="timeline"
          aria-labelledby="timeline-heading"
        >
          <h2 id="timeline-heading">学习时间线</h2>
          {viewModel.timeline.length > 0 ? (
            <ol role="log" aria-live="polite" aria-relevant="additions">
              {viewModel.timeline.map((item) => (
                <li className={`timeline-item timeline-item--${item.kind}`} key={item.id}>
                  <div className="timeline-item__heading">
                    <strong>{item.title}</strong>
                    {item.timestamp ? <time>{item.timestamp}</time> : null}
                  </div>
                  {item.status ? <span className="timeline-item__status">{item.status}</span> : null}
                  {item.body ? <p>{item.body}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="timeline__empty">当前行动会记录在这里。</p>
          )}
        </section>
      </div>
    </main>
  );
}

export function App() {
  const [api] = useState(getVsCodeApi);
  const restored = api?.getState();
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    draftByAttempt: restored?.draftByAttempt ?? initialState.draftByAttempt
  });

  useEffect(() => {
    if (!api) {
      return undefined;
    }

    const receiveHostMessage = (event: MessageEvent<unknown>) => {
      if (isHostEvent(event.data)) {
        dispatch(event.data);
      }
    };

    window.addEventListener("message", receiveHostMessage);
    api.postMessage({ command: "loadProblems" });
    return () => window.removeEventListener("message", receiveHostMessage);
  }, [api]);

  useEffect(() => {
    api?.setState({ draftByAttempt: state.draftByAttempt });
  }, [api, state.draftByAttempt]);

  const postAction = (action: SessionActionView) => {
    if (!action.disabledReason) {
      api?.postMessage(messageWithDraft(action.message, state.draft));
    }
  };

  return (
    <CurrentSessionView
      state={state}
      onAction={postAction}
      onDraftChange={(value) => dispatch({ type: "draft.changed", value })}
    />
  );
}

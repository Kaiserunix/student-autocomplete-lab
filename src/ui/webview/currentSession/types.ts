export type CurrentSessionPhase =
  | "empty"
  | "coding"
  | "coaching"
  | "running"
  | "reviewing"
  | "error"
  | "offline";

export type CurrentSessionHostCommand =
  | { command: "loadProblems" }
  | { command: "importManualMarkdownFile" }
  | {
      command: "requestAiCoach";
      action: "hint" | "specific" | "followUp" | "giveUp" | "recommend";
      problemKey: string;
      studentRequest?: string;
      previousCoachTurn?: string;
    }
  | { command: "requestAutocompletePreview" }
  | {
      command: "requestSolutionScore";
      problemKey: string;
      studentRequest?: string;
      archiveOnComplete?: boolean;
    }
  | {
      command: "requestOptimizationReview";
      problemKey: string;
      studentRequest?: string;
    }
  | { command: "requestSubmissionJudge"; problemKey: string }
  | {
      command: "archiveProblem";
      problemKey: string;
      reason?: "completed" | "removed" | "abandoned" | "revealed";
    };

export interface SessionProblemView {
  key: string;
  title: string;
  sourceLabel?: string;
}

export interface SessionActionView {
  id: string;
  label: string;
  message: CurrentSessionHostCommand;
  disabledReason?: string;
  rationale?: string;
  tone?: "default" | "attention" | "destructive";
}

export interface CurrentFeedbackView {
  kind: "info" | "success" | "warning" | "error" | "progress";
  title: string;
  body?: string;
}

export interface TimelineItemView {
  id: string;
  kind: "learner" | "coach" | "run" | "review" | "system" | "error";
  title: string;
  body?: string;
  timestamp?: string;
  status?: string;
}

export interface CurrentSessionViewModel {
  revision: number;
  attemptId?: string;
  phase: CurrentSessionPhase;
  problem?: SessionProblemView;
  nowAction: SessionActionView;
  secondaryActions: readonly SessionActionView[];
  currentFeedback?: CurrentFeedbackView;
  timeline: readonly TimelineItemView[];
  statusMessage?: string;
}

export type CurrentSessionHostEvent =
  | { type: "state.snapshot"; state: CurrentSessionViewModel }
  | {
      type: "events.appended";
      attemptId?: string;
      items: readonly TimelineItemView[];
    }
  | { type: "timeline.append"; attemptId?: string; item: TimelineItemView };

export type CurrentSessionInboundMessage = CurrentSessionHostEvent;

export interface VsCodeApi<State = unknown> {
  postMessage(message: CurrentSessionHostCommand): void;
  getState(): State | undefined;
  setState(state: State): void;
}

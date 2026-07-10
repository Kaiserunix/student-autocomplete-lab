import type {
  CurrentSessionViewModel,
  SessionActionView,
  TimelineItemView
} from "../webview/currentSession/types";

export interface CurrentSessionProblemSource {
  key: string;
  title: string;
  platform: string;
  savedAt?: string;
  archivedAt?: string;
}

export interface CurrentSessionThreadTurnSource {
  role: "student" | "assistant" | "system";
  kind: string;
  text: string;
  occurredAt: string;
}

export interface CurrentSessionAttemptSource {
  sessionId: string;
  problemKey: string;
  updatedAt: string;
  status: "active" | "archived" | "deleted";
  coachThread: readonly CurrentSessionThreadTurnSource[];
}

export interface CurrentSessionProjectionInput {
  selectedKey?: string;
  active: readonly CurrentSessionProblemSource[];
  completed: readonly CurrentSessionProblemSource[];
  sessions: readonly CurrentSessionAttemptSource[];
  teachingAvailable: boolean;
  statusMessage?: string;
}

export function projectCurrentSession(input: CurrentSessionProjectionInput): CurrentSessionViewModel {
  const problem = selectProblem(input);
  if (!problem) {
    return {
      revision: revisionFrom(input),
      phase: "empty",
      nowAction: {
        id: "import-markdown",
        label: "导入 Markdown 题目",
        message: { command: "importManualMarkdownFile" }
      },
      secondaryActions: [],
      currentFeedback: input.statusMessage
        ? { kind: "info", title: input.statusMessage }
        : undefined,
      timeline: [],
      statusMessage: input.statusMessage
    };
  }

  const completed = input.completed.some((item) => item.key === problem.key);
  const attempt = latestAttempt(input.sessions, problem.key);
  const nowAction = completed
    ? recommendationAction(problem.key)
    : coachingAction(problem.key, input.teachingAvailable);

  return {
    revision: revisionFrom(input),
    attemptId: attempt?.sessionId ?? `problem:${problem.key}`,
    phase: completed ? "reviewing" : input.teachingAvailable ? "coding" : "offline",
    problem: {
      key: problem.key,
      title: problem.title,
      sourceLabel: platformLabel(problem.platform)
    },
    nowAction,
    secondaryActions: completed ? reviewActions(problem.key) : activeActions(problem.key),
    currentFeedback: feedbackFor(input, completed),
    timeline: timelineFrom(attempt),
    statusMessage: input.statusMessage
  };
}

function selectProblem(input: CurrentSessionProjectionInput): CurrentSessionProblemSource | undefined {
  const all = [...input.active, ...input.completed];
  return all.find((item) => item.key === input.selectedKey) ?? input.active[0] ?? input.completed[0];
}

function latestAttempt(
  sessions: readonly CurrentSessionAttemptSource[],
  problemKey: string
): CurrentSessionAttemptSource | undefined {
  return sessions
    .filter((session) => session.problemKey === problemKey && session.status !== "deleted")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function coachingAction(problemKey: string, available: boolean): SessionActionView {
  return {
    id: "ask-hint",
    label: "给我一个方向",
    message: { command: "requestAiCoach", action: "hint", problemKey },
    disabledReason: available ? undefined : "AI 教练尚未配置"
  };
}

function recommendationAction(problemKey: string): SessionActionView {
  return {
    id: "recommend-next",
    label: "推荐下一题",
    message: { command: "requestAiCoach", action: "recommend", problemKey }
  };
}

function activeActions(problemKey: string): SessionActionView[] {
  return [
    {
      id: "submission-review",
      label: "提交前自检",
      message: { command: "requestSubmissionJudge", problemKey }
    },
    {
      id: "score-solution",
      label: "学习评分",
      message: { command: "requestSolutionScore", problemKey }
    }
  ];
}

function reviewActions(problemKey: string): SessionActionView[] {
  return [
    {
      id: "review-optimization",
      label: "优化复盘",
      message: { command: "requestOptimizationReview", problemKey }
    },
    {
      id: "review-errors",
      label: "找错复盘",
      message: { command: "requestSubmissionJudge", problemKey }
    }
  ];
}

function feedbackFor(
  input: CurrentSessionProjectionInput,
  completed: boolean
): CurrentSessionViewModel["currentFeedback"] {
  if (input.statusMessage) {
    return { kind: completed ? "success" : "info", title: input.statusMessage };
  }
  if (!input.teachingAvailable && !completed) {
    return {
      kind: "warning",
      title: "AI 教练尚未就绪",
      body: "可以继续编码；需要提示时请从视图标题栏打开设置。"
    };
  }
  if (completed) {
    return { kind: "success", title: "这道题已进入复盘" };
  }
  return {
    kind: "info",
    title: "先推进一个最小步骤",
    body: "遇到具体阻塞时再请求提示，草稿会在会话切换后保留。"
  };
}

function timelineFrom(attempt: CurrentSessionAttemptSource | undefined): TimelineItemView[] {
  if (!attempt) {
    return [];
  }
  return attempt.coachThread.slice(-40).map((turn, index) => ({
    id: `${attempt.sessionId}:${turn.occurredAt}:${index}`,
    kind: turn.role === "student" ? "learner" : turn.role === "assistant" ? "coach" : "system",
    title: turn.role === "student" ? "你的问题" : turn.role === "assistant" ? "教练反馈" : "会话记录",
    body: turn.text,
    timestamp: formatTime(turn.occurredAt)
  }));
}

function revisionFrom(input: CurrentSessionProjectionInput): number {
  const timestamps = [
    ...input.active.map((item) => item.savedAt),
    ...input.completed.map((item) => item.archivedAt),
    ...input.sessions.map((item) => item.updatedAt)
  ].filter((value): value is string => Boolean(value));
  return timestamps.reduce((latest, value) => Math.max(latest, Date.parse(value) || 0), 0);
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    luogu: "洛谷",
    leetcode: "LeetCode",
    nowcoder: "牛客",
    codeforces: "Codeforces",
    atcoder: "AtCoder",
    manual: "手动导入"
  };
  return labels[platform.toLowerCase()] ?? platform;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

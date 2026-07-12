import type {
  CurrentSessionHostEvent,
  CurrentSessionViewModel,
  TimelineItemView
} from "./types";

export interface CurrentSessionState {
  viewModel: CurrentSessionViewModel;
  draft: string;
  draftByAttempt: Readonly<Record<string, string>>;
}

export type CurrentSessionAction =
  | { type: "host.snapshot"; snapshot: CurrentSessionViewModel }
  | { type: "host.event"; event: CurrentSessionHostEvent }
  | CurrentSessionHostEvent
  | { type: "draft.changed"; value: string };

const EMPTY_DRAFT_KEY = "__empty__";

const emptyViewModel: CurrentSessionViewModel = {
  revision: 0,
  phase: "empty",
  nowAction: {
    id: "import-markdown",
    label: "导入 Markdown 题目",
    message: { command: "importManualMarkdownFile" }
  },
  secondaryActions: [],
  timeline: []
};

export const initialState: CurrentSessionState = {
  viewModel: emptyViewModel,
  draft: "",
  draftByAttempt: {}
};

function draftKey(viewModel: CurrentSessionViewModel): string {
  return viewModel.attemptId ?? EMPTY_DRAFT_KEY;
}

function applySnapshot(
  state: CurrentSessionState,
  snapshot: CurrentSessionViewModel
): CurrentSessionState {
  const previousKey = draftKey(state.viewModel);
  const nextKey = draftKey(snapshot);
  const draftByAttempt = {
    ...state.draftByAttempt,
    [previousKey]: state.draft
  };

  return {
    viewModel: snapshot,
    draft: previousKey === nextKey ? state.draft : draftByAttempt[nextKey] ?? "",
    draftByAttempt
  };
}

function appendTimelineEvent(
  state: CurrentSessionState,
  event: Extract<CurrentSessionHostEvent, { type: "timeline.append" }>
): CurrentSessionState {
  if (event.attemptId && event.attemptId !== state.viewModel.attemptId) {
    return state;
  }
  if (state.viewModel.timeline.some((item) => item.id === event.item.id)) {
    return state;
  }

  return {
    ...state,
    viewModel: {
      ...state.viewModel,
      timeline: [...state.viewModel.timeline, event.item]
    }
  };
}

function appendTimelineItems(
  state: CurrentSessionState,
  attemptId: string | undefined,
  items: readonly TimelineItemView[]
): CurrentSessionState {
  if (attemptId && attemptId !== state.viewModel.attemptId) {
    return state;
  }

  const knownIds = new Set(state.viewModel.timeline.map((item) => item.id));
  const additions = items.filter((item) => {
    if (knownIds.has(item.id)) {
      return false;
    }
    knownIds.add(item.id);
    return true;
  });
  if (additions.length === 0) {
    return state;
  }

  return {
    ...state,
    viewModel: {
      ...state.viewModel,
      timeline: [...state.viewModel.timeline, ...additions]
    }
  };
}

export function reducer(
  state: CurrentSessionState,
  action: CurrentSessionAction
): CurrentSessionState {
  if (action.type === "host.snapshot") {
    return applySnapshot(state, action.snapshot);
  }
  if (action.type === "host.event") {
    return reducer(state, action.event);
  }
  if (action.type === "state.snapshot") {
    return applySnapshot(state, action.state);
  }
  if (action.type === "events.appended") {
    return appendTimelineItems(state, action.attemptId, action.items);
  }
  if (action.type === "timeline.append") {
    return appendTimelineEvent(state, action);
  }

  return {
    ...state,
    draft: action.value,
    draftByAttempt: {
      ...state.draftByAttempt,
      [draftKey(state.viewModel)]: action.value
    }
  };
}

export const initialCurrentSessionState = initialState;
export const currentSessionReducer = reducer;

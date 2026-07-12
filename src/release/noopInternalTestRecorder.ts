export interface InternalTestEventInput {
  kind: string;
  [key: string]: unknown;
}

export interface InternalTestSummary {
  enabled: boolean;
  totalEvents: number;
  problemCount: number;
  hintCount: number;
  giveUpCount: number;
  solutionScoreCount: number;
  skillFeedbackCount: number;
  recommendationCount: number;
  autocompleteRequestCount: number;
  invalidRecordCount: number;
  models: string[];
  byKind: Record<string, number>;
  privacyNotice: string;
}

export interface InternalTestRecorder {
  enabled: boolean;
  eventsPath: string;
  record(event: InternalTestEventInput): Promise<void>;
  summary(): Promise<InternalTestSummary>;
}

export function createInternalTestRecorder(): InternalTestRecorder {
  return {
    enabled: false,
    eventsPath: "",
    async record(): Promise<void> {
      return;
    },
    async summary(): Promise<InternalTestSummary> {
      return disabledSummary();
    }
  };
}

export function isInternalTestBuild(): boolean {
  return false;
}

export function summarizeDisabledRecording(): InternalTestSummary {
  return disabledSummary();
}

function disabledSummary(): InternalTestSummary {
  return {
    enabled: false,
    totalEvents: 0,
    problemCount: 0,
    hintCount: 0,
    giveUpCount: 0,
    solutionScoreCount: 0,
    skillFeedbackCount: 0,
    recommendationCount: 0,
    autocompleteRequestCount: 0,
    invalidRecordCount: 0,
    models: [],
    byKind: {},
    privacyNotice: "Beta release does not include internal-test recording."
  };
}

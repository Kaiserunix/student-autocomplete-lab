import type { SupportedLanguage } from "./problem";

export type LearningEventKind =
  | "attempt_completed"
  | "attempt_abandoned"
  | "review_completed"
  | "hint_requested"
  | "self_check";

export type LearningEventVerdict =
  | "AC"
  | "WA"
  | "TLE"
  | "RE"
  | "CE"
  | "ABANDONED"
  | "AI_ESTIMATE_ONLY";

export type FsrsRatingValue = 1 | 2 | 3 | 4;

export interface LearningEventV2 {
  schemaVersion: "2.0";
  eventId: string;
  timestamp: string;
  sessionId: string;
  kind: LearningEventKind;
  problemRef: {
    problemKey: string;
    title?: string;
    difficultyTier: 1 | 2 | 3 | 4 | 5;
    conceptTags: string[];
  };
  language: SupportedLanguage;
  verdict: LearningEventVerdict;
  verdictSource: "official_oj" | "local_runner" | "ai_estimate" | "manual_report";
  independence: {
    hintsUsed: number;
    maxHintLevel: 0 | 1 | 2 | 3 | 4 | 5;
    revealedSolution: boolean;
    elapsedSec: number;
    fsrsRating?: FsrsRatingValue;
  };
  diagnosis?: {
    misconceptionIds: string[];
    summary: string;
    minimalFixHint?: string;
  };
}

export interface TeachingPreferences {
  hintStyle: "socratic" | "direct_minimal" | "dry_run_first";
  verbosity: "concise" | "detailed";
  targetGoal: "beginner_cs" | "interview_leetcode" | "contest_icpc_oi";
}

export interface AutocompleteCodeHabit {
  id: string;
  language: SupportedLanguage;
  ruleText: string;
  enabled: boolean;
}

export interface UserOverridesV2 {
  schemaVersion: "2.0";
  updatedAt: string;
  teachingPreferences: TeachingPreferences;
  autocompleteCodeHabits: AutocompleteCodeHabit[];
  mutedMisconceptionIds: Record<string, { mutedAt: string; reason: string }>;
  manualConceptOverrides: Record<
    string,
    { floorTier?: 1 | 2 | 3 | 4 | 5; pauseReview?: boolean }
  >;
  voidedEventIds: string[];
}

export interface SerializedFsrsCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview?: string;
}

export interface ConceptMastery {
  conceptTag: string;
  attemptedCount: number;
  independentAcCount: number;
  assistedAcCount: number;
  highestIndependentTier: 0 | 1 | 2 | 3 | 4 | 5;
  masteryScore: number;
  fsrsCard: SerializedFsrsCard;
}

export interface MistakeEntry {
  problemKey: string;
  title: string;
  conceptTags: string[];
  difficultyTier: 1 | 2 | 3 | 4 | 5;
  lastStatus: "independent_ac" | "assisted_ac" | "abandoned" | "unresolved";
  misconceptionIds: string[];
  takeaway: string;
  lastAttemptAt: string;
  fsrsCard: SerializedFsrsCard;
}

export interface MisconceptionStat {
  misconceptionId: string;
  recentWeightedCount: number;
  uniqueProblemKeys: string[];
  lastSeenAt: string;
  muted: boolean;
}

export interface LearnerSnapshotV2 {
  schemaVersion: "2.0";
  derivedAt: string;
  totalTerminalEvents: number;
  conceptMastery: Record<string, ConceptMastery>;
  mistakeNotebook: Record<string, MistakeEntry>;
  misconceptionStats: Record<string, MisconceptionStat>;
  recentTrajectory: {
    last7dAttempts: number;
    independentAcRate: number;
    avgHintLevel: number;
  };
}

export type RecommendationBucket = "fsrs_due" | "targeted_transfer" | "zpd_stretch";

export interface RecommendationCandidate {
  problemKey: string;
  title: string;
  conceptTags: string[];
  difficultyTier: 1 | 2 | 3 | 4 | 5;
  solved?: boolean;
}

export interface RecommendationItem {
  problemKey: string;
  title: string;
  bucket: RecommendationBucket;
  targetTag?: string;
  difficultyTier: 1 | 2 | 3 | 4 | 5;
  score: number;
  rationale: string;
}

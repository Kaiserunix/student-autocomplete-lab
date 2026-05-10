import type { ProblemPlatform } from "../problemBank/types";
import type { AttemptEvent } from "../teaching/attemptEvent";
import type { StudentProfile } from "../teaching/studentProfile";
import type { StudentSkill } from "../teaching/studentSkill";

export type RecommendationSource = ProblemPlatform | "synthetic";
export type RecommendationDifficultyChange = "down" | "same" | "up";
export type RecommendationTransferEvidenceStatus = "not_tested" | "probe" | "passed" | "failed";

export interface RecommendationCandidateInput {
  platform: ProblemPlatform;
  id: string;
  title: string;
  sourceUrl?: string;
  source?: RecommendationSource;
  difficulty?: number;
  tags: string[];
  targetPainPoints?: string[];
  skillTargets?: string[];
  reason?: string;
}

export interface RecommendationCandidate extends RecommendationCandidateInput {
  source: RecommendationSource;
  targetPainPoints: string[];
  skillTargets: string[];
}

export interface RecommendNextProblemsInput {
  profile: StudentProfile;
  studentSkill?: StudentSkill;
  attemptEvents?: AttemptEvent[];
  candidates: RecommendationCandidateInput[];
  currentProblemId?: string;
  recentlySeenProblemIds?: string[];
  archivedProblemIds?: string[];
  completedProblemIds?: string[];
  deletedProblemIds?: string[];
  limit?: number;
}

export interface RankedPainPoint {
  label: string;
  count: number;
  score: number;
  weight: number;
}

export interface RecommendationResult {
  problemId: string;
  title: string;
  source: RecommendationSource;
  reason: string;
  targetSkill: string;
  difficultyChange: RecommendationDifficultyChange;
  transferEvidenceStatus: RecommendationTransferEvidenceStatus;
}

export interface ProblemRecommendation {
  problem: RecommendationCandidate;
  score: number;
  matchedPainPoints: string[];
  reasons: string[];
  difficultySignal: string;
  transferSignal: string;
  recommendation: RecommendationResult;
  breakdown: {
    painPointScore: number;
    difficultyScore: number;
    transferScore: number;
    repeatPenalty: number;
  };
}

export interface RecommendationStrategy {
  topPainPoints: RankedPainPoint[];
  targetDifficulty: number;
  transferReadySkills: string[];
  lowHintSuccessSkills: string[];
  repeatedFailurePainPoints: string[];
  excludedProblemIds: string[];
}

export interface ProblemRecommendationResult {
  strategy: RecommendationStrategy;
  recommendations: ProblemRecommendation[];
  results: RecommendationResult[];
}

import type { ProblemRecord } from "../problemBank/types";

import type { LessonReport } from "../teaching/lessonReport";
import type { OptimizationReport } from "../teaching/optimizationReport";
import type { SolutionScoreReport } from "../teaching/solutionScore";

export type CompletionReason = "completed" | "removed" | "abandoned" | "revealed";

export interface PainSnapshot {
  painPointCounts: Record<string, number>;
  activeSkills: string[];
}

export interface CompletedProblemRecord extends ProblemRecord {
  savedAt?: string;
  sourceSetId?: string;
  completedAt: string;
  completionReason: CompletionReason;
  problemKey: string;
  painSnapshot: PainSnapshot;
  lessonReport?: LessonReport;
  solutionScore?: SolutionScoreReport;
  optimizationReport?: OptimizationReport;
}

export function buildCompletedProblemRecord(input: {
  problem: ProblemRecord & { savedAt?: string; sourceSetId?: string };
  completedAt: string;
  reason: CompletionReason;
  painSnapshot: PainSnapshot;
  lessonReport?: LessonReport;
  solutionScore?: SolutionScoreReport;
}): CompletedProblemRecord {
  return {
    ...input.problem,
    completedAt: input.completedAt,
    completionReason: input.reason,
    problemKey: makeProblemKey(input.problem),
    painSnapshot: input.painSnapshot,
    lessonReport: input.lessonReport,
    solutionScore: input.solutionScore
  };
}

export function removeProblemFromActiveQueue<T extends Pick<ProblemRecord, "platform" | "id">>(
  problems: T[],
  problemKey: string
): T[] {
  return problems.filter((problem) => makeProblemKey(problem) !== problemKey);
}

export function summarizePainSnapshot(snapshot: PainSnapshot, limit = 3): string {
  return Object.entries(snapshot.painPointCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, count]) => `${label}x${count}`)
    .join(" · ");
}

export function makeProblemKey(problem: Pick<ProblemRecord, "platform" | "id">): string {
  return `${problem.platform}:${problem.id}`;
}

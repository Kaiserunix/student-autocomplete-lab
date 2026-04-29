import { PracticeGenerationReport } from "./practiceReport";

export interface PracticeSummary {
  problemId: string;
  wrongSubmissionCount: number;
  painPointCounts: Record<string, number>;
  topPainPoint?: string;
  skillUpdateCandidateName?: string;
}

export function summarizePracticeReport(report: PracticeGenerationReport): PracticeSummary {
  const painPointCounts: Record<string, number> = {};

  for (const submission of report.wrongSubmissions) {
    for (const painPoint of submission.painPoints) {
      painPointCounts[painPoint] = (painPointCounts[painPoint] ?? 0) + 1;
    }
  }

  return {
    problemId: report.problemId,
    wrongSubmissionCount: report.wrongSubmissions.length,
    painPointCounts,
    topPainPoint: findTopPainPoint(painPointCounts),
    skillUpdateCandidateName: report.skillUpdateCandidate?.name
  };
}

function findTopPainPoint(counts: Record<string, number>): string | undefined {
  return Object.entries(counts).sort(([leftName, leftCount], [rightName, rightCount]) => {
    if (leftCount !== rightCount) {
      return rightCount - leftCount;
    }

    return leftName.localeCompare(rightName);
  })[0]?.[0];
}

import type { JourneyDiagnosisCase, JourneyDiagnosisScore } from "./journeyTrial";
import { scoreJourneyDiagnosis } from "./journeyTrial";
import type { TeachingDiagnosisReport } from "./teachingReport";

export interface TransferValidationProbe {
  skillCandidate: string;
  trainedCaseIds: string[];
  transferCase: JourneyDiagnosisCase;
  baselineHintCount: number;
}

export interface TransferValidationScore {
  skillCandidate: string;
  caseId: string;
  problemId: string;
  diagnosisScore: JourneyDiagnosisScore;
  baselineHintCount: number;
  estimatedHintCount: number;
  hintReduction: number;
  passed: boolean;
}

export interface TransferValidationSummary {
  probeCount: number;
  passedCount: number;
  transferPassRate: number;
  averageHintReduction: number;
  primaryPainPointAccuracy: number;
  skillCandidateAccuracy: number;
}

const DEFAULT_BASELINE_HINT_COUNT = 3;

export function buildTransferValidationProbes(
  trainedCases: JourneyDiagnosisCase[],
  candidateCases: JourneyDiagnosisCase[],
  readySkills: string[],
  maxPerSkill = 1
): TransferValidationProbe[] {
  const readySkillSet = new Set(readySkills);
  const trainedCaseIds = new Set(trainedCases.map((item) => item.caseId));
  const trainedBySkill = groupTrainedCaseIdsBySkill(trainedCases);
  const selectedBySkill = new Map<string, number>();
  const probes: TransferValidationProbe[] = [];

  for (const item of candidateCases) {
    if (trainedCaseIds.has(item.caseId)) {
      continue;
    }

    const skill = resolveReadySkillForCase(item, readySkillSet);
    if (!skill) {
      continue;
    }

    const selectedCount = selectedBySkill.get(skill) ?? 0;
    if (selectedCount >= maxPerSkill) {
      continue;
    }

    probes.push({
      skillCandidate: skill,
      trainedCaseIds: trainedBySkill.get(skill) ?? [],
      transferCase: item,
      baselineHintCount: DEFAULT_BASELINE_HINT_COUNT
    });
    selectedBySkill.set(skill, selectedCount + 1);
  }

  return probes;
}

export function scoreTransferValidationProbe(
  probe: TransferValidationProbe,
  report: TeachingDiagnosisReport
): TransferValidationScore {
  const diagnosisScore = scoreJourneyDiagnosis(probe.transferCase, report);
  const estimatedHintCount = estimateHintCountAfterTransfer(diagnosisScore);
  const hintReduction = probe.baselineHintCount - estimatedHintCount;

  return {
    skillCandidate: probe.skillCandidate,
    caseId: probe.transferCase.caseId,
    problemId: probe.transferCase.problemId,
    diagnosisScore,
    baselineHintCount: probe.baselineHintCount,
    estimatedHintCount,
    hintReduction,
    passed: diagnosisScore.primaryPainPointHit && diagnosisScore.skillCandidateHit && hintReduction > 0
  };
}

export function summarizeTransferValidation(scores: TransferValidationScore[]): TransferValidationSummary {
  return {
    probeCount: scores.length,
    passedCount: scores.filter((score) => score.passed).length,
    transferPassRate: ratio(scores.filter((score) => score.passed).length, scores.length),
    averageHintReduction: average(scores.map((score) => score.hintReduction)),
    primaryPainPointAccuracy: ratio(
      scores.filter((score) => score.diagnosisScore.primaryPainPointHit).length,
      scores.length
    ),
    skillCandidateAccuracy: ratio(scores.filter((score) => score.diagnosisScore.skillCandidateHit).length, scores.length)
  };
}

function groupTrainedCaseIdsBySkill(cases: JourneyDiagnosisCase[]): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const item of cases) {
    const skills = [item.expectedSkillCandidate, ...item.acceptedSkillCandidates];
    for (const skill of skills) {
      result.set(skill, [...(result.get(skill) ?? []), item.caseId]);
    }
  }

  return result;
}

function resolveReadySkillForCase(item: JourneyDiagnosisCase, readySkillSet: Set<string>): string | undefined {
  if (readySkillSet.has(item.expectedSkillCandidate)) {
    return item.expectedSkillCandidate;
  }

  return item.acceptedSkillCandidates.find((candidate) => readySkillSet.has(candidate));
}

function estimateHintCountAfterTransfer(score: JourneyDiagnosisScore): number {
  if (score.primaryPainPointHit && score.skillCandidateHit) {
    return 1;
  }

  if (score.painPointHit || score.skillCandidateHit) {
    return 2;
  }

  return 4;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 1000;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) / 1000;
}

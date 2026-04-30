import { TeachingDiagnosisReport } from "./teachingReport";
import { diagnoseFromSelfEvolutionSample, SelfEvolutionTrialResult, SelfEvolutionWrongSample } from "./selfEvolutionTrial";

export interface SelfEvolutionEvalScores {
  painPointAccuracy: number;
  primaryPainPointAccuracy: number;
  recommendationAccuracy: number;
  skillCandidateAccuracy: number;
  perfectStepAccuracy: number;
}

export interface SelfEvolutionEvalStep {
  index: number;
  problemId: string;
  expectedPainPoints: string[];
  actualPainPoints: string[];
  painPointHit: boolean;
  primaryPainPointHit: boolean;
  expectedRecommendation?: string;
  actualRecommendation?: string;
  recommendationHit: boolean;
  expectedSkillCandidate?: string;
  actualSkillCandidate?: string;
  skillCandidateHit: boolean;
  mismatchTypes: SelfEvolutionMismatchType[];
  perfect: boolean;
}

export type SelfEvolutionMismatchType = "pain_point" | "recommendation" | "skill_candidate";

export interface SelfEvolutionBiasRecord {
  index: number;
  problemId: string;
  topic: string;
  expectedPrimaryPainPoint: string;
  actualPrimaryPainPoint: string;
  expectedRecommendation?: string;
  actualRecommendation?: string;
  expectedSkillCandidate?: string;
  actualSkillCandidate?: string;
  mismatchTypes: SelfEvolutionMismatchType[];
  codeEvidence: string;
  promptPatchCandidate: string;
}

export interface SelfEvolutionPromptPatchCandidate {
  expectedPrimaryPainPoint: string;
  actualPrimaryPainPoint: string;
  occurrences: number;
  sampleProblemIds: string[];
  promptPatchCandidate: string;
}

export interface SelfEvolutionEvalResult {
  provider: "self-evolution-eval";
  sampleCount: number;
  scores: SelfEvolutionEvalScores;
  steps: SelfEvolutionEvalStep[];
  biasRecords: SelfEvolutionBiasRecord[];
  promptPatchCandidates: SelfEvolutionPromptPatchCandidate[];
}

export function evaluateSelfEvolutionTrial(
  samples: SelfEvolutionWrongSample[],
  trial: SelfEvolutionTrialResult
): SelfEvolutionEvalResult {
  if (samples.length !== trial.steps.length) {
    throw new Error(`Self-evolution eval expected ${samples.length} samples but received ${trial.steps.length} trial steps.`);
  }

  const steps = samples.map((sample, index) => evaluateStep(sample, trial.steps[index], diagnoseFromSelfEvolutionSample(sample)));
  const biasRecords = steps
    .map((step, index) => buildBiasRecord(samples[index], step))
    .filter((record): record is SelfEvolutionBiasRecord => record !== undefined);

  return {
    provider: "self-evolution-eval",
    sampleCount: samples.length,
    scores: {
      painPointAccuracy: ratio(steps.filter((step) => step.painPointHit).length, samples.length),
      primaryPainPointAccuracy: ratio(steps.filter((step) => step.primaryPainPointHit).length, samples.length),
      recommendationAccuracy: ratio(steps.filter((step) => step.recommendationHit).length, samples.length),
      skillCandidateAccuracy: ratio(steps.filter((step) => step.skillCandidateHit).length, samples.length),
      perfectStepAccuracy: ratio(steps.filter((step) => step.perfect).length, samples.length)
    },
    steps,
    biasRecords,
    promptPatchCandidates: summarizePromptPatchCandidates(biasRecords)
  };
}

function evaluateStep(
  sample: SelfEvolutionWrongSample,
  actual: SelfEvolutionTrialResult["steps"][number],
  expected: TeachingDiagnosisReport
): SelfEvolutionEvalStep {
  const expectedPainPoints = expected.painPoints.map((painPoint) => painPoint.label);
  const painPointHit = actual.normalizedPainPoints.some((painPoint) => expectedPainPoints.includes(painPoint));
  const primaryPainPointHit = actual.normalizedPainPoints.includes(expectedPainPoints[0]);
  const expectedRecommendation = expected.recommendation?.problemId;
  const recommendationHit = expectedRecommendation === actual.recommendation;
  const expectedSkillCandidate = expected.skillUpdate?.candidate;
  const skillCandidateHit = expectedSkillCandidate === actual.skillCandidate;
  const mismatchTypes = buildMismatchTypes(painPointHit, recommendationHit, skillCandidateHit);

  return {
    index: actual.index,
    problemId: sample.problemId,
    expectedPainPoints,
    actualPainPoints: actual.normalizedPainPoints,
    painPointHit,
    primaryPainPointHit,
    expectedRecommendation,
    actualRecommendation: actual.recommendation,
    recommendationHit,
    expectedSkillCandidate,
    actualSkillCandidate: actual.skillCandidate,
    skillCandidateHit,
    mismatchTypes,
    perfect: painPointHit && recommendationHit && skillCandidateHit
  };
}

function buildBiasRecord(
  sample: SelfEvolutionWrongSample,
  step: SelfEvolutionEvalStep
): SelfEvolutionBiasRecord | undefined {
  if (step.perfect) {
    return undefined;
  }

  const expectedPrimaryPainPoint = step.expectedPainPoints[0] ?? "unknown";
  const actualPrimaryPainPoint = step.actualPainPoints[0] ?? "missing";
  const codeEvidence = extractCodeEvidence(sample.wrongCode);
  return {
    index: step.index,
    problemId: sample.problemId,
    topic: sample.topic,
    expectedPrimaryPainPoint,
    actualPrimaryPainPoint,
    expectedRecommendation: step.expectedRecommendation,
    actualRecommendation: step.actualRecommendation,
    expectedSkillCandidate: step.expectedSkillCandidate,
    actualSkillCandidate: step.actualSkillCandidate,
    mismatchTypes: step.mismatchTypes,
    codeEvidence,
    promptPatchCandidate: buildPromptPatchCandidate(sample, expectedPrimaryPainPoint, actualPrimaryPainPoint, codeEvidence)
  };
}

function summarizePromptPatchCandidates(
  records: SelfEvolutionBiasRecord[]
): SelfEvolutionPromptPatchCandidate[] {
  const grouped = new Map<string, SelfEvolutionPromptPatchCandidate>();

  for (const record of records.filter((item) => item.mismatchTypes.includes("pain_point"))) {
    const key = `${record.expectedPrimaryPainPoint}->${record.actualPrimaryPainPoint}`;
    const previous = grouped.get(key);
    if (previous) {
      previous.occurrences += 1;
      previous.sampleProblemIds = unique([...previous.sampleProblemIds, record.problemId]);
    } else {
      grouped.set(key, {
        expectedPrimaryPainPoint: record.expectedPrimaryPainPoint,
        actualPrimaryPainPoint: record.actualPrimaryPainPoint,
        occurrences: 1,
        sampleProblemIds: [record.problemId],
        promptPatchCandidate: record.promptPatchCandidate
      });
    }
  }

  return Array.from(grouped.values()).sort((left, right) => right.occurrences - left.occurrences);
}

function buildMismatchTypes(
  painPointHit: boolean,
  recommendationHit: boolean,
  skillCandidateHit: boolean
): SelfEvolutionMismatchType[] {
  return [
    painPointHit ? undefined : "pain_point",
    recommendationHit ? undefined : "recommendation",
    skillCandidateHit ? undefined : "skill_candidate"
  ].filter((value): value is SelfEvolutionMismatchType => value !== undefined);
}

function buildPromptPatchCandidate(
  sample: SelfEvolutionWrongSample,
  expectedPrimaryPainPoint: string,
  actualPrimaryPainPoint: string,
  codeEvidence: string
): string {
  return [
    `When ${sample.problemId} (${sample.topic}) shows code evidence "${codeEvidence}",`,
    `prefer ${expectedPrimaryPainPoint} over ${actualPrimaryPainPoint};`,
    "check the final output or return semantics before blaming lower-level mechanics."
  ].join(" ");
}

function extractCodeEvidence(code: string): string {
  const lines = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const patternMatches = [
    lines.find((line) => /left\s*\+\s*right\s*\+\s*root/.test(line)),
    lines.find((line) => /^return\b/.test(line)),
    lines.find((line) => /^print\(/.test(line))
  ];
  const match = patternMatches.find((line): line is string => Boolean(line));
  return match ?? lines.slice(0, 3).join(" | ");
}

function ratio(hitCount: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Math.round((hitCount / total) * 1000) / 1000;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

import { readFile } from "node:fs/promises";
import { createEmptyStudentProfile, profileSummary, StudentProfile } from "./studentProfile";
import { TeachingDiagnosisReport } from "./teachingReport";
import { normalizeTeachingDiagnosisReport } from "./teachingTaxonomy";
import { runTeachingCycle } from "./teachingCycle";
import { TeachingDiagnosisContext, TeachingStudentProfileSummary } from "./types";

export interface SelfEvolutionWrongSample {
  problemId: string;
  topic: string;
  painPoint: string;
  wrongCode: string;
  expectedDiagnosisHint: string;
  recommendationExpectation: string;
}

export interface SelfEvolutionTrialStep {
  index: number;
  problemId: string;
  rawPainPoint: string;
  normalizedPainPoints: string[];
  skillCandidate?: string;
  recommendation?: string;
  profileBefore: TeachingStudentProfileSummary;
  profileAfter: TeachingStudentProfileSummary;
}

export interface SelfEvolutionTrialResult {
  provider: "self-evolution-trial";
  sampleCount: number;
  steps: SelfEvolutionTrialStep[];
  painPointCounts: Record<string, number>;
  recommendationCounts: Record<string, number>;
  readySkills: string[];
  finalProfile: StudentProfile;
}

export type SelfEvolutionDiagnose = (
  sample: SelfEvolutionWrongSample,
  context: TeachingDiagnosisContext
) => Promise<TeachingDiagnosisReport> | TeachingDiagnosisReport;

export interface SelfEvolutionTrialOptions {
  studentId?: string;
  profile?: StudentProfile;
  occurredAt?: string;
  diagnose?: SelfEvolutionDiagnose;
}

interface SamplePainPointPlan {
  labels: string[];
  skillCandidate: string;
  rules: string[];
  recommendation: string;
  recommendationReason: string;
}

const SAMPLE_PAIN_POINT_PLANS: Record<string, SamplePainPointPlan> = {
  binary_tree_traversal_order_confusion: {
    labels: ["traversal_order_confusion"],
    skillCandidate: "binary-tree-traversal-reconstruction",
    rules: ["For preorder output, emit root before recursively emitting the left and right subtrees."],
    recommendation: "P1305",
    recommendationReason: "Practice direct preorder traversal before returning to reconstruction."
  },
  recursion_base_case_and_depth_definition: {
    labels: ["recursion_base_case", "depth_definition"],
    skillCandidate: "binary-tree-depth-numbered-children",
    rules: ["Empty children contribute depth 0; a real node contributes 1 plus the deeper child."],
    recommendation: "P4913",
    recommendationReason: "Practice binary-tree depth definitions on small numbered-child trees."
  },
  output_order_and_sentinel_handling: {
    labels: ["sentinel_input", "output_order"],
    skillCandidate: "sentinel-input-output-order",
    rules: ["Stop collecting at the sentinel, then reverse only the collected valid values."],
    recommendation: "P1427",
    recommendationReason: "Practice excluding sentinel values before reverse output."
  },
  matrix_like_input_and_decimal_format: {
    labels: ["distance_formula", "output_format"],
    skillCandidate: "numeric-geometry-formatting",
    rules: ["Preserve decimal input and match the required distance formula and precision separately."],
    recommendation: "P5735",
    recommendationReason: "Practice numeric geometry with exact decimal output formatting."
  },
  balanced_tree_concept_misused_as_sorted_set: {
    labels: ["duplicate_handling", "rank_query_semantics"],
    skillCandidate: "ordered-multiset-semantics",
    rules: ["Rank, kth, predecessor, and successor operations must preserve duplicate values."],
    recommendation: "P3369",
    recommendationReason: "Practice ordered multiset semantics before optimizing the data structure."
  }
};

export function parseSelfEvolutionSamples(text: string): SelfEvolutionWrongSample[] {
  const root = requireRecord(JSON.parse(text), "self-evolution sample root");
  requireNumber(root.schemaVersion, "schemaVersion");
  return requireArray(root.samples, "samples").map(parseSelfEvolutionSample);
}

export async function loadSelfEvolutionSamples(filePath: string): Promise<SelfEvolutionWrongSample[]> {
  return parseSelfEvolutionSamples(await readFile(filePath, "utf8"));
}

export async function runSelfEvolutionTrial(
  samples: SelfEvolutionWrongSample[],
  options: SelfEvolutionTrialOptions = {}
): Promise<SelfEvolutionTrialResult> {
  let profile = options.profile ?? createEmptyStudentProfile(options.studentId ?? "self-evolution-student");
  const diagnose = options.diagnose ?? diagnoseFromSelfEvolutionSample;
  const baseOccurredAt = options.occurredAt ?? new Date().toISOString();
  const recommendationCounts: Record<string, number> = {};
  const steps: SelfEvolutionTrialStep[] = [];

  for (const [index, sample] of samples.entries()) {
    const profileBefore = profileSummary(profile);
    const context = buildSelfEvolutionTeachingContext(sample, profileBefore);
    const report = normalizeTeachingDiagnosisReport(await Promise.resolve(diagnose(sample, context)));
    const result = await runTeachingCycle(context, profile, async () => report, occurredAtForStep(baseOccurredAt, index));
    profile = result.updatedProfile;

    const recommendation = result.report.recommendation?.problemId;
    if (recommendation) {
      recommendationCounts[recommendation] = (recommendationCounts[recommendation] ?? 0) + 1;
    }

    steps.push({
      index,
      problemId: sample.problemId,
      rawPainPoint: sample.painPoint,
      normalizedPainPoints: result.report.painPoints.map((painPoint) => painPoint.label),
      skillCandidate: result.report.skillUpdate?.candidate,
      recommendation,
      profileBefore,
      profileAfter: profileSummary(profile)
    });
  }

  const summary = profileSummary(profile);
  return {
    provider: "self-evolution-trial",
    sampleCount: samples.length,
    steps,
    painPointCounts: summary.painPointCounts,
    recommendationCounts,
    readySkills: summary.activeSkills ?? [],
    finalProfile: profile
  };
}

export function buildSelfEvolutionTeachingContext(
  sample: SelfEvolutionWrongSample,
  studentProfile: TeachingStudentProfileSummary
): TeachingDiagnosisContext {
  return {
    problem: {
      id: sample.problemId,
      title: sample.problemId,
      summary: sample.topic
    },
    language: "python",
    studentCode: sample.wrongCode,
    ojVerdict: {
      status: "WA"
    },
    localEvidence: [],
    studentProfile
  };
}

export function diagnoseFromSelfEvolutionSample(sample: SelfEvolutionWrongSample): TeachingDiagnosisReport {
  const plan = SAMPLE_PAIN_POINT_PLANS[sample.painPoint] ?? {
    labels: [sample.painPoint],
    skillCandidate: "evidence-first-debugging",
    rules: ["Compare the smallest observable failure before changing the algorithm."],
    recommendation: sample.problemId,
    recommendationReason: "Stay on the current problem until the failure has a concrete explanation."
  };

  return normalizeTeachingDiagnosisReport({
    painPoints: plan.labels.map((label, labelIndex) => ({
      label,
      confidence: labelIndex === 0 ? 0.9 : 0.72,
      evidence: sample.expectedDiagnosisHint
    })),
    hint: sample.expectedDiagnosisHint,
    skillUpdate: {
      candidate: plan.skillCandidate,
      reason: `Observed ${sample.painPoint} on ${sample.problemId}.`,
      rules: plan.rules
    },
    recommendation: {
      problemId: plan.recommendation,
      reason: plan.recommendationReason
    }
  });
}

function parseSelfEvolutionSample(value: unknown): SelfEvolutionWrongSample {
  const record = requireRecord(value, "samples[]");
  return {
    problemId: requireString(record.problemId, "samples[].problemId"),
    topic: requireString(record.topic, "samples[].topic"),
    painPoint: requireString(record.painPoint, "samples[].painPoint"),
    wrongCode: requireString(record.wrongCode, "samples[].wrongCode"),
    expectedDiagnosisHint: requireString(record.expectedDiagnosisHint, "samples[].expectedDiagnosisHint"),
    recommendationExpectation: requireString(record.recommendationExpectation, "samples[].recommendationExpectation")
  };
}

function occurredAtForStep(baseOccurredAt: string, index: number): string {
  const date = new Date(baseOccurredAt);
  if (Number.isNaN(date.getTime())) {
    return baseOccurredAt;
  }

  date.setSeconds(date.getSeconds() + index);
  return date.toISOString();
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }

  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }

  return value;
}

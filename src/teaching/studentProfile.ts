import { TeachingDiagnosisReport } from "./teachingReport";

export interface StudentPainPointState {
  count: number;
  score: number;
  lastSeen: string;
}

export interface SkillCandidateState {
  count: number;
  score: number;
  status: "candidate" | "ready";
  reason: string;
  rules: string[];
  sourcePainPoints: string[];
  lastSeen: string;
}

export interface StudentProfile {
  studentId: string;
  painPoints: Record<string, StudentPainPointState>;
  skillCandidates: Record<string, SkillCandidateState>;
}

const READY_SCORE = 3;
const READY_COUNT = 3;

export function applyTeachingDiagnosis(
  profile: StudentProfile,
  report: TeachingDiagnosisReport,
  occurredAt: string
): StudentProfile {
  const next: StudentProfile = {
    studentId: profile.studentId,
    painPoints: { ...profile.painPoints },
    skillCandidates: { ...profile.skillCandidates }
  };

  for (const painPoint of report.painPoints) {
    const previous = next.painPoints[painPoint.label] ?? { count: 0, score: 0, lastSeen: occurredAt };
    next.painPoints[painPoint.label] = {
      count: previous.count + 1,
      score: roundScore(previous.score + painPoint.confidence),
      lastSeen: occurredAt
    };
  }

  if (report.skillUpdate) {
    const previous = next.skillCandidates[report.skillUpdate.candidate] ?? {
      count: 0,
      score: 0,
      status: "candidate" as const,
      reason: report.skillUpdate.reason,
      rules: report.skillUpdate.rules,
      sourcePainPoints: [],
      lastSeen: occurredAt
    };
    const sourcePainPoints = unique([...previous.sourcePainPoints, ...report.painPoints.map((painPoint) => painPoint.label)]);
    const score = roundScore(previous.score + report.painPoints.reduce((sum, painPoint) => sum + painPoint.confidence, 0));
    const count = previous.count + 1;

    next.skillCandidates[report.skillUpdate.candidate] = {
      count,
      score,
      status: score >= READY_SCORE || count >= READY_COUNT ? "ready" : "candidate",
      reason: report.skillUpdate.reason,
      rules: report.skillUpdate.rules,
      sourcePainPoints,
      lastSeen: occurredAt
    };
  }

  return next;
}

export function profileSummary(profile: StudentProfile): { painPointCounts: Record<string, number>; activeSkills: string[] } {
  const painPointCounts = Object.fromEntries(
    Object.entries(profile.painPoints).map(([label, state]) => [label, state.count])
  );
  const activeSkills = Object.entries(profile.skillCandidates)
    .filter(([, candidate]) => candidate.status === "ready")
    .map(([name]) => name);

  return { painPointCounts, activeSkills };
}

export function createEmptyStudentProfile(studentId = "local-student"): StudentProfile {
  return {
    studentId,
    painPoints: {},
    skillCandidates: {}
  };
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

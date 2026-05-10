export interface TeachingPainPoint {
  label: string;
  confidence: number;
  evidence: string;
}

export interface TeachingSkillUpdate {
  candidate: string;
  reason: string;
  rules: string[];
}

export interface TeachingRecommendation {
  problemId: string;
  reason: string;
}

export interface TeachingDiagnosisReport {
  studentErrorModel?: string;
  painPoints: TeachingPainPoint[];
  hint: string;
  specificHint?: string;
  checkpoint?: string;
  microSteps?: string[];
  skillUpdate?: TeachingSkillUpdate;
  recommendation?: TeachingRecommendation;
}

interface RawTeachingReport {
  student_error_model?: unknown;
  studentErrorModel?: unknown;
  pain_points?: unknown;
  hint?: unknown;
  specific_hint?: unknown;
  specificHint?: unknown;
  checkpoint?: unknown;
  micro_steps?: unknown;
  microSteps?: unknown;
  skill_update?: unknown;
  recommendation?: unknown;
}

export function parseTeachingDiagnosisReport(text: string): TeachingDiagnosisReport {
  const raw = JSON.parse(extractJson(text)) as RawTeachingReport;
  const painPoints = requireArray(raw.pain_points, "pain_points").map(parsePainPoint);

  if (painPoints.length === 0) {
    throw new Error("Teaching diagnosis report must include at least one pain_points item.");
  }

  return {
    studentErrorModel: optionalString(raw.student_error_model ?? raw.studentErrorModel),
    painPoints,
    hint: requireString(raw.hint, "hint"),
    specificHint: optionalString(raw.specific_hint ?? raw.specificHint),
    checkpoint: optionalString(raw.checkpoint),
    microSteps: optionalStringArray(raw.micro_steps ?? raw.microSteps, "micro_steps"),
    skillUpdate: parseSkillUpdate(raw.skill_update),
    recommendation: parseRecommendation(raw.recommendation)
  };
}

function parsePainPoint(value: unknown): TeachingPainPoint {
  const record = requireRecord(value, "pain_points[]");
  const confidence = requireNumber(record.confidence, "pain_points[].confidence");

  return {
    label: requireString(record.label, "pain_points[].label"),
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence: requireString(record.evidence, "pain_points[].evidence")
  };
}

function parseSkillUpdate(value: unknown): TeachingSkillUpdate | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const record = requireRecord(value, "skill_update");
  return {
    candidate: requireString(record.candidate, "skill_update.candidate"),
    reason: requireString(record.reason, "skill_update.reason"),
    rules: requireArray(record.rules, "skill_update.rules").map((rule) => requireString(rule, "skill_update.rules[]"))
  };
}

function parseRecommendation(value: unknown): TeachingRecommendation | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const record = requireRecord(value, "recommendation");
  return {
    problemId: requireString(record.problem_id, "recommendation.problem_id"),
    reason: requireString(record.reason, "recommendation.reason")
  };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Teaching diagnosis field ${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Teaching diagnosis field ${field} must be an array.`);
  }

  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Teaching diagnosis field ${field} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^(?:[-*]|\d+[.)])\s*/, ""))
      .filter((line) => line.length > 0);
    return lines.length > 0 ? lines : undefined;
  }

  return requireArray(value, field)
    .map((item) => requireString(item, `${field}[]`))
    .filter((item) => item.trim().length > 0);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Teaching diagnosis field ${field} must be a finite number.`);
  }

  return value;
}

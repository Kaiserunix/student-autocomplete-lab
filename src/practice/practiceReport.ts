export interface WrongSubmission {
  code: string;
  expectedError: string;
  painPoints: string[];
}

export interface SkillUpdateCandidate {
  name: string;
  rules: string[];
}

export interface PracticeGenerationReport {
  problemId: string;
  referenceSolution: string;
  wrongSubmissions: WrongSubmission[];
  skillUpdateCandidate?: SkillUpdateCandidate;
}

interface RawPracticeGeneration {
  problem_id?: unknown;
  reference_solution?: unknown;
  wrong_submissions?: unknown;
  skill_update_candidate?: unknown;
}

export function parsePracticeGeneration(text: string): PracticeGenerationReport {
  const raw = JSON.parse(extractJson(text)) as RawPracticeGeneration;

  return {
    problemId: requireString(raw.problem_id, "problem_id"),
    referenceSolution: requireString(raw.reference_solution, "reference_solution"),
    wrongSubmissions: requireArray(raw.wrong_submissions, "wrong_submissions").map(parseWrongSubmission),
    skillUpdateCandidate: parseSkillUpdateCandidate(raw.skill_update_candidate)
  };
}

function parseWrongSubmission(value: unknown): WrongSubmission {
  const item = requireRecord(value, "wrong_submissions item");

  return {
    code: requireString(item.code, "wrong_submissions[].code"),
    expectedError: requireString(item.expected_error, "wrong_submissions[].expected_error"),
    painPoints: requireArray(item.pain_points, "wrong_submissions[].pain_points").map((painPoint) =>
      requireString(painPoint, "wrong_submissions[].pain_points[]")
    )
  };
}

function parseSkillUpdateCandidate(value: unknown): SkillUpdateCandidate | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const item = requireRecord(value, "skill_update_candidate");

  return {
    name: requireString(item.name, "skill_update_candidate.name"),
    rules: requireArray(item.rules, "skill_update_candidate.rules").map((rule) =>
      requireString(rule, "skill_update_candidate.rules[]")
    )
  };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Practice generation field ${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Practice generation field ${field} must be a non-empty string.`);
  }

  return value;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Practice generation field ${field} must be an array.`);
  }

  return value;
}

import type { TeachingDiagnosisReport } from "./teachingReport";
import type { StudentProfile } from "./studentProfile";
import type { TeachingStudentProfileSummary } from "./types";
import { isStudentSkillDisabled, isStudentSkillTeachingActive } from "./studentSkillLifecycle";
import { selectLearnerRules } from "../skills/habitSelector";

export type StudentSkillSchemaVersion = "student-skill/v1";
export type StudentSkillStatus = "candidate" | "active" | "mastered" | "disabled";
export type StudentSkillCorrectionType = "diagnosis_wrong" | "diagnosis_helpful" | "skill_disabled" | "manual_note";

export interface StudentSkillEvidenceExample {
  problemId?: string;
  topic?: string;
  evidence: string;
  source: string;
  occurredAt: string;
}

export interface StudentSkillPainPointState {
  count: number;
  score: number;
  lastSeen: string;
  examples: StudentSkillEvidenceExample[];
  counterexamples: StudentSkillEvidenceExample[];
}

export interface StudentSkillEntry {
  name: string;
  status: StudentSkillStatus;
  reason: string;
  rules: string[];
  sourcePainPoints: string[];
  evidenceCount: number;
  score: number;
  examples: StudentSkillEvidenceExample[];
  lastSeen: string;
  disabledReason?: string;
}

export interface StudentSkillTransferState {
  probes: number;
  passed: number;
  estimatedHintReduction: number;
  lastSeen: string;
}

export interface StudentSkillCorrection {
  id?: string;
  type: StudentSkillCorrectionType;
  target?: string;
  note: string;
  source: string;
  occurredAt: string;
}

export interface StudentSkill {
  schemaVersion: StudentSkillSchemaVersion;
  studentId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  hardRules: {
    autocompleteMayReadProblemStatement: false;
    allowFullSolutionAutocomplete: false;
    disabledSkills: string[];
  };
  capabilityMap: {
    topics: Record<string, { level: "unknown" | "learning" | "stable"; solvedCount: number; lastSeen?: string }>;
  };
  errorModel: Record<string, StudentSkillPainPointState>;
  codeHabits: {
    globalRules: string[];
    languageRules: Record<string, string[]>;
  };
  teachingPreferences: {
    responseLanguage: "zh-CN";
    maxDefaultHintDepth: number;
    notes: string[];
  };
  skills: Record<string, StudentSkillEntry>;
  transferEvidence: Record<string, StudentSkillTransferState>;
  correctionLog: StudentSkillCorrection[];
}

export interface StudentSkillPainPointPatch {
  label: string;
  confidence: number;
  evidence: string;
}

export interface StudentSkillEntryPatch {
  name: string;
  status?: StudentSkillStatus;
  reason: string;
  rules: string[];
  sourcePainPoints: string[];
  confidence?: number;
}

export interface StudentSkillTransferPatch {
  skillName: string;
  probes: number;
  passed: number;
  estimatedHintReduction?: number;
}

export interface StudentSkillPatch {
  source: string;
  occurredAt: string;
  problemId?: string;
  topic?: string;
  painPoints?: StudentSkillPainPointPatch[];
  skills?: StudentSkillEntryPatch[];
  codeHabitRules?: Array<{ language: string; rules: string[] }>;
  teachingPreferenceNotes?: string[];
  transferEvidence?: StudentSkillTransferPatch[];
  corrections?: StudentSkillCorrection[];
  disableSkills?: Array<{ name: string; reason: string }>;
}

export interface StudentSkillMergeConflict {
  field: string;
  existing: string;
  incoming: string;
  resolution: string;
}

export interface StudentSkillMergeResult {
  skill: StudentSkill;
  conflicts: StudentSkillMergeConflict[];
  changeSummary: string[];
}

export interface StudentSkillPatchMeta {
  source: string;
  occurredAt: string;
  problemId?: string;
  topic?: string;
}

export interface AutocompleteStudentSkillContext {
  allowFullSolutionAutocomplete: false;
  autocompleteMayReadProblemStatement: false;
  learnerRuleIds: string[];
}

const ACTIVE_EVIDENCE_COUNT = 3;
const ACTIVE_SCORE = 2.5;

export function createEmptyStudentSkill(
  studentId = "local-student",
  now = new Date().toISOString()
): StudentSkill {
  return {
    schemaVersion: "student-skill/v1",
    studentId,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    hardRules: {
      autocompleteMayReadProblemStatement: false,
      allowFullSolutionAutocomplete: false,
      disabledSkills: []
    },
    capabilityMap: {
      topics: {}
    },
    errorModel: {},
    codeHabits: {
      globalRules: [],
      languageRules: {}
    },
    teachingPreferences: {
      responseLanguage: "zh-CN",
      maxDefaultHintDepth: 1,
      notes: []
    },
    skills: {},
    transferEvidence: {},
    correctionLog: []
  };
}

export function studentSkillFromProfile(profile: StudentProfile, now = new Date().toISOString()): StudentSkill {
  const skill = createEmptyStudentSkill(profile.studentId, now);

  for (const [label, state] of Object.entries(profile.painPoints)) {
    skill.errorModel[label] = {
      count: state.count,
      score: state.score,
      lastSeen: state.lastSeen,
      examples: [],
      counterexamples: []
    };
  }

  for (const [name, candidate] of Object.entries(profile.skillCandidates)) {
    skill.skills[name] = {
      name,
      status: candidate.status === "ready" ? "active" : "candidate",
      reason: candidate.reason,
      rules: candidate.rules,
      sourcePainPoints: candidate.sourcePainPoints,
      evidenceCount: candidate.count,
      score: candidate.score,
      examples: [],
      lastSeen: candidate.lastSeen
    };
  }

  return skill;
}

export function buildStudentSkillPatchFromDiagnosis(
  report: TeachingDiagnosisReport,
  meta: StudentSkillPatchMeta
): StudentSkillPatch {
  return {
    ...meta,
    painPoints: report.painPoints.map((painPoint) => ({
      label: painPoint.label,
      confidence: painPoint.confidence,
      evidence: painPoint.evidence
    })),
    skills: report.skillUpdate
      ? [
          {
            name: report.skillUpdate.candidate,
            reason: report.skillUpdate.reason,
            rules: report.skillUpdate.rules,
            sourcePainPoints: report.painPoints.map((painPoint) => painPoint.label),
            confidence: report.painPoints.reduce((sum, painPoint) => sum + painPoint.confidence, 0)
          }
        ]
      : undefined,
    teachingPreferenceNotes: report.studentErrorModel ? [`student_error_model: ${report.studentErrorModel}`] : undefined
  };
}

export function applyStudentSkillPatch(skill: StudentSkill, patch: StudentSkillPatch): StudentSkillMergeResult {
  const next = cloneSkill(skill);
  const conflicts: StudentSkillMergeConflict[] = [];
  const changeSummary: string[] = [];

  next.revision += 1;
  next.updatedAt = patch.occurredAt;

  for (const painPoint of patch.painPoints ?? []) {
    applyPainPointPatch(next, patch, painPoint);
    changeSummary.push(`pain:${painPoint.label}`);
  }

  for (const skillPatch of patch.skills ?? []) {
    applySkillEntryPatch(next, patch, skillPatch, conflicts);
    changeSummary.push(`skill:${skillPatch.name}`);
  }

  for (const codeHabit of patch.codeHabitRules ?? []) {
    next.codeHabits.languageRules[codeHabit.language] = unique([
      ...(next.codeHabits.languageRules[codeHabit.language] ?? []),
      ...codeHabit.rules
    ]);
    changeSummary.push(`codeHabit:${codeHabit.language}`);
  }

  if (patch.teachingPreferenceNotes) {
    next.teachingPreferences.notes = unique([...next.teachingPreferences.notes, ...patch.teachingPreferenceNotes]);
    changeSummary.push("teachingPreferences");
  }

  for (const transferPatch of patch.transferEvidence ?? []) {
    applyTransferPatch(next, patch, transferPatch);
    changeSummary.push(`transfer:${transferPatch.skillName}`);
  }

  for (const correction of patch.corrections ?? []) {
    applyCorrection(next, patch, correction);
    changeSummary.push(`correction:${correction.type}`);
  }

  for (const disabled of patch.disableSkills ?? []) {
    disableSkill(next, patch, disabled.name, disabled.reason);
    changeSummary.push(`disabled:${disabled.name}`);
  }

  next.hardRules.disabledSkills = unique([
    ...next.hardRules.disabledSkills,
    ...Object.values(next.skills)
      .filter((entry) => entry.status === "disabled")
      .map((entry) => entry.name)
  ]);

  return { skill: next, conflicts, changeSummary };
}

export function studentSkillSummaryForTeaching(skill: StudentSkill): TeachingStudentProfileSummary {
  const painPointCounts = Object.fromEntries(
    Object.entries(skill.errorModel).map(([label, state]) => [label, state.count])
  );
  const activeSkills = Object.values(skill.skills)
    .filter((entry) => isStudentSkillTeachingActive(entry.status))
    .map((entry) => entry.name)
    .sort();
  const recentCorrections = [...skill.correctionLog]
    .slice(-5)
    .map((entry) => ({
      type: entry.type,
      target: entry.target,
      note: entry.note
    }));

  return { painPointCounts, activeSkills, recentCorrections };
}

export function buildAutocompleteSkillContext(
  skill: StudentSkill,
  language: string,
  localCode = ""
): AutocompleteStudentSkillContext {
  return {
    allowFullSolutionAutocomplete: skill.hardRules.allowFullSolutionAutocomplete,
    autocompleteMayReadProblemStatement: skill.hardRules.autocompleteMayReadProblemStatement,
    learnerRuleIds: selectLearnerRules({
      skill,
      route: "autocomplete",
      language,
      localCode
    }).rules.map((rule) => rule.id)
  };
}

export function renderStudentSkillMarkdown(skill: StudentSkill): string {
  const painPoints = Object.entries(skill.errorModel)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, state]) => `- ${label}: count=${state.count}, score=${state.score}, lastSeen=${state.lastSeen}`);
  const skills = Object.values(skill.skills)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => `- ${entry.name}: ${entry.status}, evidence=${entry.evidenceCount}`);
  const corrections = skill.correctionLog.map((entry) => `- ${entry.type}: ${entry.target ?? "general"} - ${entry.note}`);

  return [
    `# Student Skill: ${skill.studentId}`,
    "",
    `schemaVersion: ${skill.schemaVersion}`,
    `revision: ${skill.revision}`,
    `updatedAt: ${skill.updatedAt}`,
    "",
    "## Hard Rules",
    `- autocompleteMayReadProblemStatement: ${skill.hardRules.autocompleteMayReadProblemStatement}`,
    `- allowFullSolutionAutocomplete: ${skill.hardRules.allowFullSolutionAutocomplete}`,
    "",
    "## Error Model",
    ...(painPoints.length > 0 ? painPoints : ["- none"]),
    "",
    "## Skills",
    ...(skills.length > 0 ? skills : ["- none"]),
    "",
    "## Corrections",
    ...(corrections.length > 0 ? corrections : ["- none"]),
    ""
  ].join("\n");
}

function applyPainPointPatch(
  skill: StudentSkill,
  patch: StudentSkillPatch,
  painPoint: StudentSkillPainPointPatch
): void {
  const previous = skill.errorModel[painPoint.label] ?? {
    count: 0,
    score: 0,
    lastSeen: patch.occurredAt,
    examples: [],
    counterexamples: []
  };

  skill.errorModel[painPoint.label] = {
    count: previous.count + 1,
    score: roundScore(previous.score + clampConfidence(painPoint.confidence)),
    lastSeen: patch.occurredAt,
    examples: appendEvidence(previous.examples, makeEvidenceExample(patch, painPoint.evidence)),
    counterexamples: previous.counterexamples
  };
}

function applySkillEntryPatch(
  skill: StudentSkill,
  patch: StudentSkillPatch,
  skillPatch: StudentSkillEntryPatch,
  conflicts: StudentSkillMergeConflict[]
): void {
  const previous = skill.skills[skillPatch.name] ?? {
    name: skillPatch.name,
    status: "candidate" as const,
    reason: skillPatch.reason,
    rules: [],
    sourcePainPoints: [],
    evidenceCount: 0,
    score: 0,
    examples: [],
    lastSeen: patch.occurredAt
  };
  const incomingStatus = skillPatch.status ?? "candidate";
  const nextEvidenceCount = previous.evidenceCount + 1;
  const nextScore = previous.score + (skillPatch.confidence ?? 0);
  const hasPromotionEvidence =
    nextEvidenceCount >= ACTIVE_EVIDENCE_COUNT || (nextEvidenceCount >= 2 && nextScore >= ACTIVE_SCORE);

  let status = previous.status;
  const hasWrongCorrection = skill.correctionLog.some(
    (correction) => correction.type === "diagnosis_wrong" && correction.target === skillPatch.name
  );
  if (isStudentSkillDisabled(previous.status) && incomingStatus !== "disabled") {
    conflicts.push({
      field: `skills.${skillPatch.name}.status`,
      existing: previous.status,
      incoming: incomingStatus,
      resolution: "kept existing disabled skill"
    });
  } else if (incomingStatus === "disabled") {
    status = "disabled";
  } else if (previous.status === "mastered") {
    status = "mastered";
  } else if (hasWrongCorrection) {
    status = "candidate";
    if (incomingStatus === "active" || incomingStatus === "mastered" || hasPromotionEvidence) {
      conflicts.push({
        field: `skills.${skillPatch.name}.status`,
        existing: previous.status,
        incoming: incomingStatus,
        resolution: "kept candidate after wrong-diagnosis correction"
      });
    }
  } else if (hasPromotionEvidence) {
    status = "active";
  } else {
    status = isStudentSkillTeachingActive(previous.status) ? previous.status : "candidate";
  }

  skill.skills[skillPatch.name] = {
    ...previous,
    status,
    reason: skillPatch.reason || previous.reason,
    rules: unique([...previous.rules, ...skillPatch.rules]),
    sourcePainPoints: unique([...previous.sourcePainPoints, ...skillPatch.sourcePainPoints]),
    evidenceCount: nextEvidenceCount,
    score: roundScore(nextScore),
    examples: appendEvidence(previous.examples, makeEvidenceExample(patch, skillPatch.reason)),
    lastSeen: patch.occurredAt
  };
}

function applyTransferPatch(
  skill: StudentSkill,
  patch: StudentSkillPatch,
  transferPatch: StudentSkillTransferPatch
): void {
  const previous = skill.transferEvidence[transferPatch.skillName] ?? {
    probes: 0,
    passed: 0,
    estimatedHintReduction: 0,
    lastSeen: patch.occurredAt
  };

  skill.transferEvidence[transferPatch.skillName] = {
    probes: previous.probes + Math.max(0, transferPatch.probes),
    passed: previous.passed + Math.max(0, transferPatch.passed),
    estimatedHintReduction: Math.max(previous.estimatedHintReduction, transferPatch.estimatedHintReduction ?? 0),
    lastSeen: patch.occurredAt
  };

  const nextTransfer = skill.transferEvidence[transferPatch.skillName];
  const entry = skill.skills[transferPatch.skillName];
  if (entry && !isStudentSkillDisabled(entry.status) && nextTransfer.passed >= 2 && nextTransfer.estimatedHintReduction > 0) {
    skill.skills[transferPatch.skillName] = {
      ...entry,
      status: "mastered",
      lastSeen: patch.occurredAt
    };
  }
}

function applyCorrection(skill: StudentSkill, patch: StudentSkillPatch, correction: StudentSkillCorrection): void {
  const recorded = withCorrectionId(correction, skill.correctionLog.length);
  skill.correctionLog.push(recorded);

  if (recorded.type === "diagnosis_wrong" && recorded.target) {
    markSkillDiagnosisWrong(skill, patch, recorded.target, recorded.note, recorded.source);
    return;
  }

  if (recorded.type === "diagnosis_helpful" && recorded.target) {
    const previous = skill.skills[recorded.target];
    if (!previous || previous.status === "disabled") {
      return;
    }

    skill.skills[recorded.target] = {
      ...previous,
      score: roundScore(previous.score + 0.25),
      examples: appendEvidence(previous.examples, {
        problemId: patch.problemId,
        topic: patch.topic,
        evidence: recorded.note,
        source: recorded.source,
        occurredAt: recorded.occurredAt
      }),
      lastSeen: recorded.occurredAt
    };
  }
}

function markSkillDiagnosisWrong(
  skill: StudentSkill,
  patch: StudentSkillPatch,
  target: string,
  note: string,
  source: string
): void {
  const previous = skill.skills[target];
  if (!previous) {
    return;
  }

  skill.skills[target] = {
    ...previous,
    status: "candidate",
    disabledReason: undefined,
    score: Math.max(0, roundScore(previous.score - 1)),
    lastSeen: patch.occurredAt
  };

  for (const painPoint of previous.sourcePainPoints) {
    const previousPainPoint = skill.errorModel[painPoint] ?? {
      count: 0,
      score: 0,
      lastSeen: patch.occurredAt,
      examples: [],
      counterexamples: []
    };

    skill.errorModel[painPoint] = {
      ...previousPainPoint,
      lastSeen: patch.occurredAt,
      counterexamples: appendEvidence(previousPainPoint.counterexamples, {
        problemId: patch.problemId,
        topic: patch.topic,
        evidence: note,
        source,
        occurredAt: patch.occurredAt
      })
    };
  }
}

function disableSkill(skill: StudentSkill, patch: StudentSkillPatch, name: string, reason: string): void {
  const previous = skill.skills[name] ?? {
    name,
    status: "candidate" as const,
    reason,
    rules: [],
    sourcePainPoints: [],
    evidenceCount: 0,
    score: 0,
    examples: [],
    lastSeen: patch.occurredAt
  };

  skill.skills[name] = {
    ...previous,
    status: "disabled",
    disabledReason: reason,
    lastSeen: patch.occurredAt
  };
  skill.correctionLog.push(
    withCorrectionId(
      {
        type: "skill_disabled",
        target: name,
        note: reason,
        source: patch.source,
        occurredAt: patch.occurredAt
      },
      skill.correctionLog.length
    )
  );
}

function withCorrectionId(correction: StudentSkillCorrection, index: number): StudentSkillCorrection {
  return {
    ...correction,
    id: correction.id ?? `${correction.occurredAt}|${correction.source}|${correction.type}|${index}`
  };
}

function makeEvidenceExample(patch: StudentSkillPatch, evidence: string): StudentSkillEvidenceExample {
  return {
    problemId: patch.problemId,
    topic: patch.topic,
    evidence,
    source: patch.source,
    occurredAt: patch.occurredAt
  };
}

function appendEvidence(
  previous: StudentSkillEvidenceExample[],
  next: StudentSkillEvidenceExample
): StudentSkillEvidenceExample[] {
  const key = evidenceKey(next);
  if (previous.some((item) => evidenceKey(item) === key)) {
    return previous;
  }

  return [...previous, next];
}

function evidenceKey(item: StudentSkillEvidenceExample): string {
  return [item.occurredAt, item.problemId ?? "", item.source, item.evidence].join("|");
}

function cloneSkill(skill: StudentSkill): StudentSkill {
  return JSON.parse(JSON.stringify(skill)) as StudentSkill;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { buildAutocompleteInputFromText } from "../../src/autocomplete/context";
import { requestMimoAutocompleteDetailed, type MimoAutocompleteResult } from "../../src/autocomplete/mimoAutocomplete";
import { loadPracticeFixture } from "../../src/practice/fixtureStore";
import { verifyPracticeReport, type PracticeVerificationResult, type PracticeVerifierOptions } from "../../src/practice/practiceVerifier";
import { runPythonCode } from "../../src/practice/pythonRunner";
import type { SkillPlanAudit } from "../../src/skills/types";
import {
  validateCoachDiagnosisSafety,
  validateCoachFollowUpSafety,
  type CoachSafetyMode,
  type CoachSpoilerValidationResult
} from "../../src/skills/validators/coachSpoilerPolicy";
import {
  requestMimoCoachFollowUpWithSkills,
  type CoachFollowUpReport
} from "../../src/teaching/coachFollowUp";
import { requestMimoTeachingDiagnosisWithSkills } from "../../src/teaching/mimoTeacher";
import { createEmptyStudentProfile } from "../../src/teaching/studentProfile";
import { createEmptyStudentSkill, type StudentSkill } from "../../src/teaching/studentSkill";
import type { TeachingDiagnosisReport } from "../../src/teaching/teachingReport";
import type {
  LocalEvidenceItem,
  OjVerdict,
  TeacherPackReference,
  TeachingProblemContext
} from "../../src/teaching/types";
import { runCoachDiagnosisWorkflow } from "../../src/teaching/workflow/actions";

export interface AcceptanceDiagnosisCase {
  caseId: string;
  action: "hint" | "specific";
  responseLanguage: "zh-CN" | "en-US";
  platform: string;
  problem: TeachingProblemContext;
  language: string;
  studentCode: string;
  referenceSolution?: string;
  teacherPack?: TeacherPackReference;
  ojVerdict: OjVerdict;
  localEvidence: LocalEvidenceItem[];
  studentProfileCorrections?: Array<{ type: "diagnosis_wrong" | "diagnosis_helpful"; target?: string; note: string }>;
  disabledSkills?: string[];
  habitRules?: string[];
  expectedExcludedSkillRules?: string[];
  expectedPainPoint: string;
  expectedSkillCandidate: string;
  expectedRecommendation?: string;
  safeModelResponse: Record<string, unknown>;
  leakyModelResponse?: Record<string, unknown>;
}

export interface AcceptanceFollowUpCase {
  caseId: string;
  responseLanguage: "zh-CN" | "en-US";
  problem: TeachingProblemContext;
  language: string;
  studentCode: string;
  studentRequest: string;
  previousCoachTurn?: string;
  teacherPack?: TeacherPackReference;
  safeModelResponse: Record<string, unknown>;
  leakyModelResponse?: Record<string, unknown>;
}

export interface AcceptanceContrastCase {
  caseId: string;
  problemId: string;
  language: string;
  studentCode: string;
  referenceSolution: string;
  fullSolutionText: string;
}

export interface AcceptanceAutocompleteBoundaryCase {
  caseId: string;
  language: string;
  filePath: string;
  documentText: string;
  cursorAfter: string;
  mustContain: string[];
  mustNotContain: string[];
  expectEmptyPrefix?: boolean;
  mockCompletion?: string;
  expectedStatus?: "success" | "model-empty" | "validator-rejected";
  expectedRejectionReason?: "empty-after-filter" | "explanation" | "context-marker";
  expectedMaxLines?: number;
}

export interface CoachingAcceptanceSuite {
  schemaVersion: number;
  description: string;
  practiceFixtureIds: string[];
  diagnosisCases: AcceptanceDiagnosisCase[];
  followUpCases: AcceptanceFollowUpCase[];
  hintVsGiveUpContrastCases: AcceptanceContrastCase[];
  autocompleteBoundaryCases: AcceptanceAutocompleteBoundaryCase[];
}

export interface AcceptanceFailure {
  category: "diagnosis" | "followUp" | "contrast" | "autocomplete" | "practice";
  caseId: string;
  reason: string;
}

export interface CoachingAcceptanceRunSummary {
  totalChecks: number;
  passedChecks: number;
  failures: AcceptanceFailure[];
}

export async function loadCoachingAcceptanceSuite(
  suitePath = path.join("fixtures", "acceptance", "coaching-acceptance-suite.json")
): Promise<CoachingAcceptanceSuite> {
  const raw = JSON.parse(await readFile(path.resolve(process.cwd(), suitePath), "utf8")) as CoachingAcceptanceSuite;
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.diagnosisCases) || !Array.isArray(raw.autocompleteBoundaryCases)) {
    throw new Error(`Invalid coaching acceptance suite schema in ${suitePath}.`);
  }
  return raw;
}

function buildStudentSkillForCase(item: AcceptanceDiagnosisCase): StudentSkill {
  const skill = createEmptyStudentSkill("acceptance-student", "2026-07-14T00:00:00.000Z");
  skill.codeHabits.globalRules = [...(item.habitRules ?? [])];
  skill.hardRules.disabledSkills = [...(item.disabledSkills ?? [])];
  for (const disabledName of item.disabledSkills ?? []) {
    skill.skills[disabledName] = {
      name: disabledName,
      status: "disabled",
      reason: "User disabled or flagged wrong.",
      rules: ["Check loop boundary."],
      sourcePainPoints: ["loop_boundary"],
      evidenceCount: 3,
      score: 2.8,
      examples: [],
      lastSeen: "2026-07-14T00:00:00.000Z"
    };
  }
  for (const correction of item.studentProfileCorrections ?? []) {
    skill.correctionLog.push({
      type: correction.type,
      target: correction.target,
      note: correction.note,
      source: "user",
      occurredAt: "2026-07-14T00:05:00.000Z"
    });
  }
  return skill;
}

function createFakeChatFetch(payload: unknown, captureBody?: (body: string) => void): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (captureBody) {
      captureBody(String(init?.body ?? ""));
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(payload)
            }
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
}

export async function runDiagnosisAcceptanceCase(item: AcceptanceDiagnosisCase): Promise<{
  safeCheck: CoachSpoilerValidationResult<TeachingDiagnosisReport>;
  leakyCheck?: CoachSpoilerValidationResult<TeachingDiagnosisReport>;
  audit?: SkillPlanAudit;
  failures: AcceptanceFailure[];
}> {
  const failures: AcceptanceFailure[] = [];
  const studentSkill = buildStudentSkillForCase(item);
  const profile = createEmptyStudentProfile("acceptance-student");
  let audit: SkillPlanAudit | undefined;
  let safeCheck: CoachSpoilerValidationResult<TeachingDiagnosisReport> | undefined;
  let capturedPromptBody = "";

  const providerConfig = {
    baseUrl: "https://coach.example.test/v1",
    apiKey: "test-key",
    model: "acceptance-coach-model"
  };

  const context = {
    problem: item.problem,
    teacherPack: item.teacherPack,
    language: item.language,
    studentCode: item.studentCode,
    ojVerdict: item.ojVerdict ?? { status: "UNKNOWN" },
    localEvidence: item.localEvidence ?? [],
    studentProfile: {
      painPointCounts: {},
      activeSkills: [],
      recentCorrections: item.studentProfileCorrections
    },
    responseLanguage: item.responseLanguage
  };

  const workflowResult = await runCoachDiagnosisWorkflow({
    action: item.action,
    problemKey: `${item.platform}:${item.problem.id}`,
    platform: item.platform,
    context,
    profile,
    studentSkill,
    occurredAt: "2026-07-14T00:10:00.000Z",
    patchSource: "acceptance-coach-model",
    diagnose: (diagnosisContext) =>
      requestMimoTeachingDiagnosisWithSkills(
        providerConfig,
        diagnosisContext,
        {
          studentSkill,
          action: item.action,
          onAudit: (value) => {
            audit = value;
          },
          onSafetyCheck: (value) => {
            safeCheck = value;
          }
        },
        createFakeChatFetch(item.safeModelResponse, (body) => {
          capturedPromptBody = body;
        })
      )
  });

  if (!capturedPromptBody.includes("<untrusted_student_code>")) {
    failures.push({
      category: "diagnosis",
      caseId: item.caseId,
      reason: "Diagnosis prompt missing <untrusted_student_code> delimiter."
    });
  }

  if (workflowResult.report.painPoints[0]?.label !== item.expectedPainPoint) {
    failures.push({
      category: "diagnosis",
      caseId: item.caseId,
      reason: `Expected painPoint ${item.expectedPainPoint}, got ${workflowResult.report.painPoints[0]?.label}.`
    });
  }

  if (
    workflowResult.report.skillUpdate &&
    workflowResult.report.skillUpdate.candidate !== item.expectedSkillCandidate
  ) {
    failures.push({
      category: "diagnosis",
      caseId: item.caseId,
      reason: `Expected skillUpdate.candidate ${item.expectedSkillCandidate}, got ${workflowResult.report.skillUpdate.candidate}.`
    });
  }

  if (
    item.expectedRecommendation &&
    workflowResult.report.recommendation?.problemId !== item.expectedRecommendation
  ) {
    failures.push({
      category: "diagnosis",
      caseId: item.caseId,
      reason: `Expected recommendation ${item.expectedRecommendation}, got ${workflowResult.report.recommendation?.problemId}.`
    });
  }

  if (!workflowResult.audit.excluded.includes("standard_answer") || !workflowResult.audit.excluded.includes("autocomplete_prompt")) {
    failures.push({
      category: "diagnosis",
      caseId: item.caseId,
      reason: "Workflow audit must explicitly exclude standard_answer and autocomplete_prompt."
    });
  }

  for (const excludedId of item.expectedExcludedSkillRules ?? []) {
    if (!audit?.excludedRules.some((entry) => entry.id === excludedId)) {
      failures.push({
        category: "diagnosis",
        caseId: item.caseId,
        reason: `Expected learner rule ${excludedId} to be excluded by correction/disabled guard.`
      });
    }
  }

  const refValidation = validateCoachDiagnosisSafety(workflowResult.report, {
    mode: item.action,
    studentCode: item.studentCode,
    referenceSolution: item.referenceSolution,
    teacherPack: item.teacherPack,
    responseLanguage: item.responseLanguage
  });
  if (!safeCheck?.safe || !refValidation.safe) {
    failures.push({
      category: "diagnosis",
      caseId: item.caseId,
      reason: `Safe hint response triggered unexpected safety violations: ${JSON.stringify([
        ...(safeCheck?.violations ?? []),
        ...refValidation.violations
      ])}`
    });
  }

  let leakyCheck: CoachSpoilerValidationResult<TeachingDiagnosisReport> | undefined;
  if (item.leakyModelResponse) {
    let runtimeSafety: CoachSpoilerValidationResult<TeachingDiagnosisReport> | undefined;
    const sanitized = await requestMimoTeachingDiagnosisWithSkills(
      providerConfig,
      context,
      {
        studentSkill,
        action: item.action,
        onSafetyCheck: (value) => {
          runtimeSafety = value;
        }
      },
      createFakeChatFetch(item.leakyModelResponse)
    );
    leakyCheck = validateCoachDiagnosisSafety(sanitized, {
      mode: item.action,
      studentCode: item.studentCode,
      referenceSolution: item.referenceSolution,
      teacherPack: item.teacherPack,
      responseLanguage: item.responseLanguage
    });
    if (runtimeSafety?.safe !== false) {
      failures.push({
        category: "diagnosis",
        caseId: item.caseId,
        reason: "Adversarial leaky model response was NOT caught in hint mode."
      });
    }
    if (!leakyCheck.safe) {
      failures.push({
        category: "diagnosis",
        caseId: item.caseId,
        reason: `Sanitized diagnosis still retained spoiler violations: ${JSON.stringify(leakyCheck.violations)}`
      });
    }
    if (item.teacherPack?.standardApproach && sanitized.specificHint?.includes(item.teacherPack.standardApproach)) {
      failures.push({
        category: "diagnosis",
        caseId: item.caseId,
        reason: "Sanitized output still leaked teacherPack.standardApproach."
      });
    }
    leakyCheck = runtimeSafety;
  }

  return {
    safeCheck: safeCheck ?? refValidation,
    leakyCheck,
    audit,
    failures
  };
}

export async function runFollowUpAcceptanceCase(item: AcceptanceFollowUpCase): Promise<{
  failures: AcceptanceFailure[];
}> {
  const failures: AcceptanceFailure[] = [];
  const studentSkill = createEmptyStudentSkill("acceptance-student", "2026-07-14T00:00:00.000Z");
  const providerConfig = {
    baseUrl: "https://coach.example.test/v1",
    apiKey: "test-key",
    model: "acceptance-coach-model"
  };

  let capturedBody = "";
  let safeCheck: CoachSpoilerValidationResult<CoachFollowUpReport> | undefined;
  await requestMimoCoachFollowUpWithSkills(
    providerConfig,
    {
      problem: item.problem,
      teacherPack: item.teacherPack,
      language: item.language,
      studentCode: item.studentCode,
      studentRequest: item.studentRequest,
      previousCoachTurn: item.previousCoachTurn,
      studentProfile: { painPointCounts: {}, activeSkills: [] },
      responseLanguage: item.responseLanguage
    },
    {
      studentSkill,
      onSafetyCheck: (value) => {
        safeCheck = value;
      }
    },
    createFakeChatFetch(item.safeModelResponse, (body) => {
      capturedBody = body;
    })
  );

  if (!capturedBody.includes("<untrusted_student_request>") || !capturedBody.includes("<untrusted_student_code>")) {
    failures.push({
      category: "followUp",
      caseId: item.caseId,
      reason: "Follow-up prompt missing untrusted delimiter wrappers."
    });
  }

  if (studentSkill.revision !== 0) {
    failures.push({
      category: "followUp",
      caseId: item.caseId,
      reason: "Follow-up conversation must not mutate StudentSkill revision."
    });
  }

  if (!safeCheck?.safe) {
    failures.push({
      category: "followUp",
      caseId: item.caseId,
      reason: `Safe follow-up response failed safety check: ${JSON.stringify(safeCheck?.violations)}`
    });
  }

  if (item.leakyModelResponse) {
    let leakySafety: CoachSpoilerValidationResult<CoachFollowUpReport> | undefined;
    const sanitized = await requestMimoCoachFollowUpWithSkills(
      providerConfig,
      {
        problem: item.problem,
        teacherPack: item.teacherPack,
        language: item.language,
        studentCode: item.studentCode,
        studentRequest: item.studentRequest,
        previousCoachTurn: item.previousCoachTurn,
        studentProfile: { painPointCounts: {}, activeSkills: [] },
        responseLanguage: item.responseLanguage
      },
      {
        studentSkill,
        onSafetyCheck: (value) => {
          leakySafety = value;
        }
      },
      createFakeChatFetch(item.leakyModelResponse)
    );

    if (leakySafety?.safe !== false) {
      failures.push({
        category: "followUp",
        caseId: item.caseId,
        reason: "Adversarial leaky follow-up response was NOT blocked."
      });
    }
    const postCheck = validateCoachFollowUpSafety(sanitized, {
      mode: "followUp",
      studentCode: item.studentCode,
      teacherPack: item.teacherPack,
      responseLanguage: item.responseLanguage
    });
    if (!postCheck.safe) {
      failures.push({
        category: "followUp",
        caseId: item.caseId,
        reason: `Sanitized follow-up still had violations: ${JSON.stringify(postCheck.violations)}`
      });
    }
  }

  return { failures };
}

export function runHintVsGiveUpContrastCase(item: AcceptanceContrastCase): {
  failures: AcceptanceFailure[];
} {
  const failures: AcceptanceFailure[] = [];
  const report: TeachingDiagnosisReport = {
    painPoints: [{ label: "needs_teacher_review", confidence: 0.9, evidence: "Contrastive test." }],
    hint: item.fullSolutionText
  };

  for (const hintMode of ["hint", "specific"] as CoachSafetyMode[]) {
    const blocked = validateCoachDiagnosisSafety(report, {
      mode: hintMode,
      studentCode: item.studentCode,
      referenceSolution: item.referenceSolution
    });
    if (blocked.safe || blocked.violations.length === 0) {
      failures.push({
        category: "contrast",
        caseId: item.caseId,
        reason: `Expected full solution to be blocked in ${hintMode} mode.`
      });
    }
    if (blocked.sanitizedReport.hint.includes(item.referenceSolution.trim().split("\n")[1] ?? "nonexistent-needle-xyz")) {
      failures.push({
        category: "contrast",
        caseId: item.caseId,
        reason: `Sanitized hint still leaked reference lines in ${hintMode} mode.`
      });
    }
  }

  const allowed = validateCoachDiagnosisSafety(report, {
    mode: "giveUp",
    studentCode: item.studentCode,
    referenceSolution: item.referenceSolution
  });
  if (!allowed.safe || allowed.sanitizedReport.hint !== item.fullSolutionText) {
    failures.push({
      category: "contrast",
      caseId: item.caseId,
      reason: `Expected giveUp mode to permit full solution, got violations: ${JSON.stringify(allowed.violations)}`
    });
  }

  return { failures };
}

export async function runAutocompleteBoundaryCase(item: AcceptanceAutocompleteBoundaryCase): Promise<{
  result?: MimoAutocompleteResult;
  failures: AcceptanceFailure[];
}> {
  const failures: AcceptanceFailure[] = [];
  const markerPos = item.documentText.indexOf(item.cursorAfter);
  if (markerPos < 0) {
    return {
      failures: [{
        category: "autocomplete",
        caseId: item.caseId,
        reason: `cursorAfter marker not found in documentText.`
      }]
    };
  }

  const offset = markerPos + item.cursorAfter.length;
  const input = buildAutocompleteInputFromText({
    text: item.documentText,
    offset,
    language: item.language,
    filePath: item.filePath
  });

  if (item.expectEmptyPrefix && input.prefix.trim().length > 0) {
    failures.push({
      category: "autocomplete",
      caseId: item.caseId,
      reason: `Expected empty sanitized prefix, got: ${input.prefix}`
    });
  }

  for (const expected of item.mustContain) {
    if (!input.prefix.includes(expected)) {
      failures.push({
        category: "autocomplete",
        caseId: item.caseId,
        reason: `Expected prefix to contain "${expected}".`
      });
    }
  }

  const combinedInput = `${input.prefix}\n${input.suffix}`;
  for (const forbidden of item.mustNotContain) {
    if (combinedInput.includes(forbidden)) {
      failures.push({
        category: "autocomplete",
        caseId: item.caseId,
        reason: `Context isolation leak: found forbidden "${forbidden}" in sanitized prefix/suffix.`
      });
    }
  }

  let result: MimoAutocompleteResult | undefined;
  if (item.mockCompletion !== undefined) {
    let requestBody = "";
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        choices: [{ text: item.mockCompletion }]
      }), { status: 200 });
    }) as typeof fetch;

    const skill = createEmptyStudentSkill("acceptance-ac", "2026-07-14T00:00:00.000Z");
    skill.codeHabits.globalRules = ["Check pointer validity before dereference.", "LEAK-UNMAPPED-AC-RULE"];

    result = await requestMimoAutocompleteDetailed(
      {
        format: "openai-completions",
        baseUrl: "https://api.deepseek.com/beta",
        apiKey: "test-key",
        model: "deepseek-chat"
      },
      {
        ...input,
        studentSkill: skill
      },
      fakeFetch
    );

    for (const forbidden of [...item.mustNotContain, "LEAK-UNMAPPED-AC-RULE"]) {
      if (requestBody.includes(forbidden)) {
        failures.push({
          category: "autocomplete",
          caseId: item.caseId,
          reason: `Provider request payload leaked "${forbidden}".`
        });
      }
    }

    if (item.expectedStatus && result.status !== item.expectedStatus) {
      failures.push({
        category: "autocomplete",
        caseId: item.caseId,
        reason: `Expected autocomplete status ${item.expectedStatus}, got ${result.status}.`
      });
    }
    if (item.expectedRejectionReason && result.rejectionReason !== item.expectedRejectionReason) {
      failures.push({
        category: "autocomplete",
        caseId: item.caseId,
        reason: `Expected rejectionReason ${item.expectedRejectionReason}, got ${result.rejectionReason}.`
      });
    }
    if (item.expectedMaxLines !== undefined && result.suggestion) {
      const lineCount = result.suggestion.split(/\r?\n/).length;
      if (lineCount > item.expectedMaxLines) {
        failures.push({
          category: "autocomplete",
          caseId: item.caseId,
          reason: `Suggestion exceeded max ${item.expectedMaxLines} lines (got ${lineCount}).`
        });
      }
    }
  }

  return { result, failures };
}

export async function verifyPracticeFixtureSet(
  problemIds: string[],
  options: Pick<PracticeVerifierOptions, "runSubmission"> = {}
): Promise<{
  results: PracticeVerificationResult[];
  failures: AcceptanceFailure[];
}> {
  const results: PracticeVerificationResult[] = [];
  const failures: AcceptanceFailure[] = [];
  const runSubmission =
    options.runSubmission ?? ((code: string, input: string) => runPythonCode(code, input, 15_000));

  const batchSize = 10;
  for (let start = 0; start < problemIds.length; start += batchSize) {
    const chunk = problemIds.slice(start, start + batchSize);
    const verifications = await Promise.all(
      chunk.map(async (problemId) => {
        const fixturePath = path.resolve(process.cwd(), "fixtures", "practice", `${problemId}.codex.json`);
        const report = await loadPracticeFixture(fixturePath);
        const verification = await verifyPracticeReport(report, { ...options, runSubmission });
        return { problemId, verification };
      })
    );

    for (const { problemId, verification } of verifications) {
      results.push(verification);

      if (!verification.referencePassed) {
        failures.push({
          category: "practice",
          caseId: problemId,
          reason: `Reference solution failed local oracle tests: ${JSON.stringify(verification.referenceResults.filter((r) => !r.passed))}`
        });
      }
      for (const [index, wrong] of verification.wrongSubmissionResults.entries()) {
        if (!wrong.failedAsExpected) {
          failures.push({
            category: "practice",
            caseId: `${problemId}#wrong-${index}`,
            reason: `Wrong submission unexpectedly passed all oracle test cases.`
          });
        }
      }
    }
  }

  return { results, failures };
}

export async function runFullCoachingAcceptanceSuite(
  suite?: CoachingAcceptanceSuite,
  options: { verifyPracticeWithPython?: boolean } = {}
): Promise<CoachingAcceptanceRunSummary> {
  const loaded = suite ?? (await loadCoachingAcceptanceSuite());
  const failures: AcceptanceFailure[] = [];
  let totalChecks = 0;
  let passedChecks = 0;

  for (const item of loaded.diagnosisCases) {
    totalChecks += 1;
    const outcome = await runDiagnosisAcceptanceCase(item);
    failures.push(...outcome.failures);
    if (outcome.failures.length === 0) {
      passedChecks += 1;
    }
  }

  for (const item of loaded.followUpCases) {
    totalChecks += 1;
    const outcome = await runFollowUpAcceptanceCase(item);
    failures.push(...outcome.failures);
    if (outcome.failures.length === 0) {
      passedChecks += 1;
    }
  }

  for (const item of loaded.hintVsGiveUpContrastCases) {
    totalChecks += 1;
    const outcome = runHintVsGiveUpContrastCase(item);
    failures.push(...outcome.failures);
    if (outcome.failures.length === 0) {
      passedChecks += 1;
    }
  }

  for (const item of loaded.autocompleteBoundaryCases) {
    totalChecks += 1;
    const outcome = await runAutocompleteBoundaryCase(item);
    failures.push(...outcome.failures);
    if (outcome.failures.length === 0) {
      passedChecks += 1;
    }
  }

  if (options.verifyPracticeWithPython) {
    totalChecks += loaded.practiceFixtureIds.length;
    const practiceOutcome = await verifyPracticeFixtureSet(loaded.practiceFixtureIds);
    failures.push(...practiceOutcome.failures);
    const failedPracticeIds = new Set(practiceOutcome.failures.map((f) => f.caseId.split("#")[0]));
    passedChecks += loaded.practiceFixtureIds.length - failedPracticeIds.size;
  }

  return {
    totalChecks,
    passedChecks,
    failures
  };
}

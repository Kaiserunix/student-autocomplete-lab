import { LearningEvent } from "./learningEvents";
import { getPracticeTestCases } from "./oracleRegistry";
import { PracticeGenerationReport, WrongSubmission } from "./practiceReport";
import { normalizeProgramOutput, ProgramRunResult, runPythonCode } from "./pythonRunner";
import { PracticeTestCase } from "./testCase";

export interface SubmissionCaseResult {
  note: string;
  expectedOutput: string;
  actualOutput: string;
  exitCode: number | null;
  stderr: string;
  passed: boolean;
  timedOut: boolean;
}

export interface WrongSubmissionVerification {
  expectedError: string;
  painPoints: string[];
  failedAsExpected: boolean;
  caseResults: SubmissionCaseResult[];
}

export interface PracticeVerificationResult {
  problemId: string;
  referencePassed: boolean;
  referenceResults: SubmissionCaseResult[];
  wrongSubmissionResults: WrongSubmissionVerification[];
  verifiedPainPointCounts: Record<string, number>;
  learningEvents: LearningEvent[];
}

export interface PracticeVerifierOptions {
  testCases?: PracticeTestCase[];
  runSubmission?: (code: string, input: string) => Promise<ProgramRunResult>;
  occurredAt?: string;
}

export async function verifyPracticeReport(
  report: PracticeGenerationReport,
  options: PracticeVerifierOptions = {}
): Promise<PracticeVerificationResult> {
  const testCases = options.testCases ?? getPracticeTestCases(report.problemId);
  const runSubmission = options.runSubmission ?? runPythonCode;
  const occurredAt = options.occurredAt ?? new Date().toISOString();
  const referenceResults = await runAgainstCases(report.referenceSolution, testCases, runSubmission);
  const wrongSubmissionResults: WrongSubmissionVerification[] = [];
  const verifiedPainPointCounts: Record<string, number> = {};
  const learningEvents: LearningEvent[] = [];

  for (const submission of report.wrongSubmissions) {
    const result = await verifyWrongSubmission(report.problemId, submission, testCases, runSubmission, occurredAt);
    wrongSubmissionResults.push(result);

    if (!result.failedAsExpected) {
      continue;
    }

    for (const painPoint of result.painPoints) {
      verifiedPainPointCounts[painPoint] = (verifiedPainPointCounts[painPoint] ?? 0) + 1;
      learningEvents.push({
        problemId: report.problemId,
        painPoint,
        source: "verified_fixture",
        language: "python",
        evidence: result.expectedError,
        occurredAt
      });
    }
  }

  return {
    problemId: report.problemId,
    referencePassed: referenceResults.every((result) => result.passed),
    referenceResults,
    wrongSubmissionResults,
    verifiedPainPointCounts,
    learningEvents
  };
}

async function verifyWrongSubmission(
  problemId: string,
  submission: WrongSubmission,
  testCases: PracticeTestCase[],
  runSubmission: (code: string, input: string) => Promise<ProgramRunResult>,
  occurredAt: string
): Promise<WrongSubmissionVerification> {
  void problemId;
  void occurredAt;
  const caseResults = await runAgainstCases(submission.code, testCases, runSubmission);

  return {
    expectedError: submission.expectedError,
    painPoints: submission.painPoints,
    failedAsExpected: caseResults.some((result) => !result.passed),
    caseResults
  };
}

async function runAgainstCases(
  code: string,
  testCases: PracticeTestCase[],
  runSubmission: (code: string, input: string) => Promise<ProgramRunResult>
): Promise<SubmissionCaseResult[]> {
  const results: SubmissionCaseResult[] = [];

  for (const testCase of testCases) {
    const run = await runSubmission(code, testCase.input);
    const actualOutput = normalizeProgramOutput(run.stdout);
    const expectedOutput = normalizeProgramOutput(testCase.expectedOutput);

    results.push({
      note: testCase.note,
      expectedOutput,
      actualOutput,
      exitCode: run.exitCode,
      stderr: run.stderr,
      timedOut: run.timedOut,
      passed: run.exitCode === 0 && !run.timedOut && actualOutput === expectedOutput
    });
  }

  return results;
}

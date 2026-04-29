import * as path from "node:path";
import { loadPracticeFixture } from "../practice/fixtureStore";
import { verifyPracticeReport } from "../practice/practiceVerifier";
import { profileSummary, StudentProfile, createEmptyStudentProfile } from "./studentProfile";
import { TeachingDiagnosisContext } from "./types";

const PROBLEM_SUMMARIES: Record<string, { title: string; summary: string }> = {
  P1030: {
    title: "求先序排列",
    summary: "Given inorder and postorder traversal strings, output preorder traversal."
  },
  P4913: {
    title: "二叉树深度",
    summary: "Given numbered left/right children of a binary tree rooted at 1, output maximum node depth."
  },
  P1364: {
    title: "医院设置",
    summary: "Given weighted tree nodes and child edges, choose a hospital node minimizing weighted edge distance."
  }
};

export async function buildFixtureTeachingContext(
  fixturePath: string,
  wrongSubmissionIndex = 0,
  profile: StudentProfile = createEmptyStudentProfile()
): Promise<TeachingDiagnosisContext> {
  const report = await loadPracticeFixture(path.resolve(process.cwd(), fixturePath));
  const verification = await verifyPracticeReport(report);
  const wrongSubmission = report.wrongSubmissions[wrongSubmissionIndex];
  const wrongResult = verification.wrongSubmissionResults[wrongSubmissionIndex];

  if (!wrongSubmission || !wrongResult) {
    throw new Error(`No wrong submission ${wrongSubmissionIndex} exists in ${fixturePath}.`);
  }

  const passedTests = wrongResult.caseResults.filter((result) => result.passed).length;
  const problem = PROBLEM_SUMMARIES[report.problemId] ?? {
    title: report.problemId,
    summary: `Practice fixture ${report.problemId}`
  };

  return {
    problem: {
      id: report.problemId,
      title: problem.title,
      summary: problem.summary
    },
    language: "python",
    studentCode: wrongSubmission.code,
    ojVerdict: {
      status: wrongResult.failedAsExpected ? "WA" : "AC",
      passedTests,
      totalTests: wrongResult.caseResults.length
    },
    localEvidence: wrongResult.caseResults.map((result) => ({
      note: result.note,
      expectedOutput: result.expectedOutput,
      actualOutput: result.actualOutput,
      stderr: result.stderr,
      passed: result.passed
    })),
    studentProfile: profileSummary(profile)
  };
}

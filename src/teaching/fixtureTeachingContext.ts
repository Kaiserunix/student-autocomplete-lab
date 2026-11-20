import * as path from "node:path";
import { loadPracticeFixture } from "../practice/fixtureStore";
import { verifyPracticeReport, type PracticeVerifierOptions } from "../practice/practiceVerifier";
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
  },
  P1427: {
    title: "小鱼的数字游戏",
    summary: "Read integers until sentinel 0 and print the valid numbers in reverse order."
  },
  P5711: {
    title: "闰年判断",
    summary: "Determine whether a given year is a leap year under 4, 100, and 400 divisibility rules."
  },
  P2249: {
    title: "查找",
    summary: "Use binary search on a non-decreasing array to return the 1-based index of the first occurrence of each query."
  },
  P1601: {
    title: "A+B Problem（高精）",
    summary: "Add two non-negative big integers given as decimal strings without overflow or truncation."
  },
  P2240: {
    title: "部分背包问题",
    summary: "Select fractional gold piles up to capacity T to maximize total value formatted to two decimal places."
  },
  P1551: {
    title: "亲戚",
    summary: "Maintain transitive relative relations and answer connectivity queries with Yes/No."
  },
  P5318: {
    title: "查找文献",
    summary: "Traverse a directed graph from vertex 1 using smallest-index neighbor order for DFS and BFS."
  }
};

export async function buildFixtureTeachingContext(
  fixturePath: string,
  wrongSubmissionIndex = 0,
  profile: StudentProfile = createEmptyStudentProfile(),
  verifierOptions: Pick<PracticeVerifierOptions, "runSubmission" | "testCases"> = {}
): Promise<TeachingDiagnosisContext> {
  const report = await loadPracticeFixture(path.resolve(process.cwd(), fixturePath));
  const verification = await verifyPracticeReport(report, verifierOptions);
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

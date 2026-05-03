import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("problem bank webview script", () => {
  test("keeps fix-hint newlines escaped inside the embedded script", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('issue.fixHint ? "\\\\n提示：" + issue.fixHint : ""');
  });

  test("exposes a completed-archive action without using AI analysis", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('id="coachCompleted"');
    expect(source).toContain('id="completedList"');
    expect(source).toContain('command: "archiveProblem"');
    expect(source).toContain('renderArchivedProblem(data.archivedProblem)');
  });

  test("makes the AI coach the first screen and keeps three Chinese UI layers", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('activePage: "ai"');
    expect(source).toContain('switchPage("ai")');
    expect(source).toContain('id="tabProblem"');
    expect(source).toContain('id="tabAi"');
    expect(source).not.toContain('id="tabSearch"');
    expect(source).toContain('id="problemPage"');
    expect(source).toContain('id="aiPage"');
    expect(source).not.toContain('id="searchPage"');
    expect(source).toContain('id="tabSkill"');
    expect(source).toContain(">AI 教练<");
    expect(source).toContain(">题目<");
    expect(source).toContain(">学习画像<");
    expect(source).toContain("AI 根据你的做题记录形成的可纠偏教学记忆");
    expect(source).toContain('id="coachQuestion"');
    expect(source).toContain('id="coachOjVerdict"');
    expect(source).toContain('id="aiConfigMode"');
    expect(source).toContain('id="aiAutocompleteFormat"');
    expect(source).toContain('command: "saveAiConfig"');
    expect(source).toContain('command: "requestOptimizationReview"');
    expect(source).toContain("renderOptimizationReport(data.optimizationReport)");
    expect(source).toContain("优化复盘");
    expect(source).toContain("AI 估计，不代表官方 OJ");
    expect(source).toContain('command: "requestSolutionScore"');
    expect(source).toContain("studentRequest: coachQuestion.value.trim()");
    expect(source).not.toContain('command: "requestSolutionScore",\n        problemKey: keyOf(problem),\n        studentRequest: coachQuestion.value.trim(),\n        ojVerdict: {\n          status: "AC"\n        }');
  });

  test("persists Student Skill updates from AI coaching actions", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain("studentSkillPath()");
    expect(source).toContain("studentSkillVersionsDir()");
    expect(source).toContain("runTeachingCycleWithStudentSkill");
    expect(source).toContain("saveStudentSkill(this.studentSkillPath()");
    expect(source).toContain("archiveStudentSkillVersion(");
    expect(source).toContain("this.studentSkillVersionsDir()");
    expect(source).toContain("studentSkillMerge");
  });

  test("exposes Student Skill review controls for disable and rollback", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('id="tabSkill"');
    expect(source).toContain('id="skillPage"');
    expect(source).toContain('id="studentSkillPanel"');
    expect(source).toContain('id="studentSkillVersions"');
    expect(source).toContain("这条不准");
    expect(source).toContain("查看证据");
    expect(source).toContain('command: "recordStudentSkillFeedback"');
    expect(source).toContain("handleStudentSkillFeedbackRequest");
    expect(source).toContain("renderStudentSkill()");
    expect(source).toContain('command: "disableStudentSkill"');
    expect(source).toContain('command: "rollbackStudentSkill"');
    expect(source).toContain("handleDisableStudentSkillRequest");
    expect(source).toContain("handleRollbackStudentSkillRequest");
    expect(source).toContain("listStudentSkillVersions");
  });

  test("routes next-problem recommendation through the rule engine", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain("handleRuleBasedRecommendationRequest");
    expect(source).toContain("recommendNextProblems");
    expect(source).toContain("mergeRecommendationCandidates");
    expect(source).toContain('type: "problemRecommendation"');
    expect(source).toContain("renderProblemRecommendation(data)");
    expect(source).toContain("规则推荐");
  });

  test("exposes internal-test recording only as a clearly labeled local panel", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('id="internalTestPanel"');
    expect(source).toContain("内测记录版");
    expect(source).toContain("internalTesting");
    expect(source).toContain('command: "copyInternalTestSummary"');
    expect(source).toContain("renderInternalTesting()");
    expect(source).toContain("本地记录");
  });
});

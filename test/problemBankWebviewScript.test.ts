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

  test("separates problem paste, AI interaction, and problem search into three UI layers", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('id="tabProblem"');
    expect(source).toContain('id="tabAi"');
    expect(source).toContain('id="tabSearch"');
    expect(source).toContain('id="problemPage"');
    expect(source).toContain('id="aiPage"');
    expect(source).toContain('id="searchPage"');
    expect(source).toContain('id="coachQuestion"');
    expect(source).toContain('id="coachOjVerdict"');
    expect(source).toContain('id="aiConfigMode"');
    expect(source).toContain('id="aiAutocompleteFormat"');
    expect(source).toContain('command: "saveAiConfig"');
    expect(source).toContain('command: "requestOptimizationReview"');
    expect(source).toContain("renderOptimizationReport(data.optimizationReport)");
    expect(source).toContain("优化复盘");
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
});

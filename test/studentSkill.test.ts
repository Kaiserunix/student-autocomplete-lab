import { describe, expect, test } from "vitest";
import {
  applyStudentSkillPatch,
  buildAutocompleteSkillContext,
  buildStudentSkillPatchFromDiagnosis,
  createEmptyStudentSkill,
  renderStudentSkillMarkdown,
  studentSkillFromProfile,
  studentSkillSummaryForTeaching
} from "../src/teaching/studentSkill";

describe("student skill", () => {
  test("starts with strict student-mode hard rules and Chinese teaching defaults", () => {
    const skill = createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z");

    expect(skill.schemaVersion).toBe("student-skill/v1");
    expect(skill.hardRules.autocompleteMayReadProblemStatement).toBe(false);
    expect(skill.hardRules.allowFullSolutionAutocomplete).toBe(false);
    expect(skill.teachingPreferences.responseLanguage).toBe("zh-CN");
    expect(studentSkillSummaryForTeaching(skill)).toEqual({
      painPointCounts: {},
      activeSkills: [],
      recentCorrections: []
    });
  });

  test("keeps a single model diagnosis as candidate even when the model asks for active", () => {
    const skill = applyStudentSkillPatch(createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z"), {
      source: "mimo-v2.5",
      occurredAt: "2026-05-01T00:01:00.000Z",
      problemId: "P1427",
      skills: [
        {
          name: "python-loop-boundary-check",
          status: "active",
          reason: "The model is confident after one observation.",
          rules: ["Write first and last valid indexes before coding the loop."],
          sourcePainPoints: ["loop_boundary"],
          confidence: 5
        }
      ]
    }).skill;

    expect(skill.skills["python-loop-boundary-check"]).toMatchObject({
      status: "candidate",
      evidenceCount: 1
    });
  });

  test("turns repeated diagnosis patches into an active inspectable skill", () => {
    let skill = createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z");

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const patch = buildStudentSkillPatchFromDiagnosis(
        {
          painPoints: [
            {
              label: "loop_boundary",
              confidence: 0.9,
              evidence: `attempt ${attempt}: missed the final item`
            }
          ],
          hint: "先手推最后一个下标。",
          skillUpdate: {
            candidate: "python-loop-boundary-check",
            reason: "Repeated loop boundary misses.",
            rules: ["Before writing a loop, write first and last valid indexes."]
          },
          recommendation: {
            problemId: "P1427",
            reason: "Practice sentinel and reverse output."
          }
        },
        {
          occurredAt: `2026-05-01T00:0${attempt}:00.000Z`,
          problemId: "P1427",
          source: "mimo-v2.5"
        }
      );

      skill = applyStudentSkillPatch(skill, patch).skill;
    }

    expect(skill.errorModel.loop_boundary).toMatchObject({
      count: 3,
      score: 2.7,
      lastSeen: "2026-05-01T00:03:00.000Z"
    });
    expect(skill.errorModel.loop_boundary.examples).toHaveLength(3);
    expect(skill.skills["python-loop-boundary-check"]).toMatchObject({
      status: "active",
      evidenceCount: 3,
      sourcePainPoints: ["loop_boundary"]
    });
    expect(studentSkillSummaryForTeaching(skill).activeSkills).toEqual(["python-loop-boundary-check"]);
    expect(renderStudentSkillMarkdown(skill)).toContain("python-loop-boundary-check");
  });

  test("keeps user-disabled skills disabled and reports a conflict", () => {
    let skill = createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z");
    skill = applyStudentSkillPatch(skill, {
      source: "user",
      occurredAt: "2026-05-01T00:01:00.000Z",
      disableSkills: [
        {
          name: "python-loop-boundary-check",
          reason: "This keeps over-explaining loops."
        }
      ]
    }).skill;

    const result = applyStudentSkillPatch(skill, {
      source: "mimo-v2.5",
      occurredAt: "2026-05-01T00:02:00.000Z",
      skills: [
        {
          name: "python-loop-boundary-check",
          status: "active",
          reason: "The model saw another loop issue.",
          rules: ["Write bounds first."],
          sourcePainPoints: ["loop_boundary"]
        }
      ]
    });

    expect(result.skill.skills["python-loop-boundary-check"].status).toBe("disabled");
    expect(result.conflicts).toEqual([
      {
        field: "skills.python-loop-boundary-check.status",
        existing: "disabled",
        incoming: "active",
        resolution: "kept existing disabled skill"
      }
    ]);
  });

  test("records a wrong-diagnosis correction without treating it as hard disable", () => {
    let skill = createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z");
    skill = applyStudentSkillPatch(skill, {
      source: "mimo-v2.5",
      occurredAt: "2026-05-01T00:01:00.000Z",
      problemId: "P1427",
      skills: [
        {
          name: "python-loop-boundary-check",
          status: "active",
          reason: "Repeated loop misses.",
          rules: ["Write first and last valid indexes before coding the loop."],
          sourcePainPoints: ["loop_boundary"],
          confidence: 0.95
        }
      ]
    }).skill;

    const corrected = applyStudentSkillPatch(skill, {
      source: "sidebar-user",
      occurredAt: "2026-05-01T00:02:00.000Z",
      corrections: [
        {
          type: "diagnosis_wrong",
          target: "python-loop-boundary-check",
          note: "这次不是循环边界，而是输出顺序。",
          source: "sidebar-user",
          occurredAt: "2026-05-01T00:02:00.000Z"
        }
      ]
    }).skill;

    expect(corrected.skills["python-loop-boundary-check"]).toMatchObject({
      status: "candidate",
      disabledReason: undefined
    });
    expect(corrected.hardRules.disabledSkills).not.toContain("python-loop-boundary-check");
    expect(corrected.errorModel.loop_boundary.counterexamples[0]).toMatchObject({
      evidence: "这次不是循环边界，而是输出顺序。",
      source: "sidebar-user"
    });
    expect(corrected.correctionLog.at(-1)).toMatchObject({
      type: "diagnosis_wrong",
      target: "python-loop-boundary-check"
    });

    const reactivation = applyStudentSkillPatch(corrected, {
      source: "mimo-v2.5",
      occurredAt: "2026-05-01T00:03:00.000Z",
      skills: [
        {
          name: "python-loop-boundary-check",
          status: "active",
          reason: "The model saw another loop issue.",
          rules: ["Write bounds first."],
          sourcePainPoints: ["loop_boundary"],
          confidence: 0.9
        }
      ]
    });

    expect(reactivation.skill.skills["python-loop-boundary-check"].status).toBe("candidate");
    expect(reactivation.conflicts[0]?.resolution).toBe("kept candidate after wrong-diagnosis correction");
  });

  test("marks a skill as mastered only after transfer evidence", () => {
    let skill = applyStudentSkillPatch(createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z"), {
      source: "mimo-v2.5",
      occurredAt: "2026-05-01T00:01:00.000Z",
      skills: [
        {
          name: "binary-tree-depth-numbered-children",
          status: "active",
          reason: "Depth recursion is stable on known cases.",
          rules: ["Depth is one plus the deeper child depth."],
          sourcePainPoints: ["recursion_base_case"],
          confidence: 1
        }
      ]
    }).skill;

    skill = applyStudentSkillPatch(skill, {
      source: "transfer-validator",
      occurredAt: "2026-05-01T00:02:00.000Z",
      transferEvidence: [
        {
          skillName: "binary-tree-depth-numbered-children",
          probes: 2,
          passed: 2,
          estimatedHintReduction: 1
        }
      ]
    }).skill;

    expect(skill.skills["binary-tree-depth-numbered-children"].status).toBe("mastered");
    expect(studentSkillSummaryForTeaching(skill).activeSkills).toEqual(["binary-tree-depth-numbered-children"]);
  });

  test("builds an autocomplete context that excludes teacher-only evidence", () => {
    const skill = applyStudentSkillPatch(createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z"), {
      source: "mimo-v2.5",
      occurredAt: "2026-05-01T00:01:00.000Z",
      problemId: "P1030",
      painPoints: [
        {
          label: "traversal_order_confusion",
          confidence: 0.88,
          evidence: "P1030 standard answer emits root before both subtrees."
        }
      ],
      codeHabitRules: [
        {
          language: "python",
          rules: ["prefer sys.stdin.readline in OJ scripts"]
        }
      ]
    }).skill;

    const context = buildAutocompleteSkillContext(skill, "python");

    expect(context.allowFullSolutionAutocomplete).toBe(false);
    expect(context.autocompleteMayReadProblemStatement).toBe(false);
    expect(context.learnerRuleIds).toEqual([]);
    expect(context).not.toHaveProperty("activeSkillNames");
    expect(context).not.toHaveProperty("disabledSkills");
    expect(JSON.stringify(context)).not.toContain("prefer sys.stdin.readline");
    expect(JSON.stringify(context)).not.toContain("P1030 standard answer");
  });

  test("migrates the legacy profile counters into Student Skill layers", () => {
    const skill = studentSkillFromProfile(
      {
        studentId: "student-a",
        painPoints: {
          output_order: {
            count: 2,
            score: 1.6,
            lastSeen: "2026-04-30T00:00:00.000Z"
          }
        },
        skillCandidates: {
          "format-output-checklist": {
            count: 3,
            score: 2.8,
            status: "ready",
            reason: "Repeated output-format misses.",
            rules: ["Compare the required separator before printing."],
            sourcePainPoints: ["output_order"],
            lastSeen: "2026-04-30T00:00:00.000Z"
          }
        }
      },
      "2026-05-01T00:00:00.000Z"
    );

    expect(skill.errorModel.output_order).toMatchObject({
      count: 2,
      score: 1.6,
      lastSeen: "2026-04-30T00:00:00.000Z"
    });
    expect(skill.skills["format-output-checklist"]).toMatchObject({
      status: "active",
      evidenceCount: 3,
      score: 2.8
    });
    expect(studentSkillSummaryForTeaching(skill).activeSkills).toEqual(["format-output-checklist"]);
  });
});

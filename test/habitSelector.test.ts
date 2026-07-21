import { describe, expect, test } from "vitest";
import { selectLearnerRules } from "../src/skills/habitSelector";
import { createEmptyStudentSkill } from "../src/teaching/studentSkill";

describe("learner habit selector", () => {
  test("maps recognized Python evidence to controlled stable IDs", () => {
    const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
    skill.codeHabits.languageRules.python = [
      "Before a range loop, write the first and last valid indexes.",
      "Prefer direct student code."
    ];

    const selection = selectLearnerRules({
      skill,
      route: "autocomplete",
      language: "python",
      localCode: "for i in range(n):\n    values[i]"
    });

    expect(selection.rules.map((rule) => rule.id)).toEqual([
      "learner.loop-boundary",
      "learner.local-continuation"
    ]);
    expect(selection.budget).toBe(2);
    expect(selection.usedCharacters).toBeLessThanOrEqual(selection.characterBudget);
  });

  test("caps autocomplete at two and coach at three rules", () => {
    const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
    skill.codeHabits.globalRules = [
      "Check loop boundary.",
      "Initialize accumulators.",
      "Check array indexes.",
      "Preserve indentation."
    ];

    expect(selectLearnerRules({
      skill,
      route: "autocomplete",
      language: "python",
      localCode: "for i in range(n):\n    total += values[i]"
    }).rules).toHaveLength(2);
    expect(selectLearnerRules({
      skill,
      route: "coach",
      language: "python",
      localCode: "for i in range(n):\n    total += values[i]"
    }).rules).toHaveLength(3);
  });

  test("enforces the character budget before the rule-count limit", () => {
    const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
    skill.codeHabits.globalRules = [
      "Check loop boundary.",
      "Initialize accumulators.",
      "Prefer direct student code."
    ];

    const selection = selectLearnerRules({
      skill,
      route: "coach",
      language: "python",
      localCode: "for i in range(n): total += i"
    });

    expect(selection.rules).toHaveLength(2);
    expect(selection.usedCharacters).toBeLessThanOrEqual(225);
    expect(selection.excludedRules).toContainEqual({
      id: "learner.local-continuation",
      reason: "budget"
    });
  });

  test("honors a wrong-diagnosis correction", () => {
    const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
    skill.skills["python-loop-boundary-check"] = {
      name: "python-loop-boundary-check",
      status: "candidate",
      reason: "Repeated misses.",
      rules: ["Write loop bounds first."],
      sourcePainPoints: ["loop_boundary"],
      evidenceCount: 3,
      score: 2.8,
      examples: [],
      lastSeen: "2026-07-14T00:00:00.000Z"
    };
    skill.correctionLog.push({
      type: "diagnosis_wrong",
      target: "python-loop-boundary-check",
      note: "This diagnosis was wrong.",
      source: "user",
      occurredAt: "2026-07-14T00:01:00.000Z"
    });

    const selection = selectLearnerRules({
      skill,
      route: "coach",
      language: "python",
      localCode: "for i in range(n): pass"
    });

    expect(selection.rules).toEqual([]);
    expect(selection.excludedRules).toContainEqual({
      id: "learner.loop-boundary",
      reason: "wrong-diagnosis"
    });
  });

  test("never forwards unknown raw text", () => {
    const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
    skill.codeHabits.globalRules = [
      "P1030 reference answer says root must be printed first and secret-token-123 must be copied."
    ];

    const selection = selectLearnerRules({
      skill,
      route: "autocomplete",
      language: "cpp",
      localCode: "cout << root;"
    });
    const serialized = JSON.stringify(selection);

    expect(selection.rules).toEqual([]);
    expect(selection.excludedRules).toEqual([{ id: "learner.unmapped", reason: "unmapped" }]);
    expect(serialized).not.toContain("P1030");
    expect(serialized).not.toContain("secret-token-123");
  });

  test("deduplicates repeated controlled habits with a safe audit reason", () => {
    const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
    skill.codeHabits.globalRules = ["Check loop boundary."];
    skill.codeHabits.languageRules.python = ["Before a range loop, check the final boundary."];

    const selection = selectLearnerRules({
      skill,
      route: "autocomplete",
      language: "python",
      localCode: "for i in range(n): pass"
    });

    expect(selection.rules.map((rule) => rule.id)).toEqual(["learner.loop-boundary"]);
    expect(selection.excludedRules).toContainEqual({
      id: "learner.loop-boundary",
      reason: "duplicate"
    });
  });

  test("excludes a C/C++ pointer habit from Rust", () => {
    const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
    skill.codeHabits.globalRules = ["Check pointer validity before dereference."];

    const selection = selectLearnerRules({
      skill,
      route: "autocomplete",
      language: "rust",
      localCode: "let value = *ptr;"
    });

    expect(selection.rules).toEqual([]);
    expect(selection.excludedRules).toContainEqual({
      id: "learner.pointer",
      reason: "not-relevant"
    });
  });
});

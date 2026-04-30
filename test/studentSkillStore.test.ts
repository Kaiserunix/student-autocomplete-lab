import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { applyStudentSkillPatch, createEmptyStudentSkill } from "../src/teaching/studentSkill";
import {
  archiveStudentSkillVersion,
  listStudentSkillVersions,
  loadStudentSkill,
  rollbackStudentSkill,
  saveStudentSkill
} from "../src/teaching/studentSkillStore";

describe("student skill store", () => {
  test("loads missing skill as empty, archives versions, and rolls back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "student-skill-"));
    const skillPath = join(dir, ".student-autocomplete", "student-skill.json");
    const versionsDir = join(dir, ".student-autocomplete", "skills", "versions");

    const empty = await loadStudentSkill(skillPath, "student-a", "2026-05-01T00:00:00.000Z");
    expect(empty.studentId).toBe("student-a");
    expect(empty.revision).toBe(0);

    const first = applyStudentSkillPatch(empty, {
      source: "mimo-v2.5",
      occurredAt: "2026-05-01T00:01:00.000Z",
      painPoints: [
        {
          label: "output_format",
          confidence: 0.7,
          evidence: "Printed a Python list instead of joined values."
        }
      ]
    }).skill;

    await saveStudentSkill(skillPath, first);
    const archived = await archiveStudentSkillVersion(versionsDir, first, "before disabling a noisy skill");
    expect(archived.revision).toBe(1);

    const second = applyStudentSkillPatch(first, {
      source: "user",
      occurredAt: "2026-05-01T00:02:00.000Z",
      disableSkills: [{ name: "format-output-checklist", reason: "Too noisy for now." }]
    }).skill;
    await saveStudentSkill(skillPath, second);

    const versions = await listStudentSkillVersions(versionsDir);
    expect(versions).toHaveLength(1);
    expect(versions[0].reason).toBe("before disabling a noisy skill");

    const rolledBack = await rollbackStudentSkill(skillPath, archived.path);
    expect(rolledBack.revision).toBe(1);
    expect(rolledBack.errorModel.output_format.count).toBe(1);
    expect(rolledBack.skills["format-output-checklist"]).toBeUndefined();
    expect(await readFile(skillPath, "utf8")).toContain("output_format");
  });
});

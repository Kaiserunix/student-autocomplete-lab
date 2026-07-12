import type { StudentSkillStatus } from "./studentSkill";

export function isStudentSkillTeachingActive(status: StudentSkillStatus): boolean {
  return status === "active" || status === "mastered";
}

export function isStudentSkillDisabled(status: StudentSkillStatus): boolean {
  return status === "disabled";
}

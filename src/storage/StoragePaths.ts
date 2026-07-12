import * as path from "node:path";

export interface StudentAutocompleteStoragePaths {
  root: string;
  problems: string;
  problemSets: string;
  completedProblems: string;
  attemptEvents: string;
  attemptSessions: string;
  teacherPacks: string;
  studentProfile: string;
  studentSkill: string;
  studentSkillVersionsDir: string;
}

export function createStudentAutocompleteStoragePaths(root: string): StudentAutocompleteStoragePaths {
  return {
    root,
    problems: path.join(root, "problems.jsonl"),
    problemSets: path.join(root, "problemSets.jsonl"),
    completedProblems: path.join(root, "completedProblems.jsonl"),
    attemptEvents: path.join(root, "attemptEvents.jsonl"),
    attemptSessions: path.join(root, "attemptSessions.jsonl"),
    teacherPacks: path.join(root, "teacherPacks.jsonl"),
    studentProfile: path.join(root, "studentProfile.json"),
    studentSkill: path.join(root, "studentSkill.json"),
    studentSkillVersionsDir: path.join(root, "studentSkillVersions")
  };
}

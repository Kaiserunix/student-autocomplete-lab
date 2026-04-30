import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createEmptyStudentSkill, StudentSkill } from "./studentSkill";

export interface StudentSkillVersionRecord {
  schemaVersion: "student-skill-version/v1";
  versionId: string;
  archivedAt: string;
  reason: string;
  revision: number;
  skill: StudentSkill;
  path: string;
}

interface PersistedStudentSkillVersionRecord extends Omit<StudentSkillVersionRecord, "path"> {}

export async function loadStudentSkill(
  path: string,
  studentId = "local-student",
  now = new Date().toISOString()
): Promise<StudentSkill> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as StudentSkill;
  } catch (error) {
    if (isMissingFileError(error)) {
      return createEmptyStudentSkill(studentId, now);
    }

    throw error;
  }
}

export async function saveStudentSkill(path: string, skill: StudentSkill): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(skill, null, 2)}\n`, "utf8");
}

export async function archiveStudentSkillVersion(
  versionsDir: string,
  skill: StudentSkill,
  reason: string,
  archivedAt = skill.updatedAt
): Promise<StudentSkillVersionRecord> {
  await mkdir(versionsDir, { recursive: true });
  const versionId = `${String(skill.revision).padStart(4, "0")}-${sanitizeFilePart(archivedAt)}`;
  const path = join(versionsDir, `${versionId}.json`);
  const persisted: PersistedStudentSkillVersionRecord = {
    schemaVersion: "student-skill-version/v1",
    versionId,
    archivedAt,
    reason,
    revision: skill.revision,
    skill
  };
  await writeFile(path, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");

  return { ...persisted, path };
}

export async function listStudentSkillVersions(versionsDir: string): Promise<StudentSkillVersionRecord[]> {
  let entries: string[];

  try {
    entries = await readdir(versionsDir);
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  const versions: StudentSkillVersionRecord[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json"))) {
    const path = join(versionsDir, entry);
    const persisted = JSON.parse(await readFile(path, "utf8")) as PersistedStudentSkillVersionRecord;
    versions.push({ ...persisted, path });
  }

  return versions.sort((left, right) => left.archivedAt.localeCompare(right.archivedAt));
}

export async function rollbackStudentSkill(skillPath: string, versionPath: string): Promise<StudentSkill> {
  const persisted = JSON.parse(await readFile(versionPath, "utf8")) as PersistedStudentSkillVersionRecord;
  await saveStudentSkill(skillPath, persisted.skill);
  return persisted.skill;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^0-9A-Za-z._-]/g, "-");
}

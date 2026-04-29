import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createEmptyStudentProfile, StudentProfile } from "./studentProfile";

export async function loadStudentProfile(path: string, studentId = "local-student"): Promise<StudentProfile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as StudentProfile;
  } catch (error) {
    if (isMissingFileError(error)) {
      return createEmptyStudentProfile(studentId);
    }

    throw error;
  }
}

export async function saveStudentProfile(path: string, profile: StudentProfile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

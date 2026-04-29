import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { loadStudentProfile, saveStudentProfile } from "../src/teaching/studentProfileStore";

describe("student profile store", () => {
  test("loads an empty profile when no file exists and saves updates", async () => {
    const dir = await mkdtemp(join(tmpdir(), "student-profile-"));
    const target = join(dir, "nested", "student_profile.json");

    const empty = await loadStudentProfile(target, "student-a");
    expect(empty.studentId).toBe("student-a");
    expect(empty.painPoints).toEqual({});

    await saveStudentProfile(target, {
      ...empty,
      painPoints: {
        output_order: { count: 1, score: 0.9, lastSeen: "2026-04-30T00:00:00.000Z" }
      }
    });

    expect(await readFile(target, "utf8")).toContain("output_order");
  });
});

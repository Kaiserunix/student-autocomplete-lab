import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("skill composition packaging", () => {
  test("ships compiled skills and excludes root scratch source files", async () => {
    const packager = await readFile("scripts/packageBetaReleaseVsix.js", "utf8");
    const vscodeIgnore = await readFile(".vscodeignore", "utf8");

    expect(packager).toContain('"skills"');
    expect(vscodeIgnore.split(/\r?\n/)).toEqual(expect.arrayContaining([
      "*.c",
      "*.cpp",
      "*.py",
      "*.rs"
    ]));
  });

  test("ships the teaching workflow and rejects broken runtime dependency closure", async () => {
    const packager = await readFile("scripts/packageBetaReleaseVsix.js", "utf8");

    expect(packager).toContain("allowedTeachingDirectories");
    expect(packager).toContain('"workflow"');
    expect(packager).toContain("assertRuntimeDependencyClosure();");
    expect(packager).toContain("function assertRuntimeDependencyClosure()");
  });
});

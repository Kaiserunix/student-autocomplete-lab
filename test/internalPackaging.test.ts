import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("internal packaging script", () => {
  test("creates a visibly separate internal VSIX without publish or push commands", async () => {
    const source = await readFile("scripts/packageInternalVsix.js", "utf8");

    expect(source).toContain("student-autocomplete-lab-internal");
    expect(source).toContain("studentAutocompleteInternal");
    expect(source).toContain("内测记录版");
    expect(source).toContain(".runtime");
    expect(source).not.toMatch(/\bgit\s+push\b/);
    expect(source).not.toMatch(/\bvsce\s+publish\b/);
    expect(source).not.toMatch(/\bgh\s+repo\b/);
  });
});

describe("beta release packaging script", () => {
  test("creates a clean parallel release VSIX without engineering or internal-test material", async () => {
    const source = await readFile("scripts/packageBetaReleaseVsix.js", "utf8");

    expect(source).toContain("student-autocomplete-lab-beta-release");
    expect(source).toContain("studentAutocompleteBetaRelease");
    expect(source).toContain("README.release.md");
    expect(source).toContain("tsconfig.release.json");
    expect(source).toContain("internalTesting");
    expect(source).toContain("cli");
    expect(source).toContain(".js.map");
    expect(source).not.toMatch(/\bgit\s+push\b/);
    expect(source).not.toMatch(/\bvsce\s+publish\b/);
    expect(source).not.toMatch(/\bgh\s+repo\b/);
  });
});

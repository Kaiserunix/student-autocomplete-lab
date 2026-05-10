import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("project hygiene script", () => {
  test("checks ignored local artifacts and clean beta release staging", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const source = await readFile("scripts/checkProjectHygiene.js", "utf8");

    expect(packageJson.scripts?.["check:hygiene"]).toBe("node scripts/checkProjectHygiene.js");
    expect(source).toContain("git");
    expect(source).toContain("check-ignore");
    expect(source).toContain("secrets/models.env");
    expect(source).toContain(".runtime/chat-completions-usage.jsonl");
    expect(source).toContain("practice/P1001.py");
    expect(source).toContain("beta-release-vsix");
    expect(source).toContain("student-autocomplete-lab-0.1.0-beta.1-release.vsix");
    expect(source).toContain("Run npm run package:beta-release before npm run check:hygiene.");
    expect(source).toContain("blockedReleaseFragments");
    expect(source).toContain("blockedReleaseContent");
    expect(source).toContain("Project hygiene check passed.");
  });
});

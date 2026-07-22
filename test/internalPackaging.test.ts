import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("ordinary beta packaging ignore rules", () => {
  test("keeps generated extension staging and source maps out of the beta VSIX", async () => {
    const ignore = await readFile(".vscodeignore", "utf8");

    expect(ignore).toContain("extension/**");
    expect(ignore).toContain(".github/**");
    expect(ignore).toContain("scripts/**");
    expect(ignore).toContain("*.map");
    expect(ignore).toContain("**/*.map");
    expect(ignore).toContain("MANUAL-ACCEPTANCE.md");
  });
});

describe("internal packaging script", () => {
  test("creates a visibly separate internal VSIX without publish or push commands", async () => {
    const source = await readFile("scripts/packageInternalVsix.js", "utf8");

    expect(source).toContain("student-autocomplete-lab-internal");
    expect(source).toContain("studentAutocompleteInternal");
    expect(source).toContain("内测记录版");
    expect(source).toContain("renameConfigurationProperties");
    expect(source).toContain("studentAutocompleteInternal.ai");
    expect(source).not.toContain("studentAutocomplete.problemBankWebview");
    expect(source).not.toContain("studentAutocompleteInternalInternal");
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
    expect(source).toContain("renameConfigurationProperties");
    expect(source).toContain("studentAutocompleteBetaRelease.ai");
    expect(source).toContain("coachFollowUp.js");
    expect(source).toContain("luoguMcpRecommendationCandidates.js");
    expect(source).toContain('"recommendation"');
    expect(source).toContain('"attempt"');
    expect(source).toContain('"mcp"');
    expect(source).toContain('"codex"');
    expect(source).toContain("problemSearchServer.js");
    expect(source).toContain("longitudinalSelfEvolution.js");
    expect(source).toContain("assertNoBlockedReleaseContent");
    expect(source).toContain("internalTestPanel");
    expect(source).not.toContain("studentAutocomplete.problemBankWebview");
    expect(source).not.toContain("studentAutocompleteBetaReleaseBetaRelease");
    expect(source).toContain("internalTesting");
    expect(source).toContain("cli");
    expect(source).toContain(".js.map");
    expect(source).toContain("stripReleaseInternalTestingUi");
    expect(source).not.toMatch(/\bgit\s+push\b/);
    expect(source).not.toMatch(/\bvsce\s+publish\b/);
    expect(source).not.toMatch(/\bgh\s+repo\b/);
  });
});

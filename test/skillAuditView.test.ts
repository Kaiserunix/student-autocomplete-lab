import { describe, expect, test } from "vitest";
import { toPublicSkillPlanAudit } from "../src/skills/auditView";

describe("public skill plan audit", () => {
  test("contains stable IDs and counts but no model context", () => {
    const view = toPublicSkillPlanAudit("autocomplete_preview", {
      route: "autocomplete",
      language: "python",
      renderer: "deepseek-fim",
      includedRuleIds: [
        "core.autocomplete.local-only",
        "learner.loop-boundary"
      ],
      excludedRules: [{
        id: "learner.pointer",
        reason: "not-relevant"
      }],
      learnerRuleCount: 1,
      learnerRuleBudget: 2,
      learnerCharacterCount: 72,
      learnerCharacterBudget: 160,
      enforcementKinds: ["prompt", "validator"]
    });

    expect(view).toEqual({
      action: "autocomplete_preview",
      route: "autocomplete",
      language: "python",
      renderer: "deepseek-fim",
      included: [
        "core.autocomplete.local-only",
        "learner.loop-boundary"
      ],
      excluded: ["learner.pointer:not-relevant"],
      learnerRules: {
        used: 1,
        budget: 2,
        usedCharacters: 72,
        characterBudget: 160
      },
      enforcement: ["prompt", "validator"]
    });
    expect(JSON.stringify(view)).not.toContain("prefix");
    expect(JSON.stringify(view)).not.toContain("suffix");
    expect(JSON.stringify(view)).not.toContain("filePath");
  });
});

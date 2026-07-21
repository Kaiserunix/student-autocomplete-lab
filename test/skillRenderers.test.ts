import { describe, expect, test } from "vitest";
import {
  composeAutocompleteSkillPlan,
  composeCoachSkillPlan
} from "../src/skills/composeSkillPlan";
import {
  renderAutocompleteSkillPlan,
  renderCoachSkillPlan
} from "../src/skills/renderers/skillRenderer";
import type { ProviderCapabilities } from "../src/skills/types";

const deepSeek: ProviderCapabilities = {
  renderer: "deepseek-fim",
  requestShape: "fim",
  supportsSystemInstruction: false,
  supportsFimSuffix: true,
  supportsStopSequences: true,
  prefixCacheFriendly: true
};

const chat: ProviderCapabilities = {
  renderer: "chat-messages",
  requestShape: "chat",
  supportsSystemInstruction: true,
  supportsFimSuffix: false,
  supportsStopSequences: true,
  prefixCacheFriendly: false
};

const codex: ProviderCapabilities = {
  renderer: "codex-text",
  requestShape: "codex-text",
  supportsSystemInstruction: false,
  supportsFimSuffix: false,
  supportsStopSequences: false,
  prefixCacheFriendly: false
};

const genericCompletion: ProviderCapabilities = {
  renderer: "generic-completion",
  requestShape: "completion",
  supportsSystemInstruction: false,
  supportsFimSuffix: false,
  supportsStopSequences: true,
  prefixCacheFriendly: true
};

function learnerSelection(route: "coach" | "autocomplete") {
  const instruction =
    "Check the first and last valid loop or range boundary before continuing.";
  return {
    budget: route === "autocomplete" ? 2 : 3,
    characterBudget: route === "autocomplete" ? 160 : 225,
    usedCharacters: instruction.length,
    excludedRules: [],
    rules: [{
      id: "learner.loop-boundary",
      policyKey: "habit.loop-boundary",
      route,
      layer: "tail" as const,
      strength: "soft" as const,
      source: "learner" as const,
      priority: 300,
      instruction,
      compactInstruction: "check loop bounds",
      enforcement: "prompt" as const,
      language: "python" as const
    }]
  };
}

describe("skill renderers", () => {
  test("DeepSeek FIM keeps the exact suffix and uses Python comments", () => {
    const plan = composeAutocompleteSkillPlan({
      language: "python",
      learnerSelection: learnerSelection("autocomplete")
    });
    const rendered = renderAutocompleteSkillPlan(plan, deepSeek, {
      prefix: "for i in range(n):\n    ",
      suffix: "\nprint(total)",
      language: "python",
      fileLabel: "practice/luogu/problem.py"
    });

    expect(rendered.prompt).toContain("# skill head:");
    expect(rendered.prompt).toContain("# skill tail:");
    expect(rendered.prompt).toContain("# skill tail: check loop bounds");
    expect(rendered.prompt).not.toContain(
      "Check the first and last valid loop or range boundary before continuing."
    );
    expect(rendered.prompt.endsWith("for i in range(n):\n    ")).toBe(true);
    expect(rendered.suffix).toBe("\nprint(total)");
    expect(rendered.systemInstruction).toBeUndefined();
    expect(rendered.audit.renderer).toBe("deepseek-fim");
  });

  test("DeepSeek compiles at most one learner rule into the compact preamble", () => {
    const selection = learnerSelection("autocomplete");
    const secondInstruction = "Check indexes and container bounds.";
    const plan = composeAutocompleteSkillPlan({
      language: "python",
      learnerSelection: {
        ...selection,
        usedCharacters: selection.usedCharacters + secondInstruction.length,
        rules: [
          ...selection.rules,
          {
            ...selection.rules[0],
            id: "learner.bounds",
            policyKey: "habit.bounds",
            priority: 299,
            instruction: secondInstruction,
            compactInstruction: "check indexes and bounds"
          }
        ]
      }
    });
    const rendered = renderAutocompleteSkillPlan(plan, deepSeek, {
      prefix: "value = items[",
      suffix: "]",
      language: "python",
      fileLabel: "trial.py"
    });

    expect(rendered.prompt).toContain("check loop bounds");
    expect(rendered.prompt).not.toContain("check indexes and bounds");
    expect(rendered.audit.excludedRules).toContainEqual({
      id: "learner.bounds",
      reason: "renderer-budget"
    });
  });

  test("DeepSeek generic language adds no synthetic preamble", () => {
    const selection = learnerSelection("autocomplete");
    const plan = composeAutocompleteSkillPlan({
      language: "plaintext",
      learnerSelection: {
        ...selection,
        rules: selection.rules.map((rule) => ({
          ...rule,
          language: "generic" as const
        }))
      }
    });
    const rendered = renderAutocompleteSkillPlan(plan, deepSeek, {
      prefix: "alpha = ",
      suffix: "\nomega()",
      language: "generic",
      fileLabel: "current-file"
    });

    expect(rendered.prompt).toBe("alpha = ");
    expect(rendered.suffix).toBe("\nomega()");
    expect(rendered.audit.excludedRules).toContainEqual({
      id: "language.generic.local-continuation",
      reason: "renderer-unsupported"
    });
    expect(rendered.audit.excludedRules).toContainEqual({
      id: "learner.loop-boundary",
      reason: "renderer-unsupported"
    });
    expect(rendered.audit.learnerRuleCount).toBe(0);
    expect(rendered.audit.enforcementKinds).toEqual(["prompt-and-validator"]);
  });

  test("chat preserves logical layer order and embeds suffix in the user prompt", () => {
    const plan = composeAutocompleteSkillPlan({
      language: "python",
      learnerSelection: learnerSelection("autocomplete")
    });
    const rendered = renderAutocompleteSkillPlan(plan, chat, {
      prefix: "value = items[",
      suffix: "]\nprint(value)",
      language: "python",
      fileLabel: "trial.py"
    });
    const system = rendered.systemInstruction ?? "";

    expect(system.indexOf("[head]")).toBeLessThan(system.indexOf("[body]"));
    expect(system.indexOf("[body]")).toBeLessThan(system.indexOf("[tail]"));
    expect(system.indexOf("[tail]")).toBeLessThan(system.indexOf("[footer]"));
    expect(rendered.prompt).toContain("<suffix>\n]\nprint(value)\n</suffix>");
    expect(rendered.suffix).toBeUndefined();
  });

  test("coach puts learner habits before the action/output footer", () => {
    const plan = composeCoachSkillPlan({
      language: "python",
      action: "specific",
      learnerSelection: learnerSelection("coach")
    });
    const rendered = renderCoachSkillPlan(plan, chat, "diagnosis-context-json");
    const system = rendered.messages[0].content;
    const user = rendered.messages[1].content;

    expect(system).toContain("[head]");
    expect(system).toContain("[body]");
    expect(system).not.toContain("[tail]");
    expect(system).not.toContain("[footer]");
    expect(user.indexOf("diagnosis-context-json")).toBeLessThan(user.indexOf("[tail]"));
    expect(user.indexOf("[tail]")).toBeLessThan(user.indexOf("[footer]"));
    expect(user.indexOf("Narrow the hint")).toBeLessThan(
      user.indexOf("teaching-diagnosis JSON object")
    );
    expect(user.trimEnd().endsWith("</action-output-footer>")).toBe(true);
  });

  test("Codex text carries policy and both cursor sides in one prompt", () => {
    const plan = composeAutocompleteSkillPlan({
      language: "cpp",
      learnerSelection: {
        budget: 2,
        characterBudget: 160,
        usedCharacters: 0,
        excludedRules: [],
        rules: []
      }
    });
    const rendered = renderAutocompleteSkillPlan(plan, codex, {
      prefix: "value = items[",
      suffix: "];",
      language: "cpp",
      fileLabel: "src/main.cpp"
    });

    expect(rendered.prompt).toContain("<skill-policy>");
    expect(rendered.prompt).toContain("<suffix>\n];\n</suffix>");
    expect(rendered.audit.renderer).toBe("codex-text");
  });

  test("generic completions preserve stable file/language context and omit suffix", () => {
    const plan = composeAutocompleteSkillPlan({
      language: "python",
      learnerSelection: learnerSelection("autocomplete")
    });
    const rendered = renderAutocompleteSkillPlan(plan, genericCompletion, {
      prefix: "for i in range(n):\n    ",
      suffix: "\nprint(total)",
      language: "python",
      fileLabel: "practice/luogu/problem.py"
    });

    expect(rendered.prompt).toContain("Language: python");
    expect(rendered.prompt).toContain("File: practice/luogu/problem.py");
    expect(rendered.prompt).toContain("[tail]");
    expect(rendered.prompt).not.toContain("print(total)");
    expect(rendered.suffix).toBeUndefined();
  });

  test("rejects route and normalized-language mismatches", () => {
    const autocompletePlan = composeAutocompleteSkillPlan({
      language: "python",
      learnerSelection: learnerSelection("autocomplete")
    });
    const coachPlan = composeCoachSkillPlan({
      language: "python",
      action: "hint",
      learnerSelection: learnerSelection("coach")
    });
    const context = {
      prefix: "value = ",
      suffix: "",
      language: "python" as const,
      fileLabel: "trial.py"
    };

    expect(() => renderAutocompleteSkillPlan(coachPlan, chat, context)).toThrow(
      "Autocomplete renderer received a coach SkillPlan."
    );
    expect(() => renderCoachSkillPlan(
      autocompletePlan,
      chat,
      "diagnosis-context-json"
    )).toThrow("Coach renderer received an autocomplete SkillPlan.");
    expect(() => renderAutocompleteSkillPlan(
      autocompletePlan,
      chat,
      { ...context, language: "cpp" }
    )).toThrow("Autocomplete SkillPlan language does not match its context.");
  });
});

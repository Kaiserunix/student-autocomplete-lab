import { describe, expect, it } from "vitest";
import {
  composeProjectionPlan,
  renderAnthropicMessages,
  renderChatMessages,
  renderDeepSeekFim,
  renderGenericCompletion,
  type ProjectionRule
} from "../../src/core/contextProjection";

describe("contextProjection renderers", () => {
  it("renderDeepSeekFim preserves suffix byte-for-byte across CRLF, spaces, tabs, and unicode", () => {
    const rawSuffix = "\r\n\t  // keep exact bytes: 中文 边界\r\n  return 0;\r\n}   ";
    const prefix = "#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    ios::";

    const plan = composeProjectionPlan({
      route: "autocomplete",
      language: "cpp",
      output: { maxLines: 3, maxTokens: 96 }
    });

    const rendered = renderDeepSeekFim(plan, { prefix, suffix: rawSuffix });

    // Strict byte-for-byte identity
    expect(rendered.suffix).toBe(rawSuffix);
    expect(Buffer.from(rendered.suffix, "utf8").equals(Buffer.from(rawSuffix, "utf8"))).toBe(true);

    // Compact language-native comment preamble prepended only to prompt
    expect(rendered.prompt.endsWith(prefix)).toBe(true);
    const preamble = rendered.prompt.slice(0, rendered.prompt.length - prefix.length);
    for (const line of preamble.trim().split("\n")) {
      expect(line.startsWith("// [ac:")).toBe(true);
    }
    expect(rendered.audit.renderer).toBe("deepseek-fim");
  });

  it("renderDeepSeekFim uses # comments for Python and omits prompt-only preamble for generic", () => {
    const pyPlan = composeProjectionPlan({
      route: "autocomplete",
      language: "python"
    });
    const pyRendered = renderDeepSeekFim(pyPlan, {
      prefix: "import sys\n",
      suffix: "\nprint(1)"
    });
    expect(pyRendered.prompt.startsWith("# [ac:head] ")).toBe(true);
    expect(pyRendered.suffix).toBe("\nprint(1)");

    const genericPlan = composeProjectionPlan({
      route: "autocomplete",
      language: "unknown-dsl"
    });
    const genericRendered = renderDeepSeekFim(genericPlan, {
      prefix: "raw_prefix()",
      suffix: "raw_suffix()"
    });
    expect(genericRendered.prompt).toBe("raw_prefix()");
    expect(genericRendered.suffix).toBe("raw_suffix()");
    expect(
      genericRendered.audit.excludedRules.some((r) => r.reason === "renderer-unsupported")
    ).toBe(true);
  });

  it("renderChatMessages formats head/body/tail/footer system layers cleanly", () => {
    const learnerRule: ProjectionRule = {
      id: "learner.m1",
      policyKey: "learner.m1",
      route: "coach",
      layer: "tail",
      source: "learner",
      priority: 100,
      instruction: "Learner frequently hits off-by-one binary search bounds.",
      enforcement: "prompt",
      projectedItem: {
        id: "m1",
        kind: "active_misconception",
        label: "Off-by-one binary search bounds",
        muteable: true
      }
    };
    const footerRule: ProjectionRule = {
      id: "output.json",
      policyKey: "output.format",
      route: "coach",
      layer: "footer",
      source: "output",
      priority: 800,
      instruction: "Respond in concise JSON format.",
      enforcement: "both"
    };

    const plan = composeProjectionPlan({
      route: "coach",
      language: "java",
      rules: [learnerRule, footerRule]
    });

    const rendered = renderChatMessages(plan, {
      history: [
        { role: "system", content: "should be stripped" },
        { role: "user", content: "Prior question" },
        { role: "assistant", content: "Prior hint" }
      ],
      userPrompt: "Why did sample 2 fail?"
    });

    expect(rendered.audit.renderer).toBe("chat-messages");
    expect(rendered.messages[0]?.role).toBe("system");
    const sys = rendered.messages[0]?.content ?? "";
    expect(sys.indexOf("[head]")).toBeGreaterThanOrEqual(0);
    expect(sys.indexOf("[body]")).toBeGreaterThan(sys.indexOf("[head]"));
    expect(sys.indexOf("[tail]")).toBeGreaterThan(sys.indexOf("[body]"));
    expect(sys.indexOf("[footer]")).toBeGreaterThan(sys.indexOf("[tail]"));
    expect(rendered.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user"
    ]);
  });

  it("renderAnthropicMessages keeps system separate and ensures messages start with user and alternate", () => {
    const plan = composeProjectionPlan({
      route: "coach",
      language: "rust"
    });

    const rendered = renderAnthropicMessages(plan, {
      history: [
        { role: "assistant", content: "orphan assistant intro" },
        { role: "user", content: "First user turn" }
      ],
      userPrompt: "Follow-up user turn"
    });

    expect(rendered.audit.renderer).toBe("anthropic-messages");
    expect(rendered.system).toContain("[head]");
    expect(rendered.messages).toHaveLength(1);
    expect(rendered.messages[0]?.role).toBe("user");
    expect(rendered.messages[0]?.content).toContain("First user turn");
    expect(rendered.messages[0]?.content).toContain("Follow-up user turn");
  });

  it("renderGenericCompletion emits bounded preamble and optional suffix hint", () => {
    const plan = composeProjectionPlan({
      route: "autocomplete",
      language: "rust",
      output: { maxLines: 2, maxTokens: 64 }
    });

    const rendered = renderGenericCompletion(plan, {
      prefix: "use std::collections::",
      suffix: "\nfn main() {}",
      includeSuffixHint: true
    });

    expect(rendered.audit.renderer).toBe("generic-completion");
    expect(rendered.prompt).toContain("// [ac:head]");
    expect(rendered.prompt).toContain("// [ac:suffix-hint]");
    expect(rendered.prompt.endsWith("use std::collections::")).toBe(true);
    expect(rendered.maxLines).toBe(2);
  });
});

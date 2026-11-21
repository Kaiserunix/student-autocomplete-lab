import { describe, expect, it } from "vitest";
import type { ProjectionAudit } from "../../src/core/contracts";
import { createSafeAuditView, sanitizeAuditText } from "../../src/core/contextProjection";

describe("auditView privacy redaction", () => {
  it("redacts API keys, tokens, cookies, local user paths, and emails without mutating original audit", () => {
    const original: ProjectionAudit = {
      route: "coach",
      language: "cpp",
      renderer: "chat-messages",
      includedRuleIds: ["hard.coach.socratic-guard"],
      excludedRules: [
        {
          id: "r1",
          reason: "Blocked C:\\Users\\Alice\\Desktop\\secret.cpp with sk-1234567890abcdef"
        }
      ],
      projectedItems: [
        {
          id: "item1",
          kind: "code_habit",
          label: "Bearer eyJhbGciOiJIUzI1NiJ9 and /Users/alice/code.py email alice@example.com",
          sourceKey: "LEETCODE_SESSION=supersecretcookie123",
          muteable: true
        }
      ],
      characterBudgetUsed: 120,
      characterBudgetMax: 2400
    };

    const view = createSafeAuditView(original);

    expect(view.redactedCount).toBeGreaterThanOrEqual(3);
    expect(view.excludedRules[0]?.reason).not.toContain("Alice");
    expect(view.excludedRules[0]?.reason).not.toContain("sk-1234567890abcdef");
    expect(view.projectedItems[0]?.label).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(view.projectedItems[0]?.label).not.toContain("/Users/alice");
    expect(view.projectedItems[0]?.label).not.toContain("alice@example.com");
    expect(view.projectedItems[0]?.sourceKey).not.toContain("supersecretcookie123");
    expect(view.budgetRatio).toBe(0.05);

    // Original audit object stays untouched
    expect(original.excludedRules[0]?.reason).toContain("sk-1234567890abcdef");
  });

  it("truncates overly long labels cleanly", () => {
    const longText = "x".repeat(250);
    const { text, redacted } = sanitizeAuditText(longText, 80);
    expect(redacted).toBe(false);
    expect(text.length).toBeLessThanOrEqual(80);
    expect(text.endsWith("…")).toBe(true);
  });
});

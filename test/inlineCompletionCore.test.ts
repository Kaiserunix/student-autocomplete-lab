import { describe, expect, test, vi } from "vitest";
import {
  createInlineCompletionEngine,
  type InlineCompletionEvent
} from "../src/autocomplete/inlineCompletionCore";
import { providerCapabilitiesFor } from "../src/models/providerCapabilities";
import { createEmptyStudentSkill } from "../src/teaching/studentSkill";

describe("decoupled inline completion engine (zero vscode host dependency)", () => {
  test("serves short Ghost Text across C++ and Rust contest code while caching identical requests", async () => {
    const events: InlineCompletionEvent[] = [];
    const requestAutocomplete = vi.fn(async () => ({
      status: "success" as const,
      suggestion: "total += values[i];",
      audit: {
        route: "autocomplete" as const,
        language: "cpp" as const,
        renderer: "deepseek-fim" as const,
        includedRuleIds: [],
        excludedRules: [],
        learnerRuleCount: 0,
        learnerRuleBudget: 2,
        learnerCharacterCount: 0,
        learnerCharacterBudget: 160,
        enforcementKinds: []
      }
    }));

    const engine = createInlineCompletionEngine({
      automaticDebounceMs: 0,
      minAutomaticIntervalMs: 0,
      onEvent: (event) => events.push(event),
      loadStudentSkill: async () => createEmptyStudentSkill("student-a"),
      loadRoute: async () => ({
        purpose: "autocomplete",
        providerMode: "openai-compatible",
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.com/beta",
        endpoint: "https://api.deepseek.com/beta/completions",
        format: "openai-completions",
        capabilities: providerCapabilitiesFor({
          format: "openai-completions",
          baseUrl: "https://api.deepseek.com/beta"
        }),
        config: {
          mode: "openai-compatible",
          format: "openai-completions",
          baseUrl: "https://api.deepseek.com/beta",
          apiKey: "test-key",
          model: "deepseek-chat"
        }
      }),
      requestAutocomplete
    });

    const cppText = [
      "// 题目：求和",
      "#include <bits/stdc++.h>",
      "using namespace std;",
      "int main() {",
      "    long long total = 0;",
      "    total +=",
      "}"
    ].join("\n");
    const cursorOffset = cppText.indexOf("    total +=") + "    total +=".length;
    const document = {
      uri: "file:///workspace/smoke.cpp",
      filePath: "/workspace/smoke.cpp",
      languageId: "cpp",
      version: 1,
      lineTextAt: (line: number) => cppText.split("\n")[line] ?? "",
      offsetAt: () => cursorOffset,
      getText: () => cppText
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => undefined })
    };

    const first = await engine.provideCompletion(
      document,
      { line: 5, character: 12 },
      { explicit: false },
      token
    );
    const cached = await engine.provideCompletion(
      document,
      { line: 5, character: 12 },
      { explicit: false },
      token
    );

    expect(first).toEqual({
      insertText: " values[i];",
      useSelectedCompletionRange: false,
      filterText: undefined
    });
    expect(cached).toEqual(first);
    expect(requestAutocomplete).toHaveBeenCalledTimes(1);
    expect(events.map((item) => item.type)).toEqual(["request", "success"]);
  });

  test("surfaces validator-rejected events distinctly from empty or transport errors", async () => {
    const events: InlineCompletionEvent[] = [];
    const engine = createInlineCompletionEngine({
      automaticDebounceMs: 0,
      minAutomaticIntervalMs: 0,
      onEvent: (event) => events.push(event),
      loadStudentSkill: async () => createEmptyStudentSkill("student-a"),
      loadRoute: async () => ({
        purpose: "autocomplete",
        providerMode: "openai-compatible",
        model: "fim-model",
        baseUrl: "https://example.test/v1",
        endpoint: "https://example.test/v1/completions",
        format: "openai-completions",
        capabilities: providerCapabilitiesFor({
          format: "openai-completions",
          baseUrl: "https://example.test/v1"
        }),
        config: {
          mode: "openai-compatible",
          format: "openai-completions",
          baseUrl: "https://example.test/v1",
          apiKey: "test-key",
          model: "fim-model"
        }
      }),
      requestAutocomplete: async () => ({
        status: "validator-rejected",
        suggestion: "",
        rejectionReason: "context-marker",
        audit: {
          route: "autocomplete",
          language: "rust",
          renderer: "generic-completion",
          includedRuleIds: [],
          excludedRules: [],
          learnerRuleCount: 0,
          learnerRuleBudget: 2,
          learnerCharacterCount: 0,
          learnerCharacterBudget: 160,
          enforcementKinds: []
        }
      })
    });

    const rustText = "pub fn solve() {\n    let mut sum = 0;\n    sum +=\n}";
    const result = await engine.provideCompletion(
      {
        uri: "file:///workspace/smoke.rs",
        filePath: "/workspace/smoke.rs",
        languageId: "rust",
        version: 1,
        lineTextAt: (line) => rustText.split("\n")[line] ?? "",
        offsetAt: () => rustText.indexOf("sum +=") + "sum +=".length,
        getText: () => rustText
      },
      { line: 2, character: 10 },
      { explicit: true },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => undefined })
      }
    );

    expect(result).toBeUndefined();
    expect(events).toContainEqual({
      type: "rejected",
      message: "Autocomplete output rejected by policy: context-marker"
    });
  });
});

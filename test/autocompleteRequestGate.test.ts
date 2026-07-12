import { describe, expect, test } from "vitest";
import { AutocompleteRequestGate } from "../src/autocomplete/requestGate";

describe("autocomplete request gate", () => {
  test("throttles automatic requests but lets explicit requests through", () => {
    let now = 1000;
    const gate = new AutocompleteRequestGate({
      minAutomaticIntervalMs: 1500,
      now: () => now
    });

    expect(gate.beginRequest(false)).toBe(false);
    now = 2501;
    expect(gate.beginRequest(false)).toBe(true);
    expect(gate.beginRequest(false)).toBe(false);
    gate.finishRequest();
    now = 2600;
    expect(gate.beginRequest(false)).toBe(false);
    expect(gate.beginRequest(true)).toBe(true);
  });

  test("reuses a recent same-position suggestion", () => {
    let now = 1000;
    const gate = new AutocompleteRequestGate({
      cacheTtlMs: 5000,
      now: () => now
    });

    expect(gate.beginRequest(true)).toBe(true);
    gate.completeSuccess("file.py:1:4", "return a + b");
    now = 4000;
    expect(gate.cachedSuggestion("file.py:1:4")).toEqual({
      key: "file.py:1:4",
      suggestion: "return a + b"
    });
    now = 7001;
    expect(gate.cachedSuggestion("file.py:1:4")).toBeUndefined();
  });
});

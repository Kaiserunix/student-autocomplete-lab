import { describe, expect, it } from "vitest";
import {
  evaluateAutocompleteOutput,
  extractPlaceholderRanges
} from "../../src/core/autocomplete";

describe("outputPolicy (line limits, complexity gates, stripping, placeholder ranges)", () => {
  it("enforces zone line limits (Green <= 3, Neutral <= 1, Red <= 1)", () => {
    const fiveLines = [
      "ios::sync_with_stdio(false);",
      "cin.tie(nullptr);",
      "int t;",
      "cin >> t;",
      "while (t--) solve();"
    ].join("\n");

    const green = evaluateAutocompleteOutput({
      raw: fiveLines,
      zone: "boilerplate",
      language: "cpp"
    });
    expect(green.status).toBe("accepted");
    expect(green.lineCount).toBe(3);
    expect(green.truncatedLines).toBe(true);
    expect(green.suggestion.split("\n")).toHaveLength(3);

    const neutral = evaluateAutocompleteOutput({
      raw: "int width = a.size();\nint height = b.size();",
      zone: "neutral",
      language: "cpp"
    });
    expect(neutral.status).toBe("accepted");
    expect(neutral.lineCount).toBe(1);
    expect(neutral.suggestion).toBe("int width = a.size();");
    expect(neutral.truncatedLines).toBe(true);
  });

  it("rejects nested control flow and loop+state-update stealth logic in Neutral zone", () => {
    const nestedCtrl = evaluateAutocompleteOutput({
      raw: "for (int i = 0; i < n; i++) { if (a[i] > target) return i; }",
      zone: "neutral",
      language: "cpp"
    });
    expect(nestedCtrl.status).toBe("rejected");
    expect(nestedCtrl.rejectionReason).toBe("neutral-nested-control-flow");

    const loopStateCpp = evaluateAutocompleteOutput({
      raw: "for (int i = 1; i <= n; i++) dp[i] = max(dp[i - 1], a[i]);",
      zone: "neutral",
      language: "cpp"
    });
    expect(loopStateCpp.status).toBe("rejected");
    expect(loopStateCpp.rejectionReason).toBe("neutral-loop-state-update");

    const loopStatePy = evaluateAutocompleteOutput({
      raw: "for x in nums: ans += x",
      zone: "neutral",
      language: "python"
    });
    expect(loopStatePy.status).toBe("rejected");
    expect(loopStatePy.rejectionReason).toBe("neutral-loop-state-update");

    const fullSkeleton = evaluateAutocompleteOutput({
      raw: "def solve(nums):\n    return 0",
      zone: "neutral",
      language: "python"
    });
    expect(fullSkeleton.status).toBe("rejected");
    expect(fullSkeleton.rejectionReason).toBe("full-skeleton-rejected");

    const tokenOverflow = evaluateAutocompleteOutput({
      raw: "int total = a0 + a1 + a2 + a3 + a4 + a5 + a6 + a7 + a8 + a9 + a10 + a11 + a12 + a13 + a14 + a15 + a16 + a17 + a18 + a19 + a20 + a21 + a22 + a23 + a24;",
      zone: "neutral",
      language: "cpp"
    });
    expect(tokenOverflow.status).toBe("rejected");
    expect(tokenOverflow.rejectionReason).toBe("token-budget-exceeded");
  });

  it("strips markdown fences, echoed projection control lines, and echoed current-line prefix", () => {
    const fencedWithEcho = [
      "```cpp",
      "// [ac:head] local syntax only",
      "    vec.push_back(x);",
      "```"
    ].join("\n");

    const result = evaluateAutocompleteOutput({
      raw: fencedWithEcho,
      zone: "api_syntax",
      language: "cpp",
      currentLinePrefix: "    vec.push_"
    });

    expect(result.status).toBe("accepted");
    expect(result.strippedFence).toBe(true);
    expect(result.strippedEchoedPrefix).toBe(true);
    expect(result.suggestion).toBe("back(x);");
  });

  it("rejects explanation chatter, prompt tags, and secret/path leaks", () => {
    expect(
      evaluateAutocompleteOutput({
        raw: "Here is the code you need:\nvec.push_back(x);",
        zone: "api_syntax",
        language: "cpp"
      })
    ).toMatchObject({ status: "rejected", rejectionReason: "explanation" });

    expect(
      evaluateAutocompleteOutput({
        raw: "</prefix>\nint x = 1;",
        zone: "neutral",
        language: "cpp"
      })
    ).toMatchObject({ status: "rejected", rejectionReason: "context-marker" });

    expect(
      evaluateAutocompleteOutput({
        raw: 'const char* key = "sk-1234567890abcdef";',
        zone: "neutral",
        language: "cpp"
      })
    ).toMatchObject({ status: "rejected", rejectionReason: "context-marker" });

    expect(
      evaluateAutocompleteOutput({
        raw: "   \n  ",
        zone: "neutral",
        language: "cpp"
      }).status
    ).toBe("model-empty");
  });

  it("extracts exact plain-text placeholder selection offsets (avoiding VS Code SnippetString bug #272709)", () => {
    const singleLine = "while (/* 条件 */) {";
    const evaluated = evaluateAutocompleteOutput({
      raw: singleLine,
      zone: "algo_core",
      language: "cpp"
    });

    expect(evaluated.status).toBe("accepted");
    expect(evaluated.placeholders).toHaveLength(1);
    const p = evaluated.primaryPlaceholder!;
    expect(p.text).toBe("/* 条件 */");
    expect(p.label).toBe("条件");
    expect(evaluated.suggestion.slice(p.startOffset, p.endOffset)).toBe("/* 条件 */");
    expect(p.line).toBe(0);
    expect(p.startCharacter).toBe(7);
    expect(p.endCharacter).toBe(15);

    // Multi-line placeholder offsets
    const multiLine = "if (/* condition */) {\n    dp[i] = /* 转移 */;\n}";
    const ranges = extractPlaceholderRanges(multiLine);
    expect(ranges).toHaveLength(2);

    const lines = multiLine.split("\n");
    for (const r of ranges) {
      expect(multiLine.slice(r.startOffset, r.endOffset)).toBe(r.text);
      expect(lines[r.line]?.slice(r.startCharacter, r.endCharacter)).toBe(r.text);
    }
    expect(ranges[1]?.line).toBe(1);
    expect(ranges[1]?.label).toBe("转移");

    // Token placeholders work while C++ generic type syntax produces zero false placeholders
    const tokenPlaceholder = extractPlaceholderRanges("return __CONDITION__ ? x : <转移>;");
    expect(tokenPlaceholder.map((item) => item.label)).toEqual(["CONDITION", "转移"]);
    expect(extractPlaceholderRanges("vector<pair<int, long long>> edges;")).toEqual([]);
  });
});

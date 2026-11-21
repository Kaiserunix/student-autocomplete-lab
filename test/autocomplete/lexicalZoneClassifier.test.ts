import { statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyLexicalZone } from "../../src/core/autocomplete";

describe("lexicalZoneClassifier (zero-WASM 4-zone scanner)", () => {
  describe("boilerplate zone (Green)", () => {
    it("classifies C++ headers, namespace, competition macros, fast I/O, main, and input loops", () => {
      const cases = [
        "#include <bits/",
        "#include <bits/stdc++.h>\nusing namespace ",
        "#include <bits/stdc++.h>\n#define ll long long\n#define pb ",
        "const int MOD = 1e9 + 7;\nconstexpr int MAXN = ",
        "int main() {\n    ios::sync_with_stdio(",
        "int main() {\n    ",
        "int main() {\n    int n;\n    cin >> ",
        "int main() {\n    int n;\n    cin >> n;\n    for (int i = 0; i < n; i++) {\n        "
      ];

      for (const prefix of cases) {
        const res = classifyLexicalZone({ language: "cpp", prefix, suffix: "" });
        expect(res.zone, `expected boilerplate for: ${JSON.stringify(prefix)}`).toBe(
          "boilerplate"
        );
        expect(res.spoilerRisk).toBe("low");
        expect(res.maxLines).toBe(3);
      }
    });

    it("classifies Python, Rust, and Java boilerplate & fast I/O", () => {
      expect(
        classifyLexicalZone({
          language: "python",
          prefix: "import sys\ninput = sys.stdin.",
          suffix: ""
        }).zone
      ).toBe("boilerplate");

      expect(
        classifyLexicalZone({
          language: "python",
          prefix: "import sys\nif __name__ == '__main__':\n    ",
          suffix: ""
        }).zone
      ).toBe("boilerplate");

      expect(
        classifyLexicalZone({
          language: "rust",
          prefix: "#![allow(unused)]\n#[derive(Debug, Clone)]\nuse std::collections::",
          suffix: ""
        }).zone
      ).toBe("boilerplate");

      expect(
        classifyLexicalZone({
          language: "rust",
          prefix: "use std::io::{self, Read};\nfn main() {\n    ",
          suffix: ""
        }).zone
      ).toBe("boilerplate");

      expect(
        classifyLexicalZone({
          language: "java",
          prefix: "import java.io.*;\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new ",
          suffix: ""
        }).zone
      ).toBe("boilerplate");

      expect(
        classifyLexicalZone({
          language: "c",
          prefix: "#include <stdio.h>\nint main() {\n    int n;\n    scanf(",
          suffix: ""
        }).zone
      ).toBe("boilerplate");

      expect(
        classifyLexicalZone({
          language: "python",
          prefix: "n = int(input())\nfor _ in range(n):\n    ",
          suffix: ""
        }).zone
      ).toBe("boilerplate");
    });
  });

  describe("api_syntax zone (Green)", () => {
    it("classifies member access (. / -> / ::), STL/collection declarations, and bracket closures", () => {
      const cases: Array<{ language: string; prefix: string; suffix: string }> = [
        { language: "cpp", prefix: "vector<int> a;\na.push_", suffix: "" },
        { language: "cpp", prefix: "Node* cur;\ncur->ne", suffix: "" },
        { language: "cpp", prefix: "std::sort(a.begin(), a.end()", suffix: ");" },
        { language: "cpp", prefix: "priority_queue<pair<int, int>", suffix: "" },
        { language: "rust", prefix: "let mut heap: BinaryHeap<", suffix: "" },
        { language: "rust", prefix: "let mut v = Vec::new();\nv.pu", suffix: "" },
        { language: "java", prefix: "ArrayList<Integer> list = new ", suffix: "" },
        { language: "java", prefix: "StringBuilder sb = new StringBuilder();\nsb.app", suffix: "" },
        { language: "python", prefix: "from collections import deque\nq = deque()\nq.app", suffix: "" }
      ];

      for (const tc of cases) {
        const res = classifyLexicalZone(tc);
        expect(res.zone, `expected api_syntax for ${tc.language}: ${tc.prefix}`).toBe(
          "api_syntax"
        );
        expect(res.spoilerRisk).toBe("low");
        expect(res.maxLines).toBe(3);
      }
    });
  });

  describe("neutral zone (1 line, <= 48 tokens)", () => {
    it("classifies ordinary variable declarations and assignments as neutral (even when suffix starts with closing brace on next line)", () => {
      const cases = [
        { language: "cpp", prefix: "void helper(int n) {\n    int scale = 2;\n    int offset = ", suffix: "\n}" },
        { language: "python", prefix: "def helper(items):\n    total_len = ", suffix: "\n    return total_len" },
        { language: "rust", prefix: "fn helper<'a>(s: &'a str) {\n    let bytes_len = ", suffix: "\n}" },
        { language: "java", prefix: "static void helper() {\n    String label = ", suffix: "\n}" }
      ];

      for (const tc of cases) {
        const res = classifyLexicalZone({
          language: tc.language,
          prefix: tc.prefix,
          suffix: tc.suffix
        });
        expect(res.zone, `expected neutral for ${tc.language}: ${tc.prefix}`).toBe("neutral");
        expect(res.spoilerRisk).toBe("low");
        expect(res.maxLines).toBe(1);
        expect(res.maxTokens).toBe(48);
      }
    });
  });

  describe("algo_core zone (Red — High Spoiler Risk)", () => {
    it("flags first line after natural-language comment (anti-Shepherding)", () => {
      const cases = [
        { language: "cpp", prefix: "void helper() {\n    // 二分查找第一个大于等于 target 的位置\n    " },
        { language: "python", prefix: "def helper(a):\n    # use monotonic stack to find next greater element\n    " },
        { language: "java", prefix: "static void run() {\n    /* 状态转移方程 */\n    " },
        { language: "rust", prefix: "fn run() {\n    // shortest path relaxation\n    " }
      ];

      for (const tc of cases) {
        const res = classifyLexicalZone({ language: tc.language, prefix: tc.prefix, suffix: "" });
        expect(res.zone).toBe("algo_core");
        expect(res.spoilerRisk).toBe("high");
        expect(res.reason).toBe("after-natural-language-comment");
      }
    });

    it("flags first line immediately after classic algorithm function signatures across languages", () => {
      const cases = [
        { language: "cpp", prefix: "void dfs(int u, int p) {\n    " },
        { language: "cpp", prefix: "void bfs(int s)\n{\n    " },
        { language: "cpp", prefix: "vector<long long> dijkstra(int s) {\n    " },
        { language: "cpp", prefix: "bool check(long long mid) {\n    " },
        { language: "cpp", prefix: "void solve() {\n    " },
        { language: "cpp", prefix: "auto dfs = [&](int u, int p) {\n    " },
        { language: "python", prefix: "def binary_search(nums, target):\n    " },
        { language: "python", prefix: "def lca(u, v):\n    " },
        { language: "rust", prefix: "fn kmp(s: &[u8]) -> Vec<usize> {\n    " },
        { language: "java", prefix: "static void dijkstra(int start) {\n    " }
      ];

      for (const tc of cases) {
        const res = classifyLexicalZone({ language: tc.language, prefix: tc.prefix, suffix: "" });
        expect(res.zone, `expected algo_core for: ${tc.prefix}`).toBe("algo_core");
        expect(res.reason).toBe("after-algo-function-signature");
      }
    });

    it("flags if / while / elif / for condition slots", () => {
      const cases = [
        { language: "cpp", prefix: "if (a[mid] " },
        { language: "cpp", prefix: "while (l < " },
        { language: "cpp", prefix: "for (int i = 0; i < " },
        { language: "python", prefix: "if not vis[v] and " },
        { language: "python", prefix: "elif nums[mid] " },
        { language: "python", prefix: "while left <= " },
        { language: "rust", prefix: "while l < " },
        { language: "java", prefix: "if (dist[u] + w < " }
      ];

      for (const tc of cases) {
        const res = classifyLexicalZone({ language: tc.language, prefix: tc.prefix, suffix: "" });
        expect(res.zone, `expected algo_core for: ${tc.prefix}`).toBe("algo_core");
        expect(res.reason).toBe("control-flow-condition");
      }
    });

    it("flags state variable assignment RHS (dp/f/g/dist/mid/ans/cnt)", () => {
      const cases = [
        { language: "cpp", prefix: "dp[i][j] = " },
        { language: "cpp", prefix: "f[i] = max(" },
        { language: "cpp", prefix: "g[u] += " },
        { language: "cpp", prefix: "dist[v] = " },
        { language: "python", prefix: "mid = " },
        { language: "rust", prefix: "ans = " },
        { language: "java", prefix: "cnt += " }
      ];

      for (const tc of cases) {
        const res = classifyLexicalZone({ language: tc.language, prefix: tc.prefix, suffix: "" });
        expect(res.zone, `expected algo_core for: ${tc.prefix}`).toBe("algo_core");
        expect(res.reason).toBe("state-variable-assignment");
      }
    });

    it("flags recursive self-call arguments across languages", () => {
      const cases = [
        {
          language: "cpp",
          prefix: "void dfs(int u, int p) {\n    for (int v : adj[u]) {\n        if (v != p) dfs(v, "
        },
        {
          language: "python",
          prefix: "def dfs(u, parent):\n    for v in adj[u]:\n        dfs(v, "
        },
        {
          language: "rust",
          prefix: "fn dfs<'a>(u: usize, g: &'a [Vec<usize>]) {\n    dfs(next, "
        },
        {
          language: "java",
          prefix: "static int solve(int l, int r) {\n    int x = solve(l, "
        }
      ];

      for (const tc of cases) {
        const res = classifyLexicalZone({ language: tc.language, prefix: tc.prefix, suffix: ")" });
        expect(res.zone, `expected algo_core for recursive call in ${tc.language}`).toBe("algo_core");
        expect(res.reason).toBe("recursive-call-args");
      }
    });
  });

  describe("footprint and latency guardrails (< 20KB, < 1ms)", () => {
    it("stays strictly under 20KB source size and classifies a 160-line file in under 1ms average", () => {
      const classifierPath = resolve(
        process.cwd(),
        "src/core/autocomplete/lexicalZoneClassifier.ts"
      );
      const sizeBytes = statSync(classifierPath).size;
      expect(sizeBytes).toBeLessThan(20 * 1024);

      const sampleFile = [
        "#include <bits/stdc++.h>",
        "using namespace std;",
        ...Array.from({ length: 140 }, (_, i) => `int helper_var_${i} = ${i};`),
        "void dfs(int u, int p) {",
        "    for (int v : adj[u]) {",
        "        dfs(v, "
      ].join("\n");

      // Warm up JIT
      for (let i = 0; i < 10; i++) {
        classifyLexicalZone({ language: "cpp", prefix: sampleFile, suffix: ")" });
      }

      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const res = classifyLexicalZone({ language: "cpp", prefix: sampleFile, suffix: ")" });
        expect(res.zone).toBe("algo_core");
      }
      const avgMs = (performance.now() - start) / iterations;
      expect(avgMs).toBeLessThan(1);
    });
  });
});

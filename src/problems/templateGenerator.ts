import type { ProblemDocument, SupportedLanguage } from "../core/contracts";

export interface GeneratedTemplate {
  filename: string;
  content: string;
  language: SupportedLanguage;
  mode: "stdio" | "function";
}

const EXT_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  python: "py",
  cpp: "cpp",
  c: "c",
  rust: "rs",
  java: "java",
  generic: "txt"
};

const LEETCODE_SLUG_CANDIDATES: Record<SupportedLanguage, string[]> = {
  python: ["python3", "python"],
  cpp: ["cpp"],
  c: ["c"],
  rust: ["rust"],
  java: ["java"],
  generic: []
};

function sanitizeFileStem(problem: ProblemDocument): string {
  const base = problem.problemKey
    .replace(/:/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "solution";
}

function buildHeaderComment(problem: ProblemDocument, language: SupportedLanguage): string {
  const prefix = language === "python" || language === "generic" ? "#" : "//";
  const lines = [
    `${prefix} Problem: ${problem.title} (${problem.problemKey})`,
    ...(problem.canonicalUrl ? [`${prefix} URL: ${problem.canonicalUrl}`] : []),
    `${prefix} Mode: ${problem.ioMode === "function" ? "LeetCode Function" : "ACM/OI Stdio"}`
  ];
  return lines.join("\n");
}

function enrichPythonLeetCodeSnippet(snippet: string): string {
  const needed: string[] = [];
  if (/\bList\[/.test(snippet) && !/from\s+typing\s+import\b.*\bList\b/.test(snippet)) {
    needed.push("List");
  }
  if (/\bOptional\[/.test(snippet) && !/from\s+typing\s+import\b.*\bOptional\b/.test(snippet)) {
    needed.push("Optional");
  }
  if (/\bDict\[/.test(snippet) && !/from\s+typing\s+import\b.*\bDict\b/.test(snippet)) {
    needed.push("Dict");
  }
  if (/\bTuple\[/.test(snippet) && !/from\s+typing\s+import\b.*\bTuple\b/.test(snippet)) {
    needed.push("Tuple");
  }
  if (needed.length === 0) {
    return snippet;
  }
  return `from typing import ${needed.join(", ")}\n\n${snippet}`;
}

function generateStdioBody(language: SupportedLanguage): string {
  switch (language) {
    case "python":
      return [
        "import sys",
        "",
        "",
        "def solve() -> None:",
        "    data = sys.stdin.read().strip().split()",
        "    if not data:",
        "        return",
        "    # TODO: implement solution",
        "",
        "",
        "if __name__ == \"__main__\":",
        "    solve()",
        ""
      ].join("\n");

    case "cpp":
      return [
        "#include <algorithm>",
        "#include <iostream>",
        "#include <string>",
        "#include <vector>",
        "",
        "using namespace std;",
        "",
        "int main() {",
        "    ios::sync_with_stdio(false);",
        "    cin.tie(nullptr);",
        "",
        "    // TODO: implement solution",
        "    return 0;",
        "}",
        ""
      ].join("\n");

    case "c":
      return [
        "#include <stdio.h>",
        "#include <stdlib.h>",
        "",
        "int main(void) {",
        "    /* TODO: implement solution */",
        "    return 0;",
        "}",
        ""
      ].join("\n");

    case "rust":
      return [
        "use std::io::{self, Read};",
        "",
        "fn main() {",
        "    let mut input = String::new();",
        "    io::stdin().read_to_string(&mut input).unwrap();",
        "    let _tokens: Vec<&str> = input.split_whitespace().collect();",
        "    // TODO: implement solution",
        "}",
        ""
      ].join("\n");

    case "java":
      return [
        "import java.io.*;",
        "import java.util.*;",
        "",
        "public class Main {",
        "    public static void main(String[] args) throws Exception {",
        "        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));",
        "        // TODO: implement solution",
        "    }",
        "}",
        ""
      ].join("\n");

    case "generic":
      return "// TODO: implement solution\n";
  }
}

/**
 * Generates initial practice source code for Python / C++ / C / Rust / Java.
 * - Uses LeetCode `codeSnippets` when `problem.ioMode === "function"` and a snippet exists.
 * - Falls back to clean ACM/OI Stdio templates otherwise.
 * - Intentionally omits `statementMarkdown` from source comments to maintain anti-spoiler isolation.
 */
export function generateStarterTemplate(
  problem: ProblemDocument,
  language: SupportedLanguage
): GeneratedTemplate {
  const ext = EXT_BY_LANGUAGE[language];
  const filename =
    language === "java" && problem.ioMode !== "function"
      ? "Main.java"
      : `${sanitizeFileStem(problem)}.${ext}`;
  const header = buildHeaderComment(problem, language);

  if (problem.ioMode === "function" && problem.functionMeta?.codeSnippets) {
    const candidates = LEETCODE_SLUG_CANDIDATES[language];
    for (const slug of candidates) {
      const rawSnippet = problem.functionMeta.codeSnippets[slug];
      if (typeof rawSnippet === "string" && rawSnippet.trim().length > 0) {
        const snippet =
          language === "python"
            ? enrichPythonLeetCodeSnippet(rawSnippet.trimEnd())
            : rawSnippet.trimEnd();
        return {
          filename,
          content: `${header}\n\n${snippet}\n`,
          language,
          mode: "function"
        };
      }
    }
  }

  return {
    filename,
    content: `${header}\n\n${generateStdioBody(language)}`,
    language,
    mode: "stdio"
  };
}

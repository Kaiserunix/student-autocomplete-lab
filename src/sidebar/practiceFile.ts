import type { ProblemPlatform, ProblemRecord } from "../problemBank/types";

export type PracticeLanguage = "python" | "c" | "cpp" | "rust";

export interface PracticeLanguageOption {
  id: PracticeLanguage;
  label: string;
  extension: string;
}

export const practiceLanguageOptions: PracticeLanguageOption[] = [
  { id: "python", label: "Python", extension: "py" },
  { id: "c", label: "C", extension: "c" },
  { id: "cpp", label: "C++", extension: "cpp" },
  { id: "rust", label: "Rust", extension: "rs" }
];

type PracticeProblem = Pick<ProblemRecord, "platform" | "id">;

export function buildPracticeFileRelativePath(
  problem: PracticeProblem,
  language: PracticeLanguage
): string {
  const extension = optionForLanguage(language).extension;
  return `practice/${safePlatform(problem.platform)}/${safeFileToken(problem.id)}.${extension}`;
}

export function buildPracticeFileContent(problem: PracticeProblem, language: PracticeLanguage): string {
  const header = practiceHeader(language);

  if (language === "python") {
    return `${header}
# ===== 学生代码开始 =====
import sys

input = sys.stdin.readline


def solve():
    pass


if __name__ == "__main__":
    solve()
# ===== 学生代码结束 =====
`;
  }

  if (language === "c") {
    return `${header}
// ===== 学生代码开始 =====
#include <stdio.h>

int main(void) {
    return 0;
}
// ===== 学生代码结束 =====
`;
  }

  if (language === "cpp") {
    return `${header}
// ===== 学生代码开始 =====
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
// ===== 学生代码结束 =====
`;
  }

  return `${header}
// ===== 学生代码开始 =====
use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
}
// ===== 学生代码结束 =====
`;
}

function practiceHeader(language: PracticeLanguage): string {
  const comment = language === "python" ? "#" : "//";
  return [
    `${comment} 提醒：题面在插件侧栏查看；自动补全只读取学生代码区。`
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function optionForLanguage(language: PracticeLanguage): PracticeLanguageOption {
  return practiceLanguageOptions.find((option) => option.id === language) ?? practiceLanguageOptions[0];
}

function safePlatform(platform: ProblemPlatform): string {
  return platform.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "manual";
}

function safeFileToken(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "_").replace(/^_+|_+$/g, "") || "problem";
}

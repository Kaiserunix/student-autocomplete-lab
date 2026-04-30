import type { OjVerdict } from "./types";

const allowedOjStatuses = new Set<OjVerdict["status"]>(["AC", "WA", "RE", "TLE", "MLE", "UNKNOWN"]);

export function normalizeScoreOjVerdict(value: OjVerdict | undefined): OjVerdict {
  if (value?.status && allowedOjStatuses.has(value.status)) {
    return {
      ...value,
      status: value.status
    };
  }

  return { status: "UNKNOWN" };
}

export function hasSubstantiveStudentCode(studentCode: string): boolean {
  const meaningfulLines = studentCode
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("#"))
    .filter((line) => !line.startsWith("//"))
    .filter((line) => !/^import\s+\w+/.test(line))
    .filter((line) => !/^from\s+\w+/.test(line))
    .filter((line) => !/^#include\b/.test(line))
    .filter((line) => !/^using\s+namespace\b/.test(line))
    .filter((line) => !/^input\s*=\s*sys\.stdin\.readline$/.test(line))
    .filter((line) => !/^def\s+solve\s*\(.*\)\s*:/.test(line))
    .filter((line) => !/^if\s+__name__\s*==\s*["']__main__["']\s*:/.test(line))
    .filter((line) => !/^solve\s*\(\s*\)$/.test(line))
    .filter((line) => !/^(int\s+)?main\s*\(.*\)\s*\{?$/.test(line))
    .filter((line) => line !== "{" && line !== "}")
    .filter((line) => line !== "pass")
    .filter((line) => line !== "return 0;");

  return meaningfulLines.length > 0;
}

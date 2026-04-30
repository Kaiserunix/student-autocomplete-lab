import { ChatCompletionProviderConfig, requestChatCompletionText } from "../models/chatCompletionsClient";
import type { TeachingProblemContext, TeachingStudentProfileSummary } from "./types";

export type SubmissionJudgeVerdict = "likely_ac" | "likely_wa" | "likely_re" | "likely_tle" | "needs_run";
export type SubmissionJudgeSeverity = "low" | "medium" | "high";

export interface SubmissionJudgeIssue {
  label: string;
  severity: SubmissionJudgeSeverity;
  evidence: string;
  fixHint: string;
}

export interface SubmissionJudgeTestSuggestion {
  input: string;
  expectedBehavior: string;
  reason: string;
}

export interface SubmissionJudgeContext {
  problem: TeachingProblemContext;
  language: string;
  studentCode: string;
  studentProfile: TeachingStudentProfileSummary;
}

export interface SubmissionJudgeReport {
  verdict: SubmissionJudgeVerdict;
  confidence: number;
  summary: string;
  issues: SubmissionJudgeIssue[];
  testSuggestions: SubmissionJudgeTestSuggestion[];
  nextAction: string;
}

interface RawSubmissionJudgeReport {
  verdict?: unknown;
  confidence?: unknown;
  summary?: unknown;
  issues?: unknown;
  test_suggestions?: unknown;
  next_action?: unknown;
}

const verdicts = new Set<SubmissionJudgeVerdict>(["likely_ac", "likely_wa", "likely_re", "likely_tle", "needs_run"]);
const severities = new Set<SubmissionJudgeSeverity>(["low", "medium", "high"]);

export async function requestMimoSubmissionJudge(
  config: ChatCompletionProviderConfig,
  context: SubmissionJudgeContext,
  fetchImpl: typeof fetch = fetch
): Promise<SubmissionJudgeReport> {
  const text = await requestChatCompletionText(
    config,
    {
      messages: [
        {
          role: "system",
          content:
            "You are MiMo, a conservative programming-contest submission reviewer. Return one valid JSON object only. Do not include markdown. Use Simplified Chinese for all JSON string values."
        },
        {
          role: "user",
          content: buildSubmissionJudgePrompt(context)
        }
      ],
      maxTokens: 800,
      temperature: 0.1,
      responseFormat: { type: "json_object" }
    },
    fetchImpl
  );

  try {
    return parseSubmissionJudgeReport(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const preview = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`MiMo submission judge returned invalid JSON: ${message}. Preview: ${preview || "<empty>"}`);
  }
}

export function parseSubmissionJudgeReport(text: string): SubmissionJudgeReport {
  const raw = JSON.parse(extractJson(text)) as RawSubmissionJudgeReport;
  const verdict = requireVerdict(raw.verdict);

  return {
    verdict,
    confidence: clamp01(requireNumber(raw.confidence, "confidence")),
    summary: requireString(raw.summary, "summary"),
    issues: requireArray(raw.issues, "issues").map(parseIssue),
    testSuggestions: requireArray(raw.test_suggestions, "test_suggestions").map(parseTestSuggestion),
    nextAction: requireString(raw.next_action, "next_action")
  };
}

function buildSubmissionJudgePrompt(context: SubmissionJudgeContext): string {
  return [
    "你正在做“交题前 AI 自检”。不要假装真的提交到了 OJ；只能基于题面摘要、学生代码和学生历史痛点做保守判断。",
    "所有 JSON 字符串值使用简体中文。",
    "",
    "Required JSON shape:",
    "{",
    '  "verdict": "likely_ac | likely_wa | likely_re | likely_tle | needs_run",',
    '  "confidence": 0.0,',
    '  "summary": "一句话结论",',
    '  "issues": [{"label": "stable_label", "severity": "low | medium | high", "evidence": "代码证据", "fix_hint": "不泄露完整答案的修正提示"}],',
    '  "test_suggestions": [{"input": "small input", "expected_behavior": "expected behavior, not necessarily exact full output", "reason": "why this test matters"}],',
    '  "next_action": "学生下一步该做什么"',
    "}",
    "",
    "Rules:",
    "- 如果无法可靠证明 AC，优先使用 needs_run 或 likely_wa，而不是 likely_ac。",
    "- 不要输出完整标准答案或完整可提交代码。",
    "- issues 最多 3 条，test_suggestions 最多 2 条。",
    "- 重点检查：输入解析、边界、输出格式、复杂度、数组越界、递归出口。",
    "",
    "problem:",
    JSON.stringify(context.problem, null, 2),
    "",
    "student_code:",
    context.studentCode,
    "",
    "student_profile:",
    JSON.stringify(context.studentProfile, null, 2)
  ].join("\n");
}

function parseIssue(value: unknown): SubmissionJudgeIssue {
  const record = requireRecord(value, "issues[]");
  return {
    label: requireString(record.label, "issues[].label"),
    severity: requireSeverity(record.severity),
    evidence: requireString(record.evidence, "issues[].evidence"),
    fixHint: requireString(record.fix_hint, "issues[].fix_hint")
  };
}

function parseTestSuggestion(value: unknown): SubmissionJudgeTestSuggestion {
  const record = requireRecord(value, "test_suggestions[]");
  return {
    input: requireString(record.input, "test_suggestions[].input"),
    expectedBehavior: requireString(record.expected_behavior, "test_suggestions[].expected_behavior"),
    reason: requireString(record.reason, "test_suggestions[].reason")
  };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function requireVerdict(value: unknown): SubmissionJudgeVerdict {
  if (typeof value === "string" && verdicts.has(value as SubmissionJudgeVerdict)) {
    return value as SubmissionJudgeVerdict;
  }

  throw new Error("verdict must be a known submission judge verdict.");
}

function requireSeverity(value: unknown): SubmissionJudgeSeverity {
  if (typeof value === "string" && severities.has(value as SubmissionJudgeSeverity)) {
    return value as SubmissionJudgeSeverity;
  }

  throw new Error("severity must be low, medium, or high.");
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }

  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }

  return value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

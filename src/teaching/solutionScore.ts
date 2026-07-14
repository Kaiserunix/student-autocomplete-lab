import { ChatCompletionProviderConfig, requestChatCompletionText } from "../models/chatCompletionsClient";
import { normalizePainPointLabel } from "./teachingTaxonomy";
import type { TeachingPainPoint, TeachingRecommendation } from "./teachingReport";
import type { OjVerdict, TeachingProblemContext, TeachingStudentProfileSummary } from "./types";

export type ComplexityVerdict = "matched" | "acceptable_bruteforce" | "complexity_gap" | "unknown";

export interface SolutionScoreRubric {
  correctness: number;
  complexityMatch: number;
  ideaGrowth: number;
  codeQuality: number;
  independence: number;
}

export interface ComplexityAssessment {
  observed: string;
  expected: string;
  verdict: ComplexityVerdict;
  reason: string;
}

export interface SolutionAttemptStats {
  hintCount: number;
  gaveUp: boolean;
  revealedAnswer: boolean;
}

export interface SolutionScoreContext {
  problem: TeachingProblemContext;
  language: string;
  studentCode: string;
  studentProfile: TeachingStudentProfileSummary;
  ojVerdict: OjVerdict;
  attemptStats: SolutionAttemptStats;
  studentRequest?: string;
}

export interface SolutionScoreReport {
  ojResult: OjVerdict["status"];
  learningScore: number;
  rubric: SolutionScoreRubric;
  complexityAssessment: ComplexityAssessment;
  painPoints: TeachingPainPoint[];
  summary: string;
  nextAction: string;
  recommendation?: TeachingRecommendation;
}

interface RawSolutionScoreReport {
  oj_result?: unknown;
  learning_score?: unknown;
  rubric?: unknown;
  complexity_assessment?: unknown;
  pain_points?: unknown;
  summary?: unknown;
  next_action?: unknown;
  recommendation?: unknown;
}

const ojStatuses = new Set<OjVerdict["status"]>(["AC", "WA", "RE", "TLE", "MLE", "UNKNOWN"]);
const complexityVerdicts = new Set<ComplexityVerdict>([
  "matched",
  "acceptable_bruteforce",
  "complexity_gap",
  "unknown"
]);

export async function requestMimoSolutionScore(
  config: ChatCompletionProviderConfig,
  context: SolutionScoreContext,
  fetchImpl: typeof fetch = fetch
): Promise<SolutionScoreReport> {
  const text = await requestChatCompletionText(
    config,
    {
      messages: [
        {
          role: "system",
          content:
            "你是一个算法学习评分教练。只返回一个合法 JSON 对象，不要 markdown。所有 JSON 字符串值使用简体中文。"
        },
        {
          role: "user",
          content: buildSolutionScorePrompt(context)
        }
      ],
      maxTokens: 1200,
      temperature: 0.1,
      responseFormat: { type: "json_object" }
    },
    fetchImpl
  );

  try {
    return parseSolutionScoreReport(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const preview = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`AI solution score returned invalid JSON: ${message}. Preview: ${preview || "<empty>"}`);
  }
}

export function parseSolutionScoreReport(text: string): SolutionScoreReport {
  const raw = JSON.parse(extractJson(text)) as RawSolutionScoreReport;
  return {
    ojResult: parseOjStatus(raw.oj_result),
    learningScore: clamp100(requireNumber(raw.learning_score, "learning_score")),
    rubric: parseRubric(raw.rubric),
    complexityAssessment: parseComplexityAssessment(raw.complexity_assessment),
    painPoints: requireArray(raw.pain_points, "pain_points").map(parsePainPoint),
    summary: requireString(raw.summary, "summary"),
    nextAction: requireString(raw.next_action, "next_action"),
    recommendation: parseRecommendation(raw.recommendation)
  };
}

function buildSolutionScorePrompt(context: SolutionScoreContext): string {
  return [
    "你正在做 AC 后的“教学评分”，请把 OJ 结果和学习评分分开。",
    "核心问题：这次 AC 证明了什么？还没证明什么？",
    "",
    "Required JSON shape:",
    "{",
    '  "oj_result": "AC | WA | RE | TLE | MLE | UNKNOWN",',
    '  "learning_score": 0,',
    '  "rubric": {"correctness": 0, "complexity_match": 0, "idea_growth": 0, "code_quality": 0, "independence": 0},',
    '  "complexity_assessment": {"observed": "学生解法复杂度", "expected": "题目预期复杂度", "verdict": "matched | acceptable_bruteforce | complexity_gap | unknown", "reason": "为什么"},',
    '  "pain_points": [{"label": "stable_label", "confidence": 0.0, "evidence": "证据"}],',
    '  "summary": "一句话教学结论",',
    '  "next_action": "下一步学习动作",',
    '  "recommendation": {"problem_id": "optional next problem id", "reason": "为什么推荐"}',
    "}",
    "",
    "Rubric:",
    "- 正确性：是否确实 AC，或自检是否可信。",
    "- 复杂度匹配：是否接近题目预期算法。",
    "- 思路成长：有没有从暴力走向更通用模型。",
    "- 代码质量：输入输出、边界、命名、语言规范。",
    "- 独立性：提示次数少、没有看答案，分更高。",
    "- 暴力 AC 且数据本来允许暴力，可以给 acceptable_bruteforce 和 75-85。",
    "- 暴力 AC 但题目核心是学习优化，标记 complexity_gap 或 bruteforce_no_growth。",
    "- 非 AC 但思路接近，也允许给过程分。",
    "- oj_result 必须复述输入 oj_verdict.status；如果输入是 UNKNOWN，不要写 AC。",
    "- 如果代码明显还是模板、空函数或 pass，学习评分应很低，并指出无法证明 AC。",
    "",
    "student_request:",
    context.studentRequest || "学生未额外输入问题。",
    "",
    "attemptStats:",
    JSON.stringify(context.attemptStats, null, 2),
    "",
    "problem:",
    JSON.stringify(context.problem, null, 2),
    "",
    "student_code:",
    context.studentCode,
    "",
    "oj_verdict:",
    JSON.stringify(context.ojVerdict, null, 2),
    "",
    "student_profile:",
    JSON.stringify(context.studentProfile, null, 2)
  ].join("\n");
}

function parseRubric(value: unknown): SolutionScoreRubric {
  const record = requireRecord(value, "rubric");
  return {
    correctness: clamp100(requireNumber(record.correctness, "rubric.correctness")),
    complexityMatch: clamp100(requireNumber(record.complexity_match, "rubric.complexity_match")),
    ideaGrowth: clamp100(requireNumber(record.idea_growth, "rubric.idea_growth")),
    codeQuality: clamp100(requireNumber(record.code_quality, "rubric.code_quality")),
    independence: clamp100(requireNumber(record.independence, "rubric.independence"))
  };
}

function parseComplexityAssessment(value: unknown): ComplexityAssessment {
  const record = requireRecord(value, "complexity_assessment");
  const verdict = requireString(record.verdict, "complexity_assessment.verdict");
  return {
    observed: requireString(record.observed, "complexity_assessment.observed"),
    expected: requireString(record.expected, "complexity_assessment.expected"),
    verdict: complexityVerdicts.has(verdict as ComplexityVerdict) ? (verdict as ComplexityVerdict) : "unknown",
    reason: requireString(record.reason, "complexity_assessment.reason")
  };
}

function parsePainPoint(value: unknown): TeachingPainPoint {
  const record = requireRecord(value, "pain_points[]");
  return {
    label: normalizePainPointLabel(requireString(record.label, "pain_points[].label")),
    confidence: clamp01(requireNumber(record.confidence, "pain_points[].confidence")),
    evidence: requireString(record.evidence, "pain_points[].evidence")
  };
}

function parseRecommendation(value: unknown): TeachingRecommendation | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const problemId = optionalNonEmptyString(record.problem_id) ?? optionalNonEmptyString(record.problemId);
  if (!problemId) {
    return undefined;
  }

  return {
    problemId,
    reason: optionalNonEmptyString(record.reason) ?? optionalNonEmptyString(record.rationale) ?? "模型未给出推荐理由。"
  };
}

function optionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseOjStatus(value: unknown): OjVerdict["status"] {
  if (typeof value === "string" && ojStatuses.has(value as OjVerdict["status"])) {
    return value as OjVerdict["status"];
  }

  return "UNKNOWN";
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
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

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

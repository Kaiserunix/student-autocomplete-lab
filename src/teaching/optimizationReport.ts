import {
  ChatCompletionProviderConfig,
  type ChatCompletionUsageSink,
  requestChatCompletionText
} from "../models/chatCompletionsClient";
import type { TeachingProblemContext, TeachingStudentProfileSummary } from "./types";

export type OptimizationVerdict = "optimize" | "no_need";
export type OptimizationCodeQualityVerdict = "ok" | "needs_cleanup";

export interface OptimizationDimension {
  current: string;
  target: string;
  action: string;
}

export interface OptimizationCodeQuality {
  verdict: OptimizationCodeQualityVerdict;
  action: string;
}

export interface OptimizationReportContext {
  problem: TeachingProblemContext;
  language: string;
  studentCode: string;
  archivedReason: string;
  previousScoreSummary?: string;
  studentProfile: TeachingStudentProfileSummary;
  studentRequest?: string;
}

export interface OptimizationReport {
  verdict: OptimizationVerdict;
  optimizationNeeded: boolean;
  summary: string;
  timeComplexity: OptimizationDimension;
  memory: OptimizationDimension;
  codeQuality: OptimizationCodeQuality;
  nextStep: string;
}

interface RawOptimizationReport {
  verdict?: unknown;
  summary?: unknown;
  time_complexity?: unknown;
  timeComplexity?: unknown;
  memory?: unknown;
  code_quality?: unknown;
  codeQuality?: unknown;
  next_step?: unknown;
  nextStep?: unknown;
}

export async function requestMimoOptimizationReport(
  config: ChatCompletionProviderConfig,
  context: OptimizationReportContext,
  fetchImpl: typeof fetch = fetch,
  onUsage?: ChatCompletionUsageSink
): Promise<OptimizationReport> {
  const text = await requestChatCompletionText(
    config,
    {
      messages: [
        {
          role: "system",
          content:
            "你是 MiMo，一个克制的算法优化复盘教练。只返回一个合法 JSON 对象，不要 markdown。所有 JSON 字符串值使用简体中文。"
        },
        {
          role: "user",
          content: buildOptimizationReportPrompt(context)
        }
      ],
      maxTokens: 1000,
      temperature: 0.1,
      responseFormat: { type: "json_object" },
      onUsage
    },
    fetchImpl
  );

  try {
    return parseOptimizationReport(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const preview = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`MiMo optimization report returned invalid JSON: ${message}. Preview: ${preview || "<empty>"}`);
  }
}

export function parseOptimizationReport(text: string): OptimizationReport {
  const raw = JSON.parse(extractJson(text)) as RawOptimizationReport;
  const verdict = parseVerdict(raw.verdict);

  return {
    verdict,
    optimizationNeeded: verdict === "optimize",
    summary: requireString(raw.summary, "summary"),
    timeComplexity: parseDimension(raw.time_complexity ?? raw.timeComplexity, "time_complexity"),
    memory: parseDimension(raw.memory, "memory"),
    codeQuality: parseCodeQuality(raw.code_quality ?? raw.codeQuality),
    nextStep: requireString(raw.next_step ?? raw.nextStep, "next_step")
  };
}

function buildOptimizationReportPrompt(context: OptimizationReportContext): string {
  return [
    "你正在处理“已归档题目”的第二层优化复盘，不是普通提示，也不是重新判 AC。",
    "目标：判断这题完成后是否值得继续优化算法、优化内存、改进复杂度表达或清理代码。",
    "如果题目很简单、当前解法已经匹配训练目标，必须允许 verdict=no_need，并明确说无需优化。",
    "不要为了显得高级而强行推荐复杂数据结构；少就是多。",
    "",
    "Required JSON shape:",
    "{",
    '  "verdict": "optimize | no_need",',
    '  "summary": "一句话结论：这题是否值得继续优化",',
    '  "time_complexity": {"current": "当前时间复杂度", "target": "目标时间复杂度", "action": "要做什么，或无需优化"},',
    '  "memory": {"current": "当前空间复杂度", "target": "目标空间复杂度", "action": "要做什么，或无需优化"},',
    '  "code_quality": {"verdict": "ok | needs_cleanup", "action": "规范、边界、命名或结构建议"},',
    '  "next_step": "下一步：继续下一题、做微优化、或进入同类更难题"',
    "}",
    "",
    "Rules:",
    "- 重点看时间复杂度、内存、Big-O 表达和代码质量。",
    "- 简单题允许“无需优化”，并建议继续下一题。",
    "- 如果学生代码是暴力但本题数据与训练目标允许暴力，可以 no_need 或只做轻微代码质量建议。",
    "- 如果暴力 AC 掩盖了算法学习目标，verdict=optimize，并指出最小优化方向。",
    "- 对平衡树、排名、第 k 小、前驱、后继、动态集合、操作数较大的题，必须评估单次操作复杂度。",
    "- Python list + bisect 的查询可能是 O(log n)，但插入和删除仍是 O(n)；如果题目预期平衡树、树状数组、线段树或 O(log n) 更新，不要判 no_need。",
    "- 不输出完整重写代码，除非学生要求也只给局部方向。",
    "",
    "student_request:",
    context.studentRequest || "学生未额外输入优化问题。",
    "",
    "archived_reason:",
    context.archivedReason,
    "",
    "previous_score_summary:",
    context.previousScoreSummary || "没有学习评分记录。",
    "",
    "problem:",
    JSON.stringify(context.problem, null, 2),
    "",
    "language:",
    context.language,
    "",
    "student_code:",
    context.studentCode,
    "",
    "student_profile:",
    JSON.stringify(context.studentProfile, null, 2)
  ].join("\n");
}

function parseVerdict(value: unknown): OptimizationVerdict {
  return value === "optimize" ? "optimize" : "no_need";
}

function parseDimension(value: unknown, field: string): OptimizationDimension {
  const record = requireRecord(value, field);
  return {
    current: requireString(record.current, `${field}.current`),
    target: requireString(record.target, `${field}.target`),
    action: requireString(record.action, `${field}.action`)
  };
}

function parseCodeQuality(value: unknown): OptimizationCodeQuality {
  const record = requireRecord(value, "code_quality");
  return {
    verdict: record.verdict === "needs_cleanup" ? "needs_cleanup" : "ok",
    action: requireString(record.action, "code_quality.action")
  };
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

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value;
}

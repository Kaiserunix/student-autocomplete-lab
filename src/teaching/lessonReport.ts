import { ChatCompletionProviderConfig, requestChatCompletionText } from "../models/chatCompletionsClient";
import { normalizePainPointLabel } from "./teachingTaxonomy";
import type { TeachingPainPoint, TeachingRecommendation } from "./teachingReport";
import type { TeachingProblemContext, TeachingStudentProfileSummary } from "./types";

export type LessonArchiveReason = "abandoned" | "revealed";
export type RemedialExerciseType = "problem" | "micro_drill";

export interface ReferenceSolution {
  language: string;
  code: string;
}

export interface RemedialExercise {
  type: RemedialExerciseType;
  problemId?: string;
  title: string;
  prompt: string;
  reason: string;
}

export interface LessonReportContext {
  problem: TeachingProblemContext;
  language: string;
  studentCode: string;
  studentProfile: TeachingStudentProfileSummary;
  studentRequest?: string;
  hintCount: number;
}

export interface LessonReport {
  standardApproach: string;
  painPoints: TeachingPainPoint[];
  minimalFixPath: string[];
  referenceSolution?: ReferenceSolution;
  remedialExercise: RemedialExercise;
  archiveReason: LessonArchiveReason;
}

interface RawLessonReport {
  standard_approach?: unknown;
  pain_points?: unknown;
  minimal_fix_path?: unknown;
  reference_solution?: unknown;
  remedial_exercise?: unknown;
  archive_reason?: unknown;
}

export async function requestMimoLessonReport(
  config: ChatCompletionProviderConfig,
  context: LessonReportContext,
  fetchImpl: typeof fetch = fetch
): Promise<LessonReport> {
  const text = await requestChatCompletionText(
    config,
    {
      messages: [
        {
          role: "system",
          content:
            "你是 MiMo，一个克制的算法教练。只返回一个合法 JSON 对象，不要 markdown。所有 JSON 字符串值使用简体中文。"
        },
        {
          role: "user",
          content: buildLessonReportPrompt(context)
        }
      ],
      maxTokens: 1400,
      temperature: 0.2,
      responseFormat: { type: "json_object" }
    },
    fetchImpl
  );

  try {
    return parseLessonReport(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const preview = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`MiMo lesson report returned invalid JSON: ${message}. Preview: ${preview || "<empty>"}`);
  }
}

export function parseLessonReport(text: string): LessonReport {
  const raw = JSON.parse(extractJson(text)) as RawLessonReport;
  const painPoints = requireArray(raw.pain_points, "pain_points").map(parsePainPoint);

  if (painPoints.length === 0) {
    throw new Error("lesson report must include at least one pain point.");
  }

  return {
    standardApproach: requireString(raw.standard_approach, "standard_approach"),
    painPoints,
    minimalFixPath: requireArray(raw.minimal_fix_path, "minimal_fix_path").map((item) =>
      requireString(item, "minimal_fix_path[]")
    ),
    referenceSolution: parseReferenceSolution(raw.reference_solution),
    remedialExercise: parseRemedialExercise(raw.remedial_exercise),
    archiveReason: raw.archive_reason === "revealed" ? "revealed" : "abandoned"
  };
}

function buildLessonReportPrompt(context: LessonReportContext): string {
  return [
    "你正在进入“讲解/补救阶段”，它不同于普通提示。",
    "目标：学生已经点击“我放弃了”，你要帮助他恢复学习闭环，而不是只丢答案。",
    "",
    "Required JSON shape:",
    "{",
    '  "standard_approach": "题目的正确解法轮廓，不超过 4 句",',
    '  "pain_points": [{"label": "stable_label", "confidence": 0.0, "evidence": "只指出学生代码最关键的证据"}],',
    '  "minimal_fix_path": ["先改哪一小块", "再验证什么"],',
    '  "reference_solution": {"language": "python | cpp | c | rust | other", "code": "参考实现，允许折叠显示"},',
    '  "remedial_exercise": {"type": "problem | micro_drill", "problem_id": "optional", "title": "标题", "prompt": "3 分钟补救练习或题目说明", "reason": "为什么补这个"},',
    '  "archive_reason": "abandoned | revealed"',
    "}",
    "",
    "Rules:",
    "- pain_points 只给 1 或 2 个，不要铺开批评。",
    "- minimal_fix_path 只给小步，不替学生重写完整代码。",
    "- reference_solution 可以给，但 UI 会折叠；不要让它成为正文第一屏。",
    "- 补救练习优先选择微练；如果确实有更合适题目，再给 problem_id。",
    "- 所有 JSON 字符串值使用简体中文。",
    "",
    "student_request:",
    context.studentRequest || "学生未额外输入问题。",
    "",
    "hint_count:",
    String(context.hintCount),
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

function parsePainPoint(value: unknown): TeachingPainPoint {
  const record = requireRecord(value, "pain_points[]");
  return {
    label: normalizePainPointLabel(requireString(record.label, "pain_points[].label")),
    confidence: clamp01(requireNumber(record.confidence, "pain_points[].confidence")),
    evidence: requireString(record.evidence, "pain_points[].evidence")
  };
}

function parseReferenceSolution(value: unknown): ReferenceSolution | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const record = requireRecord(value, "reference_solution");
  return {
    language: requireString(record.language, "reference_solution.language"),
    code: requireString(record.code, "reference_solution.code")
  };
}

function parseRemedialExercise(value: unknown): RemedialExercise {
  const record = requireRecord(value, "remedial_exercise");
  const type = record.type === "problem" ? "problem" : "micro_drill";
  const problemId = typeof record.problem_id === "string" && record.problem_id.trim() ? record.problem_id.trim() : undefined;

  return {
    type,
    problemId,
    title: requireString(record.title, "remedial_exercise.title"),
    prompt: requireString(record.prompt, "remedial_exercise.prompt"),
    reason: requireString(record.reason, "remedial_exercise.reason")
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

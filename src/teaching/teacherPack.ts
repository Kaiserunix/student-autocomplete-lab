import type { ProblemPlatform, ProblemRecord } from "../problemBank/types";
import {
  ChatCompletionProviderConfig,
  type ChatCompletionUsageSink,
  requestChatCompletionText
} from "../models/chatCompletionsClient";
import { readJsonlRecords, writeJsonlRecords } from "../storage/jsonlStore";
import type {
  TeacherPackBruteForce,
  TeacherPackCounterexample,
  TeacherPackPitfall,
  TeacherPackReference
} from "./types";

export interface TeacherPackRecord extends TeacherPackReference {
  problemKey: string;
  platform: ProblemPlatform;
  id: string;
  title: string;
  sourceUrl?: string;
  tags: string[];
  generatedAt: string;
  model: string;
}

interface RawTeacherPack {
  summary?: unknown;
  constraints?: unknown;
  standard_approach?: unknown;
  standardApproach?: unknown;
  expected_algorithm?: unknown;
  expectedAlgorithm?: unknown;
  expected_complexity?: unknown;
  expectedComplexity?: unknown;
  key_invariants?: unknown;
  keyInvariants?: unknown;
  common_pitfalls?: unknown;
  commonPitfalls?: unknown;
  minimal_counterexamples?: unknown;
  minimalCounterexamples?: unknown;
  brute_force?: unknown;
  bruteForce?: unknown;
}

const PROMPT_LIMIT = 9000;

export function teacherPackKey(platform: ProblemPlatform, id: string): string {
  return `${platform}:${id}`;
}

export function buildTeacherPackPrompt(problem: ProblemRecord): string {
  return [
    "You are building a hidden Teacher Pack for an algorithm-study VS Code extension.",
    "This pack is an internal reference for future diagnosis. It is not shown to the student by default.",
    "Return one valid JSON object only. Do not include markdown.",
    "",
    "Required JSON shape:",
    "{",
    '  "summary": "题目摘要",',
    '  "constraints": "约束和数据规模判断",',
    '  "standard_approach": "标准思路，不写完整代码",',
    '  "expected_algorithm": "预期算法或模型",',
    '  "expected_complexity": {"time": "O(...)", "space": "O(...)"},',
    '  "key_invariants": ["关键不变量"],',
    '  "common_pitfalls": [{"label": "stable_pain_point", "description": "常见错因"}],',
    '  "minimal_counterexamples": [{"input": "最小输入", "expected_output": "期望输出", "reason": "能打中什么错因"}],',
    '  "brute_force": {"suitable": true, "acceptable_complexity": "O(...)", "reason": "是否适合暴力"}',
    "}",
    "",
    "Rules:",
    "- Use Simplified Chinese for every string value.",
    "- Do not write a full accepted implementation.",
    "- Focus on the expected algorithm model, invariants, common wrong ideas, and tiny counterexamples.",
    "- If brute force is the intended learning path, say so. If brute force AC would hide the intended algorithm, say that clearly.",
    "- Keep minimal_counterexamples small enough for an AI/local checker to reason about later.",
    "",
    "problem:",
    clip(
      JSON.stringify(
        {
          platform: problem.platform,
          id: problem.id,
          title: problem.title,
          sourceUrl: problem.sourceUrl,
          difficulty: problem.difficulty,
          tags: problem.tags,
          statement: problem.statement,
          inputFormat: problem.inputFormat,
          outputFormat: problem.outputFormat,
          samples: problem.samples.map((sample, index) => ({
            title: `样例输入 ${index + 1}`,
            input: sample.input,
            outputTitle: `样例输出 ${index + 1}`,
            output: sample.output
          })),
          hint: problem.hint
        },
        null,
        2
      ),
      PROMPT_LIMIT
    )
  ].join("\n");
}

export async function requestMimoTeacherPack(
  config: ChatCompletionProviderConfig,
  problem: ProblemRecord,
  fetchImpl: typeof fetch = fetch,
  onUsage?: ChatCompletionUsageSink,
  generatedAt = new Date().toISOString()
): Promise<TeacherPackRecord> {
  const text = await requestChatCompletionText(
    config,
    {
      messages: [
        {
          role: "system",
          content:
            "You are MiMo, a precise algorithm teacher. Return one valid JSON object only. Do not include markdown. Use Simplified Chinese for JSON string values."
        },
        {
          role: "user",
          content: buildTeacherPackPrompt(problem)
        }
      ],
      maxTokens: 1300,
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      onUsage
    },
    fetchImpl
  );

  try {
    return parseTeacherPack(text, problem, config.model, generatedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const preview = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`MiMo teacher pack returned invalid JSON: ${message}. Preview: ${preview || "<empty>"}`);
  }
}

export function toTeacherPackReference(pack: TeacherPackRecord): TeacherPackReference {
  return {
    summary: pack.summary,
    constraints: pack.constraints,
    standardApproach: pack.standardApproach,
    expectedAlgorithm: pack.expectedAlgorithm,
    expectedComplexity: pack.expectedComplexity,
    keyInvariants: pack.keyInvariants,
    commonPitfalls: pack.commonPitfalls,
    minimalCounterexamples: pack.minimalCounterexamples,
    bruteForce: pack.bruteForce
  };
}

export async function findTeacherPack(
  storagePath: string,
  platform: ProblemPlatform,
  id: string
): Promise<TeacherPackRecord | undefined> {
  const key = teacherPackKey(platform, id);
  const records = await readJsonlRecords<TeacherPackRecord>(storagePath);
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].problemKey === key) {
      return records[index];
    }
  }

  return undefined;
}

export async function upsertTeacherPack(storagePath: string, pack: TeacherPackRecord): Promise<void> {
  const records = await readJsonlRecords<TeacherPackRecord>(storagePath);
  const nextByKey = new Map<string, TeacherPackRecord>();

  for (const record of records) {
    nextByKey.set(record.problemKey, record);
  }

  nextByKey.set(pack.problemKey, pack);
  await writeJsonlRecords(storagePath, [...nextByKey.values()]);
}

export function parseTeacherPack(
  text: string,
  problem: ProblemRecord,
  model: string,
  generatedAt = new Date().toISOString()
): TeacherPackRecord {
  const raw = JSON.parse(extractJson(text)) as RawTeacherPack;
  const expectedComplexity = requireRecord(
    raw.expected_complexity ?? raw.expectedComplexity,
    "expected_complexity"
  );

  return {
    problemKey: teacherPackKey(problem.platform, problem.id),
    platform: problem.platform,
    id: problem.id,
    title: problem.title,
    sourceUrl: problem.sourceUrl,
    tags: problem.tags,
    generatedAt,
    model,
    summary: requireString(raw.summary, "summary"),
    constraints: requireString(raw.constraints, "constraints"),
    standardApproach: requireString(raw.standard_approach ?? raw.standardApproach, "standard_approach"),
    expectedAlgorithm: requireString(raw.expected_algorithm ?? raw.expectedAlgorithm, "expected_algorithm"),
    expectedComplexity: {
      time: requireString(expectedComplexity.time, "expected_complexity.time"),
      space: requireString(expectedComplexity.space, "expected_complexity.space")
    },
    keyInvariants: requireArray(raw.key_invariants ?? raw.keyInvariants, "key_invariants").map((item) =>
      requireString(item, "key_invariants[]")
    ),
    commonPitfalls: requireArray(raw.common_pitfalls ?? raw.commonPitfalls, "common_pitfalls").map(parsePitfall),
    minimalCounterexamples: requireArray(
      raw.minimal_counterexamples ?? raw.minimalCounterexamples,
      "minimal_counterexamples"
    ).map(parseCounterexample),
    bruteForce: parseBruteForce(raw.brute_force ?? raw.bruteForce)
  };
}

function parsePitfall(value: unknown): TeacherPackPitfall {
  if (typeof value === "string") {
    return {
      label: "common_pitfall",
      description: value
    };
  }

  const record = requireRecord(value, "common_pitfalls[]");
  return {
    label: requireString(record.label, "common_pitfalls[].label"),
    description: requireString(record.description, "common_pitfalls[].description")
  };
}

function parseCounterexample(value: unknown): TeacherPackCounterexample {
  const record = requireRecord(value, "minimal_counterexamples[]");
  return {
    input: requireString(record.input, "minimal_counterexamples[].input"),
    expectedOutput: requireString(
      record.expected_output ?? record.expectedOutput,
      "minimal_counterexamples[].expected_output"
    ),
    reason: requireString(record.reason, "minimal_counterexamples[].reason")
  };
}

function parseBruteForce(value: unknown): TeacherPackBruteForce {
  const record = requireRecord(value, "brute_force");
  return {
    suitable: requireBoolean(record.suitable, "brute_force.suitable"),
    acceptableComplexity: optionalString(record.acceptable_complexity ?? record.acceptableComplexity),
    reason: requireString(record.reason, "brute_force.reason")
  };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Teacher Pack field ${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Teacher Pack field ${field} must be an array.`);
  }

  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Teacher Pack field ${field} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Teacher Pack field ${field} must be a boolean.`);
  }

  return value;
}

function clip(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n[clipped for prompt budget]`;
}

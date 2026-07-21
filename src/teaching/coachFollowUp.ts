import {
  ChatCompletionProviderConfig,
  type ChatCompletionUsageSink,
  requestChatCompletionText
} from "../models/chatCompletionsClient";
import { providerCapabilitiesFor } from "../models/providerCapabilities";
import { composeCoachSkillPlan } from "../skills/composeSkillPlan";
import { selectLearnerRules } from "../skills/habitSelector";
import { renderCoachSkillPlan } from "../skills/renderers/skillRenderer";
import type { ProviderCapabilities, SkillPlanAudit } from "../skills/types";
import { createEmptyStudentSkill, type StudentSkill } from "./studentSkill";
import type { TeacherPackReference, TeachingProblemContext, TeachingStudentProfileSummary } from "./types";

export interface CoachFollowUpContext {
  problem: TeachingProblemContext;
  teacherPack?: TeacherPackReference;
  language: string;
  studentCode: string;
  studentRequest: string;
  previousCoachTurn?: string;
  studentProfile: TeachingStudentProfileSummary;
  responseLanguage?: "zh-CN" | "en-US" | "raw";
}

export interface CoachFollowUpReport {
  answer: string;
  tinyExample?: string;
  nextAction?: string;
  boundary?: string;
}

export interface CoachFollowUpSkillOptions {
  studentSkill?: StudentSkill;
  capabilities?: ProviderCapabilities;
  onAudit?: (audit: SkillPlanAudit) => void;
}

interface RawCoachFollowUpReport {
  answer?: unknown;
  tiny_example?: unknown;
  tinyExample?: unknown;
  next_action?: unknown;
  nextAction?: unknown;
  boundary?: unknown;
}

export async function requestMimoCoachFollowUp(
  config: ChatCompletionProviderConfig,
  context: CoachFollowUpContext,
  fetchImpl: typeof fetch = fetch,
  onUsage?: ChatCompletionUsageSink
): Promise<CoachFollowUpReport> {
  return requestMimoCoachFollowUpWithSkills(
    config,
    context,
    {},
    fetchImpl,
    onUsage
  );
}

export async function requestMimoCoachFollowUpWithSkills(
  config: ChatCompletionProviderConfig,
  context: CoachFollowUpContext,
  options: CoachFollowUpSkillOptions,
  fetchImpl: typeof fetch = fetch,
  onUsage?: ChatCompletionUsageSink
): Promise<CoachFollowUpReport> {
  const skill = options.studentSkill ?? createEmptyStudentSkill("legacy-coach-follow-up");
  const learnerSelection = selectLearnerRules({
    skill,
    route: "coach",
    language: context.language,
    localCode: context.studentCode
  });
  const plan = composeCoachSkillPlan({
    language: context.language,
    action: "followUp",
    learnerSelection
  });
  const capabilities = options.capabilities ?? providerCapabilitiesFor({
    format: config.format ?? "openai-chat",
    baseUrl: "baseUrl" in config ? config.baseUrl : "codex://app-server"
  });
  const rendered = renderCoachSkillPlan(
    plan,
    capabilities,
    buildCoachFollowUpPrompt(context)
  );
  options.onAudit?.(rendered.audit);

  const text = await requestChatCompletionText(
    config,
    {
      messages: rendered.messages,
      maxTokens: 700,
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      onUsage
    },
    fetchImpl
  );

  return parseCoachFollowUpText(text);
}

function parseCoachFollowUpText(text: string): CoachFollowUpReport {
  try {
    return parseCoachFollowUpReport(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const preview = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`MiMo coach follow-up returned invalid JSON: ${message}. Preview: ${preview || "<empty>"}`);
  }
}

export function buildCoachFollowUpPrompt(context: CoachFollowUpContext): string {
  const outputLanguage =
    context.responseLanguage === "zh-CN"
      ? "Simplified Chinese for every JSON string value; keep JSON field names in English."
      : context.responseLanguage === "en-US"
        ? "English for every JSON string value; keep JSON field names in English."
      : "Use the language naturally implied by the student's request; keep JSON field names in English.";

  return [
    "You are answering a follow-up inside one existing algorithm coaching thread.",
    "Do not restart the whole diagnosis. The student already saw a hint and now needs attention to the exact sentence they asked.",
    "Do not provide full accepted code or the full standard answer.",
    "Return JSON only. Do not include markdown.",
    `Output language: ${outputLanguage}`,
    "",
    "Required JSON shape:",
    "{",
    '  "answer": "directly answer the latest student question first; 3 to 6 short sentences",',
    '  "tiny_example": "optional tiny example, trace, or analogy when it makes the answer easier",',
    '  "next_action": "one small action the student should do next",',
    '  "boundary": "optional note about what you are intentionally not revealing"',
    "}",
    "",
    "Rules:",
    "- Start answer by responding to the latest student_request, not by repeating the old diagnosis.",
    "- Casual chat is allowed when it stays inside this problem-solving session. If the student vents, jokes, or asks whether they are bad at algorithms, answer with brief encouragement and then offer one gentle next step.",
    "- Do not update Student Skill, do not infer a new long-term weakness, and do not force a diagnosis from casual or emotional text.",
    "- If the student says it is too hard, simplify vocabulary and explain one idea with a tiny concrete example.",
    "- If the student asks why, explain the reason before mentioning edits.",
    "- If the student asks how to change code, name the smallest code anchor, but do not write the whole solution.",
    "- Prefer one focused explanation over a checklist.",
    "- Keep next_action to exactly one small step.",
    "- If the previous coach turn conflicts with the current question, trust the current student_request.",
    "",
    "problem:",
    JSON.stringify(context.problem, null, 2),
    "",
    "hidden_teacher_pack_for_reference:",
    JSON.stringify(context.teacherPack ?? null, null, 2),
    "",
    "previous_coach_turn:",
    context.previousCoachTurn?.trim() || "none",
    "",
    "student_request:",
    context.studentRequest.trim(),
    "",
    "student_code:",
    context.studentCode,
    "",
    "student_profile:",
    JSON.stringify(context.studentProfile, null, 2),
    "",
    "language:",
    context.language
  ].join("\n");
}

export function parseCoachFollowUpReport(text: string): CoachFollowUpReport {
  const raw = JSON.parse(extractJson(text)) as RawCoachFollowUpReport;

  return {
    answer: requireString(raw.answer, "answer"),
    tinyExample: optionalString(raw.tiny_example ?? raw.tinyExample),
    nextAction: optionalString(raw.next_action ?? raw.nextAction),
    boundary: optionalString(raw.boundary)
  };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Coach follow-up field ${field} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

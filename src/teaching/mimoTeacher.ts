import {
  ChatCompletionProviderConfig,
  type ChatCompletionUsageSink,
  requestChatCompletionText
} from "../models/chatCompletionsClient";
import { parseTeachingDiagnosisReport, TeachingDiagnosisReport } from "./teachingReport";
import { buildTeachingDiagnosisPrompt } from "./teachingPrompt";
import { normalizeTeachingDiagnosisReport } from "./teachingTaxonomy";
import { TeachingDiagnosisContext } from "./types";

export async function requestMimoTeachingDiagnosis(
  config: ChatCompletionProviderConfig,
  context: TeachingDiagnosisContext,
  fetchImpl: typeof fetch = fetch,
  onUsage?: ChatCompletionUsageSink
): Promise<TeachingDiagnosisReport> {
  const text = await requestChatCompletionText(
    config,
    {
      messages: [
        {
          role: "system",
          content:
            "You are MiMo, a restrained algorithm teacher. Return one valid JSON object only. Do not include markdown. Follow the requested output language for all JSON string values."
        },
        {
          role: "user",
          content: buildTeachingDiagnosisPrompt(context)
        }
      ],
      maxTokens: 700,
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      onUsage
    },
    fetchImpl
  );

  try {
    return normalizeTeachingDiagnosisReport(parseTeachingDiagnosisReport(text), {
      currentProblemId: context.problem.id,
      problemSummary: context.problem.summary
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const preview = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`MiMo teaching diagnosis returned invalid JSON: ${message}. Preview: ${preview || "<empty>"}`);
  }
}

import { assertWithinBudget } from "./budget";
import { buildPracticeGenerationPrompt, PracticeGenerationPromptOptions } from "./practicePrompt";

export interface PracticeTrialOptions extends PracticeGenerationPromptOptions {
  model?: string;
  maxUsd?: number;
  estimatedOutputTokens?: number;
  spend?: boolean;
  apiKeyPresent?: boolean;
}

export interface PracticeTrialPlan {
  model: string;
  prompt: string;
  dryRun: boolean;
  allowedToSpend: boolean;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedUsd: number;
  maxUsd: number;
}

const DEFAULT_MODEL = "gpt-4.1-nano";
const DEFAULT_MAX_USD = 0.01;
const DEFAULT_OUTPUT_TOKENS = 1_600;

export function buildPracticeTrialPlan(options: PracticeTrialOptions): PracticeTrialPlan {
  const model = options.model ?? DEFAULT_MODEL;
  const maxUsd = options.maxUsd ?? DEFAULT_MAX_USD;
  const prompt = buildPracticeGenerationPrompt(options);
  const estimatedInputTokens = estimateTokens(prompt);
  const estimatedOutputTokens = options.estimatedOutputTokens ?? DEFAULT_OUTPUT_TOKENS;
  const estimatedUsd = assertWithinBudget({
    model,
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    maxUsd
  });
  const allowedToSpend = Boolean(options.spend && options.apiKeyPresent);

  return {
    model,
    prompt,
    dryRun: !allowedToSpend,
    allowedToSpend,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedUsd,
    maxUsd
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

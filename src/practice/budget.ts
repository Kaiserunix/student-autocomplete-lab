export interface GptPricing {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
}

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export interface BudgetCheck extends TokenEstimate {
  model: string;
  maxUsd: number;
}

const GPT_PRICING: Record<string, GptPricing> = {
  "gpt-4.1-nano": {
    inputPerMillion: 0.1,
    cachedInputPerMillion: 0.025,
    outputPerMillion: 0.4
  },
  "gpt-4.1-mini": {
    inputPerMillion: 0.4,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 1.6
  },
  "gpt-5-nano": {
    inputPerMillion: 0.05,
    cachedInputPerMillion: 0.005,
    outputPerMillion: 0.4
  },
  "gpt-5.4-nano": {
    inputPerMillion: 0.2,
    cachedInputPerMillion: 0.02,
    outputPerMillion: 1.25
  }
};

export function getGptPricing(model: string): GptPricing {
  const pricing = GPT_PRICING[model];
  if (!pricing) {
    throw new Error(`No GPT pricing configured for ${model}.`);
  }

  return pricing;
}

export function estimateUsd(model: string, estimate: TokenEstimate): number {
  const pricing = getGptPricing(model);
  const cachedInputTokens = Math.min(estimate.cachedInputTokens ?? 0, estimate.inputTokens);
  const regularInputTokens = Math.max(0, estimate.inputTokens - cachedInputTokens);

  return (
    (regularInputTokens * pricing.inputPerMillion) / 1_000_000 +
    (cachedInputTokens * pricing.cachedInputPerMillion) / 1_000_000 +
    (estimate.outputTokens * pricing.outputPerMillion) / 1_000_000
  );
}

export function assertWithinBudget(check: BudgetCheck): number {
  const estimatedUsd = estimateUsd(check.model, check);

  if (estimatedUsd > check.maxUsd) {
    throw new Error(
      `Estimated GPT practice run cost ${formatUsd(estimatedUsd)} exceeds budget ${formatUsd(check.maxUsd)} for ${check.model}.`
    );
  }

  return estimatedUsd;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

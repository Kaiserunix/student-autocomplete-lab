export interface CodexModelClient {
  request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
}

export interface CodexModelInfo {
  id: string;
  displayName: string;
  isDefault: boolean;
  inputModalities: string[];
  supportedReasoningEfforts: string[];
}

export interface CodexModelsView {
  models: CodexModelInfo[];
  recommendedTeachingModel?: string;
  recommendedAutocompleteModel?: string;
}

export type CodexModelSelection =
  | { available: true; model: string }
  | { available: false; model: string; recommendedModel?: string };

interface ModelListResult {
  data?: unknown;
}

export class CodexModelService {
  constructor(private readonly client: CodexModelClient) {}

  async listModels(): Promise<CodexModelsView> {
    const result = await this.client.request<ModelListResult>("model/list", {
      limit: 100,
      includeHidden: false
    });
    const models = Array.isArray(result.data)
      ? result.data.map(normalizeModel).filter((model): model is CodexModelInfo => Boolean(model))
      : [];
    const recommendedAutocompleteModel =
      models.find((model) => model.id === "gpt-5.3-codex-spark")?.id ??
      models.find((model) => /luna/i.test(model.id))?.id;
    const recommendedTeachingModel =
      models.find((model) => /terra/i.test(model.id))?.id ?? models.find((model) => model.isDefault)?.id;

    return {
      models,
      ...(recommendedAutocompleteModel ? { recommendedAutocompleteModel } : {}),
      ...(recommendedTeachingModel ? { recommendedTeachingModel } : {})
    };
  }

  validateSelection(
    model: string,
    models: readonly CodexModelInfo[],
    recommendedModel?: string
  ): CodexModelSelection {
    return models.some((item) => item.id === model)
      ? { available: true, model }
      : { available: false, model, ...(recommendedModel ? { recommendedModel } : {}) };
  }
}

function normalizeModel(value: unknown): CodexModelInfo | undefined {
  const record = asRecord(value);
  const id = stringValue(record?.id) ?? stringValue(record?.model);
  if (!record || !id || record.hidden === true) {
    return undefined;
  }
  const efforts = Array.isArray(record.supportedReasoningEfforts)
    ? record.supportedReasoningEfforts
        .map((item) => stringValue(asRecord(item)?.reasoningEffort))
        .filter((item): item is string => Boolean(item))
    : [];
  const inputModalities = Array.isArray(record.inputModalities)
    ? record.inputModalities.map(stringValue).filter((item): item is string => Boolean(item))
    : ["text", "image"];
  return {
    id,
    displayName: stringValue(record.displayName) ?? id,
    isDefault: record.isDefault === true,
    inputModalities,
    supportedReasoningEfforts: efforts
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

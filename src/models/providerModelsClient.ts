import type { AiProviderMode } from "../config/modelEnv";

export type ProviderModelUse = "chat" | "autocomplete";

export interface ProviderModelsConfig {
  mode?: AiProviderMode | string;
  baseUrl: string;
  apiKey: string;
  anthropicVersion?: string;
}

export interface ProviderModelInfo {
  id: string;
  owner?: string;
  created?: string | number;
  rawProvider: string;
  isAudioModel: boolean;
  recommendedFor: ProviderModelUse[];
}

export interface ProviderModelsResult {
  endpoint: string;
  models: ProviderModelInfo[];
}

interface RawModelRecord {
  id?: unknown;
  owned_by?: unknown;
  owner?: unknown;
  display_name?: unknown;
  created?: unknown;
  created_at?: unknown;
}

interface RawModelListResponse {
  data?: unknown;
  error?: {
    message?: unknown;
  };
}

export async function listProviderModels(
  config: ProviderModelsConfig,
  fetchImpl: typeof fetch = fetch
): Promise<ProviderModelsResult> {
  const mode = normalizeProviderMode(config.mode);
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/models`;
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: modelListHeaders(config, mode)
  });
  const text = await response.text();
  const payload = parseModelListPayload(text);

  if (!response.ok) {
    const upstream = typeof payload.error?.message === "string" ? `：${payload.error.message}` : "";
    throw new Error(`模型列表拉取失败：${explainHttpFailure(response.status)}${upstream}`);
  }

  if (!Array.isArray(payload.data)) {
    throw new Error("模型列表响应缺少 data 数组。");
  }

  const models = payload.data
    .map((item) => normalizeModelRecord(item, mode))
    .filter((item): item is ProviderModelInfo => Boolean(item))
    .sort(compareModelInfo);

  return { endpoint, models };
}

function modelListHeaders(config: ProviderModelsConfig, mode: AiProviderMode): Record<string, string> {
  if (mode === "anthropic-native") {
    return {
      "x-api-key": config.apiKey,
      "anthropic-version": config.anthropicVersion ?? "2023-06-01"
    };
  }

  return {
    Authorization: `Bearer ${config.apiKey}`
  };
}

function parseModelListPayload(text: string): RawModelListResponse {
  try {
    return JSON.parse(text) as RawModelListResponse;
  } catch {
    return {};
  }
}

function normalizeModelRecord(value: unknown, mode: AiProviderMode): ProviderModelInfo | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as RawModelRecord;
  if (typeof record.id !== "string" || !record.id.trim()) {
    return undefined;
  }

  const id = record.id.trim();
  const isAudioModel = /tts|voice|audio|speech/i.test(id);
  const owner =
    optionalString(record.owned_by) ?? optionalString(record.owner) ?? optionalString(record.display_name);
  const created = optionalString(record.created_at) ?? optionalNumber(record.created);

  return {
    id,
    owner,
    created,
    rawProvider: mode,
    isAudioModel,
    recommendedFor: recommendedUses(id, mode, isAudioModel)
  };
}

function recommendedUses(id: string, mode: AiProviderMode, isAudioModel: boolean): ProviderModelUse[] {
  if (isAudioModel) {
    return [];
  }

  if (mode === "openai-compatible" && /mimo-v2\.5-pro/i.test(id)) {
    return ["chat"];
  }

  return ["chat", "autocomplete"];
}

function compareModelInfo(left: ProviderModelInfo, right: ProviderModelInfo): number {
  if (left.isAudioModel !== right.isAudioModel) {
    return left.isAudioModel ? 1 : -1;
  }

  return left.id.localeCompare(right.id);
}

function explainHttpFailure(status: number): string {
  if (status === 401 || status === 403) {
    return "API Key 可能无效或无权限";
  }
  if (status === 404) {
    return "当前服务可能不支持 /models 接口";
  }
  return `HTTP ${status}`;
}

function normalizeProviderMode(value: string | undefined): AiProviderMode {
  if (value === "openai" || value === "anthropic-native") {
    return value;
  }

  return "openai-compatible";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

import { describe, expect, test, vi } from "vitest";
import { routeAutocompleteModel, routeTeachingModel } from "../src/models/modelRouter";
import type { ModelTextTransport } from "../src/models/modelTextTransport";

describe("model router", () => {
  test("routes OpenAI-compatible teaching and autocomplete models independently", () => {
    const env = {
      AI_PROVIDER_MODE: "openai-compatible",
      AI_OPENAI_COMPAT_BASE_URL: "https://example.test/v1/",
      AI_OPENAI_COMPAT_API_KEY: "key",
      AI_OPENAI_COMPAT_CHAT_MODEL: "analysis-model",
      AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL: "fast-model",
      AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT: "openai-completions"
    };

    expect(routeTeachingModel(env)).toMatchObject({
      purpose: "analysis",
      providerMode: "openai-compatible",
      model: "analysis-model",
      endpoint: "https://example.test/v1/chat/completions",
      format: "openai-chat"
    });
    expect(routeAutocompleteModel(env)).toMatchObject({
      purpose: "autocomplete",
      providerMode: "openai-compatible",
      model: "fast-model",
      endpoint: "https://example.test/v1/completions",
      format: "openai-completions"
    });
  });

  test("routes OpenAI-compatible autocomplete through a dedicated base URL", () => {
    const env = {
      AI_PROVIDER_MODE: "openai-compatible",
      AI_OPENAI_COMPAT_BASE_URL: "https://api.deepseek.com/v1",
      AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL: "https://api.deepseek.com/beta",
      AI_OPENAI_COMPAT_API_KEY: "key",
      AI_OPENAI_COMPAT_CHAT_MODEL: "deepseek-v4-pro",
      AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL: "deepseek-v4-flash",
      AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT: "openai-completions"
    };

    expect(routeTeachingModel(env)).toMatchObject({
      model: "deepseek-v4-pro",
      endpoint: "https://api.deepseek.com/v1/chat/completions"
    });
    expect(routeAutocompleteModel(env)).toMatchObject({
      model: "deepseek-v4-flash",
      endpoint: "https://api.deepseek.com/beta/completions"
    });
  });

  test("routes Anthropic-native requests to the messages endpoint", () => {
    const env = {
      AI_PROVIDER_MODE: "anthropic-native",
      AI_ANTHROPIC_BASE_URL: "https://api.anthropic.com/v1",
      AI_ANTHROPIC_API_KEY: "key",
      AI_ANTHROPIC_CHAT_MODEL: "claude-analysis",
      AI_ANTHROPIC_AUTOCOMPLETE_MODEL: "claude-fast"
    };

    expect(routeTeachingModel(env)).toMatchObject({
      providerMode: "anthropic-native",
      model: "claude-analysis",
      endpoint: "https://api.anthropic.com/v1/messages",
      format: "anthropic-messages"
    });
    expect(routeAutocompleteModel(env)).toMatchObject({
      providerMode: "anthropic-native",
      model: "claude-fast",
      endpoint: "https://api.anthropic.com/v1/messages",
      format: "anthropic-messages"
    });
  });

  test("routes Codex OAuth teaching and autocomplete through the injected app-server transport", () => {
    const transport: ModelTextTransport = {
      generate: vi.fn(async () => "ok")
    };
    const env = {
      AI_PROVIDER_MODE: "openai",
      AI_OPENAI_AUTH_MODE: "codex-oauth",
      AI_OPENAI_CHAT_MODEL: "gpt-5.6-terra",
      AI_OPENAI_AUTOCOMPLETE_MODEL: "gpt-5.3-codex-spark"
    };

    expect(routeTeachingModel(env, transport)).toMatchObject({
      purpose: "analysis",
      providerMode: "openai",
      authMode: "codex-oauth",
      format: "codex-app-server",
      model: "gpt-5.6-terra",
      config: { transport }
    });
    expect(routeAutocompleteModel(env, transport)).toMatchObject({
      purpose: "autocomplete",
      providerMode: "openai",
      authMode: "codex-oauth",
      format: "codex-app-server",
      model: "gpt-5.3-codex-spark",
      config: { transport }
    });
  });
});

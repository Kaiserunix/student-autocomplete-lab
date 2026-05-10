import { describe, expect, test } from "vitest";
import { routeAutocompleteModel, routeTeachingModel } from "../src/models/modelRouter";

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
});

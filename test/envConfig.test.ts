import { describe, expect, test } from "vitest";
import {
  applyAiConfigUpdateToEnvText,
  buildAiConfigView,
  loadModelEnvFromText,
  modelEnvFromSettings,
  requireAutocompleteConfig,
  requireMimoAutocompleteConfig,
  requireMimoTeachingConfig,
  requireTeachingConfig,
  withModelOverride
} from "../src/config/modelEnv";

describe("model env loading", () => {
  test("parses model env text without exposing comments or blank lines", () => {
    const env = loadModelEnvFromText(`
# Preferred provider
MIMO_OPENAI_BASE_URL=https://example.test/openai
MIMO_API_KEY=secret-value
MIMO_AUTOCOMPLETE_MODEL=mimo-v2.5-pro

DEEPSEEK_BASE_URL=https://fallback.test
`);

    expect(env.MIMO_OPENAI_BASE_URL).toBe("https://example.test/openai");
    expect(env.MIMO_API_KEY).toBe("secret-value");
    expect(env.MIMO_AUTOCOMPLETE_MODEL).toBe("mimo-v2.5-pro");
    expect(env.DEEPSEEK_BASE_URL).toBe("https://fallback.test");
  });

  test("allows a CLI trial model override without mutating the base config", () => {
    const config = {
      baseUrl: "https://example.test/openai",
      apiKey: "secret-value",
      model: "mimo-v2.5-pro"
    };

    expect(withModelOverride(config, "mimo-v2-omni")).toEqual({
      baseUrl: "https://example.test/openai",
      apiKey: "secret-value",
      model: "mimo-v2-omni"
    });
    expect(config.model).toBe("mimo-v2.5-pro");
  });

  test("defaults autocomplete to mimo-v2.5 even when Pro is configured for richer work", () => {
    const env = loadModelEnvFromText(`
MIMO_OPENAI_BASE_URL=https://example.test/openai
MIMO_API_KEY=secret-value
MIMO_AUTOCOMPLETE_MODEL=mimo-v2.5-pro
`);

    expect(requireMimoAutocompleteConfig(env).model).toBe("mimo-v2.5");
  });

  test("uses MiMo 2.5 by default for teaching diagnosis", () => {
    const env = loadModelEnvFromText(`
MIMO_OPENAI_BASE_URL=https://example.test/openai
MIMO_API_KEY=secret-value
`);

    expect(requireMimoTeachingConfig(env)).toMatchObject({
      baseUrl: "https://example.test/openai",
      apiKey: "secret-value",
      model: "mimo-v2.5"
    });
  });

  test("keeps teaching diagnosis on MiMo 2.5 when Pro is configured", () => {
    const env = loadModelEnvFromText(`
MIMO_OPENAI_BASE_URL=https://example.test/openai
MIMO_API_KEY=secret-value
MIMO_CHAT_MODEL=mimo-v2.5-pro
`);

    expect(requireMimoTeachingConfig(env).model).toBe("mimo-v2.5");
  });

  test("builds official OpenAI config from the generic AI provider settings", () => {
    const env = loadModelEnvFromText(`
AI_PROVIDER_MODE=openai
AI_OPENAI_API_KEY=openai-secret
AI_OPENAI_CHAT_MODEL=gpt-4.1-mini
AI_OPENAI_AUTOCOMPLETE_MODEL=gpt-4.1-mini
`);

    expect(requireTeachingConfig(env)).toMatchObject({
      mode: "openai",
      format: "openai-chat",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "openai-secret",
      model: "gpt-4.1-mini"
    });
    expect(requireAutocompleteConfig(env)).toMatchObject({
      format: "openai-chat",
      model: "gpt-4.1-mini"
    });
  });

  test("builds OpenAI-compatible config with a legacy completions autocomplete path", () => {
    const env = loadModelEnvFromText(`
AI_PROVIDER_MODE=openai-compatible
AI_OPENAI_COMPAT_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
AI_OPENAI_COMPAT_API_KEY=mimo-secret
AI_OPENAI_COMPAT_CHAT_MODEL=mimo-v2.5
AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL=mimo-v2.5
AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT=openai-completions
`);

    expect(requireTeachingConfig(env)).toMatchObject({
      mode: "openai-compatible",
      format: "openai-chat",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
      model: "mimo-v2.5"
    });
    expect(requireAutocompleteConfig(env)).toMatchObject({
      format: "openai-completions"
    });
  });

  test("builds Anthropic Native config for chat and autocomplete messages", () => {
    const env = loadModelEnvFromText(`
AI_PROVIDER_MODE=anthropic-native
AI_ANTHROPIC_API_KEY=anthropic-secret
AI_ANTHROPIC_CHAT_MODEL=claude-sonnet-4-5
AI_ANTHROPIC_AUTOCOMPLETE_MODEL=claude-haiku-4-5
`);

    expect(requireTeachingConfig(env)).toMatchObject({
      mode: "anthropic-native",
      format: "anthropic-messages",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "anthropic-secret",
      model: "claude-sonnet-4-5"
    });
    expect(requireAutocompleteConfig(env)).toMatchObject({
      format: "anthropic-messages",
      model: "claude-haiku-4-5"
    });
  });

  test("keeps legacy MiMo env as the default OpenAI-compatible provider", () => {
    const env = loadModelEnvFromText(`
MIMO_OPENAI_BASE_URL=https://legacy-mimo.test/v1
MIMO_API_KEY=legacy-secret
MIMO_CHAT_MODEL=mimo-v2.5-pro
MIMO_AUTOCOMPLETE_MODEL=mimo-v2.5-pro
`);

    expect(requireTeachingConfig(env)).toMatchObject({
      mode: "openai-compatible",
      baseUrl: "https://legacy-mimo.test/v1",
      model: "mimo-v2.5"
    });
    expect(requireAutocompleteConfig(env)).toMatchObject({
      format: "openai-completions",
      model: "mimo-v2.5"
    });
  });

  test("sanitizes AI config for the webview without exposing API keys", () => {
    const env = loadModelEnvFromText(`
AI_PROVIDER_MODE=anthropic-native
AI_ANTHROPIC_API_KEY=anthropic-secret
AI_ANTHROPIC_CHAT_MODEL=claude-sonnet-4-5
AI_ANTHROPIC_AUTOCOMPLETE_MODEL=claude-haiku-4-5
`);

    expect(buildAiConfigView(env)).toMatchObject({
      mode: "anthropic-native",
      hasApiKey: true,
      apiKeyPreview: "已保存",
      chatModel: "claude-sonnet-4-5",
      autocompleteModel: "claude-haiku-4-5"
    });
    expect(JSON.stringify(buildAiConfigView(env))).not.toContain("anthropic-secret");
  });

  test("updates only the selected provider and keeps a blank API key unchanged", () => {
    const next = applyAiConfigUpdateToEnvText(
      `
AI_PROVIDER_MODE=openai-compatible
AI_OPENAI_COMPAT_API_KEY=old-secret
AI_OPENAI_COMPAT_BASE_URL=https://old.example/v1
UNRELATED=value
`,
      {
        mode: "openai-compatible",
        baseUrl: "https://new.example/v1",
        apiKey: "",
        chatModel: "mimo-v2.5",
        autocompleteModel: "mimo-v2.5",
        autocompleteFormat: "openai-chat"
      }
    );
    const env = loadModelEnvFromText(next);

    expect(env.AI_PROVIDER_MODE).toBe("openai-compatible");
    expect(env.AI_OPENAI_COMPAT_API_KEY).toBe("old-secret");
    expect(env.AI_OPENAI_COMPAT_BASE_URL).toBe("https://new.example/v1");
    expect(env.AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT).toBe("openai-chat");
    expect(env.UNRELATED).toBe("value");
  });

  test("lets VS Code settings and SecretStorage override legacy env without exposing secrets", () => {
    const legacy = loadModelEnvFromText(`
MIMO_OPENAI_BASE_URL=https://legacy-mimo.test/v1
MIMO_API_KEY=legacy-secret
MIMO_CHAT_MODEL=mimo-v2.5
MIMO_AUTOCOMPLETE_MODEL=mimo-v2.5
`);
    const env = modelEnvFromSettings(
      legacy,
      {
        providerMode: "openai",
        openai: {
          baseUrl: "https://api.openai.test/v1",
          chatModel: "gpt-test-chat",
          autocompleteModel: "gpt-test-autocomplete"
        }
      },
      {
        openaiApiKey: "secret-storage-openai"
      }
    );

    expect(requireTeachingConfig(env)).toMatchObject({
      mode: "openai",
      baseUrl: "https://api.openai.test/v1",
      apiKey: "secret-storage-openai",
      model: "gpt-test-chat"
    });
    expect(requireAutocompleteConfig(env)).toMatchObject({
      mode: "openai",
      format: "openai-chat",
      model: "gpt-test-autocomplete"
    });
    expect(JSON.stringify(buildAiConfigView(env))).not.toContain("secret-storage-openai");
  });

  test("keeps legacy env as fallback when settings are empty", () => {
    const legacy = loadModelEnvFromText(`
AI_PROVIDER_MODE=openai-compatible
AI_OPENAI_COMPAT_BASE_URL=https://legacy-compatible.test/v1
AI_OPENAI_COMPAT_API_KEY=legacy-compatible-secret
AI_OPENAI_COMPAT_CHAT_MODEL=legacy-chat
AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL=legacy-complete
AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT=openai-completions
`);
    const env = modelEnvFromSettings(legacy, {}, {});

    expect(requireTeachingConfig(env)).toMatchObject({
      mode: "openai-compatible",
      baseUrl: "https://legacy-compatible.test/v1",
      apiKey: "legacy-compatible-secret",
      model: "legacy-chat"
    });
    expect(requireAutocompleteConfig(env)).toMatchObject({
      format: "openai-completions",
      model: "legacy-complete"
    });
  });
});

import { describe, expect, test } from "vitest";
import { loadModelEnvFromText, requireMimoAutocompleteConfig, withModelOverride } from "../src/config/modelEnv";

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
});

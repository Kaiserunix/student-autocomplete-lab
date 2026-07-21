import { describe, expect, test } from "vitest";
import { providerCapabilitiesFor } from "../src/models/providerCapabilities";

describe("provider capabilities", () => {
  test("recognizes only the real DeepSeek beta completions route as FIM", () => {
    expect(providerCapabilitiesFor({
      format: "openai-completions",
      baseUrl: "https://api.deepseek.com/beta"
    })).toMatchObject({
      renderer: "deepseek-fim",
      requestShape: "fim",
      supportsFimSuffix: true,
      supportsSystemInstruction: false
    });
  });

  test.each([
    ["https://api.deepseek.com/v1", "openai-completions"],
    ["https://api.deepseek.com/v1/beta", "openai-completions"],
    ["https://api.deepseek.com/beta/compatible", "openai-completions"],
    ["https://proxy.example.test/beta", "openai-completions"],
    ["https://api.deepseek.com/beta", "openai-chat"]
  ] as const)("does not infer FIM from an incomplete match", (baseUrl, format) => {
    expect(providerCapabilitiesFor({ format, baseUrl }).supportsFimSuffix).toBe(false);
  });

  test("normalizes the DeepSeek non-beta configuration issue", () => {
    expect(providerCapabilitiesFor({
      format: "openai-completions",
      baseUrl: "https://api.deepseek.com/v1"
    }).configurationIssue).toBe("deepseek-fim-beta-required");
  });

  test("maps chat, Anthropic, Codex, and generic completions explicitly", () => {
    expect(providerCapabilitiesFor({
      format: "openai-chat",
      baseUrl: "https://api.openai.com/v1"
    }).renderer).toBe("chat-messages");
    expect(providerCapabilitiesFor({
      format: "anthropic-messages",
      baseUrl: "https://api.anthropic.com/v1"
    }).requestShape).toBe("anthropic-messages");
    expect(providerCapabilitiesFor({
      format: "codex-app-server",
      baseUrl: "codex://app-server"
    }).renderer).toBe("codex-text");
    expect(providerCapabilitiesFor({
      format: "openai-completions",
      baseUrl: "https://compatible.example.test/v1"
    }).renderer).toBe("generic-completion");
  });
});

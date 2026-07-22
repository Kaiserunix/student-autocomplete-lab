import type { ModelProtocolFormat } from "./providerContracts";
import type { ProviderCapabilities } from "../skills/types";

interface ProviderCapabilityInput {
  format: ModelProtocolFormat;
  baseUrl: string;
}

export function providerCapabilitiesFor(input: ProviderCapabilityInput): ProviderCapabilities {
  if (input.format === "codex-app-server") {
    return {
      renderer: "codex-text",
      requestShape: "codex-text",
      supportsSystemInstruction: false,
      supportsFimSuffix: false,
      supportsStopSequences: false,
      prefixCacheFriendly: false
    };
  }
  if (input.format === "openai-chat") {
    return {
      renderer: "chat-messages",
      requestShape: "chat",
      supportsSystemInstruction: true,
      supportsFimSuffix: false,
      supportsStopSequences: true,
      prefixCacheFriendly: false
    };
  }
  if (input.format === "anthropic-messages") {
    return {
      renderer: "chat-messages",
      requestShape: "anthropic-messages",
      supportsSystemInstruction: true,
      supportsFimSuffix: false,
      supportsStopSequences: false,
      prefixCacheFriendly: false
    };
  }
  if (input.format === "openai-completions" && isDeepSeekBeta(input.baseUrl)) {
    return {
      renderer: "deepseek-fim",
      requestShape: "fim",
      supportsSystemInstruction: false,
      supportsFimSuffix: true,
      supportsStopSequences: true,
      prefixCacheFriendly: true
    };
  }
  return {
    renderer: "generic-completion",
    requestShape: "completion",
    supportsSystemInstruction: false,
    supportsFimSuffix: false,
    supportsStopSequences: true,
    prefixCacheFriendly: true,
    ...(input.format === "openai-completions" && isDeepSeekHost(input.baseUrl)
      ? { configurationIssue: "deepseek-fim-beta-required" as const }
      : {})
  };
}

function isDeepSeekBeta(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return url.hostname.toLowerCase() === "api.deepseek.com" &&
      path === "/beta";
  } catch {
    return false;
  }
}

function isDeepSeekHost(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === "api.deepseek.com";
  } catch {
    return false;
  }
}

import { describe, expect, test, vi } from "vitest";
import { requestChatCompletionText } from "../src/models/chatCompletionsClient";
import { requestCompletion } from "../src/models/completionsClient";
import type { ModelTextTransport } from "../src/models/modelTextTransport";

describe("Codex OAuth model client delegation", () => {
  test("delegates chat messages to the text transport without making HTTP requests", async () => {
    const generate = vi.fn(async () => "OK");
    const transport: ModelTextTransport = { generate };
    const signal = new AbortController().signal;
    const fetchImpl = vi.fn(async () => {
      throw new Error("HTTP must not be used");
    });

    const text = await requestChatCompletionText(
      {
        mode: "openai",
        authMode: "codex-oauth",
        model: "gpt-5.6-terra",
        format: "codex-app-server",
        transport
      },
      {
        messages: [
          { role: "system", content: "Return OK only." },
          { role: "user", content: "health check" }
        ],
        maxTokens: 16,
        temperature: 0,
        timeoutMs: 12_345,
        signal,
        usageLogPath: false
      },
      fetchImpl as unknown as typeof fetch
    );

    expect(text).toBe("OK");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledWith({
      purpose: "analysis",
      model: "gpt-5.6-terra",
      prompt: "[system]\nReturn OK only.\n\n[user]\nhealth check",
      maxOutputTokens: 16,
      temperature: 0,
      timeoutMs: 12_345,
      signal
    });
  });

  test("delegates autocomplete prefix and suffix to the text transport", async () => {
    const generate = vi.fn(async () => "return a + b");
    const transport: ModelTextTransport = { generate };
    const signal = new AbortController().signal;

    const text = await requestCompletion(
      {
        mode: "openai",
        authMode: "codex-oauth",
        model: "gpt-5.3-codex-spark",
        format: "codex-app-server",
        transport
      },
      {
        prompt: "def add(a, b):\n    ",
        suffix: "\nprint(add(1, 2))",
        maxTokens: 64,
        temperature: 0.1,
        timeoutMs: 2_500,
        signal
      }
    );

    expect(text).toBe("return a + b");
    expect(generate).toHaveBeenCalledWith({
      purpose: "autocomplete",
      model: "gpt-5.3-codex-spark",
      prompt: "def add(a, b):\n    \n\n<suffix>\n\nprint(add(1, 2))\n</suffix>",
      maxOutputTokens: 64,
      temperature: 0.1,
      timeoutMs: 2_500,
      signal
    });
  });
});

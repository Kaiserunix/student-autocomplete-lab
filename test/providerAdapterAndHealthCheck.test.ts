import { describe, expect, test } from "vitest";
import {
  applyAiConfigUpdateToEnvText,
  buildAiConfigView,
  loadModelEnvFromText,
  modelEnvFromSettings,
  requireAutocompleteConfig,
  requireTeachingConfig
} from "../src/config/modelEnv";
import {
  runAiProviderHealthCheck
} from "../src/models/modelHealthCheck";
import {
  routeAutocompleteModelAdapter,
  routeTeachingModelAdapter
} from "../src/models/providerAdapter";

describe("per-role OpenAI-compatible API keys, decoupled provider adapters, and health check", () => {
  test("supports distinct analysis and autocomplete API keys in OpenAI-compatible mode without leaking secrets", () => {
    const env = modelEnvFromSettings(
      {},
      {
        providerMode: "openai-compatible",
        openaiCompatible: {
          baseUrl: "https://openrouter.example.test/v1",
          autocompleteBaseUrl: "https://api.deepseek.com/beta",
          chatModel: "deepseek-reasoner",
          autocompleteModel: "deepseek-chat",
          autocompleteFormat: "openai-completions"
        }
      },
      {
        openaiCompatibleApiKey: "coach-secret-key-1111",
        openaiCompatibleAutocompleteApiKey: "fim-secret-key-2222"
      }
    );

    const teaching = requireTeachingConfig(env);
    const autocomplete = requireAutocompleteConfig(env);
    const view = buildAiConfigView(env);

    expect(teaching).toMatchObject({
      mode: "openai-compatible",
      baseUrl: "https://openrouter.example.test/v1",
      apiKey: "coach-secret-key-1111",
      model: "deepseek-reasoner"
    });
    expect(autocomplete).toMatchObject({
      mode: "openai-compatible",
      baseUrl: "https://api.deepseek.com/beta",
      apiKey: "fim-secret-key-2222",
      model: "deepseek-chat",
      format: "openai-completions"
    });
    expect(view).toMatchObject({
      hasApiKey: true,
      apiKeyPreview: "已保存",
      hasAutocompleteApiKey: true,
      autocompleteApiKeyPreview: "已保存"
    });
    expect(JSON.stringify(view)).not.toContain("coach-secret-key-1111");
    expect(JSON.stringify(view)).not.toContain("fim-secret-key-2222");
  });

  test("falls back to main OpenAI-compatible API key when autocompleteApiKey is omitted and preserves saved per-role key on blank update", () => {
    const initial = applyAiConfigUpdateToEnvText("", {
      mode: "openai-compatible",
      baseUrl: "https://coach.example.test/v1",
      autocompleteBaseUrl: "https://fim.example.test/beta",
      apiKey: "shared-key-abcd",
      autocompleteApiKey: "dedicated-fim-key-efgh",
      chatModel: "coach-pro",
      autocompleteModel: "fim-fast",
      autocompleteFormat: "openai-completions"
    });
    const afterBlankSave = applyAiConfigUpdateToEnvText(initial, {
      mode: "openai-compatible",
      baseUrl: "https://coach.example.test/v1",
      autocompleteBaseUrl: "https://fim.example.test/beta",
      apiKey: "",
      autocompleteApiKey: "",
      chatModel: "coach-pro-v2",
      autocompleteModel: "fim-fast-v2",
      autocompleteFormat: "openai-completions"
    });
    const parsed = loadModelEnvFromText(afterBlankSave);

    expect(parsed.AI_OPENAI_COMPAT_API_KEY).toBe("shared-key-abcd");
    expect(parsed.AI_OPENAI_COMPAT_AUTOCOMPLETE_API_KEY).toBe("dedicated-fim-key-efgh");
    expect(requireAutocompleteConfig(parsed).apiKey).toBe("dedicated-fim-key-efgh");

    const fallbackEnv = loadModelEnvFromText(`
AI_PROVIDER_MODE=openai-compatible
AI_OPENAI_COMPAT_BASE_URL=https://coach.example.test/v1
AI_OPENAI_COMPAT_API_KEY=shared-only-key
AI_OPENAI_COMPAT_CHAT_MODEL=coach-pro
AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL=fim-fast
`);
    expect(requireAutocompleteConfig(fallbackEnv).apiKey).toBe("shared-only-key");
  });

  test("routes teaching and autocomplete adapters cleanly with per-role credentials", async () => {
    const seenHeaders: Array<{ url: string; auth: string | null }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const targetUrl = String(url);
      const headers = new Headers(init?.headers);
      seenHeaders.push({ url: targetUrl, auth: headers.get("Authorization") });

      if (targetUrl.endsWith("/chat/completions")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    pain_points: [
                      {
                        label: "loop_boundary",
                        confidence: 0.9,
                        evidence: "range(n - 1) misses last item"
                      }
                    ],
                    hint: "检查 range 的右边界是否少算了最后一个元素。"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          choices: [{ text: "return a + b\n" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const env = {
      AI_PROVIDER_MODE: "openai-compatible",
      AI_OPENAI_COMPAT_BASE_URL: "https://coach.example.test/v1",
      AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL: "https://api.deepseek.com/beta",
      AI_OPENAI_COMPAT_API_KEY: "coach-token-secret",
      AI_OPENAI_COMPAT_AUTOCOMPLETE_API_KEY: "fim-token-secret",
      AI_OPENAI_COMPAT_CHAT_MODEL: "coach-model",
      AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL: "deepseek-chat",
      AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT: "openai-completions"
    };

    const teachingAdapter = routeTeachingModelAdapter(env, { fetchImpl: fakeFetch as typeof fetch });
    const autocompleteAdapter = routeAutocompleteModelAdapter(env, { fetchImpl: fakeFetch as typeof fetch });

    const diagnosis = await teachingAdapter.diagnose({
      problem: { id: "P1001", title: "A+B", summary: "sum" },
      language: "python",
      studentCode: "for i in range(n - 1): pass",
      ojVerdict: { status: "WA" },
      localEvidence: [],
      studentProfile: { painPointCounts: {}, activeSkills: [] }
    });
    const completion = await autocompleteAdapter.completeDetailed({
      prefix: "def add(a, b):\n    ",
      suffix: "",
      language: "python",
      filePath: "P1001.py"
    });

    expect(diagnosis.painPoints[0].label).toBe("loop_boundary");
    expect(completion.status).toBe("success");
    expect(seenHeaders).toEqual([
      { url: "https://coach.example.test/v1/chat/completions", auth: "Bearer coach-token-secret" },
      { url: "https://api.deepseek.com/beta/completions", auth: "Bearer fim-token-secret" }
    ]);
  });

  test("runs decoupled provider health checks, redacts per-role secrets, and flags DeepSeek non-beta FIM endpoints", async () => {
    const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
      const targetUrl = String(url);
      if (targetUrl.endsWith("/models")) {
        return new Response(
          JSON.stringify({ data: [{ id: "coach-model" }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (targetUrl.endsWith("/chat/completions")) {
        return new Response(
          JSON.stringify({ error: { message: "Invalid token super-secret-coach-9999" } }),
          { status: 401, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error("Unexpected autocomplete network call for non-beta DeepSeek FIM");
    };

    const check = await runAiProviderHealthCheck({
      baseEnv: {},
      config: {
        mode: "openai-compatible",
        baseUrl: "https://coach.example.test/v1",
        autocompleteBaseUrl: "https://api.deepseek.com/v1",
        apiKey: "super-secret-coach-9999",
        autocompleteApiKey: "super-secret-fim-8888",
        chatModel: "coach-model",
        autocompleteModel: "deepseek-chat",
        autocompleteFormat: "openai-completions"
      },
      fetchImpl: fakeFetch as typeof fetch,
      now: "2026-07-22T12:00:00.000Z"
    });

    expect(check.allPassed).toBe(false);
    expect(check.result.models.status).toBe("pass");
    expect(check.result.chatSmoke.status).toBe("fail");
    expect(check.result.chatSmoke.error).toContain("[redacted]");
    expect(JSON.stringify(check)).not.toContain("super-secret-coach-9999");
    expect(JSON.stringify(check)).not.toContain("super-secret-fim-8888");
    expect(check.result.autocompleteSmoke.status).toBe("fail");
    expect(check.result.autocompleteSmoke.error).toContain("/beta");
  });
});

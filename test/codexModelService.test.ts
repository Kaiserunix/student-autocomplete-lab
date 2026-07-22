import { describe, expect, test } from "vitest";
import {
  CodexModelService,
  type CodexModelClient
} from "../src/codex/codexModelService";

class FakeModelClient implements CodexModelClient {
  constructor(private readonly response: unknown) {}

  async request<T>(): Promise<T> {
    return this.response as T;
  }
}

describe("Codex OAuth models", () => {
  test("normalizes visible models and recommends Spark for autocomplete and Terra for teaching", async () => {
    const service = new CodexModelService(
      new FakeModelClient({
        data: [
          {
            id: "gpt-5.3-codex-spark",
            displayName: "GPT-5.3-Codex-Spark",
            hidden: false,
            inputModalities: ["text"]
          },
          {
            id: "hidden-model",
            displayName: "Hidden",
            hidden: true
          },
          {
            id: "gpt-5.6-terra",
            displayName: "GPT-5.6 Terra",
            hidden: false,
            isDefault: true,
            inputModalities: ["text", "image"],
            supportedReasoningEfforts: [
              { reasoningEffort: "low", description: "Lower latency" },
              { reasoningEffort: "medium", description: "Balanced" }
            ]
          }
        ],
        nextCursor: null
      })
    );

    await expect(service.listModels()).resolves.toEqual({
      models: [
        {
          id: "gpt-5.3-codex-spark",
          displayName: "GPT-5.3-Codex-Spark",
          isDefault: false,
          inputModalities: ["text"],
          supportedReasoningEfforts: []
        },
        {
          id: "gpt-5.6-terra",
          displayName: "GPT-5.6 Terra",
          isDefault: true,
          inputModalities: ["text", "image"],
          supportedReasoningEfforts: ["low", "medium"]
        }
      ],
      recommendedAutocompleteModel: "gpt-5.3-codex-spark",
      recommendedTeachingModel: "gpt-5.6-terra"
    });
  });

  test("recommends Luna/default without silently replacing an unavailable saved model", async () => {
    const service = new CodexModelService(
      new FakeModelClient({
        data: [
          { id: "gpt-5.6-luna", displayName: "Luna", hidden: false },
          { id: "gpt-5.6-sol", displayName: "Sol", hidden: false, isDefault: true }
        ]
      })
    );

    const result = await service.listModels();
    expect(result.recommendedAutocompleteModel).toBe("gpt-5.6-luna");
    expect(result.recommendedTeachingModel).toBe("gpt-5.6-sol");
    expect(
      service.validateSelection("gpt-5.3-codex-spark", result.models, result.recommendedAutocompleteModel)
    ).toEqual({
      available: false,
      model: "gpt-5.3-codex-spark",
      recommendedModel: "gpt-5.6-luna"
    });
  });
});

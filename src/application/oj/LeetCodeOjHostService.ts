import { randomUUID } from "node:crypto";
import type {
  OjCapabilities,
  OjProblemDocument,
  OjProblemRef,
  OjProviderHealth,
  OjSearchResult
} from "../../domain/oj/contracts";
import type { McpConnectionFactory } from "../../infrastructure/mcp/McpTransportFactory";
import { McpContractError } from "../../infrastructure/mcp/errors";
import {
  admitLocalAnonymousLeetCodeProvider,
  type LocalAnonymousLeetCodeAdmissionOptions,
  type LocalAnonymousLeetCodeRegistration
} from "../../infrastructure/mcp/LocalAnonymousLeetCodeProvider";
import { ProviderRegistry } from "../../infrastructure/mcp/ProviderRegistry";
import type { ProblemRecord } from "../../problemBank/types";

export interface LeetCodeProblemSearchInput {
  query: string;
  locale?: string;
  cursor?: string;
  limit?: number;
}

export class LeetCodeOjHostService {
  private readonly registry: ProviderRegistry;
  private registration?: LocalAnonymousLeetCodeRegistration;
  private disposed = false;

  constructor(
    connectionFactory: McpConnectionFactory,
    private readonly admissionOptions: LocalAnonymousLeetCodeAdmissionOptions,
    private readonly createRequestId: () => string = randomUUID
  ) {
    this.registry = new ProviderRegistry(connectionFactory);
  }

  async configure(manifest: unknown): Promise<void> {
    if (this.disposed) {
      throw new Error("The LeetCode OJ host service is disposed.");
    }
    if (this.registration) {
      throw new Error("The LeetCode OJ host service is already configured.");
    }
    this.registration = await admitLocalAnonymousLeetCodeProvider(this.registry, manifest, this.admissionOptions);
  }

  async getCapabilities(signal?: AbortSignal): Promise<OjCapabilities> {
    const client = await this.connect(signal);
    return client.getCapabilities(signal);
  }

  async getHealth(signal?: AbortSignal): Promise<OjProviderHealth> {
    const client = await this.connect(signal);
    return client.getHealth(signal);
  }

  async searchProblems(input: LeetCodeProblemSearchInput, signal?: AbortSignal): Promise<OjSearchResult> {
    const client = await this.connect(signal);
    const result = await client.search(
      {
        schemaVersion: "oj.search-request/v1",
        requestId: this.createRequestId(),
        platform: "leetcode",
        query: input.query,
        ...(input.locale ? { locale: input.locale } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
        limit: input.limit ?? 20
      },
      signal
    );
    if (result.items.some((item) => item.ref.platform !== "leetcode")) {
      throw new McpContractError("The LeetCode provider returned a search result for another platform.");
    }
    return result;
  }

  async fetchProblem(ref: OjProblemRef, signal?: AbortSignal): Promise<ProblemRecord> {
    if (ref.platform !== "leetcode") {
      throw new McpContractError("The LeetCode provider can fetch only LeetCode problem references.");
    }
    const client = await this.connect(signal);
    const document = await client.fetchProblem(ref, signal);
    if (document.ref.platform !== "leetcode" || document.ref.canonicalId !== ref.canonicalId) {
      throw new McpContractError("The LeetCode provider returned a different problem than requested.");
    }
    return mapLeetCodeProblemDocument(document);
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.registry.dispose();
  }

  private async connect(signal?: AbortSignal) {
    if (this.disposed) {
      throw new Error("The LeetCode OJ host service is disposed.");
    }
    if (!this.registration) {
      throw new Error("The LeetCode OJ host service is not configured with a pinned provider manifest.");
    }
    return this.registry.connect(this.registration.providerId, this.registration.entrypointId, signal);
  }
}

export function mapLeetCodeProblemDocument(document: OjProblemDocument): ProblemRecord {
  if (document.ref.platform !== "leetcode") {
    throw new McpContractError("Only LeetCode documents can be mapped to a LeetCode ProblemRecord.");
  }
  return {
    platform: "leetcode",
    id: document.ref.nativeId,
    title: document.title,
    sourceUrl: document.ref.url,
    ...(document.difficulty?.value !== undefined ? { difficulty: document.difficulty.value } : {}),
    tags: [...new Set(document.tags.map((tag) => tag.name))],
    statement: document.content.statement.text,
    inputFormat: document.content.input?.text ?? "",
    outputFormat: document.content.output?.text ?? "",
    samples: document.samples.map((sample) => ({ input: sample.input, output: sample.output }))
  };
}

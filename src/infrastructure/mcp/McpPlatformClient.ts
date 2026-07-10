import type {
  OjCapabilities,
  OjProviderEntrypointV1,
  OjProviderManifestV1,
  OjProviderToolName,
  OjProviderHealth,
  OjSearchRequest,
  OjSearchResult
} from "../../domain/oj/contracts";
import type { z } from "zod";
import { ojCapabilitiesSchema, ojProviderHealthSchema, ojSearchRequestSchema, ojSearchResultSchema } from "../../domain/oj/schemas";
import { decodeMcpToolResult, hashMcpToolSchema } from "./McpToolCodec";
import type { McpClientConnection, McpConnectionFactory, McpListedTool } from "./McpTransportFactory";
import { McpContractError, ProviderQuarantinedError } from "./errors";

export type McpPlatformClientState = "idle" | "connecting" | "ready" | "quarantined" | "closed";

export interface McpPlatformClientOptions {
  manifest: OjProviderManifestV1;
  entrypointId: OjProviderEntrypointV1["id"];
  connectionFactory: McpConnectionFactory;
}

export class McpPlatformClient {
  private readonly entrypoint: OjProviderEntrypointV1;
  private connection?: McpClientConnection;
  private startPromise?: Promise<void>;
  private currentState: McpPlatformClientState = "idle";

  constructor(private readonly options: McpPlatformClientOptions) {
    const entrypoint = options.manifest.entrypoints.find((candidate) => candidate.id === options.entrypointId);
    if (!entrypoint) {
      throw new Error(`Provider ${options.manifest.providerId} has no ${options.entrypointId} entrypoint.`);
    }
    this.entrypoint = entrypoint;
  }

  get state(): McpPlatformClientState {
    return this.currentState;
  }

  async start(signal?: AbortSignal): Promise<void> {
    if (this.currentState === "ready") {
      return;
    }
    if (this.currentState === "quarantined") {
      throw new ProviderQuarantinedError(this.options.manifest.providerId, "Provider is already quarantined.");
    }
    if (this.currentState === "closed") {
      throw new Error(`Provider ${this.options.manifest.providerId} is closed.`);
    }
    if (!this.startPromise) {
      this.currentState = "connecting";
      this.startPromise = this.connectAndVerify(signal);
    }
    await this.startPromise;
  }

  async getCapabilities(signal?: AbortSignal): Promise<OjCapabilities> {
    return this.call("capabilities", {}, ojCapabilitiesSchema, signal);
  }

  async getHealth(signal?: AbortSignal): Promise<OjProviderHealth> {
    return this.call("health", {}, ojProviderHealthSchema, signal);
  }

  async search(input: OjSearchRequest, signal?: AbortSignal): Promise<OjSearchResult> {
    const request = ojSearchRequestSchema.parse(input);
    return this.call("searchProblems", request, ojSearchResultSchema, signal);
  }

  async close(): Promise<void> {
    if (this.currentState === "closed") {
      return;
    }
    this.currentState = "closed";
    await this.connection?.close();
  }

  private async connectAndVerify(signal?: AbortSignal): Promise<void> {
    try {
      this.connection = this.options.connectionFactory.create(this.entrypoint);
      await this.connection.connect(signal);
      const tools = await this.connection.listTools(signal);
      this.verifyTools(tools);
      this.connection.onToolsChanged((changedTools) => {
        try {
          this.verifyTools(changedTools);
        } catch (error) {
          if (!(error instanceof ProviderQuarantinedError)) {
            this.quarantine(error instanceof Error ? error.message : String(error));
          }
        }
      });
      this.currentState = "ready";
    } catch (error) {
      if (this.currentState !== "quarantined") {
        this.currentState = "idle";
        this.startPromise = undefined;
      }
      throw error;
    }
  }

  private verifyTools(tools: McpListedTool[]): void {
    const expectedNames = this.entrypoint.expectedTools.map((tool) => tool.upstream).sort();
    const actualNames = tools.map((tool) => tool.name).sort();
    if (new Set(actualNames).size !== actualNames.length || JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
      this.quarantine(`tools/list differs from the approved manifest. Expected ${expectedNames.join(", ")}; received ${actualNames.join(", ")}.`);
    }

    for (const expected of this.entrypoint.expectedTools) {
      const actual = tools.find((tool) => tool.name === expected.upstream);
      if (!actual || hashMcpToolSchema(actual) !== expected.schemaSha256) {
        this.quarantine(`Schema hash changed for ${expected.upstream}.`);
      }
      if ((expected.risk === "R0_public_read" || expected.risk === "R1_private_read") && actual.annotations?.readOnlyHint !== true) {
        this.quarantine(`Read operation ${expected.upstream} is missing readOnlyHint=true.`);
      }
      if ((expected.risk === "R0_public_read" || expected.risk === "R1_private_read") && actual.annotations?.destructiveHint === true) {
        this.quarantine(`Read operation ${expected.upstream} is marked destructive.`);
      }
    }
  }

  private quarantine(reason: string): never {
    this.currentState = "quarantined";
    void this.connection?.close();
    throw new ProviderQuarantinedError(this.options.manifest.providerId, reason);
  }

  private async call<T>(
    canonical: OjProviderToolName,
    arguments_: Record<string, unknown>,
    outputSchema: z.ZodType<T>,
    signal?: AbortSignal
  ): Promise<T> {
    await this.start(signal);
    const tool = this.entrypoint.expectedTools.find((candidate) => candidate.canonical === canonical);
    if (!tool || !this.entrypoint.allowedRisks.includes(tool.risk)) {
      throw new McpContractError(`Provider entrypoint does not allow canonical operation ${canonical}.`);
    }
    const result = await this.connection!.callTool(tool.upstream, arguments_, signal);
    return decodeMcpToolResult(result, outputSchema);
  }
}

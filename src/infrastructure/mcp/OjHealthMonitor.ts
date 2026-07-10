import type { OjPlatformId, OjProviderHealth } from "../../domain/oj/contracts";
import { ojProviderHealthSchema } from "../../domain/oj/schemas";

export interface OjHealthAssessmentInput {
  providerId: string;
  platform: OjPlatformId;
  layers: OjProviderHealth["layers"];
  latencyMs?: number;
  retryAfterMs?: number;
  message: string;
}

export class OjHealthMonitor {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  assess(input: OjHealthAssessmentInput): OjProviderHealth {
    const health: OjProviderHealth = {
      schemaVersion: "oj.provider-health/v1",
      providerId: input.providerId,
      platform: input.platform,
      checkedAt: this.now(),
      overall: overallHealth(input.layers),
      layers: input.layers,
      latencyMs: input.latencyMs,
      retryAfterMs: input.retryAfterMs,
      message: input.message
    };
    return ojProviderHealthSchema.parse(health);
  }
}

function overallHealth(layers: OjProviderHealth["layers"]): OjProviderHealth["overall"] {
  if (layers.transport === "fail" || layers.protocol === "fail" || layers.upstream === "blocked" || layers.upstream === "fail") {
    return "unavailable";
  }
  if (layers.auth === "expired" || layers.auth === "missing" || layers.auth === "challenge") {
    return "auth_required";
  }
  if (layers.schema !== "pass" || layers.upstream !== "pass") {
    return "degraded";
  }
  return "healthy";
}

import type {
  OjCapability,
  OjProviderEntrypointV1,
  OjProviderManifestV1
} from "./contracts";

export type OjCapabilityCaller = "ui" | "agent" | "background";
export type OjCapabilityDecisionCode =
  | "allowed"
  | "status_unavailable"
  | "platform_policy"
  | "caller_forbidden"
  | "transport_forbidden"
  | "manifest_mismatch";

export interface OjCapabilityDecision {
  allowed: boolean;
  code: OjCapabilityDecisionCode;
  reason: string;
}

export interface EvaluateOjCapabilityInput {
  manifest: OjProviderManifestV1;
  entrypointId: OjProviderEntrypointV1["id"];
  capability: OjCapability;
  caller: OjCapabilityCaller;
}

export function evaluateOjCapability(input: EvaluateOjCapabilityInput): OjCapabilityDecision {
  const { manifest, capability, caller } = input;
  if (manifest.platform === "atcoder" && capability.name === "commitSubmission") {
    return denied("platform_policy", "AtCoder submission is disabled by product policy.");
  }
  if (capability.status !== "available" && capability.status !== "degraded") {
    return denied("status_unavailable", capability.reason ?? `Capability ${capability.name} is ${capability.status}.`);
  }
  if (caller === "agent" && capability.risk !== "R0_public_read" && capability.risk !== "R1_private_read") {
    return denied("caller_forbidden", `Agents cannot call ${capability.risk} operations.`);
  }
  if (caller === "background" && capability.risk !== "R0_public_read") {
    return denied("caller_forbidden", "Background work may call only R0 public reads.");
  }

  const entrypoint = manifest.entrypoints.find((candidate) => candidate.id === input.entrypointId);
  if (!entrypoint) {
    return denied("manifest_mismatch", `Manifest has no ${input.entrypointId} entrypoint.`);
  }
  if (entrypoint.transport === "remote_http" && capability.risk !== "R0_public_read") {
    return denied("transport_forbidden", "Remote HTTP providers may expose only R0 public reads.");
  }

  const expected = entrypoint.expectedTools.find((tool) => tool.canonical === capability.name);
  if (!expected || expected.risk !== capability.risk || !entrypoint.allowedRisks.includes(capability.risk)) {
    return denied("manifest_mismatch", `Capability ${capability.name} does not match the approved manifest.`);
  }
  if (capability.transport !== entrypoint.transport) {
    return denied("manifest_mismatch", `Capability ${capability.name} reports a different transport from its manifest.`);
  }
  return { allowed: true, code: "allowed", reason: "Capability is approved for this caller and transport." };
}

function denied(code: Exclude<OjCapabilityDecisionCode, "allowed">, reason: string): OjCapabilityDecision {
  return { allowed: false, code, reason };
}

import { describe, expect, test } from "vitest";
import { evaluateOjCapability } from "../../src/domain/oj/capabilityPolicy";
import type { OjCapability } from "../../src/domain/oj/contracts";
import { createFixtureManifest } from "../fixtures/mcp/providerFixture";

describe("OJ capability policy", () => {
  test("allows an approved remote public read", () => {
    const decision = evaluateOjCapability({
      manifest: createFixtureManifest(),
      entrypointId: "agentReadOnly",
      capability: capability("searchProblems", "R0_public_read"),
      caller: "agent"
    });

    expect(decision).toMatchObject({ allowed: true, code: "allowed" });
  });

  test("blocks real submit for ordinary Agents", () => {
    const decision = evaluateOjCapability({
      manifest: createFixtureManifest(),
      entrypointId: "agentReadOnly",
      capability: capability("commitSubmission", "R4_real_submit"),
      caller: "agent"
    });

    expect(decision).toMatchObject({ allowed: false, code: "caller_forbidden" });
  });

  test("blocks private reads and code execution over remote HTTP", () => {
    const manifest = createFixtureManifest() as any;
    manifest.entrypoints[0].allowedRisks.push("R1_private_read", "R2_local_execute");
    manifest.entrypoints[0].expectedTools.push(
      {
        canonical: "listSubmissions",
        upstream: "oj_list_submissions",
        schemaSha256: "a".repeat(64),
        risk: "R1_private_read"
      },
      {
        canonical: "localRun",
        upstream: "oj_run_code",
        schemaSha256: "b".repeat(64),
        risk: "R2_local_execute"
      }
    );

    expect(
      evaluateOjCapability({
        manifest,
        entrypointId: "agentReadOnly",
        capability: capability("listSubmissions", "R1_private_read"),
        caller: "ui"
      })
    ).toMatchObject({ allowed: false, code: "transport_forbidden" });
    expect(
      evaluateOjCapability({
        manifest,
        entrypointId: "agentReadOnly",
        capability: capability("localRun", "R2_local_execute"),
        caller: "ui"
      })
    ).toMatchObject({ allowed: false, code: "transport_forbidden" });
  });

  test("keeps AtCoder submission disabled by policy", () => {
    const manifest = { ...createFixtureManifest(), platform: "atcoder" as const };
    const decision = evaluateOjCapability({
      manifest,
      entrypointId: "agentReadOnly",
      capability: capability("commitSubmission", "R4_real_submit"),
      caller: "ui"
    });

    expect(decision).toMatchObject({ allowed: false, code: "platform_policy" });
  });
});

function capability(name: OjCapability["name"], risk: OjCapability["risk"]): OjCapability {
  return {
    name,
    status: "available",
    toolName: `oj_${name}`,
    transport: "remote_http",
    auth: "none",
    risk,
    compliance: "official",
    checkedAt: "2026-07-10T12:00:00.000Z"
  };
}

import { describe, expect, test } from "vitest";
import { OjHealthMonitor } from "../../../src/infrastructure/mcp/OjHealthMonitor";
import { CircuitBreaker } from "../../../src/infrastructure/mcp/CircuitBreaker";

describe("OJ provider health", () => {
  test("reports degraded when MCP is reachable but the upstream times out", () => {
    const monitor = new OjHealthMonitor(() => "2026-07-10T12:00:00.000Z");
    const health = monitor.assess({
      providerId: "codeforces-official-api",
      platform: "codeforces",
      layers: {
        transport: "pass",
        protocol: "pass",
        schema: "pass",
        auth: "not_required",
        upstream: "timeout"
      },
      latencyMs: 2100,
      message: "Codeforces upstream timed out."
    });

    expect(health).toMatchObject({ overall: "degraded", checkedAt: "2026-07-10T12:00:00.000Z" });
  });

  test("reports unavailable for transport or protocol failures", () => {
    const monitor = new OjHealthMonitor();
    const health = monitor.assess({
      providerId: "codeforces-official-api",
      platform: "codeforces",
      layers: {
        transport: "fail",
        protocol: "fail",
        schema: "unknown",
        auth: "not_required",
        upstream: "fail"
      },
      message: "Remote endpoint is unreachable."
    });

    expect(health.overall).toBe("unavailable");
  });
});

describe("OJ circuit breaker", () => {
  test("opens after safe read failures and closes after cooldown", () => {
    let now = 1_000;
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 5_000, now: () => now });

    breaker.recordFailure("R0_public_read");
    expect(breaker.canAttempt("R0_public_read")).toBe(true);
    breaker.recordFailure("R0_public_read");
    expect(breaker.canAttempt("R0_public_read")).toBe(false);

    now += 5_001;
    expect(breaker.canAttempt("R0_public_read")).toBe(true);
  });

  test("never classifies write operations as automatically retryable", () => {
    const breaker = new CircuitBreaker();

    expect(breaker.shouldRetry("R4_real_submit", "network.timeout", 0)).toBe(false);
    expect(breaker.shouldRetry("R0_public_read", "network.timeout", 0)).toBe(true);
    expect(breaker.shouldRetry("R0_public_read", "auth.invalid", 0)).toBe(false);
  });
});

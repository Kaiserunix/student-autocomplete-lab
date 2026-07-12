import type { OjErrorCode, OjOperationRisk } from "../../domain/oj/contracts";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  maxReadRetries?: number;
  now?: () => number;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly maxReadRetries: number;
  private readonly now: () => number;
  private failureCount = 0;
  private openedAt?: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.maxReadRetries = options.maxReadRetries ?? 2;
    this.now = options.now ?? Date.now;
  }

  canAttempt(risk: OjOperationRisk): boolean {
    if (risk !== "R0_public_read" || this.openedAt === undefined) {
      return true;
    }
    if (this.now() - this.openedAt > this.cooldownMs) {
      this.reset();
      return true;
    }
    return false;
  }

  recordFailure(risk: OjOperationRisk): void {
    if (risk !== "R0_public_read") {
      return;
    }
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold && this.openedAt === undefined) {
      this.openedAt = this.now();
    }
  }

  recordSuccess(risk: OjOperationRisk): void {
    if (risk === "R0_public_read") {
      this.reset();
    }
  }

  shouldRetry(risk: OjOperationRisk, errorCode: OjErrorCode, attempt: number): boolean {
    const safeErrors = new Set<OjErrorCode>(["network.timeout", "upstream.unavailable", "rate_limited"]);
    return risk === "R0_public_read" && attempt < this.maxReadRetries && safeErrors.has(errorCode) && this.canAttempt(risk);
  }

  private reset(): void {
    this.failureCount = 0;
    this.openedAt = undefined;
  }
}

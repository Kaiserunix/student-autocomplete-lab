import type { OjError, OjErrorCode } from "../../domain/oj/contracts";

export class ProviderQuarantinedError extends Error {
  constructor(
    readonly providerId: string,
    readonly reason: string
  ) {
    super(`Provider ${providerId} was quarantined: ${reason}`);
    this.name = "ProviderQuarantinedError";
  }
}

export class OjMcpToolError extends Error {
  readonly code: OjErrorCode;

  constructor(readonly details: OjError) {
    super(details.message);
    this.name = "OjMcpToolError";
    this.code = details.code;
  }
}

export class McpContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpContractError";
  }
}

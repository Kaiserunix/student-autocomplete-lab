import {
  ojCapabilityNames,
  ojPlatformIds,
  type OjCapabilities,
  type OjCapability,
  type OjCapabilityName,
  type OjError,
  type OjPlatformId,
  type OjProblemDocument,
  type OjProblemRef,
  type OjProblemSummary,
  type OjProviderHealth,
  type OjSearchResult,
  type OjSourceRef,
  type OjTextBlock
} from "./types";

export class OjContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OjContractError";
  }
}

export function parseOjCapabilities(value: unknown, expectedPlatform?: OjPlatformId): OjCapabilities {
  const record = expectRecord(value, "OJ capabilities");
  expectLiteral(record.schemaVersion, "oj.capabilities/v1", "OJ capabilities schemaVersion");
  const platform = parsePlatform(record.platform, "OJ capabilities platform");
  if (expectedPlatform && platform !== expectedPlatform) {
    throw new OjContractError(`OJ capabilities platform mismatch: expected ${expectedPlatform}, received ${platform}.`);
  }
  const operationsRecord = expectRecord(record.operations, "OJ capabilities operations");
  const operations = Object.fromEntries(
    ojCapabilityNames.map((name) => [name, parseCapability(operationsRecord[name], name)])
  ) as Record<OjCapabilityName, OjCapability>;

  return {
    schemaVersion: "oj.capabilities/v1",
    providerId: expectString(record.providerId, "OJ capabilities providerId"),
    providerVersion: expectString(record.providerVersion, "OJ capabilities providerVersion"),
    platform,
    protocolVersion: expectString(record.protocolVersion, "OJ capabilities protocolVersion"),
    operations,
    languages: expectArray(record.languages, "OJ capabilities languages").map((item, index) => {
      const language = expectRecord(item, `OJ capabilities languages[${index}]`);
      return {
        languageKey: expectString(language.languageKey, "languageKey"),
        platformLanguageId: expectString(language.platformLanguageId, "platformLanguageId"),
        displayName: expectString(language.displayName, "displayName")
      };
    }),
    source: parseSourceRef(record.source)
  };
}

export function parseOjProviderHealth(value: unknown, expectedPlatform?: OjPlatformId): OjProviderHealth {
  const record = expectRecord(value, "OJ provider health");
  expectLiteral(record.schemaVersion, "oj.provider-health/v1", "OJ provider health schemaVersion");
  const platform = parsePlatform(record.platform, "OJ provider health platform");
  if (expectedPlatform && platform !== expectedPlatform) {
    throw new OjContractError(`OJ provider health platform mismatch: expected ${expectedPlatform}, received ${platform}.`);
  }
  const layers = expectRecord(record.layers, "OJ provider health layers");
  return {
    schemaVersion: "oj.provider-health/v1",
    providerId: expectString(record.providerId, "OJ provider health providerId"),
    platform,
    checkedAt: expectIsoDate(record.checkedAt, "OJ provider health checkedAt"),
    overall: expectEnum(record.overall, ["healthy", "degraded", "unavailable", "auth_required"], "OJ provider health overall"),
    layers: {
      transport: expectEnum(layers.transport, ["pass", "fail"], "OJ health transport"),
      protocol: expectEnum(layers.protocol, ["pass", "fail"], "OJ health protocol"),
      schema: expectEnum(layers.schema, ["pass", "drift", "unknown"], "OJ health schema"),
      auth: expectEnum(layers.auth, ["not_required", "valid", "expired", "missing", "challenge"], "OJ health auth"),
      upstream: expectEnum(layers.upstream, ["pass", "timeout", "rate_limited", "blocked", "fail"], "OJ health upstream")
    },
    latencyMs: optionalFiniteNumber(record.latencyMs, "OJ provider health latencyMs"),
    retryAfterMs: optionalFiniteNumber(record.retryAfterMs, "OJ provider health retryAfterMs"),
    message: expectString(record.message, "OJ provider health message")
  };
}

export function parseOjSearchResult(value: unknown, expectedPlatform?: OjPlatformId): OjSearchResult {
  const record = expectRecord(value, "OJ search result");
  expectLiteral(record.schemaVersion, "oj.search-result/v1", "OJ search result schemaVersion");
  const items = expectArray(record.items, "OJ search result items").map((item, index) =>
    parseProblemSummary(item, expectedPlatform, `OJ search result items[${index}]`)
  );
  return {
    schemaVersion: "oj.search-result/v1",
    requestId: expectString(record.requestId, "OJ search result requestId"),
    items,
    nextCursor: optionalString(record.nextCursor, "OJ search result nextCursor"),
    source: parseSourceRef(record.source)
  };
}

export function parseOjProblemDocument(value: unknown, expectedPlatform?: OjPlatformId): OjProblemDocument {
  const record = expectRecord(value, "OJ problem document");
  expectLiteral(record.schemaVersion, "oj.problem-document/v1", "OJ problem document schemaVersion");
  const ref = parseProblemRef(record.ref, expectedPlatform);
  const content = expectRecord(record.content, "OJ problem document content");
  const io = expectRecord(record.io, "OJ problem document io");
  const limits = expectRecord(record.limits, "OJ problem document limits");
  return {
    schemaVersion: "oj.problem-document/v1",
    ref,
    title: expectString(record.title, "OJ problem document title"),
    locale: expectString(record.locale, "OJ problem document locale"),
    access: expectEnum(record.access, ["public", "auth_required", "premium", "contest_only", "unknown"], "OJ problem document access"),
    difficulty: parseDifficulty(record.difficulty),
    tags: parseTags(record.tags),
    content: {
      statement: parseTextBlock(content.statement, "statement"),
      input: content.input === undefined ? undefined : parseTextBlock(content.input, "input"),
      output: content.output === undefined ? undefined : parseTextBlock(content.output, "output"),
      notes: content.notes === undefined ? undefined : parseTextBlock(content.notes, "notes")
    },
    constraints: expectArray(record.constraints, "OJ problem document constraints").map((item) =>
      expectString(item, "OJ problem document constraint", true)
    ),
    samples: expectArray(record.samples, "OJ problem document samples").map((item, index) => {
      const sample = expectRecord(item, `OJ problem document samples[${index}]`);
      return {
        ordinal: expectPositiveInteger(sample.ordinal, "sample ordinal"),
        input: expectString(sample.input, "sample input", true),
        output: expectString(sample.output, "sample output", true),
        explanation: optionalString(sample.explanation, "sample explanation", true)
      };
    }),
    limits: {
      timeMs: optionalPositiveNumber(limits.timeMs, "time limit"),
      memoryBytes: optionalPositiveInteger(limits.memoryBytes, "memory limit")
    },
    io: {
      mode: expectEnum(io.mode, ["stdin_stdout", "function", "file", "interactive"], "OJ problem io mode"),
      inputFile: optionalString(io.inputFile, "input file"),
      outputFile: optionalString(io.outputFile, "output file")
    },
    starterCode: expectArray(record.starterCode, "OJ problem document starterCode").map((item, index) => {
      const starter = expectRecord(item, `starterCode[${index}]`);
      return {
        languageKey: expectString(starter.languageKey, "starter languageKey"),
        platformLanguageId: expectString(starter.platformLanguageId, "starter platformLanguageId"),
        code: expectString(starter.code, "starter code", true)
      };
    }),
    source: parseSourceRef(record.source)
  };
}

export function parseOjError(value: unknown): OjError | undefined {
  if (!isRecord(value) || value.schemaVersion !== "oj.error/v1") {
    return undefined;
  }
  return {
    schemaVersion: "oj.error/v1",
    code: expectString(value.code, "OJ error code"),
    layer: expectString(value.layer, "OJ error layer"),
    message: expectString(value.message, "OJ error message"),
    retryPolicy: optionalString(value.retryPolicy, "OJ error retryPolicy"),
    userAction: optionalString(value.userAction, "OJ error userAction"),
    platform: value.platform === undefined ? undefined : parsePlatform(value.platform, "OJ error platform"),
    providerId: optionalString(value.providerId, "OJ error providerId")
  };
}

function parseCapability(value: unknown, expectedName: OjCapabilityName): OjCapability {
  const record = expectRecord(value, `OJ capability ${expectedName}`);
  const name = expectEnum(record.name, ojCapabilityNames, `OJ capability ${expectedName} name`);
  if (name !== expectedName) {
    throw new OjContractError(`OJ capability key ${expectedName} contained name ${name}.`);
  }
  return {
    name,
    status: expectEnum(record.status, ["available", "auth_required", "unsupported", "disabled_by_policy", "degraded"], "OJ capability status"),
    toolName: optionalString(record.toolName, "OJ capability toolName"),
    transport: expectEnum(record.transport, ["remote_http", "local_stdio"], "OJ capability transport"),
    auth: expectEnum(record.auth, ["none", "oauth2", "api_key", "session_cookie", "browser"], "OJ capability auth"),
    risk: expectEnum(record.risk, ["R0_public_read", "R1_private_read", "R2_local_execute", "R3_prepare_write", "R4_real_submit"], "OJ capability risk"),
    compliance: expectEnum(record.compliance, ["official", "unofficial", "restricted", "unknown"], "OJ capability compliance"),
    reason: optionalString(record.reason, "OJ capability reason", true),
    checkedAt: expectIsoDate(record.checkedAt, "OJ capability checkedAt")
  };
}

function parseProblemSummary(value: unknown, expectedPlatform: OjPlatformId | undefined, label: string): OjProblemSummary {
  const record = expectRecord(value, label);
  expectLiteral(record.schemaVersion, "oj.problem-summary/v1", `${label} schemaVersion`);
  return {
    schemaVersion: "oj.problem-summary/v1",
    ref: parseProblemRef(record.ref, expectedPlatform),
    title: expectString(record.title, `${label} title`),
    difficulty: parseDifficulty(record.difficulty),
    tags: parseTags(record.tags),
    contestLabel: optionalString(record.contestLabel, `${label} contestLabel`),
    acceptance: parseAcceptance(record.acceptance),
    source: parseSourceRef(record.source)
  };
}

function parseProblemRef(value: unknown, expectedPlatform?: OjPlatformId): OjProblemRef {
  const record = expectRecord(value, "OJ problem ref");
  expectLiteral(record.schemaVersion, "oj.problem-ref/v1", "OJ problem ref schemaVersion");
  const platform = parsePlatform(record.platform, "OJ problem ref platform");
  if (expectedPlatform && platform !== expectedPlatform) {
    throw new OjContractError(`OJ problem platform mismatch: expected ${expectedPlatform}, received ${platform}.`);
  }
  const contestRecord = record.contest === undefined ? undefined : expectRecord(record.contest, "OJ problem contest");
  return {
    schemaVersion: "oj.problem-ref/v1",
    platform,
    site:
      record.site === undefined
        ? undefined
        : expectEnum(record.site, ["global", "cn"] as const, "OJ problem site"),
    nativeId: expectString(record.nativeId, "OJ problem nativeId"),
    canonicalId: expectString(record.canonicalId, "OJ problem canonicalId"),
    url: expectUrl(record.url, "OJ problem URL"),
    contest: contestRecord
      ? {
          nativeId: expectString(contestRecord.nativeId, "OJ problem contest nativeId"),
          index: optionalString(contestRecord.index, "OJ problem contest index")
        }
      : undefined,
    source: parseSourceRef(record.source)
  };
}

function parseSourceRef(value: unknown): OjSourceRef {
  const record = expectRecord(value, "OJ source ref");
  return {
    kind: expectEnum(record.kind, ["official_api", "official_open_platform", "page_adapter", "browser_companion", "community_adapter", "manual"], "OJ source kind"),
    adapterId: expectString(record.adapterId, "OJ source adapterId"),
    adapterVersion: expectString(record.adapterVersion, "OJ source adapterVersion"),
    fetchedAt: expectIsoDate(record.fetchedAt, "OJ source fetchedAt"),
    sourceUrl: expectUrl(record.sourceUrl, "OJ source URL"),
    etag: optionalString(record.etag, "OJ source etag"),
    rawRef: optionalString(record.rawRef, "OJ source rawRef"),
    confidence: expectEnum(record.confidence, ["authoritative", "derived", "user_supplied"], "OJ source confidence")
  };
}

function parseTextBlock(value: unknown, label: string): OjTextBlock {
  const record = expectRecord(value, `OJ ${label} block`);
  const sha256 = expectString(record.sha256, `OJ ${label} sha256`);
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new OjContractError(`OJ ${label} sha256 is not a SHA-256 digest.`);
  }
  return {
    text: expectString(record.text, `OJ ${label} text`, true),
    format: expectEnum(record.format, ["markdown", "html", "text"], `OJ ${label} format`),
    locale: expectString(record.locale, `OJ ${label} locale`),
    truncated: expectBoolean(record.truncated, `OJ ${label} truncated`),
    originalChars: optionalPositiveInteger(record.originalChars, `OJ ${label} originalChars`, true),
    sha256
  };
}

function parseDifficulty(value: unknown): OjProblemSummary["difficulty"] {
  if (value === undefined) return undefined;
  const record = expectRecord(value, "OJ difficulty");
  return {
    scale: expectString(record.scale, "OJ difficulty scale"),
    value: optionalFiniteNumber(record.value, "OJ difficulty value"),
    label: optionalString(record.label, "OJ difficulty label")
  };
}

function parseTags(value: unknown): OjProblemSummary["tags"] {
  return expectArray(value, "OJ tags").map((item, index) => {
    const tag = expectRecord(item, `OJ tags[${index}]`);
    return {
      namespace: expectEnum(tag.namespace, ["platform", "canonical"], "OJ tag namespace"),
      id: optionalString(tag.id, "OJ tag id"),
      slug: expectString(tag.slug, "OJ tag slug"),
      name: expectString(tag.name, "OJ tag name")
    };
  });
}

function parseAcceptance(value: unknown): OjProblemSummary["acceptance"] {
  if (value === undefined) return undefined;
  const record = expectRecord(value, "OJ acceptance");
  return {
    accepted: optionalPositiveInteger(record.accepted, "OJ accepted", true),
    submissions: optionalPositiveInteger(record.submissions, "OJ submissions", true),
    ratio: optionalRatio(record.ratio, "OJ acceptance ratio")
  };
}

function parsePlatform(value: unknown, label: string): OjPlatformId {
  return expectEnum(value, ojPlatformIds, label);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new OjContractError(`${label} must be an object.`);
  return value;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new OjContractError(`${label} must be an array.`);
  return value;
}

function expectString(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new OjContractError(`${label} must be ${allowEmpty ? "a string" : "a non-empty string"}.`);
  }
  return value;
}

function optionalString(value: unknown, label: string, allowEmpty = false): string | undefined {
  return value === undefined ? undefined : expectString(value, label, allowEmpty);
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new OjContractError(`${label} must be a boolean.`);
  return value;
}

function expectLiteral<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new OjContractError(`${label} must be ${expected}.`);
  return expected;
}

function expectEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new OjContractError(`${label} is not recognized.`);
  }
  return value as T;
}

function expectIsoDate(value: unknown, label: string): string {
  const result = expectString(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new OjContractError(`${label} must be an ISO date.`);
  return result;
}

function expectUrl(value: unknown, label: string): string {
  const result = expectString(value, label);
  try {
    const parsed = new URL(result);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    throw new OjContractError(`${label} must be an HTTP(S) URL.`);
  }
  return result;
}

function expectPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new OjContractError(`${label} must be a positive integer.`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, label: string, allowZero = false): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new OjContractError(`${label} must be ${allowZero ? "a non-negative" : "a positive"} integer.`);
  }
  return value;
}

function optionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new OjContractError(`${label} must be a positive number.`);
  }
  return value;
}

function optionalFiniteNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new OjContractError(`${label} must be finite.`);
  return value;
}

function optionalRatio(value: unknown, label: string): number | undefined {
  const result = optionalFiniteNumber(value, label);
  if (result !== undefined && (result < 0 || result > 1)) throw new OjContractError(`${label} must be between 0 and 1.`);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

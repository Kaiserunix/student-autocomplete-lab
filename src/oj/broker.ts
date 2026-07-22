import { createHash, randomUUID } from "node:crypto";
import {
  OjContractError,
  parseOjCapabilities,
  parseOjError,
  parseOjProblemDocument,
  parseOjProviderHealth,
  parseOjSearchResult
} from "./contracts";
import {
  ojCapabilityNames,
  type OjCapabilities,
  type OjCapability,
  type OjCapabilityName,
  type OjMcpSession,
  type OjMcpSessionFactory,
  type OjPlatformId,
  type OjProblemDocument,
  type OjProblemSummary,
  type OjProviderDescriptor,
  type OjProviderHealth,
  type OjProviderStatusView,
  type OjSearchResult,
  type OjSourceRef,
  type OjTextBlock
} from "./types";

const CAPABILITY_CACHE_MS = 5 * 60_000;
const READ_TIMEOUT_MS = 15_000;
const defaultSessionFactory: OjMcpSessionFactory = async (descriptor) => {
  const { connectOjMcpSession } = await import("./mcpSdkClient");
  return connectOjMcpSession(descriptor);
};

export class OjBrokerError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly platform?: OjPlatformId
  ) {
    super(message);
    this.name = "OjBrokerError";
  }
}

export class OjMcpBroker {
  private descriptors = new Map<OjPlatformId, OjProviderDescriptor>();
  private readonly sessions = new Map<OjPlatformId, Promise<OjMcpSession>>();
  private readonly capabilities = new Map<OjPlatformId, { value: OjCapabilities; expiresAt: number }>();
  private readonly statuses = new Map<OjPlatformId, OjProviderStatusView>();

  public constructor(
    descriptors: OjProviderDescriptor[],
    private readonly sessionFactory: OjMcpSessionFactory = defaultSessionFactory,
    private readonly now: () => number = Date.now
  ) {
    this.setDescriptors(descriptors);
  }

  public providerStatuses(): OjProviderStatusView[] {
    return Array.from(this.descriptors.values()).map((descriptor) =>
      this.statuses.get(descriptor.platform) ?? initialStatus(descriptor)
    );
  }

  public async refreshAll(): Promise<OjProviderStatusView[]> {
    await Promise.all(Array.from(this.descriptors.keys(), (platform) => this.refresh(platform)));
    return this.providerStatuses();
  }

  public async refresh(platform: OjPlatformId): Promise<OjProviderStatusView> {
    const descriptor = this.requireDescriptor(platform);
    if (!descriptor.transport) {
      const status = initialStatus(descriptor);
      this.statuses.set(platform, status);
      return status;
    }

    let capabilities: OjCapabilities | undefined;
    let health: OjProviderHealth | undefined;
    let failure: string | undefined;
    try {
      capabilities = await this.loadCapabilities(platform, true);
    } catch (error) {
      failure = errorMessage(error);
    }
    try {
      health = await this.loadHealth(platform);
    } catch (error) {
      failure ??= errorMessage(error);
    }
    const status: OjProviderStatusView = {
      platform,
      label: descriptor.label,
      configured: true,
      transport: descriptor.transport.kind,
      endpoint: descriptor.transport.kind === "remote_http" ? descriptor.transport.endpoint : undefined,
      overall: health?.overall ?? (failure ? "unavailable" : "unknown"),
      searchStatus: capabilities?.operations.searchProblems.status ?? "degraded",
      fetchStatus: capabilities?.operations.fetchProblem.status ?? "degraded",
      message: health?.message ?? failure ?? "能力已读取，健康状态未知。",
      checkedAt: health?.checkedAt ?? new Date(this.now()).toISOString()
    };
    this.statuses.set(platform, status);
    return status;
  }

  public async searchProblems(input: {
    platform: OjPlatformId;
    query: string;
    limit?: number;
    cursor?: string;
  }): Promise<OjSearchResult> {
    const query = input.query.trim();
    if (!query) throw new OjBrokerError("request.invalid", "请输入题号、题名或标签。", input.platform);
    const limit = normalizeLimit(input.limit, 20);
    const capabilities = await this.loadCapabilities(input.platform);
    assertReadableCapability(capabilities.operations.searchProblems, input.platform, "搜索");
    const descriptor = this.requireDescriptor(input.platform);

    if (descriptor.dialect === "luogu-v0.2") {
      const payload = await this.call(input.platform, "luogu_search_problems", { keyword: query, limit });
      return normalizeLegacyLuoguSearch(payload, query);
    }

    const requestId = randomUUID();
    const locale = input.platform === "leetcode" ? "zh-CN" : input.platform === "atcoder" ? "en" : undefined;
    const payload = await this.call(input.platform, "oj_search_problems", {
      schemaVersion: "oj.search-request/v1",
      requestId,
      platform: input.platform,
      query,
      ...(locale ? { locale } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      limit
    });
    const result = parseOjSearchResult(payload, input.platform);
    if (result.requestId !== requestId) {
      throw new OjBrokerError("upstream.schema_changed", "题库返回了不匹配的 requestId。", input.platform);
    }
    return result;
  }

  public async fetchProblem(summary: OjProblemSummary): Promise<OjProblemDocument> {
    const platform = summary.ref.platform;
    const capabilities = await this.loadCapabilities(platform);
    assertReadableCapability(capabilities.operations.fetchProblem, platform, "导题");
    const descriptor = this.requireDescriptor(platform);

    if (descriptor.dialect === "luogu-v0.2") {
      const payload = await this.call(platform, "luogu_fetch_problem", {
        pid: summary.ref.nativeId,
        maxStatementChars: 20_000
      });
      return normalizeLegacyLuoguDocument(payload);
    }

    let args: Record<string, unknown>;
    if (platform === "leetcode") {
      args = summary.ref as unknown as Record<string, unknown>;
    } else if (platform === "atcoder" || platform === "nowcoder") {
      args = { url: summary.ref.url };
    } else {
      throw new OjBrokerError(
        "capability.unsupported",
        "Codeforces 官方 API 只提供题目元数据；请用 Competitive Companion 导入题面。",
        platform
      );
    }

    return parseOjProblemDocument(await this.call(platform, "oj_fetch_problem", args), platform);
  }

  public async reconfigure(descriptors: OjProviderDescriptor[]): Promise<void> {
    await this.close();
    this.descriptors.clear();
    this.statuses.clear();
    this.setDescriptors(descriptors);
  }

  public async close(): Promise<void> {
    const sessions = Array.from(this.sessions.values());
    this.sessions.clear();
    this.capabilities.clear();
    await Promise.all(
      sessions.map(async (pending) => {
        try {
          await (await pending).close();
        } catch {
          // Closing a failed or already-closed transport is best effort.
        }
      })
    );
  }

  public dispose(): void {
    void this.close();
  }

  private setDescriptors(descriptors: OjProviderDescriptor[]): void {
    for (const descriptor of descriptors) {
      if (this.descriptors.has(descriptor.platform)) {
        throw new Error(`Duplicate OJ provider descriptor for ${descriptor.platform}.`);
      }
      this.descriptors.set(descriptor.platform, descriptor);
    }
  }

  private async loadCapabilities(platform: OjPlatformId, force = false): Promise<OjCapabilities> {
    const cached = this.capabilities.get(platform);
    if (!force && cached && cached.expiresAt > this.now()) return cached.value;
    const descriptor = this.requireDescriptor(platform);
    if (!descriptor.transport) {
      throw new OjBrokerError("provider.unconfigured", descriptor.unavailableReason ?? `${descriptor.label} 未配置。`, platform);
    }
    const value =
      descriptor.dialect === "luogu-v0.2"
        ? normalizeLegacyLuoguCapabilities(await this.call(platform, "luogu_get_capabilities", {}), descriptor)
        : parseOjCapabilities(await this.call(platform, "oj_capabilities", {}), platform);
    this.capabilities.set(platform, { value, expiresAt: this.now() + CAPABILITY_CACHE_MS });
    return value;
  }

  private async loadHealth(platform: OjPlatformId): Promise<OjProviderHealth> {
    const descriptor = this.requireDescriptor(platform);
    if (descriptor.dialect === "luogu-v0.2") {
      const startedAt = this.now();
      const tools = await (await this.session(platform)).listTools(READ_TIMEOUT_MS);
      const required = ["luogu_get_capabilities", "luogu_search_problems", "luogu_fetch_problem"];
      const missing = required.filter((name) => !tools.includes(name));
      const checkedAt = new Date(this.now()).toISOString();
      return {
        schemaVersion: "oj.provider-health/v1",
        providerId: "luogu-mcp-server",
        platform,
        checkedAt,
        overall: missing.length === 0 ? "healthy" : "degraded",
        layers: {
          transport: "pass",
          protocol: "pass",
          schema: missing.length === 0 ? "pass" : "drift",
          auth: "not_required",
          upstream: "pass"
        },
        latencyMs: Math.max(0, this.now() - startedAt),
        message: missing.length === 0 ? "洛谷 MCP 已连接，核心搜索与导题工具可用。" : `洛谷 MCP 缺少工具：${missing.join("、")}。`
      };
    }
    return parseOjProviderHealth(await this.call(platform, "oj_health", {}), platform);
  }

  private async call(platform: OjPlatformId, name: string, args: Record<string, unknown>): Promise<unknown> {
    let session: OjMcpSession;
    try {
      session = await this.session(platform);
    } catch (error) {
      this.sessions.delete(platform);
      throw new OjBrokerError("transport.unavailable", `${this.requireDescriptor(platform).label} 连接失败：${errorMessage(error)}`, platform);
    }

    let result;
    try {
      result = await session.callTool(name, args, READ_TIMEOUT_MS);
    } catch (error) {
      this.sessions.delete(platform);
      void session.close().catch(() => undefined);
      throw new OjBrokerError("transport.unavailable", `${this.requireDescriptor(platform).label} 请求失败：${errorMessage(error)}`, platform);
    }
    if (result.isError) {
      const ojError = parseOjError(result.payload);
      throw new OjBrokerError(ojError?.code ?? "provider.error", ojError?.message ?? "题库服务拒绝了本次请求。", platform);
    }
    return result.payload;
  }

  private session(platform: OjPlatformId): Promise<OjMcpSession> {
    const existing = this.sessions.get(platform);
    if (existing) return existing;
    const descriptor = this.requireDescriptor(platform);
    const pending = this.sessionFactory(descriptor).catch((error) => {
      if (this.sessions.get(platform) === pending) this.sessions.delete(platform);
      throw error;
    });
    this.sessions.set(platform, pending);
    return pending;
  }

  private requireDescriptor(platform: OjPlatformId): OjProviderDescriptor {
    const descriptor = this.descriptors.get(platform);
    if (!descriptor) throw new OjBrokerError("provider.unknown", `未注册 ${platform} 题库服务。`, platform);
    return descriptor;
  }
}

function initialStatus(descriptor: OjProviderDescriptor): OjProviderStatusView {
  return {
    platform: descriptor.platform,
    label: descriptor.label,
    configured: Boolean(descriptor.transport),
    transport: descriptor.transport?.kind,
    endpoint: descriptor.transport?.kind === "remote_http" ? descriptor.transport.endpoint : undefined,
    overall: "unknown",
    searchStatus: descriptor.transport ? "degraded" : "unsupported",
    fetchStatus: descriptor.transport ? "degraded" : "unsupported",
    message: descriptor.transport ? "尚未检查连接。" : descriptor.unavailableReason ?? "尚未配置。"
  };
}

function assertReadableCapability(capability: OjCapability, platform: OjPlatformId, action: string): void {
  if (capability.status === "available" || capability.status === "degraded") return;
  throw new OjBrokerError(
    capability.status === "auth_required" ? "auth.required" : "capability.unsupported",
    capability.reason ?? `${platform} 当前不支持${action}。`,
    platform
  );
}

function normalizeLegacyLuoguCapabilities(value: unknown, descriptor: OjProviderDescriptor): OjCapabilities {
  const record = expectRecord(value, "洛谷能力响应");
  const tools = expectArray(record.tools, "洛谷能力工具").map((item) => expectRecord(item, "洛谷能力工具项"));
  const checkedAt = new Date().toISOString();
  const statusByName = new Map(
    tools.map((tool) => [expectString(tool.name, "洛谷工具名"), expectString(tool.status, "洛谷工具状态")])
  );
  const operations = Object.fromEntries(
    ojCapabilityNames.map((name): [OjCapabilityName, OjCapability] => {
      const toolName = name === "searchProblems" ? "luogu_search_problems" : name === "fetchProblem" ? "luogu_fetch_problem" : undefined;
      const advertised = toolName ? statusByName.get(toolName) : undefined;
      return [
        name,
        {
          name,
          status: advertised === "available" ? "available" : advertised === "auth_required" ? "auth_required" : "unsupported",
          toolName,
          transport: descriptor.transport?.kind ?? "remote_http",
          auth: advertised === "auth_required" ? "session_cookie" : "none",
          risk: name === "commitSubmission" ? "R4_real_submit" : name === "prepareSubmission" ? "R3_prepare_write" : "R0_public_read",
          compliance: "unofficial",
          reason: toolName ? undefined : "洛谷 v0.2.1 兼容层只接入公开搜索和题面读取。",
          checkedAt
        }
      ];
    })
  ) as Record<OjCapabilityName, OjCapability>;
  return {
    schemaVersion: "oj.capabilities/v1",
    providerId: "luogu-mcp-server",
    providerVersion: "0.2.1",
    platform: "luogu",
    protocolVersion: "legacy-compatible",
    operations,
    languages: [],
    source: legacyLuoguSource("https://www.luogu.com.cn/")
  };
}

function normalizeLegacyLuoguSearch(value: unknown, query: string): OjSearchResult {
  const record = expectRecord(value, "洛谷搜索响应");
  const source = legacyLuoguSource("https://www.luogu.com.cn/problem/list");
  return {
    schemaVersion: "oj.search-result/v1",
    requestId: randomUUID(),
    items: expectArray(record.items, "洛谷搜索结果").map((item) => {
      const result = expectRecord(item, "洛谷搜索结果项");
      const id = expectString(result.id, "洛谷题号").toUpperCase();
      const url = expectHttpsUrl(result.sourceUrl, "洛谷题目 URL", "www.luogu.com.cn");
      return {
        schemaVersion: "oj.problem-summary/v1",
        ref: {
          schemaVersion: "oj.problem-ref/v1",
          platform: "luogu",
          nativeId: id,
          canonicalId: `luogu:${id}`,
          url,
          source
        },
        title: expectString(result.title, "洛谷题目标题"),
        difficulty: typeof result.difficulty === "number" ? { scale: "luogu", value: result.difficulty } : undefined,
        tags: stringArray(result.tags).map((tag) => ({ namespace: "platform", slug: tag, name: tag })),
        source
      };
    }),
    source: { ...source, rawRef: query }
  };
}

function normalizeLegacyLuoguDocument(value: unknown): OjProblemDocument {
  const record = expectRecord(value, "洛谷题面响应");
  const id = expectString(record.id, "洛谷题号").toUpperCase();
  const url = expectHttpsUrl(record.sourceUrl, "洛谷题目 URL", "www.luogu.com.cn");
  const source = legacyLuoguSource(url);
  const statement = expectString(record.statement, "洛谷题面", true);
  const input = expectString(record.inputFormat, "洛谷输入格式", true);
  const output = expectString(record.outputFormat, "洛谷输出格式", true);
  const truncated = record.truncated === true;
  return {
    schemaVersion: "oj.problem-document/v1",
    ref: {
      schemaVersion: "oj.problem-ref/v1",
      platform: "luogu",
      nativeId: id,
      canonicalId: `luogu:${id}`,
      url,
      source
    },
    title: expectString(record.title, "洛谷题目标题"),
    locale: "zh-CN",
    access: "public",
    difficulty: typeof record.difficulty === "number" ? { scale: "luogu", value: record.difficulty } : undefined,
    tags: stringArray(record.tags).map((tag) => ({ namespace: "platform", slug: tag, name: tag })),
    content: {
      statement: textBlock(statement, "markdown", truncated),
      input: textBlock(input, "markdown", false),
      output: textBlock(output, "markdown", false)
    },
    constraints: [],
    samples: expectArray(record.samples, "洛谷样例").map((item, index) => {
      const sample = expectRecord(item, "洛谷样例项");
      return {
        ordinal: index + 1,
        input: expectString(sample.input, "洛谷样例输入", true),
        output: expectString(sample.output, "洛谷样例输出", true)
      };
    }),
    limits: {},
    io: { mode: "stdin_stdout" },
    starterCode: [],
    source
  };
}

function legacyLuoguSource(sourceUrl: string): OjSourceRef {
  return {
    kind: "page_adapter",
    adapterId: "luogu-mcp-server",
    adapterVersion: "0.2.1",
    fetchedAt: new Date().toISOString(),
    sourceUrl,
    confidence: "derived"
  };
}

function textBlock(text: string, format: "markdown" | "html" | "text", truncated: boolean): OjTextBlock {
  return {
    text,
    format,
    locale: "zh-CN",
    truncated,
    originalChars: text.length,
    sha256: createHash("sha256").update(text, "utf8").digest("hex")
  };
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(50, Math.floor(value))) : fallback;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new OjContractError(`${label}格式错误。`);
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new OjContractError(`${label}格式错误。`);
  return value;
}

function expectString(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value)) throw new OjContractError(`${label}格式错误。`);
  return value;
}

function expectHttpsUrl(value: unknown, label: string, host: string): string {
  const raw = expectString(value, label);
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== host) throw new OjContractError(`${label}不在允许的站点。`);
  return url.toString();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

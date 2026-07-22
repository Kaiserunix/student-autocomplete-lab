import { existsSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { OjMcpBroker } from "./broker";
import type { OjPlatformId, OjProviderDescriptor } from "./types";

const settingSection = "studentAutocomplete.oj";
const nowCoderSessionSecret = "studentAutocomplete.oj.nowcoder.sessionCookie";
const remoteKeySecretPrefix = "studentAutocomplete.oj.remoteKey";

export interface OjProviderSettingsSnapshot {
  nodePath?: string;
  remoteEnabled?: Partial<Record<"luogu" | "codeforces" | "atcoder", boolean>>;
  remoteEndpoints?: Partial<Record<"luogu" | "codeforces" | "atcoder", string>>;
  nowCoderEntrypoint?: string;
  nowCoderCompanionPort?: number;
  leetCodeEntrypoint?: string;
  leetCodeSite?: "global" | "cn";
}

export interface OjProviderSecretSnapshot {
  nowCoderSessionCookie?: string;
  remoteKeys?: Partial<Record<"luogu" | "codeforces" | "atcoder", string>>;
}

export async function createVsCodeOjBroker(context: vscode.ExtensionContext): Promise<OjMcpBroker> {
  return new OjMcpBroker(await readOjProviderDescriptors(context));
}

export async function reloadVsCodeOjBroker(context: vscode.ExtensionContext, broker: OjMcpBroker): Promise<void> {
  await broker.reconfigure(await readOjProviderDescriptors(context));
}

export async function readOjProviderDescriptors(context: vscode.ExtensionContext): Promise<OjProviderDescriptor[]> {
  return buildOjProviderDescriptors(
    context.extensionPath,
    readOjProviderSettings(),
    await readOjProviderSecrets(context.secrets),
    existsSync
  );
}

export function buildOjProviderDescriptors(
  extensionPath: string,
  settings: OjProviderSettingsSnapshot,
  secrets: OjProviderSecretSnapshot,
  fileExists: (filePath: string) => boolean = existsSync
): OjProviderDescriptor[] {
  const nodePath = settings.nodePath?.trim() || "node";
  const remote = (
    platform: "luogu" | "codeforces" | "atcoder",
    label: string,
    dialect: OjProviderDescriptor["dialect"],
    defaultEndpoint: string
  ): OjProviderDescriptor => {
    if (settings.remoteEnabled?.[platform] === false) {
      return { platform, label, dialect, unavailableReason: "已在 VS Code 设置中停用。" };
    }
    const endpoint = settings.remoteEndpoints?.[platform]?.trim() || defaultEndpoint;
    if (!isHttpsUrl(endpoint)) {
      return { platform, label, dialect, unavailableReason: "MCP 地址必须是有效的 HTTPS URL。" };
    }
    const apiKey = secrets.remoteKeys?.[platform]?.trim();
    return {
      platform,
      label,
      dialect,
      transport: {
        kind: "remote_http",
        endpoint,
        headers: apiKey ? { "X-OJ-MCP-Key": apiKey } : undefined
      }
    };
  };

  const nowCoderPath = resolveLocalEntrypoint(
    settings.nowCoderEntrypoint,
    path.resolve(extensionPath, "..", "nowcoder-oj-mcp", "packages", "nowcoder", "dist", "index.js"),
    fileExists
  );
  const leetCodePath = resolveLocalEntrypoint(
    settings.leetCodeEntrypoint,
    path.resolve(extensionPath, "..", "leetcode-mcp-private", "build", "index.js"),
    fileExists
  );
  const sessionCookie = secrets.nowCoderSessionCookie?.trim();

  return [
    remote(
      "luogu",
      "洛谷",
      "luogu-v0.2",
      "https://luogu-mcp-server.lantangtang54.workers.dev/mcp"
    ),
    {
      platform: "leetcode",
      label: "LeetCode",
      dialect: "canonical-v1",
      transport: leetCodePath
        ? {
            kind: "local_stdio",
            command: nodePath,
            args: [leetCodePath, "--site", settings.leetCodeSite ?? "cn"],
            cwd: path.dirname(leetCodePath)
          }
        : undefined,
      unavailableReason: leetCodePath ? undefined : "未配置本机 LeetCode 私有适配器入口。"
    },
    {
      platform: "nowcoder",
      label: "牛客",
      dialect: "canonical-v1",
      transport: nowCoderPath
        ? {
            kind: "local_stdio",
            command: nodePath,
            args: [nowCoderPath],
            cwd: path.dirname(nowCoderPath),
            env: {
              ...(sessionCookie ? { NOWCODER_SESSION_COOKIE: sessionCookie } : {}),
              COMPETITIVE_COMPANION_PORT: String(normalizePort(settings.nowCoderCompanionPort))
            }
          }
        : undefined,
      unavailableReason: nowCoderPath ? undefined : "未配置本机牛客 MCP 入口。"
    },
    remote(
      "codeforces",
      "Codeforces",
      "canonical-v1",
      "https://codeforces-oj-mcp.lantangtang54.workers.dev/mcp"
    ),
    remote("atcoder", "AtCoder", "canonical-v1", "https://api.ksrnyx.top/oj-mcp/atcoder/mcp")
  ];
}

export async function promptAndStoreNowCoderSession(context: vscode.ExtensionContext): Promise<boolean> {
  const value = await vscode.window.showInputBox({
    title: "更新牛客登录态",
    prompt: "粘贴发往 ac.nowcoder.com 请求的完整 Cookie 请求头值",
    password: true,
    ignoreFocusOut: true,
    validateInput: (input) => {
      const trimmed = input.trim();
      if (!trimmed) return "Cookie 不能为空。";
      if (trimmed.length > 16 * 1024) return "Cookie 超过 16 KiB 上限。";
      if (/\r|\n/.test(trimmed)) return "Cookie 不能包含换行。";
      return undefined;
    }
  });
  if (!value?.trim()) return false;
  await context.secrets.store(nowCoderSessionSecret, value.trim());
  return true;
}

export async function clearNowCoderSession(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(nowCoderSessionSecret);
}

export async function promptAndStoreRemoteOjKey(
  context: vscode.ExtensionContext,
  platform: "luogu" | "codeforces" | "atcoder"
): Promise<boolean> {
  const value = await vscode.window.showInputBox({
    title: `更新 ${platform} MCP 访问密钥`,
    prompt: "该值只写入 VS Code SecretStorage，并作为 X-OJ-MCP-Key 请求头发送。",
    password: true,
    ignoreFocusOut: true,
    validateInput: (input) => {
      const trimmed = input.trim();
      if (!trimmed) return "访问密钥不能为空。";
      if (trimmed.length > 512) return "访问密钥超过 512 字符上限。";
      if (/\r|\n/.test(trimmed)) return "访问密钥不能包含换行。";
      return undefined;
    }
  });
  if (!value?.trim()) return false;
  await context.secrets.store(remoteSecretKey(platform), value.trim());
  return true;
}

export async function clearRemoteOjKey(
  context: vscode.ExtensionContext,
  platform: "luogu" | "codeforces" | "atcoder"
): Promise<void> {
  await context.secrets.delete(remoteSecretKey(platform));
}

function readOjProviderSettings(): OjProviderSettingsSnapshot {
  const configuration = vscode.workspace.getConfiguration(settingSection);
  return {
    nodePath: configuredString(configuration, "nodePath"),
    remoteEnabled: {
      luogu: configuration.get<boolean>("luogu.enabled", true),
      codeforces: configuration.get<boolean>("codeforces.enabled", true),
      atcoder: configuration.get<boolean>("atcoder.enabled", true)
    },
    remoteEndpoints: {
      luogu: configuredString(configuration, "luogu.endpoint"),
      codeforces: configuredString(configuration, "codeforces.endpoint"),
      atcoder: configuredString(configuration, "atcoder.endpoint")
    },
    nowCoderEntrypoint: configuredString(configuration, "nowcoder.entrypoint"),
    nowCoderCompanionPort: configuration.get<number>("nowcoder.companionPort", 10043),
    leetCodeEntrypoint: configuredString(configuration, "leetcode.entrypoint"),
    leetCodeSite: configuration.get<"global" | "cn">("leetcode.site", "cn")
  };
}

async function readOjProviderSecrets(secrets: vscode.SecretStorage): Promise<OjProviderSecretSnapshot> {
  return {
    nowCoderSessionCookie: await secrets.get(nowCoderSessionSecret),
    remoteKeys: {
      luogu: await secrets.get(remoteSecretKey("luogu")),
      codeforces: await secrets.get(remoteSecretKey("codeforces")),
      atcoder: await secrets.get(remoteSecretKey("atcoder"))
    }
  };
}

function resolveLocalEntrypoint(
  configuredPath: string | undefined,
  developmentFallback: string,
  fileExists: (filePath: string) => boolean
): string | undefined {
  const candidate = configuredPath?.trim() ? path.resolve(configuredPath.trim()) : developmentFallback;
  return fileExists(candidate) ? candidate : undefined;
}

function normalizePort(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1024 && value <= 65_535 ? value : 10043;
}

function configuredString(configuration: vscode.WorkspaceConfiguration, key: string): string | undefined {
  const value = configuration.get<string>(key);
  return value?.trim() || undefined;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function remoteSecretKey(platform: "luogu" | "codeforces" | "atcoder"): string {
  return `${remoteKeySecretPrefix}.${platform}`;
}

export function isRemoteOjPlatform(platform: OjPlatformId): platform is "luogu" | "codeforces" | "atcoder" {
  return platform === "luogu" || platform === "codeforces" || platform === "atcoder";
}

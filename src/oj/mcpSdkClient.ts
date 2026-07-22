import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OjMcpSession, OjMcpToolResult, OjProviderDescriptor } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TEXT_PAYLOAD_CHARS = 2 * 1024 * 1024;

export async function connectOjMcpSession(descriptor: OjProviderDescriptor): Promise<OjMcpSession> {
  if (!descriptor.transport) {
    throw new Error(descriptor.unavailableReason ?? `${descriptor.label} MCP is not configured.`);
  }

  const client = new Client(
    { name: "student-autocomplete-oj-broker", version: "0.1.0" },
    { capabilities: {} }
  );
  const transport =
    descriptor.transport.kind === "remote_http"
      ? new StreamableHTTPClientTransport(new URL(descriptor.transport.endpoint), {
          requestInit: descriptor.transport.headers
            ? { headers: descriptor.transport.headers }
            : undefined,
          reconnectionOptions: {
            initialReconnectionDelay: 500,
            maxReconnectionDelay: 2_000,
            reconnectionDelayGrowFactor: 1.5,
            maxRetries: 1
          }
        })
      : new StdioClientTransport({
          command: descriptor.transport.command,
          args: descriptor.transport.args,
          cwd: descriptor.transport.cwd,
          env: {
            ...getDefaultEnvironment(),
            ...(descriptor.transport.env ?? {})
          },
          stderr: "ignore"
        });

  try {
    await client.connect(transport, { timeout: DEFAULT_TIMEOUT_MS });
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }

  const server = client.getServerVersion();
  return {
    serverName: server?.name,
    serverVersion: server?.version,
    async listTools(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string[]> {
      const response = await client.listTools(undefined, { timeout: timeoutMs });
      return response.tools.map((tool) => tool.name);
    },
    async callTool(
      name: string,
      args: Record<string, unknown>,
      timeoutMs = DEFAULT_TIMEOUT_MS
    ): Promise<OjMcpToolResult> {
      const response = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
      const responseRecord: Record<string, unknown> = isRecord(response) ? response : {};
      return {
        isError: typeof responseRecord.isError === "boolean" ? responseRecord.isError : undefined,
        payload: extractStructuredPayload(response)
      };
    },
    close: () => client.close()
  };
}

function extractStructuredPayload(response: unknown): unknown {
  const record: Record<string, unknown> = isRecord(response) ? response : {};
  if (record.structuredContent !== undefined) {
    return record.structuredContent;
  }

  const content = Array.isArray(record.content) ? record.content : [];
  let text: string | undefined;
  for (const item of content) {
    if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
      text = item.text;
      break;
    }
  }
  if (text === undefined) {
    throw new Error("MCP tool returned neither structuredContent nor JSON text content.");
  }
  if (text.length > MAX_TEXT_PAYLOAD_CHARS) {
    throw new Error("MCP tool response exceeded the 2 MiB text limit.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("MCP tool returned text that was not valid JSON.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

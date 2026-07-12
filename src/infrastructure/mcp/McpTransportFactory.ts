import { Client, type ClientOptions } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OjProviderEntrypointV1 } from "../../domain/oj/contracts";

export interface McpListedTool {
  name: string;
  inputSchema: { type: "object"; properties?: Record<string, object>; required?: string[]; [key: string]: unknown };
  outputSchema?: { type: "object"; properties?: Record<string, object>; required?: string[]; [key: string]: unknown };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface McpToolCallResult {
  structuredContent?: unknown;
  isError?: boolean;
}

export interface McpClientConnection {
  connect(signal?: AbortSignal): Promise<void>;
  listTools(signal?: AbortSignal): Promise<McpListedTool[]>;
  callTool(name: string, arguments_: Record<string, unknown>, signal?: AbortSignal): Promise<McpToolCallResult>;
  onToolsChanged(listener: (tools: McpListedTool[]) => void): void;
  close(): Promise<void>;
}

export interface McpConnectionFactory {
  create(entrypoint: OjProviderEntrypointV1): McpClientConnection;
}

export class SdkMcpConnectionFactory implements McpConnectionFactory {
  create(entrypoint: OjProviderEntrypointV1): McpClientConnection {
    return new SdkMcpClientConnection(entrypoint);
  }
}

class SdkMcpClientConnection implements McpClientConnection {
  private readonly client: Client;
  private readonly transport;
  private toolsChangedListener?: (tools: McpListedTool[]) => void;

  constructor(entrypoint: OjProviderEntrypointV1) {
    const clientOptions: ClientOptions = {
      capabilities: {},
      listChanged: {
        tools: {
          onChanged: (error, result) => {
            if (!error && result) {
              this.toolsChangedListener?.(result as McpListedTool[]);
            }
          }
        }
      }
    };
    this.client = new Client({ name: "student-autocomplete-oj-broker", version: "0.1.0" }, clientOptions);
    if (entrypoint.transport === "remote_http") {
      this.transport = new StreamableHTTPClientTransport(new URL(requireValue(entrypoint.url, "Remote MCP entrypoint URL")));
    } else {
      this.transport = new StdioClientTransport({
        command: requireValue(entrypoint.command, "Local MCP entrypoint command"),
        args: entrypoint.args,
        stderr: "pipe"
      });
    }
  }

  async connect(signal?: AbortSignal): Promise<void> {
    await this.client.connect(this.transport, signal ? { signal } : undefined);
  }

  async listTools(signal?: AbortSignal): Promise<McpListedTool[]> {
    const result = await this.client.listTools(undefined, signal ? { signal } : undefined);
    return result.tools as McpListedTool[];
  }

  async callTool(name: string, arguments_: Record<string, unknown>, signal?: AbortSignal): Promise<McpToolCallResult> {
    const result = await this.client.callTool({ name, arguments: arguments_ }, undefined, signal ? { signal } : undefined);
    if ("toolResult" in result) {
      throw new Error("Task-based MCP tools are not supported by the OJ Broker entrypoint.");
    }
    return {
      structuredContent: result.structuredContent,
      isError: result.isError
    };
  }

  onToolsChanged(listener: (tools: McpListedTool[]) => void): void {
    this.toolsChangedListener = listener;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

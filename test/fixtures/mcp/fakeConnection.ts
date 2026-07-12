import type {
  McpClientConnection,
  McpListedTool,
  McpToolCallResult
} from "../../../src/infrastructure/mcp/McpTransportFactory";

export class FakeConnection implements McpClientConnection {
  connectCount = 0;
  closeCount = 0;
  calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  private toolsChangedListener?: (tools: McpListedTool[]) => void;

  constructor(
    private readonly tools: McpListedTool[],
    private readonly result: McpToolCallResult
  ) {}

  async connect(): Promise<void> {
    this.connectCount += 1;
  }

  async listTools(): Promise<McpListedTool[]> {
    return this.tools;
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<McpToolCallResult> {
    this.calls.push({ name, arguments: arguments_ });
    return this.result;
  }

  onToolsChanged(listener: (tools: McpListedTool[]) => void): void {
    this.toolsChangedListener = listener;
  }

  emitToolsChanged(tools: McpListedTool[]): void {
    this.toolsChangedListener?.(tools);
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

import { createHash } from "node:crypto";
import type { z } from "zod";
import { ojErrorSchema } from "../../domain/oj/schemas";
import { McpContractError, OjMcpToolError } from "./errors";
import type { McpListedTool, McpToolCallResult } from "./McpTransportFactory";

export function hashMcpToolSchema(tool: McpListedTool): string {
  const schema = stableJson({ inputSchema: tool.inputSchema, outputSchema: tool.outputSchema ?? null });
  return createHash("sha256").update(schema).digest("hex");
}

export function decodeMcpToolResult<T>(result: McpToolCallResult, schema: z.ZodType<T>): T {
  if (result.isError) {
    const parsedError = ojErrorSchema.safeParse(result.structuredContent);
    if (!parsedError.success) {
      throw new McpContractError("MCP tool returned isError without a valid structured OjError.");
    }
    throw new OjMcpToolError(parsedError.data);
  }
  if (!result.structuredContent) {
    throw new McpContractError("MCP tool result is missing structuredContent.");
  }
  const parsed = schema.safeParse(result.structuredContent);
  if (!parsed.success) {
    throw new McpContractError(`MCP tool structuredContent failed contract validation: ${parsed.error.message}`);
  }
  return parsed.data;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export type AppServerRequestId = string | number;

export interface AppServerResponse {
  kind: "response";
  id: AppServerRequestId;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

export interface AppServerNotification {
  kind: "notification";
  method: string;
  params?: unknown;
}

export interface AppServerRequest {
  kind: "request";
  id: AppServerRequestId;
  method: string;
  params?: unknown;
}

export type AppServerMessage = AppServerResponse | AppServerNotification | AppServerRequest;

export function parseAppServerMessage(line: string): AppServerMessage | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const id = requestId(record.id);
  if (typeof record.method === "string" && record.method) {
    if (id !== undefined) {
      return {
        kind: "request",
        id,
        method: record.method,
        ...(record.params !== undefined ? { params: record.params } : {})
      };
    }
    return {
      kind: "notification",
      method: record.method,
      ...(record.params !== undefined ? { params: record.params } : {})
    };
  }

  if (id === undefined || (record.result === undefined && record.error === undefined)) {
    return undefined;
  }

  return {
    kind: "response",
    id,
    ...(record.result !== undefined ? { result: record.result } : {}),
    ...(record.error !== undefined ? { error: normalizeError(record.error) } : {})
  };
}

function normalizeError(value: unknown): AppServerResponse["error"] {
  const record = asRecord(value);
  if (!record) {
    return { message: "Unknown app-server error" };
  }
  return {
    ...(typeof record.code === "number" ? { code: record.code } : {}),
    ...(typeof record.message === "string" ? { message: record.message } : {}),
    ...(record.data !== undefined ? { data: record.data } : {})
  };
}

function requestId(value: unknown): AppServerRequestId | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

import { readFile } from "node:fs/promises";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import path from "node:path";

export interface OjConsoleFrontendOptions {
  root: string;
  token: string;
  api: RequestListener;
}

const assets = new Map<string, { fileName: string; contentType: string }>([
  ["/", { fileName: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/index.html", { fileName: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.js", { fileName: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["/styles.css", { fileName: "styles.css", contentType: "text/css; charset=utf-8" }]
]);

export function createOjConsoleRequestHandler(options: OjConsoleFrontendOptions): RequestListener {
  return (request, response) => {
    setSecurityHeaders(response);
    if (!isLocalHost(request.headers.host)) {
      sendText(response, 403, "Local Host Required\n");
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/api/")) {
      options.api(request, response);
      return;
    }
    void serveAsset(request, response, url.pathname, options).catch(() => {
      sendText(response, 500, "本地控制台页面读取失败。\n");
    });
  };
}

function isLocalHost(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    const hostname = new URL(`http://${value}`).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

async function serveAsset(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  options: OjConsoleFrontendOptions
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method Not Allowed\n");
    return;
  }
  const asset = assets.get(pathname);
  if (!asset) {
    sendText(response, 404, "Not Found\n");
    return;
  }
  let body = await readFile(path.join(options.root, asset.fileName), "utf8");
  if (asset.fileName === "index.html") {
    if (!body.includes("__OJ_CONSOLE_TOKEN__")) {
      throw new Error("missing frontend token placeholder");
    }
    body = body.replace("__OJ_CONSOLE_TOKEN__", escapeHtmlAttribute(options.token));
  }
  response.statusCode = 200;
  response.setHeader("content-type", asset.contentType);
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-length", Buffer.byteLength(body));
  response.end(request.method === "HEAD" ? undefined : body);
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
  );
  response.setHeader("cross-origin-opener-policy", "same-origin");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sendText(response: ServerResponse, status: number, body: string): void {
  if (response.headersSent || response.destroyed) {
    return;
  }
  response.statusCode = status;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(body);
}

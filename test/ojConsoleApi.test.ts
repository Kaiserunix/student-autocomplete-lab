import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createOjConsoleApi } from "../prototypes/oj-console/backend/api";
import { runDemoSubmission } from "../prototypes/oj-console/backend/demoSubmission";
import { REAL_MODE_UNLOCK_PHRASE } from "../prototypes/oj-console/backend/modeGate";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function startApi(options: Parameters<typeof createOjConsoleApi>[0]) {
  const server = createServer(createOjConsoleApi(options));
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("missing test address");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { baseUrl };
}

function tokenHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "x-oj-console-token": "test-token", ...extra };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

describe("OJ console local API", () => {
  test("requires the startup token and rejects foreign browser origins", async () => {
    const { baseUrl } = await startApi({ token: "test-token", runtimeRoot: ".runtime/test-oj-console" });

    const missing = await fetch(`${baseUrl}/api/status`);
    expect(missing.status).toBe(401);
    expect(await json(missing)).toMatchObject({ error: { code: "unauthorized" } });

    const foreign = await fetch(`${baseUrl}/api/status`, {
      headers: tokenHeaders({ origin: "https://evil.example" })
    });
    expect(foreign.status).toBe(403);
    expect(await json(foreign)).toMatchObject({ error: { code: "origin_rejected" } });

    const local = await fetch(`${baseUrl}/api/status`, {
      headers: tokenHeaders({ origin: baseUrl })
    });
    expect(local.status).toBe(200);
  });

  test("caches status tool checks to avoid spawning a process for every refresh", async () => {
    const checkTool = vi.fn(async () => ({ available: false, message: "not installed" }));
    const { baseUrl } = await startApi({
      token: "test-token",
      runtimeRoot: ".runtime/test-oj-console",
      checkTool
    });

    await fetch(`${baseUrl}/api/status`, { headers: tokenHeaders() });
    await fetch(`${baseUrl}/api/status`, { headers: tokenHeaders() });

    expect(checkTool).toHaveBeenCalledOnce();
  });

  test("uploads safe metadata and completes a one-time demo submission", async () => {
    const { baseUrl } = await startApi({
      token: "test-token",
      runtimeRoot: ".runtime/test-oj-console",
      checkTool: async () => ({ available: false, message: "not installed" }),
      runDemo: (input) => runDemoSubmission({ ...input, sleep: async () => undefined })
    });
    const upload = await fetch(`${baseUrl}/api/source`, {
      method: "POST",
      headers: tokenHeaders({
        "content-type": "application/octet-stream",
        "x-source-name": "main.cpp"
      }),
      body: Buffer.from("SECRET_SOURCE_MARKER")
    });
    expect(upload.status).toBe(201);
    const source = await json(upload);
    expect(source).toMatchObject({ fileName: "main.cpp", language: "cpp", byteSize: 20 });
    expect(JSON.stringify(source)).not.toContain("SECRET_SOURCE_MARKER");

    const previewResponse = await fetch(`${baseUrl}/api/preview`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        sourceId: source.sourceId,
        problemUrl: "https://codeforces.com/problemset/problem/4/A",
        mode: "demo",
        scenario: "accepted"
      })
    });
    expect(previewResponse.status).toBe(201);
    const preview = await json(previewResponse);
    expect(preview).toMatchObject({
      mode: "demo",
      scenario: "accepted",
      target: { canonicalUrl: "https://codeforces.com/contest/4/problem/A" }
    });

    const confirmResponse = await fetch(`${baseUrl}/api/confirm`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ confirmationId: preview.confirmationId })
    });
    expect(confirmResponse.status).toBe(202);
    const confirmed = await json(confirmResponse);

    await new Promise((resolve) => setTimeout(resolve, 0));
    const jobResponse = await fetch(`${baseUrl}/api/submissions/${confirmed.jobId}`, {
      headers: tokenHeaders()
    });
    expect(await json(jobResponse)).toMatchObject({ state: "accepted", verdict: "AC" });

    const replay = await fetch(`${baseUrl}/api/confirm`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ confirmationId: preview.confirmationId })
    });
    expect(replay.status).toBe(409);
    expect(await json(replay)).toMatchObject({ error: { code: "confirmation_consumed" } });
  });

  test("keeps real preview and login locked until explicit unlock and tool availability", async () => {
    let available = false;
    const openLogin = vi.fn();
    const { baseUrl } = await startApi({
      token: "test-token",
      runtimeRoot: ".runtime/test-oj-console",
      checkTool: async () => available
        ? { available: true, message: "ready", version: "11.5.1" }
        : { available: false, message: "missing" },
      openLogin
    });
    const upload = await fetch(`${baseUrl}/api/source`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/octet-stream", "x-source-name": "main.cpp" }),
      body: Buffer.from("int main(){}")
    });
    const source = await json(upload);
    const realPreviewBody = JSON.stringify({
      sourceId: source.sourceId,
      problemUrl: "https://codeforces.com/contest/4/problem/A",
      mode: "real"
    });

    const locked = await fetch(`${baseUrl}/api/preview`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: realPreviewBody
    });
    expect(locked.status).toBe(403);

    const unlock = await fetch(`${baseUrl}/api/real-mode/unlock`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ phrase: REAL_MODE_UNLOCK_PHRASE })
    });
    expect(unlock.status).toBe(200);

    const unavailable = await fetch(`${baseUrl}/api/preview`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: realPreviewBody
    });
    expect(unavailable.status).toBe(503);
    expect(await json(unavailable)).toMatchObject({ error: { code: "tool_unavailable" } });

    available = true;
    const ready = await fetch(`${baseUrl}/api/preview`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: realPreviewBody
    });
    expect(ready.status).toBe(201);
    expect(await json(ready)).toMatchObject({ mode: "real", toolVersion: "11.5.1" });

    const login = await fetch(`${baseUrl}/api/login-terminal`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: "{}"
    });
    expect(login.status).toBe(202);
    expect(openLogin).toHaveBeenCalledOnce();
  });

  test("creates an AtCoder real preview and opens only its registered login flow", async () => {
    const openLogin = vi.fn();
    const { baseUrl } = await startApi({
      token: "test-token",
      runtimeRoot: ".runtime/test-oj-console",
      checkTool: async () => ({ available: true, message: "ready", version: "12.0.0" }),
      openLogin
    });
    const upload = await fetch(`${baseUrl}/api/source`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/octet-stream", "x-source-name": "main.cpp" }),
      body: Buffer.from("int main(){}")
    });
    const source = await json(upload);
    await fetch(`${baseUrl}/api/real-mode/unlock`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ phrase: REAL_MODE_UNLOCK_PHRASE })
    });

    const previewResponse = await fetch(`${baseUrl}/api/preview`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        sourceId: source.sourceId,
        problemUrl: "https://atcoder.jp/contests/abc350/tasks/abc350_a",
        mode: "real"
      })
    });
    expect(previewResponse.status).toBe(201);
    expect(await json(previewResponse)).toMatchObject({
      target: {
        platform: "atcoder",
        canonicalUrl: "https://atcoder.jp/contests/abc350/tasks/abc350_a"
      }
    });

    const login = await fetch(`${baseUrl}/api/login-terminal`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ platform: "atcoder" })
    });
    expect(login.status).toBe(202);
    expect(openLogin).toHaveBeenCalledWith("atcoder");
  });

  test("rejects a selected platform that does not match the normalized target", async () => {
    const { baseUrl } = await startApi({
      token: "test-token",
      runtimeRoot: ".runtime/test-oj-console"
    });
    const upload = await fetch(`${baseUrl}/api/source`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/octet-stream", "x-source-name": "main.cpp" }),
      body: Buffer.from("int main(){}")
    });
    const source = await json(upload);

    const response = await fetch(`${baseUrl}/api/preview`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        sourceId: source.sourceId,
        problemUrl: "https://atcoder.jp/contests/abc350/tasks/abc350_a",
        platform: "codeforces",
        mode: "demo",
        scenario: "accepted"
      })
    });

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: { code: "target_invalid" } });
  });

  test("rejects wrong body types and bounds source bytes without leaking them", async () => {
    const { baseUrl } = await startApi({ token: "test-token", runtimeRoot: ".runtime/test-oj-console" });
    const wrongType = await fetch(`${baseUrl}/api/source`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "text/plain", "x-source-name": "main.cpp" }),
      body: "SECRET_SOURCE_MARKER"
    });
    expect(wrongType.status).toBe(415);

    const oversized = await fetch(`${baseUrl}/api/source`, {
      method: "POST",
      headers: tokenHeaders({ "content-type": "application/octet-stream", "x-source-name": "main.cpp" }),
      body: Buffer.alloc(1024 * 1024 + 1, "x")
    });
    expect(oversized.status).toBe(413);
    const body = JSON.stringify(await json(oversized));
    expect(body).not.toContain("SECRET_SOURCE_MARKER");
    expect(body).not.toContain("stack");
  });
});

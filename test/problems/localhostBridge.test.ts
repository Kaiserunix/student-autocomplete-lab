import { createServer as createNetServer, request as httpRequest } from "node:http";
import type { ProblemDocument } from "../../src/core/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { LocalhostBridge, isAllowedLoopbackHost } from "../../src/problems";

const activeClosers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (activeClosers.length > 0) {
    const close = activeClosers.pop()!;
    await close();
  }
});

function rawPost(opts: {
  port: number;
  hostHeader: string;
  body: string;
  path?: string;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: opts.port,
        path: opts.path ?? "/",
        method: "POST",
        headers: {
          host: opts.hostHeader,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(opts.body),
          ...(opts.headers ?? {})
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          })
        );
      }
    );
    req.on("error", reject);
    req.write(opts.body);
    req.end();
  });
}

describe("LocalhostBridge", () => {
  it("validates allowed loopback Host headers strictly against DNS rebinding", () => {
    expect(isAllowedLoopbackHost("127.0.0.1:27121")).toBe(true);
    expect(isAllowedLoopbackHost("localhost:27121")).toBe(true);
    expect(isAllowedLoopbackHost("[::1]:27121")).toBe(true);
    expect(isAllowedLoopbackHost("evil.attacker.com:27121")).toBe(false);
    expect(isAllowedLoopbackHost("127.0.0.1.evil.com")).toBe(false);
    expect(isAllowedLoopbackHost(undefined)).toBe(false);
  });

  it("receives standard Competitive Companion JSON and optional statementMarkdown on ephemeral 127.0.0.1 port", async () => {
    const received: ProblemDocument[] = [];
    const bridge = new LocalhostBridge({
      preferredPort: 0,
      onProblem: (doc) => {
        received.push(doc);
      }
    });
    const port = await bridge.start();
    activeClosers.push(() => bridge.stop());

    expect(port).toBeGreaterThan(0);
    expect(bridge.isRunning()).toBe(true);

    // Health check
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as { ok: boolean; port: number };
    expect(healthJson.ok).toBe(true);
    expect(healthJson.port).toBe(port);

    // Standard Competitive Companion payload (samples_only)
    const ccPayload = {
      name: "A. Watermelon",
      group: "Codeforces",
      url: "https://codeforces.com/contest/4/problem/A",
      timeLimit: 1000,
      memoryLimit: 64,
      tests: [{ input: "8\n", output: "YES\n" }]
    };
    const res1 = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ccPayload)
    });
    expect(res1.status).toBe(200);
    expect(received[0]?.problemKey).toBe("cf:4A");
    expect(received[0]?.completeness).toBe("samples_only");
    expect(received[0]?.samples).toHaveLength(1);

    // Extended payload with statementMarkdown (full)
    const extPayload = {
      name: "NowCoder Sample",
      url: "https://ac.nowcoder.com/acm/problem/14362",
      timeLimit: 2000,
      memoryLimit: 256,
      tests: [{ input: "1 2\n", output: "3\n" }],
      statementMarkdown: "Given two integers, output their sum."
    };
    const res2 = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(extPayload)
    });
    expect(res2.status).toBe(200);
    expect(received[1]?.problemKey).toBe("nowcoder:acm-14362");
    expect(received[1]?.completeness).toBe("full");
    expect(received[1]?.statementMarkdown).toContain("output their sum");
  });

  it("rejects DNS Rebinding Host headers with 403 Forbidden", async () => {
    const bridge = new LocalhostBridge({ preferredPort: 0 });
    const port = await bridge.start();
    activeClosers.push(() => bridge.stop());

    const res = await rawPost({
      port,
      hostHeader: `rebind.evil.example:${port}`,
      body: JSON.stringify({ name: "Attack" })
    });
    expect(res.status).toBe(403);
    expect(bridge.getReceivedProblems()).toHaveLength(0);
  });

  it("falls back automatically to next port when preferredPort is occupied (EADDRINUSE)", async () => {
    // Occupy an ephemeral port first
    const blocker = createNetServer();
    const occupiedPort = await new Promise<number>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", () => {
        const addr = blocker.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });
    activeClosers.push(
      () =>
        new Promise<void>((resolve) => {
          blocker.close(() => resolve());
        })
    );

    const bridge = new LocalhostBridge({
      preferredPort: occupiedPort,
      maxPortAttempts: 5
    });
    const boundPort = await bridge.start();
    activeClosers.push(() => bridge.stop());

    expect(boundPort).toBeGreaterThan(occupiedPort);
    expect(boundPort).toBeLessThan(occupiedPort + 5);
  });

  it("enforces optional pairingToken when configured", async () => {
    const bridge = new LocalhostBridge({
      preferredPort: 0,
      pairingToken: "secret-123456"
    });
    const port = await bridge.start();
    activeClosers.push(() => bridge.stop());

    const unauthorized = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test" })
    });
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-algo-coach-token": "secret-123456"
      },
      body: JSON.stringify({ name: "Test", tests: [{ input: "1", output: "1" }] })
    });
    expect(authorized.status).toBe(200);
  });
});

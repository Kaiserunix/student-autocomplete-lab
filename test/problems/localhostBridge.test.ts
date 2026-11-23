import { createServer as createNetServer, request as httpRequest } from "node:http";
import type { ProblemDocument } from "../../src/core/contracts";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalhostBridge,
  isAllowedLoopbackHost,
  isAllowedVerdictCorsOrigin,
  normalizeBridgeVerdictPayload,
  normalizeBridgeVerdictText
} from "../../src/problems";

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

  it("enforces strict CORS origin allowlist and token authentication on POST /verdict across 6 OJs while keeping POST / compatible", async () => {
    expect(isAllowedVerdictCorsOrigin("https://leetcode.cn")).toBe(true);
    expect(isAllowedVerdictCorsOrigin("https://www.luogu.com.cn")).toBe(true);
    expect(isAllowedVerdictCorsOrigin("https://codeforces.com")).toBe(true);
    expect(isAllowedVerdictCorsOrigin("https://atcoder.jp")).toBe(true);
    expect(isAllowedVerdictCorsOrigin("https://ac.nowcoder.com")).toBe(true);
    expect(isAllowedVerdictCorsOrigin("https://leetcode.com")).toBe(true);
    expect(isAllowedVerdictCorsOrigin("chrome-extension://abcdefghijklmnop")).toBe(true);
    expect(isAllowedVerdictCorsOrigin("moz-extension://ext-uuid-1234")).toBe(true);

    expect(isAllowedVerdictCorsOrigin("https://evil.example")).toBe(false);
    expect(isAllowedVerdictCorsOrigin("http://leetcode.cn")).toBe(false);
    expect(isAllowedVerdictCorsOrigin("https://leetcode.cn/problems/two-sum")).toBe(false);
    expect(isAllowedVerdictCorsOrigin("https://leetcode.cn:8443")).toBe(false);
    expect(isAllowedVerdictCorsOrigin(undefined)).toBe(false);

    expect(normalizeBridgeVerdictText("通过")).toBe("AC");
    expect(normalizeBridgeVerdictText("解答错误")).toBe("WA");
    expect(normalizeBridgeVerdictText("答案正确")).toBe("AC");
    expect(normalizeBridgeVerdictText("Judging")).toBeUndefined();

    const luoguNorm = normalizeBridgeVerdictPayload({
      platform: "luogu",
      problemUrl: "https://www.luogu.com.cn/problem/P1001",
      submissionUrl: "https://www.luogu.com.cn/record/123456",
      submissionId: "123456",
      verdict: "Accepted"
    });
    expect(luoguNorm?.event.problemKey).toBe("luogu:P1001");
    expect(luoguNorm?.event.verdict).toBe("AC");
    expect(luoguNorm?.event.observedVia).toBe("browser_extension");
    expect(luoguNorm?.dedupKey).toBe("bridge-luogu-123456");

    const receivedVerdicts: Array<{ problemKey: string; verdict: string }> = [];
    const bridge = new LocalhostBridge({
      preferredPort: 0,
      verdictToken: "verdict-token-xyz",
      onVerdict: (v) => {
        receivedVerdicts.push({ problemKey: v.event.problemKey, verdict: v.event.verdict });
      }
    });
    const port = await bridge.start();
    activeClosers.push(() => bridge.stop());

    // OPTIONS preflight allows Luogu origin without wildcard and rejects evil origin
    const preflightOk = await fetch(`http://127.0.0.1:${port}/verdict`, {
      method: "OPTIONS",
      headers: { Origin: "https://www.luogu.com.cn" }
    });
    expect(preflightOk.status).toBe(204);
    expect(preflightOk.headers.get("access-control-allow-origin")).toBe("https://www.luogu.com.cn");

    const preflightBad = await fetch(`http://127.0.0.1:${port}/verdict`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" }
    });
    expect(preflightBad.status).toBe(403);
    expect(preflightBad.headers.get("access-control-allow-origin")).toBeNull();

    // POST /verdict rejects unauthenticated requests, accepts valid token
    const noToken = await fetch(`http://127.0.0.1:${port}/verdict`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: "https://www.luogu.com.cn" },
      body: JSON.stringify({ platform: "luogu", sourceId: "P1001", verdict: "AC" })
    });
    expect(noToken.status).toBe(401);

    const validVerdictRes = await fetch(`http://127.0.0.1:${port}/verdict`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://www.luogu.com.cn",
        "x-algo-coach-token": "verdict-token-xyz"
      },
      body: JSON.stringify({
        platform: "luogu",
        sourceId: "P1001",
        submissionId: "9988",
        verdict: "通过"
      })
    });
    expect(validVerdictRes.status).toBe(200);
    expect(validVerdictRes.headers.get("access-control-allow-origin")).toBe("https://www.luogu.com.cn");
    expect(receivedVerdicts).toEqual([{ problemKey: "luogu:P1001", verdict: "AC" }]);
    expect(bridge.getReceivedVerdicts()).toHaveLength(1);

    // Existing POST / Competitive Companion push stays backward-compatible without verdictToken header
    const ccPush = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "A+B Problem",
        url: "https://www.luogu.com.cn/problem/P1001",
        tests: [{ input: "1 2\n", output: "3\n" }]
      })
    });
    expect(ccPush.status).toBe(200);
    expect(bridge.getReceivedProblems()).toHaveLength(1);
  });

  it("prevents false AC on negative Chinese phrases and secures POST / against CSRF while emitting PNA headers", async () => {
    // P0-1: negative Chinese phrases & pass rate must never produce AC
    expect(normalizeBridgeVerdictText("未通过")).toBeUndefined();
    expect(normalizeBridgeVerdictText("部分通过")).toBeUndefined();
    expect(normalizeBridgeVerdictText("不通过")).toBeUndefined();
    expect(normalizeBridgeVerdictText("全部未通过")).toBeUndefined();
    expect(normalizeBridgeVerdictText("通过率")).toBeUndefined();
    expect(normalizeBridgeVerdictText("通过率 52.3%")).toBeUndefined();
    expect(normalizeBridgeVerdictText("未通过：解答错误")).toBe("WA");
    expect(normalizeBridgeVerdictText("已通过")).toBe("AC");

    // DedupKey alignment & canonical prefixes & mixed-case CN slug preservation
    expect(
      normalizeBridgeVerdictPayload({
        platform: "codeforces",
        sourceId: "1900A",
        submissionId: "777",
        verdict: "OK"
      })
    ).toMatchObject({
      dedupKey: "cf-sub-777",
      event: { problemKey: "cf:1900A", verdict: "AC" }
    });
    expect(
      normalizeBridgeVerdictPayload({
        platform: "leetcode-cn",
        problemUrl: "https://leetcode.cn/problems/1fGaJU/",
        submissionId: "888",
        verdict: "通过"
      })
    ).toMatchObject({
      dedupKey: "lccn-sub-888",
      sourceId: "1fGaJU",
      event: { problemKey: "lc-cn:1fGaJU", verdict: "AC" }
    });
    expect(
      normalizeBridgeVerdictPayload({
        platform: "leetcode-global",
        sourceId: "two-sum",
        submissionId: "999",
        verdict: "Accepted"
      })
    ).toMatchObject({
      dedupKey: "lc-sub-999",
      event: { problemKey: "lc-global:two-sum", verdict: "AC" }
    });
    expect(
      normalizeBridgeVerdictPayload({
        platform: "atcoder",
        sourceId: "tessoku_book_a",
        submissionId: "1010",
        verdict: "AC"
      })
    ).toMatchObject({
      dedupKey: "ac-sub-1010",
      event: { problemKey: "atcoder:tessoku_book_a", verdict: "AC" }
    });

    const bridge = new LocalhostBridge({ preferredPort: 0, verdictToken: "tok-1" });
    const port = await bridge.start();
    activeClosers.push(() => bridge.stop());

    // CSRF defense on POST /: reject untrusted Origin and non-JSON Content-Type when Origin present
    const evilCsrf = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { Origin: "https://evil-attacker.example", "content-type": "text/plain" },
      body: JSON.stringify({ name: "Attack" })
    });
    expect(evilCsrf.status).toBe(403);

    const nonJsonWithOrigin = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { Origin: "https://codeforces.com", "content-type": "text/plain" },
      body: JSON.stringify({ name: "A. Watermelon" })
    });
    expect(nonJsonWithOrigin.status).toBe(415);
    expect(bridge.getReceivedProblems()).toHaveLength(0);

    const extPush = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { Origin: "chrome-extension://abcdefghijklmnop", "content-type": "application/json" },
      body: JSON.stringify({ name: "A. Watermelon", url: "https://codeforces.com/contest/4/problem/A" })
    });
    expect(extPush.status).toBe(200);
    expect(bridge.getReceivedProblems()).toHaveLength(1);

    // PNA header on OPTIONS /verdict only when Origin is allowlisted and requested
    const pnaMobileCf = await fetch(`http://127.0.0.1:${port}/verdict`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://m.codeforces.com",
        "Access-Control-Request-Private-Network": "true"
      }
    });
    expect(pnaMobileCf.status).toBe(204);
    expect(pnaMobileCf.headers.get("access-control-allow-origin")).toBe("https://m.codeforces.com");
    expect(pnaMobileCf.headers.get("access-control-allow-private-network")).toBe("true");

    const pnaNowCoderApex = await fetch(`http://127.0.0.1:${port}/verdict`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://nowcoder.com",
        "Access-Control-Request-Private-Network": "true"
      }
    });
    expect(pnaNowCoderApex.status).toBe(204);
    expect(pnaNowCoderApex.headers.get("access-control-allow-private-network")).toBe("true");

    const pnaEvil = await fetch(`http://127.0.0.1:${port}/verdict`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Private-Network": "true"
      }
    });
    expect(pnaEvil.status).toBe(403);
    expect(pnaEvil.headers.get("access-control-allow-private-network")).toBeNull();
  });
});

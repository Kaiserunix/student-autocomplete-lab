import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { startOjConsoleServer, type OjConsoleServer } from "../prototypes/oj-console/backend/server";

const servers: OjConsoleServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("OJ console server", () => {
  test("binds to localhost and publishes a protected runtime descriptor", async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), "oj-console-server-"));
    const output: string[] = [];
    const server = await startOjConsoleServer({
      runtimeRoot,
      port: 0,
      output: (line) => output.push(line),
      api: {
        checkTool: async () => ({ available: false, message: "not installed" })
      }
    });
    servers.push(server);

    expect(server.host).toBe("127.0.0.1");
    expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(server.token).toMatch(/^[a-f0-9]{64}$/);

    const descriptor = JSON.parse(await readFile(server.descriptorPath, "utf8")) as Record<string, unknown>;
    expect(descriptor).toMatchObject({
      baseUrl: server.baseUrl,
      token: server.token,
      pid: process.pid
    });
    expect(descriptor.startedAt).toEqual(expect.any(String));
    expect(output.join("\n")).toContain(server.baseUrl);
    expect(output.join("\n")).not.toContain(server.token);

    const unauthorized = await fetch(`${server.baseUrl}/api/status`);
    expect(unauthorized.status).toBe(401);
    const authorized = await fetch(`${server.baseUrl}/api/status`, {
      headers: { "x-oj-console-token": server.token }
    });
    expect(authorized.status).toBe(200);
  });

  test("removes stale session data on startup and active session data on close", async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), "oj-console-cleanup-"));
    const stalePath = path.join(runtimeRoot, "session", "stale.txt");
    await mkdir(path.dirname(stalePath), { recursive: true });
    await writeFile(stalePath, "stale", "utf8");

    const server = await startOjConsoleServer({
      runtimeRoot,
      port: 0,
      output: () => undefined,
      api: {
        checkTool: async () => ({ available: false, message: "not installed" })
      }
    });
    servers.push(server);

    await expect(stat(stalePath)).rejects.toMatchObject({ code: "ENOENT" });
    await stat(server.descriptorPath);
    await stat(server.sessionRoot);

    await server.close();
    servers.splice(servers.indexOf(server), 1);
    await expect(stat(server.descriptorPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(server.sessionRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { createOjConsoleApi, type OjConsoleApiOptions } from "./api";

export interface StartOjConsoleServerOptions {
  runtimeRoot?: string;
  port?: number;
  token?: string;
  output?: (line: string) => void;
  api?: Partial<Omit<OjConsoleApiOptions, "token" | "runtimeRoot" | "startedAt">>;
}

export interface OjConsoleServer {
  host: "127.0.0.1";
  port: number;
  baseUrl: string;
  token: string;
  descriptorPath: string;
  sessionRoot: string;
  close(): Promise<void>;
}

export async function startOjConsoleServer(
  options: StartOjConsoleServerOptions = {}
): Promise<OjConsoleServer> {
  const host = "127.0.0.1" as const;
  const runtimeRoot = path.resolve(options.runtimeRoot ?? path.join(process.cwd(), ".runtime", "oj-console"));
  const sessionRoot = path.join(runtimeRoot, "session");
  const descriptorPath = path.join(runtimeRoot, "server.json");
  const token = options.token ?? randomBytes(32).toString("hex");
  const startedAt = new Date().toISOString();
  const output = options.output ?? ((line: string) => console.log(line));

  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
  await Promise.all([
    rm(sessionRoot, { recursive: true, force: true }),
    rm(descriptorPath, { force: true })
  ]);
  await mkdir(sessionRoot, { recursive: true, mode: 0o700 });

  const httpServer = createServer(createOjConsoleApi({
    ...options.api,
    token,
    runtimeRoot: sessionRoot,
    startedAt
  }));

  try {
    const port = await listen(httpServer, options.port ?? environmentPort());
    const baseUrl = `http://${host}:${port}`;
    await writeFile(descriptorPath, JSON.stringify({
      baseUrl,
      token,
      pid: process.pid,
      startedAt
    }, null, 2), { encoding: "utf8", mode: 0o600 });
    output(`OJ Console 后端已启动：${baseUrl}`);
    output(`运行描述文件：${descriptorPath}`);

    let closed = false;
    return {
      host,
      port,
      baseUrl,
      token,
      descriptorPath,
      sessionRoot,
      async close(): Promise<void> {
        if (closed) {
          return;
        }
        closed = true;
        await closeServer(httpServer);
        await Promise.all([
          rm(descriptorPath, { force: true }),
          rm(sessionRoot, { recursive: true, force: true })
        ]);
      }
    };
  } catch (error) {
    await closeServer(httpServer);
    await Promise.all([
      rm(descriptorPath, { force: true }),
      rm(sessionRoot, { recursive: true, force: true })
    ]);
    throw error;
  }
}

function environmentPort(): number {
  const raw = process.env.OJ_CONSOLE_PORT;
  if (!raw) {
    return 0;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("OJ_CONSOLE_PORT 必须是 0 到 65535 之间的整数。");
  }
  return port;
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("无法读取 OJ Console 本地监听地址。"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

if (require.main === module) {
  void startOjConsoleServer().then((server) => {
    let stopping = false;
    const stop = () => {
      if (stopping) {
        return;
      }
      stopping = true;
      void server.close().then(() => process.exit(0), () => process.exit(1));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "OJ Console 后端启动失败。");
    process.exitCode = 1;
  });
}

import * as path from "node:path";
import { describe, expect, test, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {},
  window: {},
  commands: {},
  ConfigurationTarget: {}
}));

import { OjMcpBroker } from "../src/oj/broker";
import { buildOjProviderDescriptors } from "../src/oj/vscodeProviderConfiguration";

describe("VS Code OJ provider configuration", () => {
  test("discovers adjacent private adapters in development and keeps secrets in transports", () => {
    const extensionPath = path.resolve("C:/workspace/student-autocomplete-lab");
    const nowCoderPath = path.resolve("C:/workspace/nowcoder-oj-mcp/packages/nowcoder/dist/index.js");
    const leetCodePath = path.resolve("C:/workspace/leetcode-mcp-private/build/index.js");
    const remoteSecret = "remote-secret-value";
    const cookieSecret = "SESSION=private-cookie";
    const descriptors = buildOjProviderDescriptors(
      extensionPath,
      {},
      {
        nowCoderSessionCookie: cookieSecret,
        remoteKeys: { atcoder: remoteSecret }
      },
      (candidate) => candidate === nowCoderPath || candidate === leetCodePath
    );

    const nowCoder = descriptors.find((item) => item.platform === "nowcoder")!;
    const leetCode = descriptors.find((item) => item.platform === "leetcode")!;
    const atCoder = descriptors.find((item) => item.platform === "atcoder")!;

    expect(nowCoder.transport).toMatchObject({
      kind: "local_stdio",
      command: "node",
      args: [nowCoderPath],
      env: { NOWCODER_SESSION_COOKIE: cookieSecret, COMPETITIVE_COMPANION_PORT: "10043" }
    });
    expect(leetCode.transport).toMatchObject({
      kind: "local_stdio",
      args: [leetCodePath, "--site", "cn"]
    });
    expect(atCoder.transport).toMatchObject({
      kind: "remote_http",
      headers: { "X-OJ-MCP-Key": remoteSecret }
    });

    const publicStatus = new OjMcpBroker(descriptors, async () => {
      throw new Error("not used");
    }).providerStatuses();
    expect(JSON.stringify(publicStatus)).not.toContain(remoteSecret);
    expect(JSON.stringify(publicStatus)).not.toContain(cookieSecret);
    expect(JSON.stringify(publicStatus)).not.toContain(nowCoderPath);
    expect(JSON.stringify(publicStatus)).not.toContain(leetCodePath);
  });

  test("leaves local adapters unconfigured in an installed extension until paths are supplied", () => {
    const descriptors = buildOjProviderDescriptors("C:/installed/extension", {}, {}, () => false);

    expect(descriptors.find((item) => item.platform === "leetcode")).toMatchObject({
      transport: undefined,
      unavailableReason: "未配置本机 LeetCode 私有适配器入口。"
    });
    expect(descriptors.find((item) => item.platform === "nowcoder")).toMatchObject({
      transport: undefined,
      unavailableReason: "未配置本机牛客 MCP 入口。"
    });
  });

  test("rejects insecure remote endpoints and honors explicit local settings", () => {
    const leetCodePath = path.resolve("D:/private/leetcode/build/index.js");
    const descriptors = buildOjProviderDescriptors(
      "C:/installed/extension",
      {
        nodePath: "C:/tools/node.exe",
        remoteEndpoints: { luogu: "http://example.test/mcp" },
        leetCodeEntrypoint: leetCodePath,
        leetCodeSite: "global"
      },
      {},
      (candidate) => candidate === leetCodePath
    );

    const luogu = descriptors.find((item) => item.platform === "luogu")!;
    expect(luogu.transport).toBeUndefined();
    expect(luogu.unavailableReason).toBe("MCP 地址必须是有效的 HTTPS URL。");
    expect(descriptors.find((item) => item.platform === "leetcode")?.transport).toMatchObject({
      command: "C:/tools/node.exe",
      args: [leetCodePath, "--site", "global"]
    });
  });
});

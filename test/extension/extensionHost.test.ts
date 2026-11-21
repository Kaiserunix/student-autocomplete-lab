import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockExtensionContext, createMockVscodeState } from "./mockVscode";

const mockState = vi.hoisted(() => ({
  harness: null as ReturnType<typeof createMockVscodeState> | null
}));

vi.mock("vscode", async () => {
  const { createMockVscodeState: factory } = await import("./mockVscode");
  const harness = factory();
  mockState.harness = harness;
  return harness.vscodeMock;
});

import { activate, deactivate, EXTENSION_COMMANDS } from "../../src/extension/extension";
import {
  buildSidebarAiConfigView,
  CHAT_API_KEY_SECRET,
  FIM_API_KEY_SECRET,
  readAiRouterConfig,
  saveAiConfigSafely,
  SecretKeyStore,
  VscodeWorkspaceConfigAdapter
} from "../../src/extension/vscodeAdapters";

describe("Extension Host activation, commands & SecretKeyStore", () => {
  let tempDir: string;

  beforeEach(async () => {
    mockState.harness?.reset();
    tempDir = await mkdtemp(join(tmpdir(), "algo-coach-ext-test-"));
  });

  afterEach(async () => {
    deactivate();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("registers 100% of commands declared in package.json with exact match", async () => {
    const pkgPath = resolve("package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
      contributes: { commands: Array<{ command: string }> };
    };
    const declaredCommands = pkg.contributes.commands.map((c) => c.command).sort();

    // Disable localhost bridge port binding during unit test to avoid port contention
    mockState.harness!.globalConfig.set("algoCoach.oj.bridgePort", 0);
    const context = createMockExtensionContext(tempDir, resolve("."));
    await activate(context as unknown as import("vscode").ExtensionContext);

    const registeredCommands = Array.from(mockState.harness!.registeredCommands.keys()).sort();

    expect(registeredCommands).toEqual(declaredCommands);
    expect([...EXTENSION_COMMANDS].sort()).toEqual(declaredCommands);
    expect(registeredCommands).toHaveLength(18);

    // Sidebar provider must be registered with retainContextWhenHidden: true
    const sidebarReg = mockState.harness!.webviewProviders.get("algoCoach.sidebar");
    expect(sidebarReg).toBeDefined();
    expect(sidebarReg?.options?.webviewOptions?.retainContextWhenHidden).toBe(true);

    // Dispose all subscriptions cleanly
    for (const sub of context.subscriptions) {
      sub.dispose();
    }
  });

  it("isolates Chat and FIM API keys in SecretStorage and never writes plaintext keys to settings", async () => {
    const secretsMap = new Map<string, string>();
    const secretStore = new SecretKeyStore({
      get: async (k) => secretsMap.get(k),
      store: async (k, v) => {
        secretsMap.set(k, v);
      },
      delete: async (k) => {
        secretsMap.delete(k);
      }
    });
    const configAdapter = new VscodeWorkspaceConfigAdapter();
    mockState.harness!.setWorkspaceFolders([tempDir]);

    await secretStore.setChatApiKey("sk-chat-secret-111111");
    await secretStore.setFimApiKey("sk-fim-secret-222222");

    expect(secretsMap.get(CHAT_API_KEY_SECRET)).toBe("sk-chat-secret-111111");
    expect(secretsMap.get(FIM_API_KEY_SECRET)).toBe("sk-fim-secret-222222");
    expect(await secretStore.getChatApiKey()).toBe("sk-chat-secret-111111");
    expect(await secretStore.getFimApiKey()).toBe("sk-fim-secret-222222");

    // Deleting Chat key must NOT affect FIM key
    await secretStore.deleteChatApiKey();
    expect(await secretStore.hasChatApiKey()).toBe(false);
    expect(await secretStore.hasFimApiKey()).toBe(true);
    expect(await secretStore.getFimApiKey()).toBe("sk-fim-secret-222222");

    // saveAiConfigSafely writes non-secret settings to workspace config and keys strictly to SecretStorage
    const routerConfig = await saveAiConfigSafely(
      configAdapter,
      secretStore,
      {
        chat: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          apiKey: "sk-new-chat-999999"
        },
        fim: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/beta",
          model: "deepseek-chat"
          // omitted -> must preserve existing FIM key!
        },
        codeforcesHandle: "tourist"
      },
      "workspace"
    );

    expect(routerConfig.chat.apiKey).toBe("sk-new-chat-999999");
    expect(routerConfig.fim.apiKey).toBe("sk-fim-secret-222222");

    // Verify ZERO secret keys leaked into VS Code workspace or global settings
    const allPlainSettingsValues = [
      ...mockState.harness!.workspaceConfig.entries(),
      ...mockState.harness!.globalConfig.entries()
    ]
      .map(([k, v]) => `${k}=${String(v)}`)
      .join("\n");

    expect(allPlainSettingsValues).not.toContain("sk-new-chat-999999");
    expect(allPlainSettingsValues).not.toContain("sk-fim-secret-222222");
    expect(allPlainSettingsValues).not.toContain("apiKey");

    // Sidebar view never contains raw keys, only boolean flags
    const sidebarView = await buildSidebarAiConfigView(configAdapter, secretStore);
    expect(sidebarView.chat.hasApiKey).toBe(true);
    expect(sidebarView.fim.hasApiKey).toBe(true);
    expect(sidebarView.codeforcesHandle).toBe("tourist");
    expect(JSON.stringify(sidebarView)).not.toContain("sk-");

    // Re-reading router config keeps both roles independent
    const reread = await readAiRouterConfig(configAdapter, secretStore);
    expect(reread.chat.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(reread.fim.baseUrl).toBe("https://api.deepseek.com/beta");
    expect(reread.chat.apiKey).not.toBe(reread.fim.apiKey);
  });

  it("immediately disposes inline completion provider when ghostText.mode changes to off", async () => {
    mockState.harness!.globalConfig.set("algoCoach.oj.bridgePort", 0);
    const context = createMockExtensionContext(tempDir, resolve("."));
    await activate(context as unknown as import("vscode").ExtensionContext);

    // Focus preset enables adaptive ghost text -> inlineProvider registered & active
    expect(mockState.harness!.inlineProviders.length).toBe(1);
    expect(mockState.harness!.inlineProviders[0]?.disposed).toBe(false);

    // Disable ghost text via settings -> ManagedModuleController must dispose immediately
    mockState.harness!.globalConfig.set("algoCoach.ghostText.mode", "off");
    mockState.harness!.emitConfigurationChange("algoCoach.ghostText.mode");

    expect(mockState.harness!.inlineProviders[0]?.disposed).toBe(true);

    // Re-enabling registers fresh inline provider cleanly
    mockState.harness!.globalConfig.set("algoCoach.ghostText.mode", "manual");
    mockState.harness!.emitConfigurationChange("algoCoach.ghostText.mode");

    expect(mockState.harness!.inlineProviders.length).toBe(2);
    expect(mockState.harness!.inlineProviders[1]?.disposed).toBe(false);

    for (const sub of context.subscriptions) {
      sub.dispose();
    }
  });

  it("contains zero Unicode Emoji across all src/extension/*.ts host files", async () => {
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const extDir = resolve("src/extension");
    const files = (await readdir(extDir)).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(6);

    for (const file of files) {
      const content = await readFile(join(extDir, file), "utf8");
      expect(emojiRe.test(content), `Found Unicode Emoji in src/extension/${file}`).toBe(false);
    }
  });
});

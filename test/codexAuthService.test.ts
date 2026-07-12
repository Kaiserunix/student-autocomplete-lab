import { describe, expect, test } from "vitest";
import {
  CodexAuthService,
  type CodexAuthClient
} from "../src/codex/codexAuthService";
import type { AppServerNotification } from "../src/codex/appServerProtocol";

class FakeAuthClient implements CodexAuthClient {
  private readonly responses = new Map<string, unknown[]>();
  private readonly listeners = new Set<(message: AppServerNotification) => void>();
  readonly calls: Array<{ method: string; params?: unknown }> = [];

  queue(method: string, response: unknown): void {
    const queued = this.responses.get(method) ?? [];
    queued.push(response);
    this.responses.set(method, queued);
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    this.calls.push({ method, params });
    const queued = this.responses.get(method) ?? [];
    if (queued.length === 0) {
      throw new Error(`No fake response for ${method}`);
    }
    const next = queued.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next as T;
  }

  onNotification(listener: (message: AppServerNotification) => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  notify(method: string, params?: unknown): void {
    for (const listener of this.listeners) {
      listener({ kind: "notification", method, params });
    }
  }
}

describe("Codex OAuth state", () => {
  test("normalizes signed-out and signed-in accounts without exposing upstream tokens", async () => {
    const client = new FakeAuthClient();
    const service = new CodexAuthService(client);

    client.queue("account/read", { account: null, requiresOpenaiAuth: true });
    await expect(service.refresh()).resolves.toEqual({ status: "signed-out" });

    client.queue("account/read", {
      account: {
        type: "chatgpt",
        email: "student@example.com",
        planType: "pro",
        accessToken: "discard-me",
        refreshToken: "discard-me-too",
        cookie: "discard-cookie",
        credentialPath: "C:/private/auth.json"
      },
      requiresOpenaiAuth: true
    });
    const state = await service.refresh();
    expect(state).toEqual({
      status: "signed-in",
      email: "student@example.com",
      planType: "pro"
    });
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("discard-me");
    expect(serialized).not.toMatch(/accessToken|refreshToken|cookie|auth\.json/i);
  });

  test("redacts credential material from public auth errors", async () => {
    const client = new FakeAuthClient();
    const service = new CodexAuthService(client);
    client.queue(
      "account/read",
      new Error('failed C:/private/auth.json accessToken="secret" cookie=session https://login.example.test/private')
    );

    const state = await service.refresh();
    const serialized = JSON.stringify(state);
    expect(state.status).toBe("error");
    expect(serialized).not.toMatch(/secret|session|accessToken|cookie|auth\.json|login\.example/i);
  });

  test("starts a managed browser login with the documented request", async () => {
    const client = new FakeAuthClient();
    const service = new CodexAuthService(client);
    client.queue("account/login/start", {
      type: "chatgpt",
      loginId: "login-browser",
      authUrl: "https://chatgpt.com/auth?state=sensitive"
    });

    await expect(service.startBrowserLogin()).resolves.toEqual({
      status: "login-pending",
      loginId: "login-browser",
      authUrl: "https://chatgpt.com/auth?state=sensitive"
    });
    expect(client.calls).toContainEqual({
      method: "account/login/start",
      params: {
        type: "chatgpt",
        useHostedLoginSuccessPage: true,
        appBrand: "codex"
      }
    });
  });

  test("starts a device-code login without exposing account credentials", async () => {
    const client = new FakeAuthClient();
    const service = new CodexAuthService(client);
    client.queue("account/login/start", {
      type: "chatgptDeviceCode",
      loginId: "login-device",
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-1234",
      accessToken: "must-not-escape"
    });

    const state = await service.startDeviceLogin();
    expect(state).toEqual({
      status: "login-pending",
      loginId: "login-device",
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-1234"
    });
    expect(client.calls).toContainEqual({
      method: "account/login/start",
      params: { type: "chatgptDeviceCode" }
    });
    expect(JSON.stringify(state)).not.toContain("must-not-escape");
  });

  test("refreshes account state after a successful login notification", async () => {
    const client = new FakeAuthClient();
    const service = new CodexAuthService(client);
    client.queue("account/login/start", {
      loginId: "login-device",
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-1234"
    });
    await service.startDeviceLogin();
    client.queue("account/read", {
      account: { type: "chatgpt", email: "student@example.com", planType: "pro" }
    });

    client.notify("account/login/completed", {
      loginId: "login-device",
      success: true,
      error: null
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(service.getState()).toEqual({
      status: "signed-in",
      email: "student@example.com",
      planType: "pro"
    });
  });

  test("refreshes account state after a signed-in account update", async () => {
    const client = new FakeAuthClient();
    const service = new CodexAuthService(client);
    client.queue("account/read", {
      account: { type: "chatgpt", email: "updated@example.com", planType: "plus" }
    });

    client.notify("account/updated", { authMode: "chatgpt" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(service.getState()).toEqual({
      status: "signed-in",
      email: "updated@example.com",
      planType: "plus"
    });
  });

  test("cancels a pending login and logs out an active account", async () => {
    const client = new FakeAuthClient();
    const service = new CodexAuthService(client);
    client.queue("account/login/start", {
      loginId: "login-browser",
      authUrl: "https://chatgpt.com/auth"
    });
    await service.startBrowserLogin();
    client.queue("account/login/cancel", {});
    await expect(service.cancelLogin()).resolves.toEqual({ status: "signed-out" });
    expect(client.calls).toContainEqual({
      method: "account/login/cancel",
      params: { loginId: "login-browser" }
    });

    client.queue("account/logout", {});
    await expect(service.logout()).resolves.toEqual({ status: "signed-out" });
    expect(client.calls).toContainEqual({ method: "account/logout", params: undefined });
  });
});

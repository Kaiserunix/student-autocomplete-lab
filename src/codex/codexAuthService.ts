import type { Disposable } from "./appServerClient";
import type { AppServerNotification } from "./appServerProtocol";

export type CodexAuthState =
  | { status: "starting" }
  | { status: "unavailable"; error: string }
  | { status: "signed-out" }
  | {
      status: "login-pending";
      loginId: string;
      authUrl?: string;
      verificationUrl?: string;
      userCode?: string;
    }
  | { status: "signed-in"; email?: string; planType?: string }
  | { status: "error"; error: string };

export interface CodexAuthClient {
  request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  onNotification(listener: (message: AppServerNotification) => void): Disposable;
}

interface AccountReadResult {
  account?: unknown;
  requiresOpenaiAuth?: unknown;
}

interface LoginStartResult {
  loginId?: unknown;
  authUrl?: unknown;
  verificationUrl?: unknown;
  userCode?: unknown;
}

export class CodexAuthService {
  private state: CodexAuthState = { status: "starting" };
  private readonly listeners = new Set<(state: CodexAuthState) => void>();
  private readonly notificationSubscription: Disposable;

  constructor(private readonly client: CodexAuthClient) {
    this.notificationSubscription = client.onNotification((message) => this.handleNotification(message));
  }

  getState(): CodexAuthState {
    return this.state;
  }

  onDidChange(listener: (state: CodexAuthState) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  async refresh(): Promise<CodexAuthState> {
    this.setState({ status: "starting" });
    try {
      const result = await this.client.request<AccountReadResult>("account/read", { refreshToken: false });
      const account = asRecord(result.account);
      if (!account) {
        return this.setState({ status: "signed-out" });
      }
      return this.setState({
        status: "signed-in",
        ...(stringValue(account.email) ? { email: stringValue(account.email) } : {}),
        ...(stringValue(account.planType) ? { planType: stringValue(account.planType) } : {})
      });
    } catch (error) {
      return this.setState({ status: "error", error: errorMessage(error) });
    }
  }

  async startBrowserLogin(): Promise<CodexAuthState> {
    try {
      const result = await this.client.request<LoginStartResult>("account/login/start", {
        type: "chatgpt",
        useHostedLoginSuccessPage: true,
        appBrand: "codex"
      });
      const loginId = stringValue(result.loginId);
      const authUrl = stringValue(result.authUrl);
      if (!loginId || !authUrl) {
        throw new Error("Codex browser login did not return loginId and authUrl.");
      }
      return this.setState({ status: "login-pending", loginId, authUrl });
    } catch (error) {
      return this.setState({ status: "error", error: errorMessage(error) });
    }
  }

  async startDeviceLogin(): Promise<CodexAuthState> {
    try {
      const result = await this.client.request<LoginStartResult>("account/login/start", {
        type: "chatgptDeviceCode"
      });
      const loginId = stringValue(result.loginId);
      const verificationUrl = stringValue(result.verificationUrl);
      const userCode = stringValue(result.userCode);
      if (!loginId || !verificationUrl || !userCode) {
        throw new Error("Codex device login did not return loginId, verificationUrl, and userCode.");
      }
      return this.setState({ status: "login-pending", loginId, verificationUrl, userCode });
    } catch (error) {
      return this.setState({ status: "error", error: errorMessage(error) });
    }
  }

  async cancelLogin(): Promise<CodexAuthState> {
    if (this.state.status !== "login-pending") {
      return this.setState({ status: "signed-out" });
    }
    try {
      await this.client.request("account/login/cancel", { loginId: this.state.loginId });
      return this.setState({ status: "signed-out" });
    } catch (error) {
      return this.setState({ status: "error", error: errorMessage(error) });
    }
  }

  async logout(): Promise<CodexAuthState> {
    try {
      await this.client.request("account/logout");
      return this.setState({ status: "signed-out" });
    } catch (error) {
      return this.setState({ status: "error", error: errorMessage(error) });
    }
  }

  dispose(): void {
    this.notificationSubscription.dispose();
    this.listeners.clear();
  }

  private handleNotification(message: AppServerNotification): void {
    if (message.method === "account/login/completed") {
      const params = asRecord(message.params);
      if (params?.success === true) {
        void this.refresh();
      } else {
        this.setState({
          status: "error",
          error: stringValue(params?.error) ?? "Codex login failed."
        });
      }
      return;
    }
    if (message.method !== "account/updated") {
      return;
    }
    const params = asRecord(message.params);
    if (!params || params.authMode === null) {
      this.setState({ status: "signed-out" });
    }
  }

  private setState(state: CodexAuthState): CodexAuthState {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
    return state;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

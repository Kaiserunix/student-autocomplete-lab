import * as path from "node:path";
import { CodexAppServerClient, type SafeCodexLogEntry } from "./appServerClient";
import { CodexAuthService } from "./codexAuthService";
import { CodexModelService } from "./codexModelService";
import { CodexTextClient } from "./codexTextClient";

export const CODEX_HTTP_MODEL_PROVIDER_ID = "student-autocomplete-http";

export function codexHttpAppServerArgs(): string[] {
  const provider = `model_providers.${CODEX_HTTP_MODEL_PROVIDER_ID}`;
  return [
    "app-server",
    "-c", `${provider}.name=StudentAutocompleteHttp`,
    "-c", `${provider}.base_url=https://chatgpt.com/backend-api/codex`,
    "-c", `${provider}.wire_api=responses`,
    "-c", `${provider}.requires_openai_auth=true`,
    "-c", `${provider}.supports_websockets=false`
  ];
}

export interface CodexServicePaths {
  executablePath: string;
  codexHome: string;
  runtimeCwd: string;
  extensionVersion: string;
}

export interface ResolveCodexServicePathsOptions {
  globalStoragePath: string;
  executablePath: string;
  extensionVersion: string;
}

export interface CodexServices {
  appServer: CodexAppServerClient;
  auth: CodexAuthService;
  models: CodexModelService;
  text: CodexTextClient;
  dispose(): void;
}

export function resolveCodexServicePaths(options: ResolveCodexServicePathsOptions): CodexServicePaths {
  const root = path.join(path.resolve(options.globalStoragePath), "codex-oauth");
  return {
    executablePath: options.executablePath.trim() || "codex",
    codexHome: path.join(root, "home"),
    runtimeCwd: path.join(root, "runtime"),
    extensionVersion: options.extensionVersion
  };
}

export function createCodexServices(
  paths: CodexServicePaths,
  onLog?: (entry: SafeCodexLogEntry) => void
): CodexServices {
  const appServer = new CodexAppServerClient({
    executablePath: paths.executablePath,
    appServerArgs: codexHttpAppServerArgs(),
    codexHome: paths.codexHome,
    runtimeCwd: paths.runtimeCwd,
    clientVersion: paths.extensionVersion,
    onLog
  });
  const auth = new CodexAuthService(appServer);
  return {
    appServer,
    auth,
    models: new CodexModelService(appServer),
    text: new CodexTextClient(appServer, paths.runtimeCwd, CODEX_HTTP_MODEL_PROVIDER_ID),
    dispose: () => {
      auth.dispose();
      void appServer.dispose();
    }
  };
}

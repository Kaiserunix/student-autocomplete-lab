import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
  CODEX_HTTP_MODEL_PROVIDER_ID,
  codexHttpAppServerArgs,
  resolveCodexServicePaths
} from "../src/codex/codexServices";

describe("Codex extension service paths", () => {
  test("keeps OAuth state and runtime cwd below global storage and outside the workspace", () => {
    const globalStoragePath = path.resolve("C:/extension-global-storage/student-autocomplete-lab");
    const workspacePath = path.resolve("C:/workspaces/student-project");
    const paths = resolveCodexServicePaths({
      globalStoragePath,
      executablePath: "C:/tools/codex.exe",
      extensionVersion: "0.1.0-beta.1"
    });

    expect(paths.executablePath).toBe("C:/tools/codex.exe");
    expect(paths.extensionVersion).toBe("0.1.0-beta.1");
    expect(isDescendant(globalStoragePath, paths.codexHome)).toBe(true);
    expect(isDescendant(globalStoragePath, paths.runtimeCwd)).toBe(true);
    expect(isDescendant(workspacePath, paths.codexHome)).toBe(false);
    expect(isDescendant(workspacePath, paths.runtimeCwd)).toBe(false);
    expect(paths.codexHome).not.toBe(paths.runtimeCwd);
  });

  test("configures the private app-server transport to use OAuth over Responses HTTP", () => {
    expect(codexHttpAppServerArgs()).toEqual([
      "app-server",
      "-c", `model_providers.${CODEX_HTTP_MODEL_PROVIDER_ID}.name=StudentAutocompleteHttp`,
      "-c", `model_providers.${CODEX_HTTP_MODEL_PROVIDER_ID}.base_url=https://chatgpt.com/backend-api/codex`,
      "-c", `model_providers.${CODEX_HTTP_MODEL_PROVIDER_ID}.wire_api=responses`,
      "-c", `model_providers.${CODEX_HTTP_MODEL_PROVIDER_ID}.requires_openai_auth=true`,
      "-c", `model_providers.${CODEX_HTTP_MODEL_PROVIDER_ID}.supports_websockets=false`
    ]);
  });
});

function isDescendant(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

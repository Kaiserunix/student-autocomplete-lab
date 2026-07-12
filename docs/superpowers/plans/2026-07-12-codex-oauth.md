# Codex OAuth Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Codex app-server OAuth route that independently powers teaching and inline autocomplete while preserving OpenAI API-key, custom OpenAI-compatible URL/key, and Anthropic routes.

**Architecture:** A lazy stdio JSON-RPC client runs Codex app-server inside an extension-owned `CODEX_HOME`. OpenAI keeps its existing provider identity and gains `api-key | codex-oauth` authentication; HTTP model clients delegate to an injected text-only Codex transport when OAuth is selected. Webview state contains normalized account/model data and never receives tokens.

**Tech Stack:** TypeScript 5.8, VS Code Extension API, Node child processes and readline, Codex app-server JSON-RPC, Vitest, Pp/VSIX packaging, Computer Use for installed-extension acceptance.

---

## Authoritative Context

- Specification: `docs/superpowers/specs/2026-07-12-codex-oauth-design.md`
- Feature branch: `codex/codex-oauth`
- Worktree: `C:\Users\qwerf\.config\superpowers\worktrees\student-autocomplete-lab\codex-oauth`
- Base commit: `098365f`
- Design commit: `ea08146`
- Baseline: `npm test` passed 246 tests; `npm run compile` passed.

Run every command from the feature worktree. Never copy uncommitted files from
`C:\Users\qwerf\Desktop\student-autocomplete-lab`.

## File Map

New production files:

- `src/codex/appServerProtocol.ts`: JSON-RPC and public Codex types/guards.
- `src/codex/appServerClient.ts`: process lifecycle and request correlation.
- `src/codex/codexAuthService.ts`: account/login/logout state machine.
- `src/codex/codexModelService.ts`: OAuth model discovery and recommendations.
- `src/codex/codexTextClient.ts`: one-shot thread/turn text generation.
- `src/models/modelTextTransport.ts`: transport interface shared by HTTP clients and Codex.

Modified production files:

- `package.json`: settings schema for auth mode and Codex executable.
- `src/config/modelEnv.ts`: persist/read OpenAI auth mode.
- `src/config/vscodeModelEnv.ts`: map VS Code settings and secrets.
- `src/models/providerContracts.ts`: route metadata for OAuth transport.
- `src/models/modelRouter.ts`: choose HTTP or Codex transport.
- `src/models/chatCompletionsClient.ts`: delegate OAuth chat requests.
- `src/models/completionsClient.ts`: delegate OAuth completion requests.
- `src/autocomplete/inlineProvider.ts`: receive the shared Codex transport.
- `src/extension.ts`: create/dispose the Codex service container.
- `src/sidebar/messageProtocol.ts`: typed OAuth commands.
- `src/sidebar/stateView.ts`: sanitized OAuth state/model views.
- `src/sidebar/ProblemBankViewProvider.ts`: OAuth handlers, routing, and UI.

New tests:

- `test/codexAppServerProtocol.test.ts`
- `test/codexAppServerClient.test.ts`
- `test/codexAuthService.test.ts`
- `test/codexModelService.test.ts`
- `test/codexTextClient.test.ts`
- `test/codexOAuthRouting.test.ts`

Existing regression tests to extend:

- `test/envConfig.test.ts`
- `test/modelRouter.test.ts`
- `test/completionsClient.test.ts`
- `test/chatCompletionsClient.test.ts`
- `test/autocomplete.test.ts`
- `test/problemBankWebviewScript.test.ts`
- `test/sidebarMessageProtocol.test.ts`
- `test/extensionManifest.test.ts`
- `test/internalPackaging.test.ts`

## Task 1: Configuration And Route Contracts

**Files:**

- Modify: `package.json`
- Modify: `src/config/modelEnv.ts`
- Modify: `src/config/vscodeModelEnv.ts`
- Create: `src/models/modelTextTransport.ts`
- Modify: `src/models/providerContracts.ts`
- Modify: `src/models/modelRouter.ts`
- Test: `test/envConfig.test.ts`
- Test: `test/modelRouter.test.ts`
- Test: `test/extensionManifest.test.ts`

- [x] **Step 1: Write failing configuration tests**

Add tests proving that the default remains API key and OAuth survives settings
round-trips:

```ts
test("defaults OpenAI authentication to API key", () => {
  const view = buildAiConfigView({
    AI_PROVIDER_MODE: "openai",
    AI_OPENAI_CHAT_MODEL: "gpt-teach",
    AI_OPENAI_AUTOCOMPLETE_MODEL: "gpt-complete",
    AI_OPENAI_API_KEY: "secret"
  });
  expect(view.authMode).toBe("api-key");
});

test("keeps Codex OAuth without requiring an API key", () => {
  const env = modelEnvFromSettings(
    {},
    {
      providerMode: "openai",
      openai: {
        authMode: "codex-oauth",
        chatModel: "gpt-5.6-terra",
        autocompleteModel: "gpt-5.3-codex-spark"
      }
    },
    {}
  );
  expect(env.AI_OPENAI_AUTH_MODE).toBe("codex-oauth");
  expect(buildAiConfigView(env)).toMatchObject({
    mode: "openai",
    authMode: "codex-oauth",
    hasApiKey: false
  });
});
```

Add route tests using a fake transport:

```ts
const transport: ModelTextTransport = {
  generate: vi.fn(async () => "ok")
};

expect(routeTeachingModel(oauthEnv, transport)).toMatchObject({
  purpose: "analysis",
  providerMode: "openai",
  authMode: "codex-oauth",
  format: "codex-app-server",
  model: "gpt-5.6-terra"
});

expect(routeAutocompleteModel(oauthEnv, transport)).toMatchObject({
  purpose: "autocomplete",
  providerMode: "openai",
  authMode: "codex-oauth",
  format: "codex-app-server",
  model: "gpt-5.3-codex-spark"
});
```

- [x] **Step 2: Run the focused tests and confirm RED**

Run:

```powershell
npm test -- --run test/envConfig.test.ts test/modelRouter.test.ts test/extensionManifest.test.ts
```

Expected: failure because `authMode`, `ModelTextTransport`, and
`codex-app-server` do not exist.

- [x] **Step 3: Add the configuration and route types**

Introduce:

```ts
export type OpenAiAuthMode = "api-key" | "codex-oauth";

export interface ModelTextRequest {
  purpose: "analysis" | "autocomplete";
  model: string;
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ModelTextTransport {
  generate(request: ModelTextRequest): Promise<string>;
}
```

Add `AI_OPENAI_AUTH_MODE`, `authMode` fields on OpenAI settings/config views,
and the manifest setting:

```json
"studentAutocomplete.ai.openai.authMode": {
  "type": "string",
  "enum": ["api-key", "codex-oauth"],
  "default": "api-key",
  "description": "OpenAI authentication: API key or managed Codex OAuth."
},
"studentAutocomplete.ai.codex.executablePath": {
  "type": "string",
  "default": "codex",
  "description": "Codex CLI executable used for the OAuth app-server route."
}
```

`routeTeachingModel(env, transport?)` and
`routeAutocompleteModel(env, transport?)` must throw a clear error when OAuth
is selected without a transport. HTTP routes keep their current endpoints and
config objects.

- [x] **Step 4: Run the focused tests and confirm GREEN**

Run the Task 1 command again.

Expected: all selected tests pass.

- [x] **Step 5: Commit Task 1**

```powershell
git add package.json src/config/modelEnv.ts src/config/vscodeModelEnv.ts src/models/providerContracts.ts src/models/modelRouter.ts src/models/modelTextTransport.ts test/envConfig.test.ts test/modelRouter.test.ts test/extensionManifest.test.ts
git commit -m "feat: add Codex OAuth route configuration"
```

## Task 2: JSON-RPC Protocol And App-Server Process

**Files:**

- Create: `src/codex/appServerProtocol.ts`
- Create: `src/codex/appServerClient.ts`
- Create: `test/codexAppServerProtocol.test.ts`
- Create: `test/codexAppServerClient.test.ts`

- [x] **Step 1: Write one protocol guard test**

```ts
test("classifies responses and notifications without accepting arrays", () => {
  expect(parseAppServerMessage('{"id":1,"result":{"ok":true}}')).toEqual({
    kind: "response",
    id: 1,
    result: { ok: true }
  });
  expect(parseAppServerMessage('{"method":"account/updated","params":{"authMode":"chatgpt"}}')).toEqual({
    kind: "notification",
    method: "account/updated",
    params: { authMode: "chatgpt" }
  });
  expect(parseAppServerMessage("[]")).toBeUndefined();
});
```

- [x] **Step 2: Run the protocol test and confirm RED**

```powershell
npm test -- --run test/codexAppServerProtocol.test.ts
```

Expected: import failure for `parseAppServerMessage`.

- [x] **Step 3: Implement strict protocol parsing**

Implement a discriminated parser that accepts numeric/string request IDs,
response `result`/`error`, and method notifications. Malformed JSON returns
`undefined`; it does not crash the process client.

- [x] **Step 4: Run the protocol test and confirm GREEN**

Run the Step 2 command.

Expected: pass.

- [x] **Step 5: Write a failing process-client tracer test**

Create a fake process with writable stdin and readable stdout/stderr. Verify the
client emits this exact handshake and resolves an `account/read` response:

```ts
await client.start();
expect(fake.sent()).toEqual([
  {
    method: "initialize",
    id: 1,
    params: {
      clientInfo: {
        name: "student_autocomplete_lab",
        title: "Student Autocomplete Lab",
        version: "0.1.0-beta.1"
      }
    }
  },
  { method: "initialized", params: {} }
]);

const pending = client.request("account/read", { refreshToken: false });
fake.emitJson({ id: 2, result: { account: null, requiresOpenaiAuth: true } });
await expect(pending).resolves.toEqual({ account: null, requiresOpenaiAuth: true });
```

- [x] **Step 6: Run the process-client test and confirm RED**

```powershell
npm test -- --run test/codexAppServerClient.test.ts
```

Expected: import failure for `CodexAppServerClient`.

- [x] **Step 7: Implement the minimal process client**

The constructor accepts:

```ts
interface CodexAppServerClientOptions {
  executablePath: string;
  codexHome: string;
  runtimeCwd: string;
  clientVersion: string;
  requestTimeoutMs?: number;
  spawnProcess?: AppServerProcessFactory;
  onLog?: (entry: SafeCodexLogEntry) => void;
}
```

Required public methods:

```ts
start(): Promise<void>;
request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
notify(method: string, params?: unknown): void;
onNotification(listener: (message: AppServerNotification) => void): Disposable;
dispose(): Promise<void>;
```

Spawn `codex app-server` with `CODEX_HOME` set to `codexHome`, process cwd set
to `runtimeCwd`, and stdio pipes. Reject all pending requests on exit. Redact
raw stderr to a bounded message and never log JSON request params.

- [x] **Step 8: Add timeout, malformed-line, notification, and crash tests**

Add one test per observable behaviour:

```ts
await expect(client.request("slow", {}, 5)).rejects.toThrow("timed out");
fake.emitLine("not-json");
fake.emitJson({ method: "account/updated", params: { authMode: null } });
expect(notifications).toContainEqual({ method: "account/updated", params: { authMode: null } });
fake.exit(1);
await expect(inFlight).rejects.toThrow("exited");
```

- [x] **Step 9: Run both Task 2 test files and compile**

```powershell
npm test -- --run test/codexAppServerProtocol.test.ts test/codexAppServerClient.test.ts
npm run compile
```

Expected: both commands pass.

- [x] **Step 10: Commit Task 2**

```powershell
git add src/codex/appServerProtocol.ts src/codex/appServerClient.ts test/codexAppServerProtocol.test.ts test/codexAppServerClient.test.ts
git commit -m "feat: add Codex app-server JSON-RPC client"
```

## Task 3: Managed OAuth State Machine

**Files:**

- Create: `src/codex/codexAuthService.ts`
- Create: `test/codexAuthService.test.ts`

- [x] **Step 1: Write the signed-out/signed-in tracer test**

Use a fake request client and verify account normalization:

```ts
const service = new CodexAuthService(fakeClient);
fakeClient.respond("account/read", { account: null, requiresOpenaiAuth: true });
await expect(service.refresh()).resolves.toEqual({ status: "signed-out" });

fakeClient.respond("account/read", {
  account: { type: "chatgpt", email: "student@example.com", planType: "pro", accessToken: "discard-me" },
  requiresOpenaiAuth: true
});
await expect(service.refresh()).resolves.toEqual({
  status: "signed-in",
  email: "student@example.com",
  planType: "pro"
});
```

- [x] **Step 2: Run the auth test and confirm RED**

```powershell
npm test -- --run test/codexAuthService.test.ts
```

Expected: import failure.

- [x] **Step 3: Implement refresh and public state subscription**

Expose:

```ts
getState(): CodexAuthState;
refresh(): Promise<CodexAuthState>;
onDidChange(listener: (state: CodexAuthState) => void): Disposable;
```

Normalize only `email` and `planType`. Never spread upstream account objects.

- [x] **Step 4: Add browser and device-code login tests**

```ts
await expect(service.startBrowserLogin()).resolves.toMatchObject({
  status: "login-pending",
  loginId: "login-browser",
  authUrl: "https://chatgpt.com/auth"
});

await expect(service.startDeviceLogin()).resolves.toEqual({
  status: "login-pending",
  loginId: "login-device",
  verificationUrl: "https://auth.openai.com/codex/device",
  userCode: "ABCD-1234"
});
```

The browser request parameters must be:

```ts
{
  type: "chatgpt",
  useHostedLoginSuccessPage: true,
  appBrand: "codex"
}
```

- [x] **Step 5: Implement login, completion notification, cancellation, and logout**

Expose:

```ts
startBrowserLogin(): Promise<CodexAuthState>;
startDeviceLogin(): Promise<CodexAuthState>;
cancelLogin(): Promise<CodexAuthState>;
logout(): Promise<CodexAuthState>;
dispose(): void;
```

`account/login/completed` triggers a refresh on success and a recoverable error
on failure. `account/updated` with `authMode: null` becomes signed out. Logout
never deletes or reads credential files directly.

- [x] **Step 6: Add sensitive-field and invalid-payload tests**

Prove serialized public state does not contain `accessToken`, `refreshToken`,
`cookie`, or `authUrl` after sign-in.

- [x] **Step 7: Run auth tests and compile**

```powershell
npm test -- --run test/codexAuthService.test.ts
npm run compile
```

Expected: pass.

- [x] **Step 8: Commit Task 3**

```powershell
git add src/codex/codexAuthService.ts test/codexAuthService.test.ts
git commit -m "feat: add managed Codex OAuth state"
```

## Task 4: OAuth Model Discovery And Recommendations

**Files:**

- Create: `src/codex/codexModelService.ts`
- Create: `test/codexModelService.test.ts`

- [x] **Step 1: Write a failing visible-model normalization test**

```ts
const result = await service.listModels();
expect(result.models).toEqual([
  {
    id: "gpt-5.3-codex-spark",
    displayName: "GPT-5.3-Codex-Spark",
    isDefault: false,
    inputModalities: ["text"],
    supportedReasoningEfforts: []
  },
  {
    id: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    isDefault: true,
    inputModalities: ["text", "image"],
    supportedReasoningEfforts: ["low", "medium"]
  }
]);
expect(result.recommendedAutocompleteModel).toBe("gpt-5.3-codex-spark");
expect(result.recommendedTeachingModel).toBe("gpt-5.6-terra");
```

- [x] **Step 2: Run the model-service test and confirm RED**

```powershell
npm test -- --run test/codexModelService.test.ts
```

Expected: import failure.

- [x] **Step 3: Implement model listing and recommendation**

Call:

```ts
client.request("model/list", { limit: 100, includeHidden: false });
```

Recommendation order:

```ts
const autocomplete = exact("gpt-5.3-codex-spark") ?? contains("luna");
const teaching = contains("terra") ?? models.find((model) => model.isDefault)?.id;
```

Do not use hidden models and do not substitute an arbitrary first model.

- [x] **Step 4: Add unavailable-saved-model tests**

Verify `validateSelection(modelId, models)` returns a typed unavailable result
with a recommendation instead of changing the selected ID.

- [x] **Step 5: Run model tests and compile**

```powershell
npm test -- --run test/codexModelService.test.ts
npm run compile
```

Expected: pass.

- [x] **Step 6: Commit Task 4**

```powershell
git add src/codex/codexModelService.ts test/codexModelService.test.ts
git commit -m "feat: discover Codex OAuth models"
```

## Task 5: Text-Only One-Shot Generation

**Files:**

- Create: `src/codex/codexTextClient.ts`
- Create: `test/codexTextClient.test.ts`

- [x] **Step 1: Write the successful text-generation tracer test**

```ts
const pending = transport.generate({
  purpose: "autocomplete",
  model: "gpt-5.3-codex-spark",
  prompt: "return code only",
  maxOutputTokens: 64,
  temperature: 0,
  timeoutMs: 2_500
});

fake.respond("thread/start", { thread: { id: "thread-1" } });
fake.respond("turn/start", { turn: { id: "turn-1" } });
fake.notify("item/completed", {
  threadId: "thread-1",
  turnId: "turn-1",
  item: { type: "agentMessage", id: "item-1", text: "return a + b" }
});
fake.notify("turn/completed", {
  threadId: "thread-1",
  turn: { id: "turn-1", status: "completed" }
});

await expect(pending).resolves.toBe("return a + b");
expect(fake.callsFor("thread/delete")).toEqual([{ threadId: "thread-1" }]);
```

- [x] **Step 2: Run the text-client test and confirm RED**

```powershell
npm test -- --run test/codexTextClient.test.ts
```

Expected: import failure.

- [x] **Step 3: Implement one-shot generation**

Create the runtime directory before use. Start the thread with the selected
model, runtime cwd, read-only sandbox, and no approval escalation using the
exact fields supported by the installed app-server schema. Start one turn with
the prompt. Store state by `threadId` and `turnId`; resolve only after
`turn/completed` with accumulated final agent text.

The generated app-server schema must be inspected before finalizing request
field names:

```powershell
codex app-server generate-json-schema --out .runtime/codex-app-server-schema
```

Do not commit `.runtime` output.

- [x] **Step 4: Add tool-rejection tests**

For every forbidden item type, notify the client and assert interrupt, rejection,
and deletion:

```ts
for (const type of [
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "dynamicToolCall",
  "collabToolCall",
  "webSearch"
]) {
  await expect(runWithItem(type)).rejects.toThrow("text-only");
}
```

- [x] **Step 5: Add cancellation, timeout, failed-turn, and cleanup tests**

Use an `AbortController`; verify `turn/interrupt` is sent and `thread/delete`
runs in `finally`. Also prove delete failures do not replace the original
generation error.

- [x] **Step 6: Run text tests and compile**

```powershell
npm test -- --run test/codexTextClient.test.ts
npm run compile
```

Expected: pass.

- [x] **Step 7: Commit Task 5**

```powershell
git add src/codex/codexTextClient.ts test/codexTextClient.test.ts
git commit -m "feat: add text-only Codex generation transport"
```

## Task 6: Delegate Existing Model Clients Without Regressions

**Files:**

- Modify: `src/models/chatCompletionsClient.ts`
- Modify: `src/models/completionsClient.ts`
- Modify: `src/models/providerContracts.ts`
- Test: `test/chatCompletionsClient.test.ts`
- Test: `test/completionsClient.test.ts`
- Create: `test/codexOAuthRouting.test.ts`

- [x] **Step 1: Write one failing OAuth chat-delegation test**

```ts
const transport: ModelTextTransport = { generate: vi.fn(async () => "OK") };
const text = await requestChatCompletionText(
  {
    mode: "openai",
    authMode: "codex-oauth",
    model: "gpt-5.6-terra",
    format: "codex-app-server",
    transport
  },
  {
    messages: [
      { role: "system", content: "Return OK only." },
      { role: "user", content: "health check" }
    ],
    maxTokens: 16,
    temperature: 0,
    usageLogPath: false
  }
);
expect(text).toBe("OK");
expect(transport.generate).toHaveBeenCalledWith(expect.objectContaining({
  purpose: "analysis",
  model: "gpt-5.6-terra",
  maxOutputTokens: 16
}));
```

- [x] **Step 2: Run chat/completion tests and confirm RED**

```powershell
npm test -- --run test/chatCompletionsClient.test.ts test/completionsClient.test.ts test/codexOAuthRouting.test.ts
```

Expected: type/import failure for the OAuth config shape.

- [x] **Step 3: Add discriminated HTTP/OAuth config unions**

Use `format: "codex-app-server"` as the discriminator. OAuth configs contain
`transport` and no API key. HTTP configs retain required `baseUrl` and `apiKey`.

Before any HTTP work:

```ts
if (config.format === "codex-app-server") {
  return config.transport.generate({
    purpose: "analysis",
    model: config.model,
    prompt: serializeChatMessages(request.messages),
    maxOutputTokens: request.maxTokens,
    temperature: request.temperature,
    timeoutMs: request.timeoutMs ?? 60_000,
    signal: request.signal
  });
}
```

The completion client uses `purpose: "autocomplete"`, includes the existing
safe prompt and suffix in the serialized text request, and defaults to a short
timeout. HTTP branches keep their current request bodies byte-for-byte except
for type narrowing.

- [x] **Step 4: Prove old HTTP payloads remain unchanged**

Keep all existing fetch assertions. Add explicit regression assertions for:

- OpenAI Chat `/chat/completions`;
- OpenAI-compatible `/completions`;
- DeepSeek beta `suffix`;
- Anthropic `/messages`.

- [x] **Step 5: Run focused client/routing tests and compile**

Run the Step 2 command, then:

```powershell
npm run compile
```

Expected: pass.

- [x] **Step 6: Commit Task 6**

```powershell
git add src/models/chatCompletionsClient.ts src/models/completionsClient.ts src/models/providerContracts.ts test/chatCompletionsClient.test.ts test/completionsClient.test.ts test/codexOAuthRouting.test.ts
git commit -m "feat: route model text through Codex OAuth"
```

## Task 7: Extension Service Container And Product Routes

**Files:**

- Modify: `src/extension.ts`
- Modify: `src/autocomplete/inlineProvider.ts`
- Modify: `src/sidebar/ProblemBankViewProvider.ts`
- Test: `test/autocomplete.test.ts`
- Test: `test/sidebarTeachingContext.test.ts`
- Test: `test/problemBankWebviewScript.test.ts`

- [x] **Step 1: Write a failing service-container routing test**

Extract a small factory that creates app-server/auth/model/text services from:

```ts
interface CodexServicePaths {
  executablePath: string;
  codexHome: string;
  runtimeCwd: string;
  extensionVersion: string;
}
```

Test that `codexHome` and `runtimeCwd` are descendants of
`context.globalStorageUri.fsPath` and never descendants of a workspace folder.

- [x] **Step 2: Run focused product tests and confirm RED**

```powershell
npm test -- --run test/autocomplete.test.ts test/sidebarTeachingContext.test.ts test/problemBankWebviewScript.test.ts
```

Expected: failure for the missing service container/factory contract.

- [x] **Step 3: Wire one shared service container at activation**

Create the services once in `activate`, pass the text transport to
`createMimoInlineCompletionProvider`, and pass auth/model/text services into
`ProblemBankViewProvider`. Add the app-server client to extension disposables.

`deactivate` must not own a second process; disposal happens through
`context.subscriptions`.

- [x] **Step 4: Route every teaching/autocomplete config through the transport-aware router**

Every `routeTeachingModel` and `routeAutocompleteModel` call in the sidebar and
inline provider receives the shared OAuth text transport. Existing provider
modes still produce HTTP configs.

Health checks behave as follows:

- OAuth model check uses `model/list`;
- OAuth chat smoke uses the teaching OAuth route;
- OAuth autocomplete smoke uses the autocomplete OAuth route;
- API-key/custom-provider checks keep their existing logic.

- [x] **Step 5: Strengthen context-boundary tests**

Capture the OAuth transport request and assert forbidden strings never occur:

```ts
expect(request.prompt).not.toContain("The hidden statement");
expect(request.prompt).not.toContain("Teacher Pack secret");
expect(request.prompt).not.toContain("standard answer secret");
expect(request.prompt).not.toContain("coach thread secret");
```

Also assert app-server thread cwd equals the extension runtime directory and
not the workspace.

- [x] **Step 6: Run product tests and compile**

```powershell
npm test -- --run test/context.test.ts test/autocomplete.test.ts test/autocompleteRequestGate.test.ts test/sidebarTeachingContext.test.ts test/teachingWorkflow.test.ts test/problemBankWebviewScript.test.ts
npm run compile
```

Expected: pass.

- [x] **Step 7: Commit Task 7**

```powershell
git add src/extension.ts src/autocomplete/inlineProvider.ts src/sidebar/ProblemBankViewProvider.ts test/autocomplete.test.ts test/sidebarTeachingContext.test.ts test/problemBankWebviewScript.test.ts
git commit -m "feat: wire Codex OAuth into teaching and autocomplete"
```

## Task 8: OAuth Webview Commands And UI

**Files:**

- Modify: `src/sidebar/messageProtocol.ts`
- Modify: `src/sidebar/stateView.ts`
- Modify: `src/sidebar/ProblemBankViewProvider.ts`
- Modify: `src/sidebar/webview/styles.css`
- Modify: `src/sidebar/webview/main.ts`
- Test: `test/sidebarMessageProtocol.test.ts`
- Test: `test/problemBankWebviewScript.test.ts`
- Test: `test/sidebarWebviewModules.test.ts`

- [x] **Step 1: Write failing command-contract tests**

Require these commands in `webviewCommandNames` and the `WebviewMessage` union:

```text
readCodexAuth
startCodexBrowserLogin
startCodexDeviceLogin
cancelCodexLogin
logoutCodex
refreshCodexModels
```

Add source-contract assertions for auth-mode selector, OAuth account status,
browser/device buttons, login cancel, logout, and separate model selectors.

- [x] **Step 2: Run webview tests and confirm RED**

```powershell
npm test -- --run test/sidebarMessageProtocol.test.ts test/problemBankWebviewScript.test.ts test/sidebarWebviewModules.test.ts
```

Expected: command and source assertions fail.

- [x] **Step 3: Extend sanitized state views**

Add:

```ts
interface CodexOAuthStateView {
  auth: CodexAuthState;
  models: CodexModelInfo[];
  recommendedTeachingModel?: string;
  recommendedAutocompleteModel?: string;
  error?: string;
}
```

`ProblemBankStateView` includes this object. Tests serialize the state and prove
it contains none of `accessToken`, `refreshToken`, `cookie`, or `auth.json`.

- [x] **Step 4: Implement host command handlers**

- Browser login opens the returned URL with `vscode.env.openExternal`.
- Device login returns verification URL and user code to the webview.
- Cancel/logout/refresh call the service methods and republish state.
- Auth notifications trigger a state post when the webview is available.
- Save config persists `authMode` and role model IDs but never OAuth data.

- [x] **Step 5: Implement the OAuth configuration panel**

When provider is OpenAI:

- show `API Key | Codex OAuth` authentication selection;
- API-key selection shows the current key/base URL fields;
- OAuth selection shows availability, account state, login actions, and model
  selectors;
- pending device login shows a copyable code and an open-verification-page
  action;
- signed-in state shows email when present and plan type when present;
- signed-out/error state shows retry actions;
- model entries come from normalized app-server data.

OpenAI-compatible and Anthropic panels must retain their current fields.

- [x] **Step 6: Run webview tests and compile**

```powershell
npm test -- --run test/sidebarMessageProtocol.test.ts test/problemBankWebviewScript.test.ts test/sidebarWebviewModules.test.ts test/envConfig.test.ts
npm run compile
```

Expected: pass.

- [x] **Step 7: Commit Task 8**

```powershell
git add src/sidebar/messageProtocol.ts src/sidebar/stateView.ts src/sidebar/ProblemBankViewProvider.ts src/sidebar/webview/styles.css src/sidebar/webview/main.ts test/sidebarMessageProtocol.test.ts test/problemBankWebviewScript.test.ts test/sidebarWebviewModules.test.ts test/envConfig.test.ts
git commit -m "feat: add Codex OAuth configuration UI"
```

## Task 9: Full Verification, Packaging, And Installed Acceptance

**Files:**

- Modify if needed: `scripts/packageBetaReleaseVsix.js`
- Modify if needed: `.vscodeignore`
- Test: `test/internalPackaging.test.ts`
- Create only if desktop acceptance remains incomplete: `MANUAL-ACCEPTANCE.md`

- [x] **Step 1: Run context-boundary verification**

```powershell
npm test -- --run test/context.test.ts test/autocomplete.test.ts test/autocompleteRequestGate.test.ts
npm test -- --run test/teachingWorkflow.test.ts test/sidebarTeachingContext.test.ts
rg -n "teacherPack|standard|solution|statement|problem\.statement|coachThread" src\autocomplete src\teaching src\sidebar test
```

Expected: tests pass; review the search output and confirm no new OAuth path
crosses teaching-only context into autocomplete.

- [x] **Step 2: Run the full source verification**

```powershell
npm test
npm run compile
npm run check:hygiene
```

Expected: zero failures and zero hygiene violations.

- [x] **Step 3: Build and inspect the beta VSIX**

```powershell
npm run package:beta
tar -tf .runtime\student-autocomplete-lab-0.1.0-beta.1.vsix | Select-String -Pattern "auth.json|codex-oauth/home|access.token|refresh.token|secrets/|\.runtime/"
```

Expected: package succeeds; inspection has no credential/cache matches. A VSIX
is a ZIP archive, so use `tar -tf` only for listing.

- [x] **Step 4: Install the VSIX and record the installed version**

```powershell
code --install-extension .runtime\student-autocomplete-lab-0.1.0-beta.1.vsix --force
code --list-extensions --show-versions | Select-String student-autocomplete
```

Expected: installation succeeds and prints the extension ID/version.

- [x] **Step 5: Use Computer Use for the installed-extension path**

Load and follow the `computer-use:computer-use` skill before controlling VS Code.
Verify:

1. OAuth panel renders.
2. Browser login starts.
3. User completes any credential/consent ceremony; the agent never types or
   reads private credentials.
4. Signed-in state and models render.
5. Separate teaching/autocomplete models save.
6. One teaching hint returns.
7. One 1-3 line Ghost Text completion returns.
8. Spark appears only when returned by the account.
9. Logout returns to signed-out state.
10. OpenAI API-key and OpenAI-compatible configuration panels still work.

Computer Use verified the installed panel, legacy/API-key visibility, OAuth
visibility, and separate role selectors. A real Codex CLI smoke test verified
startup and signed-out `account/read`. Account-holder login, returned models,
text generation, and logout remain in `MANUAL-ACCEPTANCE.md` because private
credentials/consent could not be automated and the VS Code window later had
active user input.

- [x] **Step 6: Write a manual checklist only for remaining desktop gaps**

If every Step 5 action is verified, do not create a root checklist. Otherwise
create `MANUAL-ACCEPTANCE.md` with this exact structure and list only unverified
steps:

```markdown
# Codex OAuth Manual Acceptance

Generated because the automated desktop acceptance could not complete the
following user-controlled steps.

## Remaining checks

- [ ] Complete the browser OAuth consent ceremony.
  - Expected: the extension account card shows the signed-in email and plan.
  - Reason not automated: account credentials or explicit user consent were required.
```

Replace that concrete browser-consent row with another equally specific row
when a different acceptance action is the one that remains unverified.

- [x] **Step 7: Run final verification after any acceptance-driven fixes**

```powershell
npm test
npm run compile
npm run package:beta
git diff --check
git status --short
```

Expected: tests, compile, package, and diff check pass. Status contains only
intentional feature/acceptance files.

- [x] **Step 8: Commit verification artifacts or acceptance checklist**

If code/package hygiene changed:

```powershell
git add scripts/packageBetaReleaseVsix.js .vscodeignore test/internalPackaging.test.ts
git commit -m "test: verify Codex OAuth release package"
```

If `MANUAL-ACCEPTANCE.md` was required:

```powershell
git add MANUAL-ACCEPTANCE.md
git commit -m "docs: record remaining OAuth acceptance checks"
```

Do not commit `.runtime` or the generated VSIX.

## Task 10: Completion Audit And Merge Preparation

**Files:**

- Modify: `docs/superpowers/plans/2026-07-12-codex-oauth.md` checkbox state
- Review: `docs/superpowers/specs/2026-07-12-codex-oauth-design.md`

- [x] **Step 1: Check every specification requirement against evidence**

Create a local audit table from the design sections: authentication, model
roles, legacy providers, process isolation, text-only enforcement, context
boundary, UI states, deterministic tests, VSIX hygiene, installed extension,
and manual fallback. Each row must name a test output, source path, package
listing, or desktop observation.

| Requirement | Evidence |
| --- | --- |
| Authentication lifecycle | `test/codexAuthService.test.ts` (7 tests), `src/codex/codexAuthService.ts`, and real `account/read` smoke returned signed-out/`requiresOpenaiAuth`. |
| Separate model roles | `test/codexModelService.test.ts`, `test/envConfig.test.ts`, and installed UI observation of independent teaching/autocomplete selectors. |
| Legacy providers and custom URL/key | Full `test/modelRouter.test.ts`, `test/chatCompletionsClient.test.ts`, `test/completionsClient.test.ts`; installed UI showed OpenAI-compatible and API-key fields and hid OAuth controls correctly. |
| Process and credential isolation | `test/codexServices.test.ts`, `src/codex/codexServices.ts`; isolated `globalStorage/codex-oauth/{home,runtime}` and VSIX credential-name audit found no auth/token files. |
| Text-only, read-only generation | `test/codexTextClient.test.ts` (14 tests) covers ephemeral threads, approval rejection, interrupt/delete, and text extraction; runtime uses read-only sandbox and approval `never`. |
| Autocomplete context boundary | `test/autocomplete.test.ts`, `test/context.test.ts`, and `test/sidebarTeachingContext.test.ts` prove OAuth autocomplete excludes statement, answer, Teacher Pack, and coach history. |
| UI state correctness | `test/problemBankWebviewScript.test.ts`, `test/sidebarWebviewModules.test.ts`, and Computer Use observations; acceptance found and fixed `[hidden]` CSS precedence. |
| Deterministic source verification | Final pre-audit run: 80 test files and 285 tests passed; TypeScript compile passed. |
| VSIX hygiene | `npm run package:beta` passed; 6 Codex runtime files were included, credential patterns were absent, and `MANUAL-ACCEPTANCE.md` is excluded by `.vscodeignore` with a packaging regression test. |
| Installed extension | `kaiserunix.student-autocomplete-lab@0.1.0-beta.1` installed with `--force`; Computer Use rendered and exercised the configuration panel. |
| Manual fallback | Root `MANUAL-ACCEPTANCE.md` contains only account-holder login/model/generation/logout checks that could not be safely automated. |

- [x] **Step 2: Confirm branch history and working tree**

```powershell
git log --oneline --decorate 098365f..HEAD
git status --short --branch
git diff 098365f...HEAD --stat
```

Expected: feature commits are focused and the worktree is clean except for the
plan checkbox update that will be committed next.

- [x] **Step 3: Mark completed plan checkboxes and commit the plan record**

```powershell
git add docs/superpowers/plans/2026-07-12-codex-oauth.md
git commit -m "docs: complete Codex OAuth implementation plan"
```

- [x] **Step 4: Run the final post-commit proof**

```powershell
npm test
npm run compile
git status --short --branch
```

Expected: all tests and compile pass; the feature worktree is clean.

- [x] **Step 5: Use the finishing-a-development-branch skill**

Present verified options for merging, pushing/PR, keeping the branch, or
discarding it. Do not merge into the dirty primary worktree without first
reconciling its existing uncommitted changes.

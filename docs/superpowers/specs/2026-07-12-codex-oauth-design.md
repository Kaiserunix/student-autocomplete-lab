# Codex OAuth Provider Design

Date: 2026-07-12

Status: approved for implementation

Branch: `codex/codex-oauth`

Worktree: `<worktree-root>\student-autocomplete-lab\codex-oauth`

Base commit: `098365f` (`feat: harden beta ai coach release candidate`)

## Recovery After Context Compaction

Continue only in the worktree above. Do not switch branches in or copy unrelated
changes from `<repo-root>`; that worktree had
pre-existing uncommitted changes when this feature branch was created.

Before resuming implementation:

1. Read this specification completely.
2. Read `docs/superpowers/plans/2026-07-12-codex-oauth.md` after it exists.
3. Run `git status --short --branch` and continue from the first unchecked plan
   item.
4. Preserve the autocomplete context boundary: OAuth changes transport and
   authentication, not what autocomplete is allowed to read.
5. Keep the existing OpenAI API-key, OpenAI-compatible custom URL/key, and
   Anthropic routes working.

Baseline evidence from the new worktree:

- `npm test`: 73 test files, 246 tests passed.
- `npm run compile`: passed.

## Goal

Add an optional Codex OAuth authentication mode to the existing OpenAI provider.
The OAuth route must support both teaching/analysis and inline autocomplete with
independently selected models. Existing API-key and custom-provider routes must
remain available and backward compatible.

## Product Scope

The feature adds:

- managed ChatGPT browser login through Codex app-server;
- device-code login as a fallback;
- account state, retry, cancellation, and logout controls;
- account-scoped model discovery through `model/list`;
- separate teaching and autocomplete model selection;
- Codex app-server text generation for both model roles;
- deterministic tests for protocol, authentication, routing, cancellation, and
  cleanup;
- installed-extension validation after implementation.

The feature does not:

- remove or replace OpenAI API-key authentication;
- remove OpenAI-compatible custom base URL/key configuration;
- remove the separate OpenAI-compatible autocomplete base URL or protocol choice;
- remove Anthropic-native configuration;
- inspect or judge where a user obtained an API key;
- parse, expose, upload, or manage ChatGPT access/refresh tokens itself;
- expose a public proxy or OpenAI-compatible endpoint;
- add cloud synchronization of credentials;
- allow Codex tools to edit or inspect the student's workspace as part of model
  generation.

## Source Of Truth

The implementation uses documented Codex app-server surfaces:

- [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- [Authentication endpoints](https://learn.chatgpt.com/docs/app-server#auth-endpoints)
- [Model discovery](https://learn.chatgpt.com/docs/app-server#models)

The app-server owns the browser/device-code login, persists credentials, and
refreshes managed ChatGPT sessions. The extension consumes normalized account
state and never receives raw token fields.

## Considered Approaches

### 1. Persistent Codex app-server child process — selected

Run `codex app-server` over stdio, initialize a JSON-RPC connection once, and
reuse it for account, model, and text-generation calls. This is the documented
deep-integration surface and avoids handling OAuth tokens in extension code.

### 2. One `codex exec` process per request — rejected

This has a smaller client implementation but process startup and session setup
would occur on every keystroke-driven completion. It also provides a weaker
account/model lifecycle for a configuration UI.

### 3. Extension-managed OAuth tokens and direct service calls — rejected

This duplicates token refresh, couples the extension to undocumented service
details, and increases credential exposure. The extension will not use the
experimental externally managed `chatgptAuthTokens` mode.

## Provider And Authentication Model

Provider and authentication remain separate concepts.

Existing provider modes remain:

```text
openai
openai-compatible
anthropic-native
```

The OpenAI provider gains:

```text
studentAutocomplete.ai.openai.authMode = api-key | codex-oauth
```

`api-key` is the default so existing installations do not change behavior.

The route matrix is:

| Provider | Authentication | Transport |
| --- | --- | --- |
| OpenAI | API key | existing OpenAI HTTP client |
| OpenAI | Codex OAuth | new Codex app-server client |
| OpenAI-compatible | custom key | existing custom URL HTTP client |
| Anthropic-native | API key | existing Anthropic HTTP client |

Teaching and autocomplete retain separate model IDs for every provider. OAuth
does not force both roles onto one model.

## Runtime Architecture

New modules:

```text
src/codex/appServerProtocol.ts
src/codex/appServerClient.ts
src/codex/codexAuthService.ts
src/codex/codexModelService.ts
src/codex/codexTextClient.ts
```

Responsibilities:

- `appServerProtocol.ts`: narrow JSON-RPC request, response, notification, item,
  and public-state types plus runtime guards.
- `appServerClient.ts`: lazy child-process lifecycle, JSONL framing, initialize
  handshake, monotonically increasing request IDs, pending-request correlation,
  request timeouts, notification subscriptions, stderr redaction, crash handling,
  and disposal.
- `codexAuthService.ts`: `account/read`, browser/device-code login, login
  cancellation, logout, account notifications, and the public authentication
  state machine.
- `codexModelService.ts`: `model/list`, visible-model normalization, availability
  checks, and role recommendations.
- `codexTextClient.ts`: one-shot thread/turn lifecycle, final text collection,
  cancellation, tool-call rejection, and guaranteed thread deletion.

Existing modules keep their domain responsibilities. `modelRouter.ts` selects
the transport; autocomplete and teaching prompt builders do not learn about
OAuth or JSON-RPC.

## Process Isolation

The extension starts one lazy app-server process when OAuth state, OAuth models,
or an OAuth generation route is first requested.

The process receives an extension-owned environment:

```text
CODEX_HOME=<ExtensionContext.globalStorageUri>/codex-oauth/home
cwd=<ExtensionContext.globalStorageUri>/codex-oauth/runtime
```

This prevents Student Autocomplete logout from logging the user out of the
official Codex CLI or another IDE extension. It also prevents inherited user
Codex skills, project configuration, plugins, MCP servers, and task history from
becoming part of this extension's model path.

The app-server executable defaults to `codex`. An advanced setting allows a
user-supplied executable path:

```text
studentAutocomplete.ai.codex.executablePath
```

If the executable cannot start or lacks required app-server methods, only the
OAuth route is unavailable. Other providers continue to work.

The child process is disposed when the extension deactivates. An unexpected
exit rejects all pending requests and moves authentication state to a
recoverable error. A later explicit action may restart it.

## Authentication State Machine

Public UI state:

```ts
type CodexAuthState =
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
  | {
      status: "signed-in";
      email?: string;
      planType?: string;
    }
  | { status: "error"; error: string };
```

Transitions:

- startup calls `account/read`;
- no account becomes `signed-out`;
- an account becomes `signed-in`;
- browser login calls `account/login/start` with `type: "chatgpt"` and opens
  the returned URL through `vscode.env.openExternal`;
- device login calls `account/login/start` with
  `type: "chatgptDeviceCode"` and displays only the verification URL and code;
- `account/login/completed` resolves a pending login;
- `account/updated` is authoritative for later account changes;
- cancellation calls `account/login/cancel`;
- logout calls `account/logout`;
- a failed automatic refresh becomes a recoverable re-login state.

Unknown response fields are discarded. Raw auth URLs must not be written to
logs because their query parameters may carry sensitive state.

## Model Discovery And Selection

OAuth models come only from app-server `model/list` with `includeHidden: false`.
The UI does not assume Spark exists.

When no OAuth role model has been saved:

- autocomplete recommends exact `gpt-5.3-codex-spark` when visible;
- otherwise autocomplete recommends a visible model whose ID contains `luna`;
- teaching recommends a visible model whose ID contains `terra`;
- otherwise teaching uses the app-server entry marked `isDefault`;
- if no defensible recommendation exists, the role remains unselected.

Recommendations initialize blank fields only. If a previously selected model
disappears, the request is blocked and the UI shows a replacement suggestion;
the extension does not silently switch models or quota buckets.

The model view retains app-server metadata needed for display:

- model ID;
- display name;
- default marker;
- supported reasoning efforts;
- input modalities.

Reasoning effort is not exposed in the first implementation. The request uses
the app-server/model default to keep the OAuth surface focused.

## Text Generation Lifecycle

The common OAuth text interface is:

```ts
interface CodexTextRequest {
  purpose: "analysis" | "autocomplete";
  model: string;
  prompt: string;
  maxOutputTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}
```

For each request:

1. Create a new app-server thread using the extension-owned runtime directory.
2. Start one turn with the selected model and the already-built prompt.
3. Collect only final `agentMessage` text associated with that thread/turn.
4. Ignore reasoning text and progress notifications.
5. If command execution, file changes, MCP calls, dynamic tool calls, web search,
   collaboration calls, or approval requests appear, interrupt the turn and
   fail with a text-only-route error.
6. On cancellation or timeout, call `turn/interrupt`.
7. In `finally`, call `thread/delete` so completion requests do not accumulate
   in Codex history.

The request runs with a read-only sandbox, no approval escalation, and the
extension-owned empty runtime directory. No workspace path is supplied as cwd.

Autocomplete cancellation is connected to the VS Code cancellation token.
Cancellation returns no Ghost Text and does not show a blocking message.
Teaching errors remain visible in the AI Coach response area.

## Context Boundary

OAuth is a transport change, not a context expansion.

Inline autocomplete may send only:

- filtered prefix and suffix around the cursor;
- language;
- sanitized local file context already permitted by the current prompt builder;
- indentation/import/signature context;
- hard rules and safe code habits.

It may not send:

- the full problem statement;
- Teacher Pack content;
- the standard answer;
- lesson reports;
- archived solutions;
- AI Coach history.

Teaching routes may continue to use their existing explicit teaching context.
Both roles run app-server with the isolated runtime cwd, so Codex cannot use the
student workspace as implicit context.

The implementation must retain or strengthen prompt-leakage tests. Filtering a
leaked response is not sufficient; forbidden content must never be sent.

## Configuration UI

In OpenAI mode, the configuration panel shows an authentication selector:

```text
API Key | Codex OAuth
```

API-key mode keeps the existing base URL, key, teaching model, and autocomplete
model controls.

OAuth mode hides the API-key input and shows:

- CLI/app-server availability;
- signed-in, signed-out, login-in-progress, and recoverable-error state;
- browser login;
- device-code login;
- copy/open actions for a device-code ceremony;
- cancel login;
- refresh account;
- logout;
- OAuth teaching model selector;
- OAuth autocomplete model selector.

OpenAI-compatible mode remains unchanged and continues to expose:

- custom base URL;
- optional autocomplete-specific base URL;
- custom API key;
- teaching and autocomplete models;
- OpenAI Completions, OpenAI Chat, and Anthropic Messages autocomplete formats.

New webview commands:

```text
readCodexAuth
startCodexBrowserLogin
startCodexDeviceLogin
cancelCodexLogin
logoutCodex
refreshCodexModels
```

The host pushes normalized account updates to the webview when app-server emits
notifications. The webview never receives credential-cache contents.

## Error Behaviour

| Failure | Required behaviour |
| --- | --- |
| Codex CLI missing | Mark OAuth unavailable and keep other providers usable. |
| CLI/app-server incompatible | Explain that Codex must be upgraded. |
| Browser callback fails | Keep device-code login available. |
| Login cancelled or expired | Return to signed-out state and allow retry. |
| Process exits | Reject pending work and permit a later lazy restart. |
| Session refresh fails | Ask the user to sign in again. |
| Saved model is unavailable | Block the request and ask for a new selection. |
| Autocomplete timeout | Return an empty suggestion without a blocking popup. |
| Teaching timeout | Show a retryable AI Coach error. |
| Request cancelled | Interrupt the turn and delete the thread. |
| Tool activity appears | Interrupt and fail the text-only route. |
| Rate limit reached | Preserve the service error; do not silently switch models. |

Logs may contain operation name, model ID, latency, normalized error category,
and request ID. They may not contain prompts, user/device codes, raw OAuth URLs,
tokens, cookies, or credential-file contents.

## Test Strategy

New deterministic tests:

```text
test/codexAppServerProtocol.test.ts
test/codexAppServerClient.test.ts
test/codexAuthService.test.ts
test/codexModelService.test.ts
test/codexTextClient.test.ts
test/codexOAuthRouting.test.ts
```

The process client accepts an injected process factory. Tests use a fake JSONL
process rather than a real account and verify public behaviour:

- initialize handshake;
- request/response correlation;
- malformed JSON isolation;
- browser and device login;
- login success, failure, cancellation, and logout;
- account notifications;
- visible model normalization and recommendations;
- independent teaching/autocomplete model routes;
- streamed final text aggregation;
- cancellation and timeout;
- unexpected child exit;
- tool-call rejection;
- thread deletion on success and failure;
- sensitive-value redaction.

Regression coverage must prove:

- default OpenAI auth remains API key;
- existing OpenAI API-key calls are unchanged;
- custom OpenAI-compatible URL/key routing is unchanged;
- DeepSeek FIM autocomplete base URL and suffix behaviour are unchanged;
- Anthropic-native routing is unchanged;
- OAuth autocomplete never receives forbidden teaching context;
- app-server cwd is not a student workspace path;
- packaged VSIX files do not include the OAuth `CODEX_HOME` or global storage.

## Installed-Extension Acceptance

After automated tests and packaging, use Computer Use when available to drive
the installed VS Code extension through:

1. open the OAuth configuration;
2. start browser login;
3. confirm account state after the user completes any required identity or
   consent ceremony;
4. fetch models;
5. choose separate teaching and autocomplete models;
6. request one teaching hint;
7. trigger a 1-3 line Ghost Text completion;
8. verify Spark is selectable only when returned by the account;
9. log out and confirm signed-out state;
10. switch back to OpenAI API key;
11. switch to OpenAI-compatible custom URL/key;
12. verify existing health-check UI remains available.

Computer Use may operate VS Code and the browser, but it must not guess, enter,
or expose account credentials. If user participation or the desktop environment
prevents completing any acceptance step, create a concise root-level
`MANUAL-ACCEPTANCE.md` containing only the remaining unverified actions and the
expected results. Do not create that file if Computer Use completes the entire
acceptance path.

## Completion Criteria

- Codex browser login, device-code login, cancellation, account refresh, and
  logout are implemented.
- OAuth supports both teaching and autocomplete with separate model choices.
- Existing OpenAI API-key, OpenAI-compatible custom URL/key, and Anthropic routes
  have no regression.
- Context-boundary tests prove OAuth autocomplete receives no teaching-only
  material.
- Deterministic process/protocol tests pass.
- `npm test` and `npm run compile` pass from the feature worktree.
- A clean VSIX is built and inspected.
- The VSIX is installed with `--force` and the installed version is recorded.
- Computer Use completes the installed-extension flow, or remaining steps are
  recorded in root `MANUAL-ACCEPTANCE.md`.
- The final report lists verified and unverified golden-path steps explicitly.


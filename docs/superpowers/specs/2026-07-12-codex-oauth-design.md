# Codex OAuth Provider Design

Date: 2026-07-12
Status: Reference (Implemented — experimental OAuth authentication mode for OpenAI)

## 1. Goal & Scope

Add an optional Codex OAuth authentication mode (`codex-oauth`) to the OpenAI provider so both teaching/analysis and inline autocomplete can run with independently selected models from the user's ChatGPT Codex session, while keeping OpenAI API-key, OpenAI-compatible custom URL/key, and Anthropic-native routes unchanged.

Non-goals:
- Never replace or weaken API-key, OpenAI-compatible (including DeepSeek FIM), or Anthropic-native routes.
- Never parse, persist, upload, or expose raw ChatGPT access/refresh tokens in extension code.
- Never expose a public proxy or let Codex tools inspect or edit the student's workspace during model generation.

Source of truth: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Auth endpoints](https://learn.chatgpt.com/docs/app-server#auth-endpoints), [Model discovery](https://learn.chatgpt.com/docs/app-server#models).

## 2. Architecture Decision

**Selected: Persistent lazy `codex app-server` child process over stdio JSON-RPC.**
Reusing one initialized process avoids per-keystroke process startup (`codex exec`) and avoids handling OAuth tokens or undocumented refresh logic inside extension code (`chatgptAuthTokens`).

## 3. Provider & Route Matrix

Setting: `studentAutocomplete.ai.openai.authMode = "api-key" | "codex-oauth"` (default `"api-key"`).
Executable setting: `studentAutocomplete.ai.codex.executablePath` (default `"codex"`).

| Provider Mode | Auth Mode | Transport |
| --- | --- | --- |
| `openai` | `api-key` | OpenAI HTTP client |
| `openai` | `codex-oauth` | Codex app-server JSON-RPC client |
| `openai-compatible` | custom key | OpenAI-compatible HTTP client |
| `anthropic-native` | API key | Anthropic Messages HTTP client |

Modules in `src/codex/` and `src/models/`:
- `src/codex/appServerProtocol.ts` — JSON-RPC request/response/notification types and guards.
- `src/codex/appServerClient.ts` — lazy process lifecycle, JSONL framing, initialize handshake, request correlation, timeouts, stderr redaction, crash recovery, disposal.
- `src/codex/codexAuthService.ts` — `account/read`, browser/device login, cancellation, logout, notification subscriptions, public `CodexAuthState` state machine.
- `src/codex/codexModelService.ts` — `model/list` (`includeHidden: false`), visible-model normalization, selection validation, role recommendations.
- `src/codex/codexTextClient.ts` — one-shot thread/turn text generation, cancellation, tool-call rejection, guaranteed `thread/delete`.
- `src/codex/codexServices.ts` — service container and isolated storage path resolution.
- `src/models/modelTextTransport.ts` & `src/models/modelRouter.ts` — transport abstraction keeping prompt builders agnostic to OAuth/JSON-RPC.

## 4. Process Isolation

The lazy `codex app-server` process starts on first OAuth auth, model-list, or generation request inside an extension-owned environment:

```text
CODEX_HOME = <ExtensionContext.globalStorageUri>/codex-oauth/home
cwd        = <ExtensionContext.globalStorageUri>/codex-oauth/runtime
```

This prevents extension logout from affecting the user's standalone Codex CLI and prevents user Codex skills, project configs, plugins, or MCP servers from leaking into student requests. The process is disposed on extension deactivation; unexpected exits reject pending requests and allow lazy restart on the next explicit action.

## 5. Authentication State Machine

Public state (`src/codex/codexAuthService.ts`):

```ts
type CodexAuthState =
  | { status: "starting" }
  | { status: "unavailable"; error: string }
  | { status: "signed-out" }
  | { status: "login-pending"; loginId: string; authUrl?: string; verificationUrl?: string; userCode?: string }
  | { status: "signed-in"; email?: string; planType?: string }
  | { status: "error"; error: string };
```

Transitions:
- `account/read` initializes `signed-out` or `signed-in`.
- Browser login invokes `account/login/start` (`type: "chatgpt"`) and opens `authUrl` via `vscode.env.openExternal`.
- Device-code login invokes `account/login/start` (`type: "chatgptDeviceCode"`) and displays verification URL and code.
- `account/login/completed` resolves pending logins; `account/updated` is authoritative for state updates.
- `account/login/cancel` cancels pending login; `account/logout` signs out.
- Raw auth URLs, device codes, tokens, and credential files are never written to logs.

Webview commands (`src/sidebar/messageProtocol.ts`): `readCodexAuth`, `startCodexBrowserLogin`, `startCodexDeviceLogin`, `cancelCodexLogin`, `logoutCodex`, `refreshCodexModels`.

## 6. Model Discovery & Selection

Models come exclusively from `model/list` (`includeHidden: false`). Defaults initialize blank fields only (`src/codex/codexModelService.ts`):
- **Autocomplete**: exact `gpt-5.3-codex-spark` when visible, else first visible model matching `/luna/i`.
- **Teaching**: first visible model matching `/terra/i`, else app-server entry with `isDefault: true`.

If a previously saved model disappears from the account list, requests are blocked with a replacement suggestion — never silently switched.

## 7. Text Generation Lifecycle & Context Boundary

For every `CodexTextRequest` (`analysis` or `autocomplete`):
1. Start an isolated thread in the extension-owned empty runtime `cwd` (read-only sandbox, no approval escalation, never the student workspace).
2. Run one turn with the selected model and pre-built prompt.
3. Collect only final `agentMessage` text; ignore reasoning/progress notifications.
4. Immediately interrupt and fail with a text-only error if any command execution, file edit, MCP/tool call, web search, or approval request appears.
5. On cancellation/timeout, call `turn/interrupt`.
6. In `finally`, always call `thread/delete` so completions never accumulate in Codex history.

OAuth changes transport only — autocomplete context isolation remains identical (local prefix/suffix, normalized language, sanitized file label, bounded safe code habits; never problem statement, Teacher Pack, standard answer, lesson report, or coach history).

## 8. Error Behavior

| Failure | Required Behavior |
| --- | --- |
| Codex CLI missing / incompatible | Mark OAuth unavailable; other providers stay usable |
| Browser callback fails | Keep device-code login available |
| Login cancelled / expired | Return to `signed-out` and allow retry |
| Child process exits | Reject pending work; permit later lazy restart |
| Saved model unavailable | Block request and prompt for replacement; never silently switch |
| Autocomplete timeout / cancel | Return empty Ghost Text silently; interrupt turn & delete thread |
| Teaching timeout / error | Surface retryable error in AI Coach |
| Tool activity appears | Interrupt turn and fail as text-only violation |
| Rate limit reached | Preserve provider error; never silently switch models |

Deterministic tests (`test/codex*.test.ts`) inject a fake JSONL process and cover handshake, framing, login/logout, model discovery, text aggregation, tool rejection, cancellation, thread cleanup, secret redaction, and context isolation.

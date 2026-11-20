# Manual Acceptance Checklist

Use this checklist to validate live VS Code Extension Host behavior that automated Vitest suites cannot cover (real provider calls, Ghost Text rendering, interactive sidebar flows, and the integrated OJ Submission Console).

## Prerequisites

1. Run automated checks first:
   ```powershell
   npm test
   npm run compile
   npm run package:beta-release
   npm run check:hygiene
   ```
2. Install the clean beta-release VSIX (or launch via `F5` -> `Run Student Autocomplete Extension`). If both `kaiserunix.student-autocomplete-lab` and `kaiserunix.student-autocomplete-lab-beta-release` are installed, disable one for the workspace and run `Developer: Reload Window` so commands and views have a single owner.
3. Never paste API keys, OAuth tokens, raw auth URLs, or private model transcripts into repo files or issue reports.

## 1. Provider Configuration And Health Check

1. Open `AI 做题陪练` in the Activity Bar and stay on `作答现场`.
2. Expand `账户与模型`.
3. For **Codex OAuth** (if testing an authorized local Codex CLI session):
   - Set `兼容模式` to `OpenAI 官方` and `OpenAI 认证` to `Codex OAuth`.
   - Confirm status shows signed-in; click `刷新模型` and pick separate `提示/评分模型` and `补全模型` from the account list.
   - Click `保存 AI 配置`, then click `健康检查`.
4. For **OpenAI-compatible / DeepSeek FIM** (optional):
   - Set `兼容模式` to `OpenAI 兼容`, analysis Base URL (e.g., `/v1`), autocomplete Base URL (`https://api.deepseek.com/beta` for DeepSeek FIM), and your own key.
   - Click `保存 AI 配置`, `拉取模型`, and `健康检查`.

Pass criteria:

- Health check reports independent status for model list, chat/hint smoke test, and autocomplete smoke test.
- Autocomplete card displays `Renderer` and validation state (`success`, `model-empty`, or `validator-rejected` — never a generic network error when empty or rejected).
- API keys show only saved/masked status, never plaintext.

## 2. Automatic Ghost Text Across Supported Languages

Create four throwaway files in an ignored scratch folder (for example under `practice/`): `.py`, `.c`, `.cpp`, and `.rs`, each containing a small partial loop or `if` body.

For each file:

1. Type an incomplete statement inside an indented block (for example `total +=`).
2. Pause typing for ~350 ms without pressing any shortcut and wait for gray Ghost Text to appear automatically.
3. If Ghost Text does not trigger automatically, run `AI 做题陪练：立即补全一次（备用）` to separate auto-trigger issues from model/transport issues, then use `更多操作` -> `测试补全接口` to inspect `model-empty`, `validator-rejected`, or transport errors.
4. Accept with `Tab` or dismiss with `Esc`.

Pass criteria:

- Suggestion is code-only and at most 3 contiguous lines — no explanation prose, Markdown fences, problem statement text, full solution, or prompt echo.
- Language idioms hold: Python indentation, C/C++ braces/semicolons/types, Rust ownership/borrowing and `Option`/`Result` without reckless `unwrap`.
- Sidebar skill audit displays route, language, renderer, stable rule IDs, rule budget, and enforcement — never raw prefix/suffix code, file paths, problem statements, Teacher Packs, or credentials.

## 3. Single-Session Coaching And Learning Profile

Import a Markdown or online problem in `题目张贴板`, create/open its starter file, and enter `作答现场`:

1. Click `给一个提示`.
2. Expand `更多操作` and click `提示更具体`; confirm it narrows the same issue without dumping a full solution.
3. Enter a follow-up question in `追问` and click `发送` (or `Ctrl+Enter`); confirm the reply answers the latest question directly.
4. Trigger one automatic 1–3 line Ghost Text completion in the editor; confirm neither Ghost Text nor follow-up promotes a `Student Skill`.
5. Use `更多操作` -> `完成复盘` or `我卡住了` to run an evidence-bearing teaching review, then inspect `学习档案` (`revision`, evidence cards, `有帮助` / `这条不准` / `禁用`, version rollback).
6. Run `AI 做题陪练：推荐下一题` (or the archived-problem recommendation button) and verify visible reasons.

Pass criteria:

- Coach audit reports `coach` route and stable rule IDs; autocomplete audit reports `autocomplete` route.
- Disabled or wrong-marked skills are excluded from applied rules.
- Autocomplete requests never receive the problem statement, standard answer, Teacher Pack, or coach history.
- Recommendations show explicit rationale and tie difficulty changes to evidence.

## 4. Integrated OJ Submission Console (Demo Mode)

1. Run `AI 做题陪练：打开 OJ 提交控制台` from the Command Palette (`Ctrl+Shift+P`).
2. Confirm top bar status reaches `LOCAL / ONLINE` and default mode is `DEMO`.
3. Choose or drop `prototypes/oj-console/examples/demo-source.cpp`; confirm source ticket and 12-char SHA-256 digest appear without displaying source code.
4. Click `生成安全预览` (or `Ctrl+Enter`), review the immutable preview card, then click `确认并执行一次` (or `Ctrl+Enter`).
5. Confirm stage progression finishes at `ACCEPTED` with verdict badge `AC`.
6. Verify `Ctrl+K` command palette opens/filters/runs and the 4-theme dock (`acid` / `violet` / `amber` / `cyan`) updates the UI cleanly.

Note: Real-mode remote submission to Codeforces or AtCoder is verified separately under the dedicated-account manual release gate in [docs/superpowers/specs/2026-07-21-multi-platform-oj-submission-design.md](docs/superpowers/specs/2026-07-21-multi-platform-oj-submission-design.md).

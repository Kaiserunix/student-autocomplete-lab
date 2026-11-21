# Student Autocomplete Lab — Product Strategy, Anti-Spoiler Positioning & Roadmap

> **Status**: Pod A Cross-Functional Consensus (Tech Lead + Marketing & Growth + Simulated Competitive Programming Student)
> **Scope**: Positioning, honest 5-platform capability boundaries, VSIX/DeepSeek onboarding upgrades, and engineering decoupling roadmap for `Kaiserunix/student-autocomplete-lab`.

---

## 1. Executive Positioning & Core Differentiator

### Unified Stage & Hero Positioning
- **Release Stage**: **Public Beta** *(unify GitHub About metadata from `"alpha"` to `"Public Beta"` to match `README.md` and `package.json` `0.1.0-beta.1`)*.
- **Headline (CN)**: **Student Autocomplete Lab · 不替你交卷的 VS Code 算法私教 (Public Beta)**
- **Headline (EN)**: **Student Autocomplete Lab — Anti-Spoiler VS Code Algorithm Coach & Local Learning Skill Profile**
- **Core Differentiator vs. GitHub Copilot / Cursor**:
  - Standard AI coding assistants read your entire workspace/problem statement and dump the whole AC solution on one `Tab` press — killing algorithmic learning.
  - **Student Autocomplete Lab architecturally separates inline completion from teaching**: the 1–3 line Ghost Text completion path (`src/autocomplete/`) is **structurally blocked** from reading the problem statement, reference solution, Teacher Pack, or coach history (verified by `test/skillContextBoundary.test.ts`). Problem statements and hints enter **only** when the student explicitly asks the Socratic AI Coach.
  - Recurring struggle patterns accumulate into a **local, inspectable, editable, and rollbackable `Student Skill`** profile (JSONL on disk, never silently uploaded or locked).

---

## 2. Honest Capability Boundaries (Anti-Overpromise Contract)

| Area | Verified Current Reality | Copy & Marketing Redline |
| :--- | :--- | :--- |
| **Anti-Spoiler Context Isolation** | Enforced in code and covered by `test/skillContextBoundary.test.ts` + 100+ Vitest tests. | **Headline USP** — place front-and-center in README Hero. |
| **5-Platform OJ Problem Import** | **Luogu & AtCoder**: out-of-the-box public read. **Codeforces**: public metadata only; full statements require Competitive Companion (`127.0.0.1:10043`) or Markdown import. **NowCoder & LeetCode**: require separately installed local MCP adapters (Markdown works as universal fallback). | **Never** promise turnkey 5-platform one-click import without explicitly noting local adapters / Competitive Companion requirements. |
| **In-Extension Submission** | Only **experimental Codeforces / AtCoder submission** via user-installed Python [`online-judge-tools/oj`](https://github.com/online-judge-tools/oj) with 2-minute single-use confirmation; **AtCoder is currently restricted by upstream Cloudflare Turnstile**. NowCoder run/submit lives in the separate local MCP (`ketherworks/competitive-programming-mcp`). | **Never** promise "5-platform built-in 1-click submission". Keep submission clearly marked experimental with explicit per-platform caveats. |
| **DeepSeek Dual-Model FIM Setup** | DeepSeek FIM autocomplete requires `https://api.deepseek.com/beta` (`deepseek-chat`); putting `/v1` causes silent FIM failure. | Provide an explicit **30-Second DeepSeek Dual-Model Cheat Sheet** right under Quick Start. |
| **Evaluation & OS Parity** | 1,000-step longitudinal skill eval is **synthetic** (`docs/large-scale-growth-simulation.md`); primary dev/test baseline is **Windows + PowerShell** (`VS Code >= 1.125.0`, Node 20+). | Do **not** claim proven real-classroom learning gains or full macOS/Linux verification parity yet. |

---

## 3. Prioritized Engineering & Decoupling Roadmap

### P0 — Onboarding Conversion & AI Config Reliability
1. **Publish Prebuilt `.vsix` GitHub Releases**: Automate `npm run package:beta-release` + `npm run check:hygiene` into GitHub Releases so students install with one `code --install-extension` command instead of cloning and pressing `F5`.
2. **AI Configuration Hardening (`Chat` vs `FIM` Separation)**:
   - Support independent API keys for Chat vs. Autocomplete in OpenAI-compatible mode;
   - Add a **1-Click Chat + FIM Connection Self-Check** button in the sidebar `AI 配置` panel that catches DeepSeek `/v1` vs `/beta` misconfigurations with actionable Chinese/English hints;
   - Strip 145 legacy `mimo` identifiers across `src/` in favor of provider-neutral naming.
3. **Unify Default OJ Endpoints & Remove Hardcoded Sibling Paths**:
   - Align `src/oj/vscodeProviderConfiguration.ts` with canonical production endpoints from `ketherworks/competitive-programming-mcp/docs/deployment/production-endpoints.md` (fixing `codeforces-mcp.ksrnyx.top/mcp` drift);
   - Replace hardcoded sibling paths (`../nowcoder-oj-mcp/...`, unreleased `../leetcode-mcp-private/build/index.js`) with configurable settings + graceful setup prompts.

### P1 — Architectural Decoupling & Runtime Verification
1. **Decompose `src/sidebar/ProblemBankViewProvider.ts` (~8,360 lines / 299 KB)**: Split the monolithic webview god-file into a thin webview message shell + focused domain controllers (`AiConfigController`, `ProblemBankController`, `CoachSessionController`, `StudentSkillController`).
2. **Deduplicate `src/ojConsole/` vs `prototypes/oj-console/backend/`**: Consolidate the 7 duplicated backend files into a single shared module and add runtime verification tests for `OjConsolePanel.ts` (currently compile-tested only).
3. **Inline Ghost Text E2E Test Harness**: Add a deterministic VS Code Extension Host test verifying Ghost Text trigger timing, spoiler-free output filtering, and acceptance telemetry.

### P2 — Cross-Platform Polish & Real-Learner Validation
1. **macOS / Linux Compatibility Matrix**: Verify shell invocation, `oj` CLI paths, and file watching on macOS and Ubuntu CI runners.
2. **Real-Student Pilot Calibration**: Run opt-in local-first cohorts with ICPC/OI trainees to calibrate Student Skill decay, next-problem recommendations, and English UI coverage.

---

## 4. Distribution Hooks & Visual Assets

- **GitHub About (Updated)**: `Anti-spoiler VS Code algorithm coach (Public Beta): context-blind 1-3 line FIM autocomplete + Socratic hints + local inspectable Student Skill profile for Luogu, AtCoder, CF & NowCoder.`
- **Student / ACM Community Hook (知乎 / V2EX / B站 / 集训队群)**: *"刷算法题用 Copilot 一按 Tab 整道题全剧透？我做了一个架构级「防剧透短补全 + 苏格拉底阶梯提示 + 本地学习画像」的 VS Code 插件。"*
- **Recommended Visual Assets (`docs/assets/`)**:
  - `anti-spoiler-vs-copilot.gif` — Side-by-side comparison: 1–3 line Ghost Text boilerplate completion vs. explicit Socratic hint escalation in the sidebar.
  - `student-skill-inspector.png` — Inspecting, correcting, and rolling back a local `Student Skill` pain-point entry.

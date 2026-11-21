# Student Autocomplete Lab Beta Release

Student Autocomplete Lab is a Chinese-first VS Code algorithm-learning coach (VS Code `1.125.0+`). It helps students practice contest-style problems with safe local inline autocomplete, explicit AI coaching, learning-score review, and an inspectable local learning profile.

It is not an automatic problem solver or an unattended OJ submitter. AI submission checks remain estimates. Optional Codeforces and AtCoder submission uses a separately installed OJ client and always requires a fresh user confirmation.

## What Is Included

- **AI Coach (`作答现场` / `AI Coach`)**: progressive hints, follow-up Q&A, lesson reports after giving up, AI-estimated pre-submit checks, learning scores, optimization reviews, archiving, and rule-backed next-problem recommendations.
- **Problems (`题目张贴板` / `Problems`)**: read-only search and import across five OJ providers (Luogu, LeetCode, NowCoder, Codeforces, AtCoder), Chinese/English Markdown problem import, and starter file creation for Python, C, C++, and Rust.
- **Learning Profile (`学习档案` / `Learning Profile`)**: inspectable, correctable, disableable, and version-rollbackable local `Student Skill` memory.
- **Safe Autocomplete**: after pausing ~350 ms while typing, inline Ghost Text suggests 1–3 lines using local student-code context and safe language/habit rules only — never the full problem statement, Teacher Pack, or hidden reference solution.
- **Provider Flexibility**: OpenAI (API Key or experimental Codex OAuth), OpenAI-compatible services (including DeepSeek FIM via `https://api.deepseek.com/beta`), and Anthropic Messages.
- **English Beta Support**: main sidebar navigation, explicit English AI-output mode, and English Markdown problem import.
- **Experimental Codeforces & AtCoder Submission**: available in the sidebar submission docket and the `AI 做题陪练：打开 OJ 提交控制台` webview panel via a user-installed `online-judge-tools/oj`, requiring a fresh single-use confirmation for every submission with no automatic retry.

## Experimental Codeforces And AtCoder Submission

Install [`online-judge-tools/oj`](https://github.com/online-judge-tools/oj) separately; it is not bundled in this VSIX. Choose Codeforces or AtCoder, sign in through the visible terminal, preview the saved active file (or selected file in the OJ Submission Console), and explicitly confirm one submission. Confirmations expire after two minutes or on source change. The extension never retries automatically or exposes raw CLI output.

Student Autocomplete Lab is not affiliated with or endorsed by Codeforces, AtCoder, or `online-judge-tools`. See `THIRD_PARTY_NOTICES.md` in the installed package.

## Model Setup

Open VS Code Settings and search `AI 做题陪练` / `Student Autocomplete`, or expand `账户与模型` in the sidebar.

Recommended routing:

- **Autocomplete**: a fast, low-latency completion or FIM model (for DeepSeek FIM, set the autocomplete base URL to `https://api.deepseek.com/beta` and autocomplete format to `openai-completions`).
- **Teaching, scoring, and optimization**: a stronger chat/reasoning model.
- **OpenAI-compatible providers**: configurable base URL, optional separate autocomplete base URL, model names, and autocomplete format (`openai-completions`, `openai-chat`, `anthropic-messages`).

API keys saved from the sidebar are stored in VS Code SecretStorage. Legacy `secrets/models.env` files remain supported as a local development fallback.

Codex OAuth uses the local Codex CLI ChatGPT session and remains experimental. Self-testing has not encountered an account suspension, but that is not a zero-risk or official guarantee; use an API key if you prefer to avoid that uncertainty.

## Privacy

This beta release package excludes the internal friend-test recorder, CLI trial scripts, and development docs. Local problem data, learning profiles, and runtime traces remain on the user's machine unless explicitly shared.

## Limitations

- Online OJ reads depend on public endpoints or separately installed local adapters (LeetCode and NowCoder); Markdown import remains the offline fallback.
- Codeforces exposes public metadata only; complete statements require Competitive Companion or Markdown import.
- AI judgment is not an official OJ verdict; AtCoder submission stops at `submitted` with an official link rather than scraping a verdict.
- English UI is beta-level; Chinese remains the most complete interface language.

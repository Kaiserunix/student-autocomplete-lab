# Student Autocomplete Lab Beta Release

Student Autocomplete Lab is a VS Code algorithm-learning coach. It helps students practice contest-style problems with safe local autocomplete, explicit AI coaching, learning-score review, and an inspectable learning profile.

It is not an automatic problem solver or an automatic submitter. AI submission checks remain estimates. Optional Codeforces and AtCoder submission uses a separately installed OJ client and always requires a fresh user confirmation.

## What Is Included

- `AI 教练`: hints, lesson reports after giving up, AI-estimated submission checks, learning scores, optimization review, archiving, and next-problem recommendations.
- `题目`: search five OJ providers, import supported problem statements or Markdown files, and create starter files.
- `学习画像`: inspectable and correctable local teaching memory.
- `安全补全`: after the student pauses while typing, inline completion runs automatically and reads student-code context only, not the full problem statement or hidden reference material.
- English beta support: main sidebar labels, explicit English AI-output mode, and English Markdown problem import.
- Provider settings for OpenAI, OpenAI-compatible services, Anthropic Messages, and experimental Codex OAuth.
- Experimental Codeforces and AtCoder submission through a user-installed `online-judge-tools/oj`, with a fresh explicit confirmation for every submission and no automatic resubmission.

## Experimental Codeforces And AtCoder Submission

Install [`online-judge-tools/oj`](https://github.com/online-judge-tools/oj) separately; it is not bundled in this VSIX. In the AI coach, choose Codeforces or AtCoder, use the visible login terminal, preview the saved active file, and explicitly confirm one submission. The extension does not automatically retry or expose raw CLI output.

Student Autocomplete Lab is not affiliated with or endorsed by Codeforces, AtCoder, or online-judge-tools. See `THIRD_PARTY_NOTICES.md` in the installed package.

## Model Setup

Open VS Code Settings and search `Student Autocomplete`, or use the sidebar `AI 配置` panel.

Recommended routing:

- autocomplete: a fast low-cost model such as `dsv4f`;
- analysis, scoring, and optimization: a stronger model such as `dsv4pro`;
- OpenAI-compatible providers are supported through configurable base URL, model names, and autocomplete format.

API keys saved from the sidebar are stored in VS Code SecretStorage. Legacy `secrets/models.env` files are still accepted as a local fallback.

Codex OAuth uses the local Codex CLI ChatGPT session and remains experimental. The author has not encountered an account suspension during self-testing, but that personal result is not a zero-risk or official guarantee. Use an API key if you prefer not to accept that uncertainty.

## Privacy

This beta release package does not include the internal friend-test recorder. Local problem data, learning profiles, and runtime traces stay on the user's machine unless the user chooses to share them.

## Limitations

- OJ reads depend on public endpoints or separately installed local adapters; Markdown remains the fallback.
- Codeforces exposes public metadata but needs Competitive Companion or Markdown for complete statements.
- AI judgment is not an official OJ verdict; submission results remain separate from AI scoring.
- English UI is beta-level; Chinese remains the most complete interface language.

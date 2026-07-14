# Student Autocomplete Lab Beta Release

Student Autocomplete Lab is a VS Code algorithm-learning coach. It helps students practice contest-style problems with safe local autocomplete, explicit AI coaching, learning-score review, and an inspectable learning profile.

It is not an automatic problem solver or an automatic submitter. AI submission checks remain estimates. The optional Codeforces experiment is a user-confirmed bridge to a separately installed OJ client and reports official verdicts separately.

## What Is Included

- `AI 教练`: hints, lesson reports after giving up, AI-estimated submission checks, learning scores, optimization review, archiving, and next-problem recommendations.
- `题目`: import Markdown problem files, search/import Luogu problems, and create starter files.
- `学习画像`: inspectable and correctable local teaching memory.
- `安全补全`: inline completion reads student-code context only, not the full problem statement or hidden reference material.
- English beta support: main sidebar labels, explicit English AI-output mode, and English Markdown problem import.
- Provider settings for OpenAI, OpenAI-compatible services, and Anthropic Messages.
- Experimental Codeforces submission through a user-installed `online-judge-tools/oj`, with a fresh explicit confirmation for every submission and no automatic resubmission.

## Experimental Codeforces Submission

Install [`online-judge-tools/oj`](https://github.com/online-judge-tools/oj) separately; it is not bundled in this VSIX. In the AI coach, open `OJ 提交（Codeforces 实验）`, use the visible login terminal, paste a Codeforces problem URL, preview the saved active file, and explicitly confirm one submission. Human verification stays human-operated. The extension does not scrape browser cookies, bypass CAPTCHA, or expose raw CLI output. Other OJ platforms are not supported by this experimental slice.

Student Autocomplete Lab is not affiliated with or endorsed by Codeforces or online-judge-tools. See `THIRD_PARTY_NOTICES.md` in the installed package.

## Model Setup

Open VS Code Settings and search `Student Autocomplete`, or use the sidebar `AI 配置` panel.

Recommended routing:

- autocomplete: a fast low-cost model such as `dsv4f`;
- analysis, scoring, and optimization: a stronger model such as `dsv4pro`;
- OpenAI-compatible providers are supported through configurable base URL, model names, and autocomplete format.

API keys saved from the sidebar are stored in VS Code SecretStorage. Legacy `secrets/models.env` files are still accepted as a local fallback.

## Privacy

This beta release package does not include the internal friend-test recorder. Local problem data, learning profiles, and runtime traces stay on the user's machine unless the user chooses to share them.

## Limitations

- Luogu import/search is best-effort and depends on public web endpoints.
- LeetCode support uses manual Markdown-file import unless a stable adapter is added.
- AI judgment is not an official OJ verdict; only the separate Codeforces result panel may show a normalized public judge result.
- English UI is beta-level; Chinese remains the most complete interface language.

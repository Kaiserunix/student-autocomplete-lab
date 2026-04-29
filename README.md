# Student Autocomplete Lab

This folder is a small Codex-ready brief for building a student-friendly code completion tool.

The goal is not to build another full agent IDE. The goal is a narrow autocomplete layer that helps with typing and local style recall while preserving the student's own thinking.

## Core Direction

- Build code completion only, not a full vibe-coding agent.
- Prefer Xiaomi MiMo Token Plan first.
- Use DeepSeek V4 Flash only as fallback.
- Keep completions small: usually 1 to 3 lines.
- Avoid generating full problem solutions by default.
- Learn user habits transparently and store them as editable local skills.

## Folder Contents

- `docs/requirements.md`: product requirements and guardrails.
- `docs/codex-start-prompt.md`: prompt to give Codex for the first build attempt.
- `secrets/models.env`: local API credentials and model routing. This is ignored by git.

## Current Build Target

The first implementation is now a VS Code extension prototype.

It starts with:

1. A VS Code sidebar for a local problem bank.
2. Luogu starter problem metadata from the supplied problem list.
3. Public Luogu problem import through `GET /problem/:pid` with `x-lentille-request: content-only`.
4. Public Luogu problem-set import through `GET /training/:id` with `x-luogu-type: content-only`.
5. Manual paste fallback for problem statements.
6. A local JSONL store for imported/manual problems and imported problem sets.
7. Safe autocomplete prompt/filter modules that do not include problem statements.

LeetCode support is planned as an adapter. Until a stable GraphQL path is wired, LeetCode problems should be pasted manually.

## Development

Install dependencies:

```powershell
npm install
```

Run tests:

```powershell
npm test
```

Compile the extension:

```powershell
npm run compile
```

To try the extension in VS Code, open this folder, press `F5`, and choose the extension host launch option. The activity bar will show `Student Autocomplete`, with a `Problem Bank` sidebar.

## Source Policy

Luogu problem import is best-effort from the public problem JSON endpoint. Luogu problem-set import is best-effort from the public training JSON endpoint.

Problem-set import stores the set title, description, and problem metadata. It does not automatically fetch the full statement for every problem in the set; individual full statements can be imported through the problem endpoint when needed.

The extension should not do login bypass, CAPTCHA bypass, or rate-limit evasion. It should cache local records and prefer user-initiated imports.

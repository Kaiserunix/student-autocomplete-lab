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
5. Luogu keyword search for problems and problem sets.
6. Manual paste fallback for problem statements.
7. A local JSONL store for imported/manual problems and imported problem sets.
8. Safe autocomplete prompt/filter modules that do not include problem statements.

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

Run a live MiMo autocomplete trial:

```powershell
npm run trial:mimo
```

Compare a specific MiMo model:

```powershell
npm run trial:mimo -- --model mimo-v2.5
npm run trial:mimo -- --model mimo-v2-omni
```

The trial reads `secrets/models.env`, calls the MiMo OpenAI-compatible `/v1/completions` endpoint, and prints only the provider, model, and filtered completion. It does not print API keys.

To try the extension in VS Code, open this folder, press `F5`, and choose the extension host launch option. The activity bar will show `Student Autocomplete`, with a `Problem Bank` sidebar.

## Source Policy

Luogu problem import is best-effort from the public problem JSON endpoint. Luogu problem and problem-set search use the public list endpoints. Luogu problem-set import is best-effort from the public training JSON endpoint.

Problem-set import stores the set title, description, and problem metadata. It does not automatically fetch the full statement for every problem in the set; individual full statements can be imported through the problem endpoint when needed.

Search matters for the learning loop: future recommendation code can query nearby problems by keyword, concept, or pain-point label instead of relying only on the fixed seed list.

## MiMo Trial Notes

The first live trial showed that `mimo-v2.5-pro` responds well to prefix-only autocomplete prompts. XML/FIM-style prompts with both prefix and suffix returned an empty completion in testing, even though the request succeeded. The current MiMo path therefore uses a prefix-completion prompt and relies on the post-filter to stop after the first local continuation.

Model notes from local trials:

- `mimo-v2.5-pro`: best current MiMo default for stable code autocomplete and future teaching hints.
- `mimo-v2.5`: current default for inline autocomplete. It works on the simple add-function case and gives the MiMo team useful high-frequency autocomplete traffic, while Pro stays available for richer teaching work.
- `mimo-v2-omni`: can complete the simplest sample, but returned a cursor placeholder on a slightly more OJ-like loop sample. Keep it for multimodal/problem-understanding experiments, not default inline completion.
- TTS models are voice models and should not be used for code autocomplete.

The extension should not do login bypass, CAPTCHA bypass, or rate-limit evasion. It should cache local records and prefer user-initiated imports.

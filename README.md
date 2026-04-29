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

## Suggested First Build

Start with a local prototype instead of a VS Code extension:

1. A tiny local HTTP service.
2. A CLI endpoint that accepts `prefix`, `suffix`, `language`, and `file_path`.
3. A habit store backed by SQLite or JSON files.
4. A MiMo `/v1/completions` request using FIM-style prompting.
5. A strict post-filter that returns at most 1 to 3 lines.

Only after the behavior feels good should this become a VS Code inline completion extension.

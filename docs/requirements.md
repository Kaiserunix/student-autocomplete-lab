# Requirements: Student Autocomplete

## Problem

Current AI coding tools often push users toward vibe coding: full-function generation, agentic edits, and large unexplained patches. That is risky for a student because it can replace the learning process instead of supporting it.

The desired tool should act like a careful autocomplete system. It should help the user type faster, remember local style, and reuse known patterns, while still requiring the user to understand and drive the solution.

## Product Positioning

Student Autocomplete is a local-first code completion layer.

It should:

- Complete the current line or the next few obvious lines.
- Learn the user's coding habits from accepted and rejected completions.
- Convert repeated habits into editable local skill files.
- Use project context only to improve local completion, not to write whole features.
- Make it easy to inspect what habits the system has learned.

It should not:

- Generate complete algorithm solutions unless explicitly requested.
- Modify files by itself.
- Run as an autonomous agent.
- Hide learned rules in a black box.
- Encourage blind acceptance of large blocks.

## Model Routing

Priority order:

1. Xiaomi MiMo Token Plan through the OpenAI-compatible base URL.
2. DeepSeek V4 Flash as fallback.

Known MiMo settings:

- Base URL: `MIMO_OPENAI_BASE_URL`
- Preferred autocomplete model: `MIMO_AUTOCOMPLETE_MODEL`
- Use `/v1/completions` for autocomplete-style requests.
- `mimo-v2.5-pro` worked better than `mimo-v2.5` in manual FIM-style testing.

Do not hardcode secrets in source files. Load them from `secrets/models.env`.

## Completion Behavior

Default behavior:

- Return at most 1 to 3 lines.
- Prefer syntactically valid local continuation.
- Use surrounding prefix and suffix.
- Preserve the user's formatting, naming, and language style.
- If uncertain, return nothing rather than a noisy suggestion.

Student mode guardrails:

- If the prompt looks like a full competitive-programming problem, do not generate the whole solution.
- If the missing region is an entire function body, prefer a skeleton or one next step.
- If the user has only written comments and no implementation direction, provide no completion or a minimal next line.
- Avoid explaining in autocomplete output.

## Habit Learning

Track these signals locally:

- Accepted completions.
- Rejected completions.
- Accepted completions edited immediately afterward.
- File type and language.
- Repeated local patterns, such as input templates, naming style, helper functions, and comment style.

Convert stable habits into local skill files, for example:

```md
skill: python-oj-style
scope: Python algorithm files
rules:
- prefer `import sys` and `input = sys.stdin.readline`
- use a `main()` function for complete scripts
- keep completion short unless the user has already written the loop structure
- do not generate full problem solutions from comments alone
```

Skill files must be:

- Human-readable.
- Editable.
- Disableable.
- Small and specific.

## Architecture Sketch

Recommended first prototype:

- `server`: local HTTP service for completion requests.
- `context`: prefix/suffix extraction and lightweight project context.
- `habits`: local habit log and skill extraction.
- `models`: MiMo and DeepSeek adapters.
- `filters`: post-processing, max-line enforcement, and student-mode refusal.
- `eval`: simple acceptance/edit-distance metrics.

## Success Metrics

The tool is good if:

- It saves keystrokes without solving the whole assignment.
- Suggestions feel like the user's own style.
- Accepted completions require little editing.
- The user can explain what the code does.
- Learned habits can be inspected and corrected.

The tool is bad if:

- It writes full answers too often.
- It produces long blocks by default.
- It makes the user copy without thinking.
- It hides why a suggestion was made.
- It depends on one fragile provider.

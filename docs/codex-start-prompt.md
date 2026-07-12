# Codex Start Prompt

You are working in the repository root for `student-autocomplete-lab`.

Build a minimal prototype of a student-friendly code autocomplete system.

## Goal

Create a local-first autocomplete prototype, not a full coding agent. The system should help a student type faster while preserving their own thinking. It should return short, local code continuations and avoid generating complete solutions.

## Provider Priority

Load credentials from:

`secrets/models.env`

Use providers in this order:

1. Xiaomi MiMo Token Plan via `MIMO_OPENAI_BASE_URL`
2. DeepSeek V4 Flash via `DEEPSEEK_BASE_URL`

For MiMo autocomplete, prefer `MIMO_AUTOCOMPLETE_MODEL`, currently `mimo-v2.5-pro`.

## First Implementation Target

Build a local prototype with:

- A small command-line script or local HTTP service.
- Input fields: `prefix`, `suffix`, `language`, `file_path`.
- A model adapter for OpenAI-compatible `/v1/completions`.
- A FIM-style prompt builder.
- A post-filter limiting output to 1 to 3 lines.
- Student-mode guardrails that avoid full-solution generation.
- A local habit log that records accepted/rejected examples in JSONL.

Do not build a VS Code extension first. Prove the completion behavior from the command line.

## Important Constraints

- Do not hardcode keys in source files.
- Do not commit `secrets/models.env`.
- Do not create a full autonomous coding agent.
- Do not generate large patches unless explicitly asked.
- Keep the first version small and testable.
- Add a short README section explaining how to run one completion request.

## Suggested Test Case

Use a small Python prefix/suffix pair:

```python
import sys
input = sys.stdin.readline

def add(a, b):
    # cursor here
```

The ideal completion is a short local continuation such as:

```python
return a + b
```

If the system returns a full unrelated program, the filter or prompt is wrong.

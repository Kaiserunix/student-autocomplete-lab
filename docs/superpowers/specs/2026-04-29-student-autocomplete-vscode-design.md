# Student Autocomplete VS Code MVP Design

Date: 2026-04-29

## Summary

Student Autocomplete is a VS Code extension for algorithm practice and student coding. It separates small inline code completion from explicit teaching help. A student may paste the full problem statement into the extension sidebar, but normal autocomplete must not use that statement. The statement becomes available only when the student clicks a teaching action such as "Give me a hint" or "Show answer / I give up".

The first version should prove one learning loop: problem note -> isolated local autocomplete -> explicit hint request -> pain point analysis -> wrong-problem record -> simple recommendation.

## Product Goals

- Save typing time without replacing the student's reasoning.
- Let students paste and view a problem statement inside VS Code.
- Prevent problem text from leaking into automatic inline completion.
- Provide explicit, progressive hints based on the current code and problem statement.
- Use hidden reference solutions and grading criteria to identify the student's current pain point.
- Record pain points, hint count, answer reveals, and completion acceptance locally.
- Recommend follow-up problems from a local problem library by pain point and concept.
- Convert repeated user signals into editable, user-approved teaching skills.

## Non-Goals For MVP

- Do not build a full autonomous coding agent.
- Do not auto-edit project files.
- Do not generate full solutions through inline autocomplete.
- Do not build a full online judge or submission platform.
- Do not make model-generated problems the primary recommendation source.
- Do not implement advanced knowledge tracing in the first version.
- Do not write a full PEP 8, CERT C, or style-guide encyclopedia into prompts.

## Core User Experience

### Sidebar

The extension contributes one VS Code sidebar view with:

- Problem note area: title, source, tags, full statement, constraints, sample input/output.
- Current problem state: active, solved, wrong-problem bank, answer revealed.
- Hint panel: latest pain point, current hint level, next action.
- Actions:
  - Save problem
  - Give me a hint
  - More specific
  - Show answer / I give up
  - Recommend next problem

The problem note behaves like a visible notebook. It is persistent local data, not an automatic autocomplete context.

### Inline Autocomplete

The extension registers a VS Code inline completion provider. Each request uses only:

- Current document prefix.
- Current document suffix.
- Language id.
- File path.
- Small local coding-habit skills that are safe for autocomplete.

It must not include:

- Problem statement.
- Hidden reference solution.
- Wrong-problem analysis.
- Recommendation data.

Output is limited to 1 to 3 lines by prompt and by post-filter.

### Teaching Hint

When the student clicks "Give me a hint", the extension may send a larger teaching request that includes:

- Active problem statement.
- Current code.
- Cursor location.
- Language.
- Existing hint count for this problem.
- Relevant teaching skills.
- Prior pain points for this student.

The model internally produces:

- Reference solution.
- Acceptable brute-force solution, if any.
- Target algorithm and expected complexity.
- Key concepts.
- Common mistakes.
- Comparison between student code and target solution.
- One current pain point.

The UI displays only:

- One pain point.
- One next-step hint.
- A short reason why this improves the algorithm or correctness.

Full answers are hidden until the student explicitly clicks "Show answer / I give up".

## Model Routing

Credentials are loaded from `secrets/models.env` and never hardcoded.

Provider order:

1. Xiaomi MiMo Token Plan through `MIMO_OPENAI_BASE_URL`.
2. DeepSeek V4 Flash through `DEEPSEEK_BASE_URL`.

Suggested roles:

- Fast autocomplete model: MiMo autocomplete model from `MIMO_AUTOCOMPLETE_MODEL`.
- Teaching and grading model: stronger configured chat/completion model, with DeepSeek fallback.

All provider calls go through a small adapter with a normalized request and response shape.

## Prompt And Cache Strategy

Prompts are arranged to improve prefix-cache reuse:

1. Stable system boundary rules.
2. Stable language/style skill.
3. Stable user-approved skill.
4. Current task data.

Autocomplete prompt data is intentionally small and stable. Teaching prompt data can be larger but should still keep stable policy and skill sections first. This helps providers with prefix/context caching and keeps behavior auditable.

## Skill System

Skills are local, editable Markdown files plus machine-readable metadata. The MVP includes built-in starter skills and can generate user-approved drafts.

### Built-In Skills

`student-autocomplete-boundary`

- Autocomplete must not read problem statements.
- Autocomplete must not reveal full solutions.
- Autocomplete output is limited to 1 to 3 lines.

`python-oj-style`

- Prefer clear, direct Python.
- Use 4 spaces and `snake_case`.
- Preserve student style unless confusing or wrong.
- For online-judge files, `import sys` and `input = sys.stdin.readline` are acceptable.
- Do not add classes, docstrings, or type annotations unless the student is already using them.

`c-oj-safety-style`

- Prefer simple C with explicit initialization and clear loop bounds.
- Avoid undefined behavior, out-of-bounds access, uninitialized reads, and unsafe integer assumptions.
- Use wider integer types when constraints require them.
- Avoid macro tricks unless already used safely by the student.

`hint-ladder-policy`

- First hint identifies the concept or bug shape.
- Second hint gives a small example or counterexample.
- Third hint can name the exact condition or algorithmic step.
- Full answer requires explicit reveal.

`wrong-problem-bank-policy`

- Revealing the answer marks the problem as a wrong-problem-bank item.
- Store the final pain point, hint count, and answer-reveal event.
- Recommend one nearby follow-up problem before increasing difficulty.

### Skill Self-Improvement

The extension records signals locally:

- Completion accepted.
- Completion rejected.
- Completion edited after acceptance.
- Hint requested.
- More-specific hint requested.
- Answer revealed.
- Problem solved after hint.
- Problem solved by brute force when better complexity was expected.

When repeated signals pass a threshold, the system creates a draft skill. The student must approve the draft before it affects future requests. Each generated skill records evidence and a version number. Skills can be disabled or edited.

## Pain Point Taxonomy

The MVP uses a compact taxonomy:

- `problem_understanding`
- `input_output`
- `loop_boundary`
- `condition_branching`
- `state_design`
- `data_structure_choice`
- `complexity_gap`
- `bruteforce_only`
- `off_by_one`
- `integer_overflow`
- `array_bounds`
- `recursion_base_case`
- `dp_transition`
- `graph_traversal`
- `debugging_method`

The taxonomy can grow, but the first version should keep tags few enough for recommendation to be understandable.

## Local Data

MVP uses JSONL files first, with a path that is easy to inspect and back up. SQLite is out of scope for the first implementation phase and can replace or supplement JSONL in a later phase.

Suggested files:

- `.student-autocomplete/problems.jsonl`
- `.student-autocomplete/events.jsonl`
- `.student-autocomplete/skills/*.md`
- `.student-autocomplete/recommendations.jsonl`

Problem record fields:

- `id`
- `title`
- `source`
- `statement`
- `constraints`
- `samples`
- `tags`
- `status`
- `created_at`
- `updated_at`

Event fields:

- `timestamp`
- `type`
- `problem_id`
- `language`
- `file_path`
- `pain_point`
- `hint_level`
- `summary`
- `metadata`

No API keys or secrets are stored in these files.

## Recommendation MVP

First-version recommendations are rule-based:

- If the student reveals an answer, recommend a same-concept easier or equal-difficulty problem.
- If `bruteforce_only` or `complexity_gap` appears, recommend a problem that forces the intended optimization.
- If the student solves two or more same-concept problems with low hint usage, recommend a slightly harder problem.
- If the same pain point repeats several times, recommend a remedial problem instead of increasing difficulty.

Model-generated problems are allowed only as drafts. A generated problem must include statement, constraints, samples, reference solution, brute-force checker for small cases where possible, concept tags, and difficulty labels before it can enter the local library.

## Error Handling

- If no problem is active, hint actions ask the student to paste or select a problem.
- If a provider fails, try the fallback provider and show a concise error if both fail.
- If the model returns a full solution in hint mode before answer reveal, the post-filter converts it to a shorter hint or discards it.
- If inline autocomplete output exceeds 3 lines, trim or discard it.
- If a skill draft is low confidence, store it as inactive and ask for review.

## Testing Strategy

MVP tests should verify:

- Inline autocomplete request does not contain problem statement text.
- Inline autocomplete trims output to 1 to 3 lines.
- Hint request includes active problem statement and current code.
- Answer reveal marks the problem as wrong-problem-bank.
- Events append valid JSONL records.
- Recommendation rules produce a next problem for repeated pain points.
- Built-in skills are loaded only in the intended mode.

Manual smoke tests:

- Paste a Python online-judge problem into the sidebar.
- Type a partial function and confirm autocomplete gives only local continuation.
- Click "Give me a hint" and confirm output is a pain point plus one next step.
- Click "Show answer / I give up" and confirm the problem is stored as wrong.

## Implementation Phases

### Phase 1: VS Code Shell

- Extension scaffold.
- Sidebar problem notebook.
- Local JSONL data store.
- Commands and action wiring.

### Phase 2: Safe Autocomplete

- Inline completion provider.
- Model adapter.
- FIM-style prompt builder.
- Output filter.
- Autocomplete event logging.

### Phase 3: Teaching Hint Loop

- Active problem selection.
- Teaching prompt builder.
- Hidden reference analysis.
- Pain point display.
- Hint ladder.
- Answer reveal and wrong-problem record.

### Phase 4: Skills And Recommendations

- Built-in skill loading.
- Event aggregation.
- User-approved skill drafts.
- Rule-based recommendations.
- Generated-problem draft validation.

## Acceptance Criteria

- A student can paste a problem into the sidebar and still receive autocomplete that does not use the problem statement.
- Autocomplete is short and local by default.
- Clicking "Give me a hint" produces a single pain point and next step, not a full solution.
- Clicking "Show answer / I give up" reveals the reference answer and records the problem in the wrong-problem bank.
- Local event logs are human-inspectable.
- At least Python and C starter skills are present and mode-scoped.
- The first recommendation mechanism works without requiring a remote problem database.

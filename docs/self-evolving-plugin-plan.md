# Self-Evolving Student Autocomplete Plugin Plan

> **For agentic workers:** This is the living design record for the self-evolving student plugin. Implementation should proceed one slice at a time with tests. Do not replace this with a broad rewrite.

**Goal:** Build a VS Code-style learning plugin that helps students solve algorithm problems faster while still preserving the student's own reasoning and long-term skill growth.

**Architecture:** The plugin separates high-frequency autocomplete from teacher-mode analysis. Small autocomplete models only complete local code context; larger teacher models are used only after explicit student actions such as "give me a hint" or "I give up". The self-evolution loop converts repeated pain points into profile updates, skill candidates, and problem recommendations.

**Tech Stack:** VS Code extension, local JSONL stores, MiMo v2.5 for cheap autocomplete, MiMo v2.5 Pro for teacher diagnosis, Luogu/LeetCode MCP servers for problem discovery, TypeScript tests and live MCP smoke tests.

---

## Product Position

This is not a general coding agent.

The plugin should:

- Help a student type obvious local code faster.
- Keep pasted problem statements visible like a notebook page.
- Avoid solving the pasted problem automatically.
- Trigger deeper model analysis only when the student explicitly asks.
- Track pain points from the student's own attempts.
- Recommend the next problem from diagnosed gaps.
- Let the user inspect and edit learned skills.

The plugin should not:

- Generate a full solution from the problem statement in autocomplete.
- Autonomously edit project files.
- Pretend a wrong submission can be fully diagnosed from verdict text alone.
- Depend on a manually completed oracle for every public problem.
- Hide learned rules inside an opaque model memory.

## Core User Flow

1. Student pastes or imports a problem.
2. The problem appears in the plugin side panel as a readable note.
3. Autocomplete sees only local code context by default, not the full problem statement as a solve prompt.
4. Student writes code normally.
5. Student clicks "Give me a hint".
6. Teacher model reads the problem, the student's code, the student's recent actions, and known pain-point profile.
7. Teacher model internally writes or reasons about a standard solution path.
8. Teacher model returns one focused pain point and one next-step hint.
9. If the student clicks "More specific", the same pain point can escalate to a more concrete hint.
10. If the student clicks "I give up / Show answer", the plugin reveals a solution and stores the problem in the wrong-problem bank.
11. The profile is updated from the hint requests, repeated pain points, verdicts, and abandoned problems.
12. The recommender chooses the next problem from topic/pain-point mappings and MCP search results.

## Model Routing

### Autocomplete Route

Use MiMo v2.5 by default.

Purpose:

- Local continuation.
- 1 to 3 lines.
- Style preservation.
- No problem-solving from pasted statements.

Inputs:

- Code prefix and suffix.
- Language.
- File path.
- Active local skill snippets.
- Minimal problem metadata only when needed, such as topic tag, not full statement.

Reject or trim output when:

- It tries to write a whole solution.
- It introduces a full algorithm before the student has started.
- It uses the problem statement as a direct solve prompt.

### Teacher Route

Use MiMo v2.5 Pro.

Purpose:

- Analyze student code pain points.
- Produce a standard solution path internally.
- Return a single teaching intervention.
- Update profile and skill candidates.
- Recommend next problem.

Inputs:

- Problem statement and samples.
- Student code.
- Optional verdict data: WA, RE, TLE, failed count, compile error text.
- Recent hint count.
- Current student profile.
- Current skill rules.
- Problem-source metadata from MCP.

Outputs:

```json
{
  "standard_solution_outline": "not shown to student by default",
  "pain_points": [
    {
      "label": "traversal_order_confusion",
      "confidence": 0.86,
      "evidence": "The code appends the root after both subtrees."
    }
  ],
  "hint": "In preorder traversal, decide when the root is emitted before recursing.",
  "skill_update": {
    "candidate": "binary-tree-traversal-reconstruction",
    "reason": "Repeated confusion between preorder and postorder output.",
    "rules": [
      "When reconstructing preorder, identify the root emission point before splitting subtrees.",
      "Use tiny traversal examples before editing the full solution."
    ]
  },
  "recommendation": {
    "problem_id": "P1305",
    "reason": "Practice direct preorder traversal before reconstruction."
  }
}
```

## Evidence Model

The plugin should not rely on a giant manually built test oracle.

Use layered evidence instead:

- Problem source: title, tags, difficulty, samples, training-set membership.
- Student events: hint count, reveal-answer action, compile errors, run errors, pasted verdict.
- Code evidence: static structure, suspicious patterns, missing base cases, output order, input handling.
- Lightweight runtime evidence: official samples, user-provided tests, AI-generated micro-tests marked as synthetic.
- Teacher analysis: MiMo Pro diagnosis with confidence and evidence text.
- Human correction: user can mark a diagnosis as helpful or wrong.

Verdict-only signals are weak:

- WA means output semantics or edge cases may be wrong.
- RE means indexing, null/empty structures, recursion depth, parsing, or type errors may be involved.
- TLE means complexity may be wrong, but it can also be an implementation bug.

Therefore, verdicts should raise suspicion, not become the diagnosis by themselves.

## Pain-Point Taxonomy

Initial labels:

- `input_parsing`
- `output_format`
- `output_order`
- `sentinel_input`
- `loop_boundary`
- `array_indexing`
- `recursion_base_case`
- `child_indexing`
- `depth_definition`
- `traversal_order_confusion`
- `root_identification`
- `subtree_boundary`
- `tree_distance`
- `weighted_cost`
- `undirected_tree_edges`
- `time_complexity_mismatch`
- `bruteforce_no_growth`
- `needs_teacher_review`

Each label should have:

- Description.
- Positive examples.
- Negative examples.
- Recommended hint style.
- Recommended next-problem strategy.

## Self-Evolution Loop

Self-evolution means improving local teaching behavior from evidence, not blindly rewriting prompts.

### Profile Update

For each teacher interaction, update:

- Pain-point count.
- Confidence-weighted score.
- Last seen problem.
- Last seen topic.
- Hint depth used.
- Whether the student later solved, abandoned, or repeated the issue.

### Skill Candidate

When a pain point crosses a threshold, create or update a local skill candidate:

```md
skill: binary-tree-traversal-reconstruction
scope: Luogu and LeetCode binary-tree traversal problems
status: candidate
source_pain_points:
- traversal_order_confusion
- subtree_boundary
rules:
- Ask the student to locate the root in each traversal before giving code.
- Prefer a three-node example before discussing the full algorithm.
- Do not reveal the reconstruction formula until the student asks for a more specific hint.
promotion_rules:
- promote after 3 helpful diagnoses across at least 2 problems
- demote after 2 user-marked wrong diagnoses
```

### Promotion

A candidate becomes an active skill only when:

- It has repeated evidence.
- The student accepted or benefited from it.
- It did not cause over-hinting.
- It does not duplicate an existing active skill.

### Demotion

Demote or disable a skill when:

- The student marks it unhelpful.
- It causes repeated wrong diagnosis.
- It recommends same-level problems after mastery.
- It increases hint count without solving rate improvement.

## Recommendation Strategy

Use problem recommendation as a teaching move, not as random刷题.

Priority order:

1. Same pain point, easier and more focused problem.
2. Same topic, different surface form.
3. Adjacent prerequisite topic.
4. Slightly harder problem only after repeated success.
5. Generated custom problem only for micro-drills, not as the main progression.

MCP usage:

- Use Luogu training-set search as the stable topic entry.
- Use problem search as supplement.
- Use `luogu_find_related_problems` for related public problems.
- Use LeetCode MCP for parallel English/LeetCode variants.
- Cache problem metadata and search results.

Avoid:

- Recommending only AI-generated problems.
- Staying forever on self-generated variants.
- Jumping difficulty only because the student requested many hints.

Difficulty ladder:

- If a pain point appears 1 to 2 times: recommend easier focused practice.
- If it appears 3 to 4 times: activate a local teaching skill and recommend a training-set slice.
- If it appears 5+ times: lower problem difficulty and use micro-drills.
- If the student solves 2+ related problems with low hint depth: increase difficulty.

## Generated Problems

Model-generated problems can help, but only in a narrow role.

Good use:

- 3-minute micro-drills.
- Contrast examples.
- Testing one specific concept.
- Producing tiny input/output exercises after a diagnosis.

Bad use:

- Replacing public problem banks.
- Measuring long-term level.
- Generating endless same-shape tasks.
- Training only on the model's own distribution.

Guardrails:

- Generated problem must cite target pain point.
- Generated problem must include a small answer explanation.
- Generated problem must be marked synthetic.
- Synthetic success should not count as strongly as public-problem success.

## Data Storage

Local-first files:

- `.student-autocomplete/problems.jsonl`
- `.student-autocomplete/attempts.jsonl`
- `.student-autocomplete/teaching-events.jsonl`
- `.student-autocomplete/student-profile.json`
- `.student-autocomplete/skills/candidates/*.md`
- `.student-autocomplete/skills/active/*.md`
- `.student-autocomplete/cache/problem-search/*.json`

Do not store:

- API keys.
- Full private code outside user-selected workspace.
- Hidden model memory that the user cannot inspect.

## Plugin Surfaces

VS Code side panel:

- Problem notebook.
- Current problem metadata.
- Paste/import problem.
- Give me a hint.
- More specific hint.
- I give up / show answer.
- Wrong-problem bank.
- Recommended next problem.
- Skill profile viewer.

Editor integration:

- Inline autocomplete.
- No full-problem solve mode in autocomplete.
- Hint decorations only after explicit request.

MCP integration:

- Problem discovery tools.
- Problem fetch tools.
- Related-problem tools.
- Capability reporting.
- Optional future authenticated routes.

## Implementation Slices

### Slice 1: Documentation and Contracts

Files:

- `docs/self-evolving-plugin-plan.md`
- `src/teaching/teachingTaxonomy.ts`
- `src/teaching/teachingReport.ts`
- `test/teachingReport.test.ts`

Acceptance:

- Pain-point labels are stable.
- Teacher output parser rejects missing pain points.
- Documentation names the exact loop and evidence model.

### Slice 2: MCP Problem Context Adapter

Files:

- `src/mcp/problemSearchTools.ts`
- `src/teaching/problemContext.ts`
- `test/problemContext.test.ts`

Acceptance:

- Given a Luogu pid, the adapter returns statement, samples, tags, source URL, and training-set hints when available.
- Given a pain point, the adapter returns related public problems through MCP.
- Cache keys are deterministic.

### Slice 3: Teacher Diagnosis Cycle

Files:

- `src/teaching/teachingPrompt.ts`
- `src/teaching/mimoTeacher.ts`
- `src/teaching/teachingCycle.ts`
- `test/teachingCycle.test.ts`

Acceptance:

- Teacher prompt includes standard-solution-outline instruction.
- Student-facing hint does not reveal the full answer by default.
- Profile updates after each teaching report.

### Slice 4: Skill Candidate Store

Files:

- `src/teaching/skillCandidate.ts`
- `src/teaching/skillCandidateStore.ts`
- `test/skillCandidateStore.test.ts`

Acceptance:

- Candidate skill markdown can be created from repeated pain points.
- Candidate skill can be promoted, demoted, disabled.
- Active skill summary can be injected into autocomplete and teacher prompts.

### Slice 5: Recommendation Loop

Files:

- `src/teaching/recommendationPolicy.ts`
- `src/problemBank/recommendationClient.ts`
- `test/recommendationPolicy.test.ts`

Acceptance:

- Policy prefers public training-set problems over synthetic problems.
- Repeated pain points lower or focus difficulty before increasing it.
- Low-hint success raises difficulty.

### Slice 6: VS Code UI Wiring

Files:

- `src/sidebar/ProblemBankViewProvider.ts`
- `src/extension.ts`
- `test/sidebarMessageContracts.test.ts`

Acceptance:

- Problem note is visible without feeding full statement into autocomplete.
- Hint buttons trigger teacher cycle.
- Show-answer stores wrong problem.
- Recommendation card uses profile and MCP results.

### Slice 7: Evaluation and Live Smoke

Files:

- `scripts/selfEvolutionSmoke.ts`
- `fixtures/evolution/*.json`
- `test/selfEvolutionSmoke.test.ts`

Acceptance:

- Binary-tree traversal fixture triggers traversal pain point.
- Output-order fixture triggers output-order pain point.
- Profile changes are explainable from event logs.
- MCP live smoke can verify problem lookup breadth separately.

## Immediate Next Step

The next engineering step is MCP testing:

1. Register the independent Luogu MCP in the local Codex config or test harness.
2. Verify tools through a real MCP client, not direct function calls only.
3. Compare MCP results with Luogu website content-only responses.
4. Feed MCP problem context into the teacher diagnosis cycle.
5. Run one end-to-end case: problem fetch -> student wrong code -> MiMo Pro diagnosis -> profile update -> next problem recommendation.

## Non-Goals for the Next Pass

- No authenticated Luogu submission route.
- No automatic public-problem scraping beyond explicit lookup/search.
- No large oracle database.
- No autonomous code edits.
- No hidden skill rewrite without user-readable diff.

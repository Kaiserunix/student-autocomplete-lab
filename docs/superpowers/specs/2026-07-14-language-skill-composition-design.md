# Language Skill Composition And Provider Rendering Design

Date: 2026-07-14
Status: Reference (Implemented — `src/skills/`)

## 1. Goal & Non-Goals

Replace ad hoc prompt concatenation with a typed, deterministic 4-layer `SkillPlan` composition pipeline that keeps domain policy separate from provider serialization:

```text
head   = route-wide invariant safety policy
body   = normalized language strategy (python | c | cpp | rust | generic)
tail   = bounded relevant learner habits & confirmed corrections
footer = current action and output contract
```

Logical order controls precedence, not physical byte order. Provider renderers translate the resolved plan into Chat messages, Anthropic messages, Codex app-server text, generic completions, or exact-suffix DeepSeek FIM requests.

Non-goals:
- No per-language model selectors or head/body/tail editing UI.
- No arbitrary filesystem `SKILL.md` loading into student prompts.
- No AST relevance engine or DeepSeek Chat Prefix Completion in this iteration.
- Never allow learner habits to override hard safety rules or leak teaching context into autocomplete.

DeepSeek API references (verified 2026-07-14):
- [FIM Completion](https://api-docs.deepseek.com/guides/fim_completion/) (`prompt` before cursor, optional real `suffix` after cursor)
- [Chat Prefix Completion](https://api-docs.deepseek.com/guides/chat_prefix_completion/) (deferred; does not preserve a real FIM suffix)
- [Context Caching](https://api-docs.deepseek.com/guides/kv_cache/) (stable policy precedes dynamic context)
- [Pricing & Models](https://api-docs.deepseek.com/quick_start/pricing/) (FIM runs on supported non-thinking models)

## 2. Actual Module Layout (`src/skills/`)

| Module | Responsibility |
| --- | --- |
| `src/skills/types.ts` | Core types: `SkillRoute`, `NormalizedSkillLanguage`, `SkillRule`, `SkillPlan`, `SkillOutputContract`, `SkillPlanAudit`, `ProviderCapabilities`, rendered request contracts |
| `src/skills/languageRegistry.ts` | Language alias normalization (`c++` -> `cpp`, etc.) and independent coach/autocomplete strategies for `python`, `c`, `cpp`, `rust`, `generic` |
| `src/skills/habitSelector.ts` | Bounded, relevance-ranked selection of safe learner rule IDs from `StudentSkill` (backward compatible with legacy `codeHabits`) |
| `src/skills/composeSkillPlan.ts` | Deterministic composition, precedence resolution, deduplication, and route context boundaries |
| `src/skills/auditView.ts` | Privacy-safe `PublicSkillPlanAudit` projection (`toPublicSkillPlanAudit`) |
| `src/skills/renderers/skillRenderer.ts` | Top-level renderer dispatch by `ProviderCapabilities` |
| `src/skills/renderers/deepSeekFimRenderer.ts` | DeepSeek FIM prompt preamble + exact unmodified real code suffix |
| `src/skills/renderers/genericCompletionRenderer.ts` | Generic completion prompt serialization |
| `src/skills/renderers/messageAutocompleteRenderer.ts` | Chat / Anthropic / Codex message-based autocomplete rendering |
| `src/skills/renderers/renderRules.ts` | Shared rule-formatting helpers |
| `src/skills/validators/autocompleteOutputPolicy.ts` | Enforceable output checks (line cap, code-only, preamble stripping, language-aware validation) |

## 3. Core Contracts (`src/skills/types.ts`)

```ts
type SkillRoute = "coach" | "autocomplete";
type NormalizedSkillLanguage = "python" | "c" | "cpp" | "rust" | "generic";
type SkillLayer = "head" | "body" | "tail" | "footer";
type SkillRuleStrength = "hard" | "soft";
type SkillRuleSource = "core" | "output" | "action" | "language" | "learner";
type SkillEnforcement = "prompt" | "stop" | "validator" | "prompt-and-validator";
type SkillRendererId = "unrendered" | "deepseek-fim" | "chat-messages" | "codex-text" | "generic-completion";
```

`SkillPlan` contains `{ route, language, rules, output: SkillOutputContract, audit: SkillPlanAudit }`.
`SkillPlanAudit` tracks only safe metadata: `route`, `language`, `renderer`, `includedRuleIds`, `excludedRules` (with normalized reason codes: `conflict`, `disabled`, `wrong-diagnosis`, `not-relevant`, `route-mismatch`, `language-mismatch`, `budget`, `renderer-budget`, `renderer-unsupported`, `duplicate`, `unmapped`), `learnerRuleCount`, `learnerRuleBudget`, `learnerCharacterCount`, `learnerCharacterBudget`, and `enforcementKinds`.

## 4. Precedence & Conflict Resolution

Fixed precedence:

```text
hard safety rules > output contract > current explicit action > language strategy > learner habits
```

Deterministic rules:
1. Reject any learner rule contradicting a hard rule or disabled/wrong-marked skill.
2. Keep the higher-precedence rule on colliding `policyKey` / rule ID.
3. Deduplicate identical rule IDs and sort deterministically within each layer by priority and ID.
4. Record every excluded rule ID and normalized reason in `audit.excludedRules`.
5. Never copy raw learner free text into prompts or audit logs.

## 5. Language Registry & Habit Tail

VS Code `document.languageId` is authoritative (sanitized file extension used only when unknown; unknown languages fall back to `generic`).

- **Python**: indentation, `range` boundaries, mutable defaults/values, recursion depth, input patterns, list indexing.
- **C**: initialization, array bounds, pointers, buffer sizing, integer overflow, I/O contracts, undefined behavior.
- **C++**: STL/container semantics, iterators, comparator validity, copy vs reference, signed/unsigned comparisons.
- **Rust**: ownership/borrowing, `Option`/`Result` handling without reckless `unwrap`, indexing, mutation, recursion limits.
- **Generic**: route-wide rules only; no synthetic comment preamble in FIM.

Learner habit selection caps:
- Match active route and language; exclude pedagogy-only habits from autocomplete.
- Prefer human-confirmed corrections over inferred habits; rank by relevance, confirmation, confidence, recency, and evidence count.
- Strict count and character budgets (at most 3 coach habits, at most 2 autocomplete habits).

## 6. Context Boundary & Provider Rendering

### Coach Requests
Rendered into system/developer policy (`head + language body + safety rules`) and user content (`explicit teaching context + selected learner tail + current action + output footer/schema`), preserving prefix-cache stability and keeping Teacher Pack hidden.

### Autocomplete Requests
`AutocompleteSkillContext` accepts only `{ prefix, suffix, language, fileLabel }`. Problem statements, Teacher Packs, standard answers, lesson reports, coach threads, raw Student Skill text, and credentials are structurally absent from the type and verified absent in provider-bound request tests.

### DeepSeek FIM Invariant (`deepSeekFimRenderer.ts`)
```text
prompt = compact deterministic language-native comment preamble + exact sanitized code prefix
suffix = exact sanitized real code suffix (byte-for-byte unmodified)
```
- Python preamble uses `#`; C/C++/Rust use `//`; `generic` omits the synthetic preamble.
- No instruction, habit, or marker may ever be appended to `suffix`.
- Hard limits (1–3 lines, code-only, no echoed preamble) are enforced via token budgets, stop sequences, and `autocompleteOutputPolicy.ts`. A validator rejection returns no Ghost Text and records `validator-rejected` without issuing an automatic retry call.

## 7. Error & Fallback Matrix

| Condition | Behavior |
| --- | --- |
| Unknown language | Fall back to `generic` |
| No relevant learner habits | Render head, body, and footer with empty tail |
| Conflicting / disabled learner rule | Exclude and record normalized reason in `audit.excludedRules` |
| Oversized learner plan | Drop lowest-ranked soft learner rules first |
| DeepSeek FIM pointing at `/v1` instead of `/beta` | Flag `configurationIssue: "deepseek-fim-beta-required"` in capabilities/health check |
| FIM suffix unavailable | Prefix-only completion; never fabricate a suffix |
| Output validator rejects completion | Return no Ghost Text; report `validator-rejected` (distinct from `model-empty`) |

## 8. Privacy-Safe Audit (`src/skills/auditView.ts`)

`PublicSkillPlanAudit` exposes only action, route, language, renderer, included/excluded rule IDs, learner rule counts/budgets, and enforcement kinds. It never includes code prefix/suffix, file paths, problem content, Teacher Pack text, raw learner notes, API keys, or OAuth URLs/tokens.

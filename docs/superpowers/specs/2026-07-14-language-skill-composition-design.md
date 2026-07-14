# Language Skill Composition And Provider Rendering Design

Date: 2026-07-14

Status: direction approved; awaiting written-spec review

Branch: `codex/beta-0.2-one-shot-refactor`

Worktree: `C:\Users\qwerf\Desktop\student-autocomplete-lab`

## Recovery After Context Compaction

This worktree contains pre-existing uncommitted product changes. Before resuming:

1. Read this specification completely.
2. Run `git status --short --branch` and preserve all unrelated changes.
3. Read the implementation plan under `docs/superpowers/plans/` after it exists.
4. Keep coach and autocomplete composition separate. A shared composition engine
   must not make teaching-only context available to autocomplete.
5. Treat DeepSeek FIM `suffix` as real code after the cursor, never as an
   instruction slot.
6. Do not add per-language model selectors or new configuration UI in the first
   implementation.

## Goal

Replace ad hoc prompt concatenation with a typed, deterministic skill-composition
layer. Every request is assembled from four logical layers:

```text
head   = route-wide invariant policy
body   = language-specific strategy
tail   = relevant learner habits and confirmed corrections
footer = current action and output contract
```

The logical order controls precedence. It does not require every provider to
serialize the fragments in the same physical order. Provider renderers map the
same resolved plan into Chat messages, Codex app-server text, Anthropic messages,
or DeepSeek FIM prompt/suffix fields without weakening the context boundary.

## Product Outcomes

The change should produce:

- more language-aware coaching for Python, C, C++, and Rust;
- language-correct inline completions and trigger/format behaviour;
- learner personalization based on a small number of relevant, evidence-backed
  habits rather than the entire Student Skill record;
- one shared source of hard safety rules;
- provider-specific prompt placement without provider checks inside domain prompt
  builders;
- auditable fragment selection and deterministic tests;
- a clean path to future provider experiments without adding configuration
  fields in this iteration.

## Non-Goals

This design does not:

- select a different model for every language;
- expose head/body/tail editing in the sidebar;
- load arbitrary filesystem `SKILL.md` files into student requests;
- let learner habits override safety or output constraints;
- send problem statements, Teacher Packs, standard answers, lesson reports, or
  coach history to autocomplete;
- add DeepSeek Chat Prefix Completion in the first implementation;
- build a full parser or AST-based relevance engine;
- rewrite the teaching taxonomy or Student Skill model wholesale.

The word `skill` in this design means a typed internal policy fragment, not a
Codex agent skill package.

## Existing Foundations

The repository already carries most required routing inputs:

- VS Code `document.languageId` reaches coach and autocomplete requests.
- Autocomplete context extraction and trigger rules already contain
  language-specific handling.
- `StudentSkill.codeHabits` already separates global and language rules.
- Teaching context contains the active source language.
- Model routing already separates teaching from autocomplete and separates
  HTTP, Anthropic, and Codex app-server transports.
- DeepSeek FIM currently receives a prompt plus a real suffix through the beta
  completions route.

The missing boundary is between domain context and provider serialization.
`prompt.ts`, `teachingPrompt.ts`, and related builders currently return final
strings too early, so provider-specific placement and deterministic conflict
resolution are difficult.

## DeepSeek Source Of Truth

The DeepSeek-specific design is based on the provider's current official API
documentation as of 2026-07-14:

- [FIM Completion](https://api-docs.deepseek.com/guides/fim_completion/): the
  beta completions request separates `prompt` before the insertion point from
  the optional real `suffix` after it.
- [Chat Prefix Completion](https://api-docs.deepseek.com/guides/chat_prefix_completion/):
  the last assistant message may be marked as a prefix, but this is a different
  request shape and does not replace a real FIM suffix.
- [Context Caching](https://api-docs.deepseek.com/guides/kv_cache/): cache hits
  rely on reusable matching input prefixes, so stable policy belongs before
  dynamic learner and code context.
- [Model capabilities](https://api-docs.deepseek.com/quick_start/pricing/): FIM
  is provided through supported non-thinking model operation.

These beta surfaces may change. Provider capability normalization and request-
shape tests must isolate future API changes from domain prompt composition.

## Considered Approaches

### 1. Literal `head + body + tail` string concatenation — rejected

This is easy to implement but assumes every provider has the same instruction
surface. It also encourages copying hard rules into every language body and makes
DeepSeek FIM suffix contamination likely.

### 2. Typed SkillPlan plus provider renderers — selected

Domain code builds a typed intermediate representation, resolves conflicts, and
selects relevant learner habits. Provider renderers then serialize the plan into
the provider's supported request shape. This adds a small abstraction layer but
keeps context policy, provider quirks, and output validation independently
testable.

### 3. Separate complete pipelines per provider and language — rejected

This offers maximum tuning but multiplies routes across provider, language,
teaching action, and autocomplete mode. Safety clauses and behaviour would drift,
and the configuration UI would become difficult to operate.

### Deferred alternative: DeepSeek FIM/chat-prefix hybrid

DeepSeek Chat Prefix Completion could keep instructions in chat messages when
the cursor is effectively at end of file, while FIM remains for real middle-of-
file suffixes. This is deliberately deferred until the FIM renderer has measured
acceptance, latency, and habit-adherence data.

## Architecture

New modules should be small and route-aware:

```text
src/skills/types.ts
src/skills/languageRegistry.ts
src/skills/habitSelector.ts
src/skills/composeSkillPlan.ts
src/skills/renderers/chatSkillRenderer.ts
src/skills/renderers/codexSkillRenderer.ts
src/skills/renderers/deepSeekFimSkillRenderer.ts
src/skills/renderers/genericCompletionSkillRenderer.ts
src/skills/validators/autocompleteOutputPolicy.ts
```

Exact filenames may be adjusted in the implementation plan, but responsibilities
must remain separated:

- language registry owns normalized language strategies;
- habit selector owns relevance, confidence, and budget selection;
- composer owns precedence, deduplication, and context allowlists;
- renderers own physical provider placement;
- validators own enforceable output rules;
- existing request clients remain responsible for HTTP/app-server transport.

Teaching and autocomplete use distinct heads, distinct allowed fragment types,
and distinct context bundles. They may share the composer mechanics and language
registry data, but not a combined prompt object containing both routes' context.

## Typed Intermediate Representation

The initial public shape should resemble:

```ts
type SkillRoute = "coach" | "autocomplete";
type SkillLayer = "head" | "body" | "tail" | "footer";
type RuleStrength = "hard" | "soft";

interface SkillRule {
  id: string;
  layer: SkillLayer;
  strength: RuleStrength;
  route: SkillRoute;
  language?: NormalizedLanguage;
  instruction: string;
  enforcement?: "prompt" | "stop" | "validator" | "prompt-and-validator";
  source: "core" | "language" | "student-skill" | "current-action";
}

interface SkillPlan {
  route: SkillRoute;
  language: NormalizedLanguage;
  rules: SkillRule[];
  outputContract: OutputContract;
  audit: SkillPlanAudit;
}
```

The plan must not contain provider credentials. The autocomplete plan must not
contain teaching context fields, even as optional properties.

## Precedence And Conflict Resolution

Precedence is fixed:

```text
hard safety rules
> output contract
> current explicit action
> language strategy
> learner habits
```

Conflict resolution is deterministic:

1. Reject a learner rule that contradicts a hard rule.
2. Prefer the higher-precedence rule for the same stable rule ID.
3. Deduplicate semantically identical normalized rule IDs.
4. Keep deterministic ordering inside a layer by priority and rule ID.
5. Record excluded rule IDs and normalized reasons in the audit.
6. Never resolve a conflict by copying raw student text into the prompt.

Examples:

- a stored preference for full solutions is excluded from autocomplete and hint
  routes;
- `python-loop-boundary-check` may be included when Python loop syntax appears
  near the cursor;
- a C pointer habit is excluded from a Rust request;
- output-only rules such as maximum lines compile to a validator even when a
  provider ignores the prompt wording.

## Language Registry

Supported normalized languages in the first version:

```text
python
c
cpp
rust
generic
```

Aliases are normalized centrally, for example `c++` to `cpp`. VS Code
`document.languageId` is authoritative; a sanitized file extension may be used
only when the language ID is unknown.

Each language strategy contains two independent sections:

```ts
interface LanguageStrategy {
  id: NormalizedLanguage;
  aliases: string[];
  coach: LanguageCoachStrategy;
  autocomplete: LanguageAutocompleteStrategy;
}
```

Coach strategies provide evidence checks and beginner-friendly explanation
guidance, not final diagnoses. The algorithmic teaching taxonomy remains
authoritative. A language strategy may raise relevant evidence but must not
force every C bug to become a pointer bug or every Python bug to become an
indentation bug.

Autocomplete strategies provide compact syntax/style rules, trigger hints,
language-aware stop sequences, and validator options. They never add problem
data.

Initial strategy emphasis:

- Python: indentation, `range` boundaries, mutable values, recursion depth,
  input patterns, and list/index semantics.
- C: initialization, bounds, pointers, buffer sizing, integer overflow, I/O
  contracts, and undefined behaviour.
- C++: STL/container semantics, iterators, comparator validity, copies versus
  references, and signed/unsigned comparisons.
- Rust: ownership and borrowing evidence, `Option`/`Result`, indexing, mutation,
  and recursion constraints.
- Generic: route-wide rules only, with no invented language assumptions.

## Learner Habit Tail

Learner habits remain logically in the tail, meaning they are the last
personalization layer applied before the current action and output contract.
They are not guaranteed to be the final bytes of a provider request.

New habits should be structured and evidence-backed:

```ts
interface LearnerHabitRule {
  id: string;
  language?: NormalizedLanguage;
  category: "syntax" | "safety" | "style" | "misconception" | "pedagogy";
  confidence: number;
  evidenceCount: number;
  lastConfirmedAt?: string;
}
```

The first implementation remains backward compatible with existing
`codeHabits.globalRules` and `languageRules`. Legacy strings are normalized into
bounded soft candidates; they are never treated as hard policy and are not
allowed to introduce new context fields.

Habit selection rules:

- match the active route and language;
- require current-code relevance when the habit is code-specific;
- prefer human-confirmed corrections over inferred habits;
- rank by relevance, confirmation, confidence, recency, and evidence count;
- include at most three coach habits and at most two autocomplete habits;
- use a strict token/character budget;
- omit low-confidence or conflicting habits;
- do not include pedagogy-only habits in inline autocomplete.

The first relevance matcher uses normalized language plus inexpensive local code
signals. Full AST parsing is deferred.

## Coach Composition

Coach requests are rendered as:

```text
system/developer policy:
  common coach head
  language coaching body
  non-negotiable safety and answer-gating rules

user/task content:
  existing explicit teaching context
  selected learner tail
  current student action or question
  output footer/schema
```

The footer remains physically last because JSON shape, answer length, and the
current action are more important than learner style preferences. The learner
tail is close to the evidence and current request but cannot replace either.

Existing Teacher Pack access remains teaching-only. The language body may guide
how evidence is interpreted, but it must not expose hidden reference material in
the response.

## Autocomplete Composition And Context Boundary

Autocomplete may include only:

- sanitized code prefix and suffix around the cursor;
- normalized language;
- sanitized file label already permitted by the current prompt builder;
- indentation, imports, signatures, and local code signals;
- core autocomplete hard rules;
- language autocomplete body;
- at most two relevant safe-code habits;
- output contract and enforcement metadata.

It may never include:

- full problem statement or title-derived problem content;
- Teacher Pack or standard answer;
- lesson report or archived solution;
- coach thread or previous teaching response;
- raw Student Skill records;
- API keys, OAuth data, or provider credentials.

The autocomplete composer accepts a narrow autocomplete context type. Forbidden
teaching fields are absent from the type, not merely filtered after composition.
Tests must inspect the provider-bound request and prove forbidden markers were
never sent. Output filtering alone is not sufficient.

## Provider Capabilities

Renderers should consume explicit normalized capabilities rather than scatter
model-name and hostname checks through prompt builders:

```ts
interface ProviderCapabilities {
  requestShape: "chat" | "anthropic-messages" | "codex-text" | "fim" | "completion";
  supportsSystemInstruction: boolean;
  supportsFimSuffix: boolean;
  supportsStopSequences: boolean;
  prefixCacheFriendly: boolean;
}
```

The router derives these capabilities from the selected provider format and
known provider preset. Existing URL-based DeepSeek compatibility remains during
migration, but new composition code must not depend directly on
`api.deepseek.com`. This leaves room for an explicitly configured compatible
gateway without teaching the domain layer about its hostname.

## DeepSeek FIM Renderer

DeepSeek FIM is the main provider exception. Its physical request is:

```text
prompt = compact control preamble + exact sanitized code prefix
suffix = exact sanitized real code suffix
```

The real suffix must remain byte-for-byte equivalent to the sanitized suffix
selected by the autocomplete context builder. No habit, instruction, marker, or
fake comment may be appended to it.

Habit compilation by category:

| Habit or rule | FIM enforcement |
| --- | --- |
| maximum 1–3 lines | token budget, stop sequences, validator |
| code only/no explanation | compact preamble plus output filter |
| preserve indentation | language-aware validator/normalizer |
| language syntax preference | compact preamble when relevant |
| confirmed local misconception | at most one compact preamble rule when relevant |
| pedagogy or explanation preference | excluded from autocomplete |

The production preamble is a short deterministic language-native comment block:

- Python uses `#` comment lines.
- C, C++, and Rust use `//` comment lines.
- `generic` does not receive a synthetic learner-habit preamble; it relies on
  token limits, stop sequences, and validators because no safe comment syntax is
  known.

The block contains only stable rule text selected by rule ID, never raw learner
free text. Preamble markers and known control lines must be stripped if echoed.

Hard constraints should be enforced outside the prompt whenever possible. A
failed validator returns no Ghost Text and records a normalized rejection reason;
the first version does not make an automatic second model call.

DeepSeek FIM uses the provider's supported non-thinking completion mode. Chat
Prefix Completion remains deferred because it cannot preserve a real FIM suffix
with the same semantics and would introduce a second autocomplete request shape.

## Prefix-Cache Ordering

For prefix-cache-friendly providers, physical serialization should keep stable
content before dynamic content:

```text
route head
language body
selected learner tail
current code/context
current action/output footer where the request shape permits
```

This preserves the largest practical common prefix. Cache behaviour remains a
best-effort optimization and cannot affect correctness. Audit data may record
provider-reported cache-hit/miss token counts when already returned by the API,
but prompt or code content must not be logged.

## Error Behaviour And Fallbacks

| Condition | Behaviour |
| --- | --- |
| Unknown language | Use `generic`; do not fail the request. |
| No relevant habits | Render head, body, and footer without a tail. |
| Conflicting learner rule | Exclude it and record a normalized audit reason. |
| Oversized skill plan | Drop lowest-ranked soft learner rules first. |
| Missing provider capability | Use the existing generic renderer or fail configuration health check clearly. |
| FIM suffix unavailable | Use prefix-only FIM; do not invent a suffix. |
| FIM validator rejects output | Return no Ghost Text and report a normalized empty/rejected status. |
| Renderer throws | Preserve the existing visible coach error or autocomplete error event. |
| Legacy habit cannot be normalized | Exclude it; keep the stored record unchanged. |

There is no silent model switch, provider switch, or weakening of safety policy.

## Audit And Observability

Every composed request produces a safe audit record:

```ts
interface SkillPlanAudit {
  route: SkillRoute;
  language: NormalizedLanguage;
  renderer: string;
  includedRuleIds: string[];
  excludedRules: Array<{ id: string; reason: string }>;
  habitBudgetUsed: number;
  enforcementKinds: string[];
}
```

Audit records may contain stable IDs, counts, route metadata, provider format,
model ID, latency, and normalized rejection categories. They may not contain raw
student code, prompt text, problem content, Teacher Pack data, learner free text,
keys, tokens, or raw OAuth URLs.

Success metrics should be grouped by language and renderer:

- autocomplete request, empty, validator-rejection, and success rates;
- Ghost Text acceptance rate when observable;
- median and tail latency;
- coach parse/normalization failures;
- selected-habit count and confirmed-correction adherence;
- provider-reported cache-hit/miss tokens when available;
- leakage test result, which must remain zero failures.

## Migration Strategy

Migration is incremental:

1. Introduce types, language normalization, composer, and audit with no provider
   behaviour change.
2. Move autocomplete to the typed plan and generic renderer while preserving
   current prompt output for the generic route.
3. Add the DeepSeek FIM renderer and exact-suffix tests.
4. Move coach prompts to the typed plan while preserving the current JSON schema
   and teaching taxonomy.
5. Connect bounded Student Skill habit selection.
6. Add safe route/renderer metadata to existing health checks and preview UI.
7. Package and test the installed extension.

Existing configuration remains valid. No migration prompt, new required field,
or per-language model selection is introduced.

## Test Strategy

Deterministic unit and integration coverage must include:

- language alias normalization and `generic` fallback;
- deterministic layer ordering and stable rule IDs;
- precedence and conflict rejection;
- habit relevance, ranking, per-route budgets, and legacy-string normalization;
- coach and autocomplete plans using different allowed context types;
- forbidden teaching markers absent from provider-bound autocomplete requests;
- current generic prompt behaviour preserved where intended;
- Chat, Anthropic, Codex, generic completion, and DeepSeek FIM renderer snapshots;
- DeepSeek prompt contains the selected compact controls;
- DeepSeek suffix equals only the real sanitized code suffix;
- language-aware stop/validator behaviour;
- validator rejection returns no Ghost Text without a second request;
- audit records contain IDs and counts but no raw code or problem content;
- existing API-key, OpenAI-compatible, Anthropic, and Codex OAuth routes remain
  available;
- existing teaching JSON parsing and normalization remain compatible.

Required context-boundary verification after implementation:

```powershell
npm test -- --run test/context.test.ts test/autocomplete.test.ts test/autocompleteRequestGate.test.ts
npm test -- --run test/teachingWorkflow.test.ts test/sidebarTeachingContext.test.ts
npm run compile
```

Full `npm test` and beta packaging are required before installed-extension
claims. A live DeepSeek call is optional only when no test credentials are
available; deterministic FIM request-shape tests are mandatory. Any live health
check must use synthetic code and must never include a real problem statement.

## Installed-Extension Acceptance

After packaging and forced installation:

1. Reload the VS Code window so the new Extension Host is active.
2. Verify Python, C, C++, and Rust retain supported autocomplete triggers.
3. Trigger a 1–3 line completion with the existing configured provider.
4. Confirm the status distinguishes model-empty from validator-rejected output.
5. Verify coach hints still use the current problem and code while withholding
   the full answer.
6. Verify autocomplete audit excludes problem, Teacher Pack, answer, and coach
   context.
7. If a DeepSeek FIM route is configured, verify a middle-of-file completion
   preserves the real suffix and returns code only.
8. Confirm OAuth and API-key configurations remain saved after reload.

Computer Use may perform installed-extension checks when available, but it must
not enter credentials, operate authentication dialogs, or expose private source
or secrets in logs.

## Completion Criteria

- Typed SkillPlan composition exists for coach and autocomplete.
- Python, C, C++, Rust, and generic strategies are registered centrally.
- Hard safety and output rules cannot be overridden by learner habits.
- Learner habits are bounded, relevant, auditable, and backward compatible with
  existing Student Skill data.
- Provider renderers own physical instruction placement.
- DeepSeek FIM suffix contains only real sanitized code after the cursor.
- Autocomplete provider-bound requests contain no teaching-only context.
- Existing model configuration and provider routes remain backward compatible.
- Targeted boundary tests, full tests, compile, package, and installed-extension
  verification are reported with exact evidence.

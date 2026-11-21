# Research Notes & Design Provenance

Status: Reference — consolidated synthesis of the May 2026 research passes (agent frameworks, coding assistants, programming education, skill distillation, observability/eval, and VS Code UX).

## 1. Key Architectural Decisions Grounded In Research

| Topic | Decision Adopted | Rejected / Deferred |
| --- | --- | --- |
| Orchestration runtime | Deterministic TypeScript teaching workflow (`src/teaching/workflow/`) with role-specific prompts, typed sessions (`AttemptSession`), and structural output validators | Embedding a generic multi-agent runtime (LangGraph, AutoGen, CrewAI, Mastra) inside the VS Code extension |
| Autocomplete vs coaching | Hard separation of autocomplete model role & context window from coaching/analysis roles; FIM-aware rendering (`src/skills/renderers/`) | Using a single chat/reasoning prompt for both keystroke completion and coaching, or feeding full problem statements into autocomplete |
| Pedagogical guardrails | Structural context gatekeeping, gated answer reveal only on abandon, concise single-step hints (~80–160 words / one concrete move), no competing algorithm lists for novices | Relying solely on system-prompt "do not reveal the answer" instructions |
| Learner model (`Student Skill`) | Local, inspectable, user-correctable, versioned skill memory with explicit disable/rollback and transfer validation before raising difficulty | Opaque text memory blobs, personality/roleplay student clones, or neural Deep Knowledge Tracing (DKT) before real user data exists |
| Problem intake & MCP | MCP strictly as a narrow, read-only tool boundary (`src/oj/`, `src/mcp/`); Markdown import as universal offline fallback; Competitive Companion for structured payloads | Bundling scraped problem banks, bypassing CAPTCHA/anti-bot gates, or trusting unvalidated MCP tool output as instructions |
| Evaluation & UI gates | Multi-tier eval (Vitest unit/contract tests -> 1,000-sample deterministic fixture dry run -> bounded live calibration -> manual acceptance); single compact VS Code sidebar WebviewView | Unbounded live token spend without dry-run gates, or multiplying VS Code webview panels |

## 2. Provenance & Reference Sources

### Agent & Workflow Systems
- **LangGraph** (<https://docs.langchain.com/oss/python/langgraph/overview>), **AutoGen AgentChat** (<https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/index.html>), **CrewAI** (<https://docs.crewai.com/en/introduction>), **OpenAI Agents SDK** (<https://openai.github.io/openai-agents-python/>), **Mastra** (<https://mastra.ai/ai-agent-framework>), **Semantic Kernel** (<https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/>), **LlamaIndex** (<https://developers.llamaindex.ai/python/framework/understanding/agent/>).
- *Borrowed concepts*: durable attempt sessions, explicit role boundaries, structured outputs, human-in-the-loop correction, and traceable transitions — implemented directly in TypeScript without runtime lock-in.

### AI Coding Assistants, Problem Intake & MCP
- **Continue** (<https://docs.continue.dev/customize/model-roles/autocomplete>): separate autocomplete vs chat model roles and FIM-first inline completion discipline.
- **Tabby** (<https://github.com/TabbyML/tabby>): low-latency completion lane and self-hosted compatible provider support.
- **Sourcegraph Cody** (<https://sourcegraph.com/docs/cody>): explicit context disclosure rather than silent whole-workspace indexing.
- **vscode-leetcode** (<https://github.com/LeetCode-OpenSource/vscode-leetcode>) & **Competitive Companion** (<https://github.com/jmerle/competitive-companion>): workspace starter files, normalized problem/sample schemas, and browser-assisted import without scraping.
- **Model Context Protocol** (<https://modelcontextprotocol.io/specification/2025-06-18/server/tools>, <https://github.com/modelcontextprotocol/typescript-sdk>) & MCP security analysis (<https://arxiv.org/abs/2601.17549>): strict tool annotations, untrusted-data handling, no secrets in tool args/outputs.
- **VS Code UX Guidelines** (<https://code.visualstudio.com/api/ux-guidelines/views>, <https://code.visualstudio.com/api/ux-guidelines/webviews>): one Activity Bar container, one compact WebviewView, keyboard accessibility, theme variables.

### Programming Education & Learning Science
- **CodeAid** (CHI 2024, <https://arxiv.org/abs/2401.11314>) & **CodeHelp** (2023, <https://arxiv.org/abs/2308.06921>): guardrailed conceptual help and student control over direct code generation to prevent delegation harm.
- **Next-Step Hint Generation** (ACE 2024, <https://arxiv.org/abs/2312.10055>) & **Howzat?** (2024, <https://arxiv.org/abs/2411.18151>): personalized single-move hints (~80–160 words, accessible reading level); avoid offering multiple alternative algorithms to novices.
- **OpenAI Study Mode** (<https://openai.com/index/chatgpt-study-mode/>) & **Loksa & Ko** (<https://faculty.washington.edu/ajko/papers/Loksa2016Metacognition.pdf>): scaffolded reflection and self-regulation prompts.
- **Testing Effect** (Roediger & Karpicke, <https://journals.sagepub.com/doi/10.1111/j.1745-6916.2006.00012.x>), **Distributed Practice** (Cepeda et al., <https://augmentingcognition.com/assets/Cepeda2006.pdf>), & **Parsons Problems** (<https://en.wikipedia.org/wiki/Parsons_problem>): retrieval/transfer probes and narrow micro-drills outperform passive explanation rereading.
- **ITAP** (<https://eric.ed.gov/?id=EJ1126596>), **OverCode** (<https://www.microsoft.com/en-us/research/publication/overcode-visualizing-variation-in-student-solutions-to-programming-problems-at-scale-2/>), **AlphaCode** (<https://www.science.org/doi/10.1126/science.abq1158>), & **CodeT** (<https://arxiv.org/abs/2207.10397>): reference state (`Teacher Pack`) + misconception clustering + minimal counterexamples (explicitly never equated to official OJ proof).
- **Deep Knowledge Tracing** (NeurIPS 2015, <https://papers.nips.cc/paper/5654-deep-knowledge-tracing>) & **GenAI in Programming Education** (2025, <https://link.springer.com/article/10.1007/s40593-025-00496-4>): interpretable mastery counters first; defer neural KT until thousands of real events exist.

### Skill Distillation & Self-Improvement Patterns
- **`titanwings/colleague-skill`** (<https://github.com/titanwings/colleague-skill>): separating operational habits from interaction style, first-class user corrections, incremental append-only evolution, and version rollback — adapted for learning state rather than persona cloning.
- **`alchaincyf/nuwa-skill`** (<https://github.com/alchaincyf/nuwa-skill>): threefold verification (recurrence, generative power, specificity) and honest uncertainty boundaries.
- **EvoSkill** (<https://github.com/sentient-agi/EvoSkill>), **SkillWeaver** (<https://arxiv.org/abs/2504.07079>), **Reflexion** (<https://arxiv.org/abs/2303.11366>), **Voyager** (<https://voyager.minedojo.org/>), **ExpeL** (<https://arxiv.org/abs/2308.10144>), **Self-Refine** (<https://arxiv.org/abs/2303.17651>): external auditable skill libraries validated against unseen transfer tasks rather than weight mutation.

### Observability, Learning Records & Evaluation
- **xAPI** (<https://github.com/adlnet/xAPI-Spec>) & **Caliper Analytics 1.2** (<https://www.imsglobal.org/spec/caliper/v1p2/>): inspiration for structured local learning-event records without hosting an external LRS.
- **Promptfoo** (<https://www.promptfoo.dev/docs/intro/>), **OpenAI Evals** (<https://github.com/openai/evals>), **DeepEval** (<https://deepeval.com/>), **Inspect AI** (<https://inspect.aisi.org.uk/>), **Braintrust** (<https://www.braintrust.dev/docs/evaluate>), **Langfuse** (<https://langfuse.com/docs>), **Arize Phoenix** (<https://arize.com/docs/phoenix>), **OpenTelemetry GenAI** (<https://opentelemetry.io/docs/specs/semconv/gen-ai/>): scenario replay, mismatch summaries, red-team leakage tests, and local token/latency tracking.

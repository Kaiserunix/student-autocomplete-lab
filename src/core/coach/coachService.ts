import type {
  CoachAction,
  CoachResponsePayload,
  CoachStrictness,
  HintLevel,
  LearnerSnapshotV2,
  LocalRunResult,
  ProblemDocument,
  StuckCategory,
  SupportedLanguage,
  UserOverridesV2
} from "../contracts";
import type { ModelRouter } from "../ai/modelRouter";
import { createDefaultUserOverrides } from "../learner/overridesStore";
import { projectCoachContext } from "../learner/projectLearnerContext";
import {
  normalizeConceptTagOrRaw,
  normalizeConceptTags,
  normalizeMisconceptionIdOrRaw
} from "../learner/taxonomy";
import { buildCoachMessages } from "./coachPrompts";
import { buildDryRunPrompt, type DryRunPromptResult } from "./dryRunBuilder";
import {
  HINT_LEVEL_SPECS,
  HintLadderMachine,
  STUCK_CATEGORY_SPECS,
  type HintLadderState
} from "./hintLadder";
import { analyzeProblemPattern, type PatternMapAnalysis } from "./patternMapper";
import { enforceCoachSpoilerPolicy } from "./spoilerPolicy";

export interface CoachRequest {
  action: CoachAction;
  problem: ProblemDocument;
  language: SupportedLanguage;
  studentCode: string;
  studentMessage?: string;
  previousCoachTurn?: string;
  localRunResult?: LocalRunResult;
  stuckCategory?: StuckCategory;
  strictness?: CoachStrictness;
  uiLanguage?: "zh-CN" | "en-US";
  /**
   * Required to be strictly `true` when action === "giveUp" to unlock full explanation.
   */
  explicitGiveUp?: boolean;
  /**
   * Optional requested hint level — HintLadderMachine still enforces strict no-skip progression.
   */
  requestedHintLevel?: HintLevel;
  learnerSnapshot?: LearnerSnapshotV2;
  userOverrides?: UserOverridesV2;
  /**
   * Optional hidden reference solution used ONLY for output-side spoiler overlap enforcement.
   * Never sent to the LLM prompt in hint modes.
   */
  referenceSolution?: string;
  offlineMode?: boolean;
  now?: string;
}

export interface CoachServiceOptions {
  hintLadder?: HintLadderMachine;
  modelRouter?: ModelRouter;
  defaultStrictness?: CoachStrictness;
  defaultUiLanguage?: "zh-CN" | "en-US";
  fallbackToOfflineOnError?: boolean;
}

interface ParsedModelCoachJson {
  headline?: string;
  guidance?: string;
  guidingQuestion?: string;
  misconceptionIds?: string[];
  conceptTags?: string[];
  dryRunPrompt?: {
    minimalInput?: string;
    question?: string;
  };
}

export class CoachService {
  private readonly hintLadder: HintLadderMachine;
  private readonly modelRouter?: ModelRouter;
  private readonly defaultStrictness: CoachStrictness;
  private readonly defaultUiLanguage: "zh-CN" | "en-US";
  private readonly fallbackToOfflineOnError: boolean;

  constructor(options: CoachServiceOptions = {}) {
    this.hintLadder =
      options.hintLadder ??
      new HintLadderMachine({
        defaultStrictness: options.defaultStrictness ?? "standard"
      });
    this.modelRouter = options.modelRouter;
    this.defaultStrictness = options.defaultStrictness ?? "standard";
    this.defaultUiLanguage = options.defaultUiLanguage ?? "zh-CN";
    this.fallbackToOfflineOnError = options.fallbackToOfflineOnError ?? true;
  }

  public async getHintState(problemKey: string): Promise<HintLadderState> {
    return await this.hintLadder.getState(problemKey);
  }

  public async reopenSession(problemKey: string, now?: string): Promise<HintLadderState> {
    return await this.hintLadder.reopenSession(problemKey, now);
  }

  public async resetProblem(problemKey: string): Promise<void> {
    await this.hintLadder.resetProblemState(problemKey);
  }

  public async respond(
    request: CoachRequest,
    onStreamDelta?: (chunk: string) => void
  ): Promise<CoachResponsePayload> {
    const uiLanguage = request.uiLanguage ?? this.defaultUiLanguage;
    const problemKey = request.problem.problemKey;

    // 1. Deterministic state machine transition (immune to prompt injection)
    let state = await this.hintLadder.getState(problemKey, request.now);
    const strictness = request.strictness ?? state.strictness ?? this.defaultStrictness;

    const patternMap = analyzeProblemPattern(request.problem);
    const dryRun = buildDryRunPrompt({
      runResult: request.localRunResult,
      studentCode: request.studentCode,
      problemTitle: request.problem.title
    });

    const resolvedStuckCategory =
      request.stuckCategory ??
      (request.localRunResult && !request.localRunResult.allPassed ? dryRun.stuckCategory : state.stuckCategory);

    if (request.action === "hint") {
      const advanced = await this.hintLadder.requestNextHint(problemKey, {
        stuckCategory: resolvedStuckCategory,
        strictness,
        requestedLevel: request.requestedHintLevel,
        now: request.now
      });
      state = advanced.state;
    } else if (request.action === "giveUp") {
      const unlockRes = await this.hintLadder.unlockGiveUp(
        problemKey,
        request.explicitGiveUp === true,
        request.now
      );
      state = unlockRes.state;
    } else if (request.strictness || resolvedStuckCategory) {
      state = await this.hintLadder.setPreferences(
        problemKey,
        { strictness, stuckCategory: resolvedStuckCategory },
        request.now
      );
    }

    // 2. Stateless learner context projection (<= 3 visible, muteable items)
    const problemConceptTags = Array.from(
      new Set([
        ...normalizeConceptTags(request.problem.conceptTags ?? []),
        ...normalizeConceptTags(request.problem.rawTags),
        ...patternMap.candidates.slice(0, 2).map((c) => c.conceptTag)
      ])
    );

    const overrides = request.userOverrides ?? createDefaultUserOverrides(request.now);
    const chatRoute = this.modelRouter?.describeRoute("chat");
    const projection = projectCoachContext({
      snapshot: request.learnerSnapshot,
      overrides,
      problemConceptTags,
      language: request.language,
      renderer: chatRoute?.renderer ?? "chat-messages",
      uiLanguage
    });

    // 3. Refuse implicit giveUp without explicit confirmation
    if (request.action === "giveUp" && !state.giveUpUnlocked) {
      const rawRefusal = buildImplicitGiveUpRefusal({
        hintLevel: state.currentLevel,
        strictness,
        stuckCategory: resolvedStuckCategory,
        conceptTags: problemConceptTags,
        uiLanguage,
        audit: projection.audit
      });
      return enforceCoachSpoilerPolicy(rawRefusal, {
        action: "hint",
        hintLevel: state.currentLevel,
        giveUpUnlocked: false,
        studentCode: request.studentCode,
        referenceSolution: request.referenceSolution,
        uiLanguage
      }).sanitizedPayload;
    }

    // 4. Decide online LLM vs offline deterministic local coach
    const canCallOnline =
      !request.offlineMode &&
      this.modelRouter !== undefined &&
      this.modelRouter.isRoleReady("chat");

    let rawPayload: CoachResponsePayload;
    if (canCallOnline && this.modelRouter) {
      try {
        const messages = buildCoachMessages({
          action: request.action,
          hintLevel: state.currentLevel,
          giveUpUnlocked: state.giveUpUnlocked,
          strictness,
          stuckCategory: resolvedStuckCategory,
          uiLanguage,
          language: request.language,
          problem: request.problem,
          studentCode: request.studentCode,
          studentMessage: request.studentMessage,
          previousCoachTurn: request.previousCoachTurn,
          localRunResult: request.localRunResult,
          dryRun,
          patternMap,
          projectedLearnerContextBlock: projection.formattedPromptBlock
        });

        const completion = onStreamDelta
          ? await this.modelRouter.streamChat(
              { messages, temperature: strictness === "strict" ? 0.1 : 0.25, maxTokens: 900 },
              onStreamDelta
            )
          : await this.modelRouter.completeChat({
              messages,
              temperature: strictness === "strict" ? 0.1 : 0.25,
              maxTokens: 900,
              jsonMode: chatRoute?.provider !== "anthropic"
            });

        rawPayload = parseModelResponseToPayload({
          rawText: completion.text,
          action: request.action,
          hintLevel: state.currentLevel,
          strictness,
          stuckCategory: resolvedStuckCategory,
          fallbackConceptTags: problemConceptTags,
          fallbackDryRun: dryRun,
          uiLanguage,
          audit: projection.audit
        });
      } catch (error) {
        if (!this.fallbackToOfflineOnError) {
          throw error;
        }
        rawPayload = buildDeterministicOfflinePayload({
          action: request.action,
          hintLevel: state.currentLevel,
          giveUpUnlocked: state.giveUpUnlocked,
          strictness,
          stuckCategory: resolvedStuckCategory,
          problem: request.problem,
          studentCode: request.studentCode,
          studentMessage: request.studentMessage,
          patternMap,
          dryRun,
          conceptTags: problemConceptTags,
          uiLanguage,
          audit: projection.audit
        });
      }
    } else {
      rawPayload = buildDeterministicOfflinePayload({
        action: request.action,
        hintLevel: state.currentLevel,
        giveUpUnlocked: state.giveUpUnlocked,
        strictness,
        stuckCategory: resolvedStuckCategory,
        problem: request.problem,
        studentCode: request.studentCode,
        studentMessage: request.studentMessage,
        patternMap,
        dryRun,
        conceptTags: problemConceptTags,
        uiLanguage,
        audit: projection.audit
      });
    }

    // 5. Mandatory deterministic output-side spoiler hard gate
    const knownSecrets = this.modelRouter
      ? [this.modelRouter.getRoleConfig("chat").apiKey, this.modelRouter.getRoleConfig("fim").apiKey]
      : [];

    const checked = enforceCoachSpoilerPolicy(rawPayload, {
      action: request.action,
      hintLevel: state.currentLevel,
      giveUpUnlocked: state.giveUpUnlocked,
      studentCode: request.studentCode,
      referenceSolution: request.referenceSolution,
      knownSecrets,
      uiLanguage
    });

    return checked.sanitizedPayload;
  }
}

function buildImplicitGiveUpRefusal(params: {
  hintLevel: HintLevel;
  strictness: CoachStrictness;
  stuckCategory?: StuckCategory;
  conceptTags: string[];
  uiLanguage: "zh-CN" | "en-US";
  audit: CoachResponsePayload["audit"];
}): CoachResponsePayload {
  const isEn = params.uiLanguage === "en-US";
  return {
    action: "giveUp",
    hintLevel: params.hintLevel,
    strictness: params.strictness,
    stuckCategory: params.stuckCategory,
    headline: isEn ? "Full Solution Locked — Explicit Confirmation Required" : "完整讲解尚未解锁 — 需显式确认放弃",
    guidance: isEn
      ? `You are currently at L${params.hintLevel}. Full solutions only unlock after explicit Give-Up confirmation. Try requesting the next Socratic hint level or dry-running a minimal counterexample first.`
      : `当前提示进度为 L${params.hintLevel}，完整讲解仅在显式点击「我放弃了」确认后才会解锁。建议先推进下一级苏格拉底提示或做一次最小反例干跑。`,
    guidingQuestion: isEn
      ? "Which single part is blocking you right now: idea, TLE, partial WA, or implementation?"
      : "你当前最卡的是哪一类：完全没思路、超时 TLE、部分样例 WA，还是实现细节？",
    misconceptionIds: [],
    conceptTags: params.conceptTags,
    spoilerSafe: true,
    violations: [],
    audit: params.audit
  };
}

function parseModelResponseToPayload(params: {
  rawText: string;
  action: CoachAction;
  hintLevel: HintLevel;
  strictness: CoachStrictness;
  stuckCategory?: StuckCategory;
  fallbackConceptTags: string[];
  fallbackDryRun: DryRunPromptResult;
  uiLanguage: "zh-CN" | "en-US";
  audit: CoachResponsePayload["audit"];
}): CoachResponsePayload {
  const parsed = tryParseCoachJson(params.rawText);
  const isEn = params.uiLanguage === "en-US";
  const isCe = params.fallbackDryRun.verdict === "CE";
  const levelSpec = HINT_LEVEL_SPECS[params.hintLevel];
  const defaultHeadline =
    isCe && params.action === "dryRun"
      ? isEn
        ? "Compile Error Diagnosis (CE)"
        : "编译错误诊断（CE）"
      : isEn
        ? levelSpec.titleEn
        : levelSpec.titleZh;

  if (parsed && typeof parsed.guidance === "string" && parsed.guidance.trim().length > 0) {
    const normalizedMisconceptions = Array.from(
      new Set(
        (parsed.misconceptionIds ?? [])
          .map(normalizeMisconceptionIdOrRaw)
          .filter((id) => id.length > 0)
      )
    );
    const normalizedTags = Array.from(
      new Set(
        (parsed.conceptTags && parsed.conceptTags.length > 0
          ? parsed.conceptTags
          : params.fallbackConceptTags
        )
          .map(normalizeConceptTagOrRaw)
          .filter((t) => t.length > 0)
      )
    );

    const dryRunPrompt = isCe
      ? undefined
      : parsed.dryRunPrompt?.minimalInput && parsed.dryRunPrompt?.question
        ? {
            minimalInput: parsed.dryRunPrompt.minimalInput,
            question: parsed.dryRunPrompt.question
          }
        : params.fallbackDryRun.hasFailureEvidence
          ? {
              minimalInput: params.fallbackDryRun.minimalInput,
              question: isEn ? params.fallbackDryRun.questionEn : params.fallbackDryRun.questionZh
            }
          : undefined;

    return {
      action: params.action,
      hintLevel: params.hintLevel,
      strictness: params.strictness,
      stuckCategory: params.stuckCategory,
      headline: parsed.headline?.trim() || defaultHeadline,
      guidance: parsed.guidance.trim(),
      guidingQuestion: parsed.guidingQuestion?.trim() || undefined,
      dryRunPrompt,
      misconceptionIds:
        normalizedMisconceptions.length > 0
          ? normalizedMisconceptions
          : params.fallbackDryRun.suggestedMisconceptionIds,
      conceptTags: normalizedTags,
      spoilerSafe: true,
      violations: [],
      audit: params.audit
    };
  }

  // Graceful plain-text fallback when model ignores JSON schema
  return {
    action: params.action,
    hintLevel: params.hintLevel,
    strictness: params.strictness,
    stuckCategory: params.stuckCategory,
    headline: defaultHeadline,
    guidance: params.rawText.trim(),
    guidingQuestion: undefined,
    dryRunPrompt:
      params.fallbackDryRun.hasFailureEvidence && !isCe
        ? {
            minimalInput: params.fallbackDryRun.minimalInput,
            question: isEn ? params.fallbackDryRun.questionEn : params.fallbackDryRun.questionZh
          }
        : undefined,
    misconceptionIds: params.fallbackDryRun.suggestedMisconceptionIds,
    conceptTags: params.fallbackConceptTags,
    spoilerSafe: true,
    violations: [],
    audit: params.audit
  };
}

function tryParseCoachJson(rawText: string): ParsedModelCoachJson | null {
  const trimmed = rawText.trim();
  const candidates: string[] = [trimmed];
  const fencedJson = trimmed.match(/```(?:json)?\s*\r?\n([\s\S]*?)```/i);
  if (fencedJson?.[1]) {
    candidates.unshift(fencedJson[1].trim());
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as ParsedModelCoachJson;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

function buildDeterministicOfflinePayload(params: {
  action: CoachAction;
  hintLevel: HintLevel;
  giveUpUnlocked: boolean;
  strictness: CoachStrictness;
  stuckCategory?: StuckCategory;
  problem: ProblemDocument;
  studentCode: string;
  studentMessage?: string;
  patternMap: PatternMapAnalysis;
  dryRun: DryRunPromptResult;
  conceptTags: string[];
  uiLanguage: "zh-CN" | "en-US";
  audit: CoachResponsePayload["audit"];
}): CoachResponsePayload {
  const isEn = params.uiLanguage === "en-US";
  const topCandidate = params.patternMap.candidates[0];
  const topPair = params.patternMap.confusablePairs[0];
  const stuckSpec = params.stuckCategory ? STUCK_CATEGORY_SPECS[params.stuckCategory] : undefined;

  if (params.action === "patternMap") {
    const decisionLines = params.patternMap.decisionTree
      .map((s) =>
        isEn
          ? `${s.step}. ${s.questionEn} -> Yes: ${s.ifYesEn} | No: ${s.ifNoEn}`
          : `${s.step}. ${s.questionZh} → 是：${s.ifYesZh} ｜ 否：${s.ifNoZh}`
      )
      .join("\n");
    const pairLine = topPair
      ? isEn
        ? `\nDisambiguation (${topPair.leftNameEn} vs ${topPair.rightNameEn}): ${topPair.keyDifferenceEn} ${topPair.quickCheckEn}`
        : `\n易混淆辨析（${topPair.leftNameZh} vs ${topPair.rightNameZh}）：${topPair.keyDifferenceZh} ${topPair.quickCheckZh}`
      : "";

    return {
      action: "patternMap",
      hintLevel: params.hintLevel,
      strictness: params.strictness,
      stuckCategory: params.stuckCategory,
      headline: isEn
        ? `30s Pattern Mapper · ${params.problem.title}`
        : `30 秒审题模式识别 · ${params.problem.title}`,
      guidance: `${isEn ? params.patternMap.thirtySecondSummaryEn : params.patternMap.thirtySecondSummaryZh}\n${decisionLines}${pairLine}`,
      guidingQuestion: topCandidate
        ? isEn
          ? topCandidate.decisionQuestionEn
          : topCandidate.decisionQuestionZh
        : undefined,
      misconceptionIds: [],
      conceptTags: params.conceptTags,
      spoilerSafe: true,
      violations: [],
      audit: params.audit
    };
  }

  if (params.action === "dryRun") {
    const isCe = params.dryRun.verdict === "CE";
    return {
      action: "dryRun",
      hintLevel: params.hintLevel,
      strictness: params.strictness,
      stuckCategory: params.dryRun.stuckCategory,
      headline: isCe
        ? isEn
          ? "Compile Error Diagnosis (CE)"
          : "编译错误诊断（CE）"
        : isEn
          ? `Minimal Counterexample Dry-Run (${params.dryRun.verdict ?? "TRACE"})`
          : `最小反例干跑推演（${params.dryRun.verdict ?? "手推"}）`,
      guidance: isEn ? params.dryRun.divergenceSummaryEn : params.dryRun.divergenceSummaryZh,
      guidingQuestion: isEn ? params.dryRun.questionEn : params.dryRun.questionZh,
      ...(isCe
        ? {}
        : {
            dryRunPrompt: {
              minimalInput: params.dryRun.minimalInput,
              question: isEn ? params.dryRun.questionEn : params.dryRun.questionZh
            }
          }),
      misconceptionIds: params.dryRun.suggestedMisconceptionIds,
      conceptTags: params.conceptTags,
      spoilerSafe: true,
      violations: [],
      audit: params.audit
    };
  }

  if (params.action === "review") {
    const budget = params.patternMap.scaleBudget.targetComplexity;
    return {
      action: "review",
      hintLevel: params.hintLevel,
      strictness: params.strictness,
      stuckCategory: params.stuckCategory,
      headline: isEn ? `Complexity & Edge-Case Review · ${params.problem.title}` : `复杂度演进与边界复盘 · ${params.problem.title}`,
      guidance: isEn
        ? `Evolution: Brute Force -> Eliminate redundant inner scans -> Target ${budget}. Verify local edge cases: empty/n=1, all identical elements, strictly sorted & reverse-sorted inputs, negative values, and 32-bit overflow bounds.`
        : `优化演进：朴素暴力 → 消除内层重复计算 → 目标 ${budget}。必测本地边界清单：空/单元素、全相同重复值、严格递增与严格递减、负数与 0、以及接近 32 位上限的极值溢出测试。`,
      guidingQuestion: isEn
        ? "Which of those edge cases could break your current loop condition or integer type?"
        : "上述边界样例中，哪一组最容易击穿你当前的循环条件或变量类型范围？",
      misconceptionIds: params.dryRun.suggestedMisconceptionIds,
      conceptTags: params.conceptTags,
      spoilerSafe: true,
      violations: [],
      audit: params.audit
    };
  }

  if (params.action === "giveUp" && params.giveUpUnlocked) {
    const algoName = topCandidate
      ? isEn
        ? `${topCandidate.nameEn} (${topCandidate.expectedComplexity})`
        : `${topCandidate.nameZh}（${topCandidate.expectedComplexity}）`
      : params.patternMap.scaleBudget.targetComplexity;

    return {
      action: "giveUp",
      hintLevel: params.hintLevel,
      strictness: params.strictness,
      stuckCategory: params.stuckCategory,
      headline: isEn ? `Unlocked Explanation · ${params.problem.title}` : `已解锁完整思路讲解 · ${params.problem.title}`,
      guidance: isEn
        ? `Target approach: ${algoName}. ${params.patternMap.scaleBudget.explanationEn} Key implementation checklist: (1) parse inputs cleanly, (2) establish the core invariant before entering the main loop, (3) handle empty/single/duplicate boundaries explicitly, and (4) verify on local samples before submitting.`
        : `核心解法方向：${algoName}。${params.patternMap.scaleBudget.explanationZh} 实现要点：1）核对输入规模与 64 位整数需求；2）在主循环前明确不变量与初始化边界；3）显式覆盖空/单元素/重复元素分支；4）先用本地样例全部跑绿再提交。`,
      guidingQuestion: isEn
        ? "Try closing this explanation in 5 minutes and re-implementing it from memory to lock in retention."
        : "看懂后建议合上讲解，间隔 5 分钟自己独立重敲一遍以真正转化为记忆稳定度。",
      misconceptionIds: params.dryRun.suggestedMisconceptionIds,
      conceptTags: params.conceptTags,
      spoilerSafe: true,
      violations: [],
      audit: params.audit
    };
  }

  // Deterministic L1-L5 Socratic Hint / Follow-up (offline mode)
  const level = params.hintLevel;
  const levelSpec = HINT_LEVEL_SPECS[level];
  const tonePrefix = buildTonePrefix(params.strictness, isEn);
  const stuckContext = stuckSpec
    ? isEn
      ? `Focus (${stuckSpec.labelEn}): ${stuckSpec.coachingFocusEn} `
      : `当前卡点（${stuckSpec.labelZh}）：${stuckSpec.coachingFocusZh}`
    : "";

  let guidance: string;
  let guidingQuestion: string;

  switch (level) {
    case 0:
    case 1:
      guidance = isEn
        ? `${tonePrefix}${stuckContext}${params.patternMap.scaleBudget.explanationEn} Do not jump into coding yet—write down the exact input/output invariant on a 3-element sample.`
        : `${tonePrefix}${stuckContext}${params.patternMap.scaleBudget.explanationZh}先不要急着改整段代码，拿一组 3 元素小样例写下输入与输出必须满足的不变量。`;
      guidingQuestion = isEn
        ? "What constraint in the problem statement immediately rules out a naive brute-force scan?"
        : "题面中的哪一条数据规模或约束条件，直接排除了最朴素的暴力做法？";
      break;
    case 2:
      guidance = isEn
        ? `${tonePrefix}${stuckContext}Look for the structural property hidden in the input: is there monotonicity, overlapping subproblems, a sliding contiguous invariant, or transitive grouping?`
        : `${tonePrefix}${stuckContext}观察题目隐藏的结构性质：它是否具备某种「单调性」、相邻状态的「重叠子问题」、连续区间的「单向收缩性质」，或元素间的「传递等价关系」？`;
      guidingQuestion = topCandidate
        ? isEn
          ? topCandidate.decisionQuestionEn
          : topCandidate.decisionQuestionZh
        : isEn
          ? "What repeated work does brute force perform across adjacent indices?"
          : "如果用暴力做，相邻两步之间究竟重复计算了哪一部分信息？";
      break;
    case 3:
      guidance = isEn
        ? `${tonePrefix}${stuckContext}Define the minimal state you must remember as you scan or recurse so you never recompute earlier decisions, and check whether your complexity fits ${params.patternMap.scaleBudget.targetComplexity}.`
        : `${tonePrefix}${stuckContext}明确每一步只需保留的「最小状态信息」，消除暴力里的重复扫描，使总体复杂度收敛到 ${params.patternMap.scaleBudget.targetComplexity}（先想清楚状态更新顺序，再选具体容器）。`;
      guidingQuestion = isEn
        ? "After step i finishes, what exact invariant guarantees that earlier discarded candidates can never be optimal?"
        : "第 i 步处理完成后，凭什么保证已经被排除的候选状态以后再也不可能成为最优解？";
      break;
    case 4:
      guidance = isEn
        ? `${tonePrefix}${stuckContext}Recommended pattern: ${topCandidate?.nameEn ?? "Structured Linear/Logarithmic Strategy"} (target ${topCandidate?.expectedComplexity ?? params.patternMap.scaleBudget.targetComplexity}). Pay special attention to boundary initialization and duplicate/empty edge cases.`
        : `${tonePrefix}${stuckContext}推荐算法与核心数据结构方向：${topCandidate?.nameZh ?? "线性/对数级优化策略"}（目标复杂度 ${topCandidate?.expectedComplexity ?? params.patternMap.scaleBudget.targetComplexity}）。动笔前重点核对初始化边界、重复元素与空输入分支。`;
      guidingQuestion = isEn
        ? "Before writing code, what is your exact base case and loop termination condition?"
        : "动手实现前，你能先用一句话说清循环/递归的精确终止条件和初始值吗？";
      break;
    case 5:
      guidance = isEn
        ? `${tonePrefix}High-level pseudocode skeleton (non-runnable):\n\`\`\`text\n1. Parse problem input and handle trivial edge cases (n <= 1)\n2. Initialize core state for ${topCandidate?.nameEn ?? "target strategy"}\n3. Loop over elements/states while maintaining the primary invariant\n4. Update candidate answer only when state validity holds\n5. Guard boundary termination (duplicates / final carry / empty check)\n6. Output final answer\n\`\`\``
        : `${tonePrefix}抽象伪代码骨架（非完整可运行代码）：\n\`\`\`text\n1. 读入数据并优先特判极小边界（如空输入或单元素）\n2. 初始化「${topCandidate?.nameZh ?? "核心策略"}」所需的关键状态与边界指针\n3. 按单调或拓扑顺序遍历状态，每步仅做 O(1) 或 O(log n) 维护\n4. 仅在状态不变量成立时更新候选答案\n5. 循环结束后检查残留状态（如末位进位、未弹出元素或无解标记）\n6. 按题目格式输出最终结果\n\`\`\``;
      guidingQuestion = isEn
        ? "Translate steps 2-4 into your language of choice and test immediately on the failing local sample."
        : "请把第 2–4 步翻译成你正在使用的语言实现，并立刻用本地样例跑一次验证。";
      break;
  }

  return {
    action: params.action,
    hintLevel: level,
    strictness: params.strictness,
    stuckCategory: params.stuckCategory,
    headline: isEn ? levelSpec.titleEn : levelSpec.titleZh,
    guidance,
    guidingQuestion,
    dryRunPrompt:
      params.dryRun.hasFailureEvidence && params.dryRun.verdict !== "CE"
        ? {
            minimalInput: params.dryRun.minimalInput,
            question: isEn ? params.dryRun.questionEn : params.dryRun.questionZh
          }
        : undefined,
    misconceptionIds: params.dryRun.suggestedMisconceptionIds,
    conceptTags: params.conceptTags,
    spoilerSafe: true,
    violations: [],
    audit: params.audit
  };
}

function buildTonePrefix(strictness: CoachStrictness, isEn: boolean): string {
  if (strictness === "strict") {
    return isEn ? "[Direct Critique] Skip assumptions—verify your invariant. " : "【直击问题】不要猜，直接核对不变量与复杂度。";
  }
  if (strictness === "gentle") {
    return isEn ? "Take it one small step at a time. " : "稳住节奏，我们一步步拆解。";
  }
  return "";
}

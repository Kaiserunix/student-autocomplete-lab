import type {
  AutocompleteCodeHabit,
  LearnerSnapshotV2,
  ProjectedContextItem,
  ProjectionAudit,
  SupportedLanguage,
  UserOverridesV2
} from "../contracts";
import { isMisconceptionMuted } from "./overridesStore";
import {
  getConceptTagDefinition,
  getMisconceptionDefinition,
  isMisconceptionRelevantToContext,
  normalizeConceptTagOrRaw
} from "./taxonomy";

export const COACH_MAX_PROJECTED_ITEMS = 3;
export const COACH_DEFAULT_CHAR_BUDGET = 360;
export const AUTOCOMPLETE_MAX_HABITS = 2;
export const AUTOCOMPLETE_MAX_CHAR_BUDGET = 160;

export interface ProjectCoachContextInput {
  snapshot?: LearnerSnapshotV2;
  overrides: UserOverridesV2;
  problemConceptTags: readonly string[];
  language: SupportedLanguage;
  renderer?: ProjectionAudit["renderer"];
  uiLanguage?: "zh-CN" | "en-US";
  maxItems?: number;
  maxChars?: number;
  minMisconceptionWeight?: number;
}

export interface CoachContextProjectionResult {
  items: ProjectedContextItem[];
  formattedPromptBlock: string;
  audit: ProjectionAudit;
}

export interface ProjectAutocompleteContextInput {
  /**
   * Anti-spoiler physical boundary: Autocomplete projection ONLY accepts
   * explicit user overrides (never LearnerSnapshotV2 or ProblemDocument).
   */
  overrides: UserOverridesV2;
  language: SupportedLanguage;
  renderer?: ProjectionAudit["renderer"];
  maxHabits?: number;
  maxChars?: number;
}

export interface AutocompleteContextProjectionResult {
  habits: AutocompleteCodeHabit[];
  items: ProjectedContextItem[];
  formattedCommentBlock: string;
  audit: ProjectionAudit;
}

/**
 * Stateless deterministic projection for the Coach route:
 * Projects at most 3 visible, transparent (and muteable where applicable) items:
 *   1. Concept mastery level for the CURRENT problem's tags only
 *   2. 0-2 active, unmuted, context-relevant misconceptions
 *   3. Explicit teaching preferences
 */
export function projectCoachContext(
  input: ProjectCoachContextInput
): CoachContextProjectionResult {
  const maxItems = Math.max(1, Math.min(COACH_MAX_PROJECTED_ITEMS, input.maxItems ?? COACH_MAX_PROJECTED_ITEMS));
  const maxChars = Math.max(80, input.maxChars ?? COACH_DEFAULT_CHAR_BUDGET);
  const minWeight = input.minMisconceptionWeight ?? 1.0;
  const uiLanguage = input.uiLanguage ?? "zh-CN";
  const renderer = input.renderer ?? "chat-messages";

  const projectedItems: ProjectedContextItem[] = [];
  const includedRuleIds: string[] = [];
  const excludedRules: Array<{ id: string; reason: string }> = [];
  let charsUsed = 0;

  const tryPush = (item: ProjectedContextItem): boolean => {
    if (projectedItems.length >= maxItems) {
      excludedRules.push({ id: item.id, reason: "item_limit_reached" });
      return false;
    }
    const lineCost = item.label.length + 2; // "- " prefix
    const nextSize = charsUsed + lineCost + (projectedItems.length > 0 ? 1 : 0);
    if (nextSize > maxChars) {
      excludedRules.push({ id: item.id, reason: "character_budget_exceeded" });
      return false;
    }
    projectedItems.push(item);
    includedRuleIds.push(item.id);
    charsUsed = nextSize;
    return true;
  };

  const normalizedProblemTags = Array.from(
    new Set(input.problemConceptTags.map(normalizeConceptTagOrRaw).filter((t) => t.length > 0))
  );

  // 1. Project current problem's concept mastery level ONLY
  if (input.snapshot && normalizedProblemTags.length > 0) {
    const matchedMasteries = normalizedProblemTags
      .map((tag) => input.snapshot?.conceptMastery[tag])
      .filter((m): m is NonNullable<typeof m> => Boolean(m));

    if (matchedMasteries.length > 0) {
      const summaryParts = matchedMasteries.slice(0, 2).map((m) => {
        const def = getConceptTagDefinition(m.conceptTag);
        const name = uiLanguage === "en-US" ? def?.labelEn ?? m.conceptTag : def?.labelZh ?? m.conceptTag;
        return uiLanguage === "en-US"
          ? `${name}: score ${m.masteryScore}/100, indep AC ${m.independentAcCount}`
          : `${name}：掌握度 ${m.masteryScore}/100，独立 AC ${m.independentAcCount} 次`;
      });
      const primaryTag = matchedMasteries[0]!.conceptTag;
      tryPush({
        id: `concept:${primaryTag}`,
        kind: "concept_level",
        label:
          uiLanguage === "en-US"
            ? `Current concept level: ${summaryParts.join("; ")}`
            : `当前知识点水位：${summaryParts.join("；")}`,
        sourceKey: primaryTag,
        muteable: false
      });
    }
  }

  // Reserve 1 slot for teaching preference if maxItems >= 2
  const preferenceItem: ProjectedContextItem = {
    id: "pref:teaching",
    kind: "preference",
    label: formatTeachingPreferences(input.overrides.teachingPreferences, uiLanguage),
    muteable: false
  };

  // 2. Project active, UNMUTED, context-relevant misconceptions
  const maxMisconceptions = Math.max(0, maxItems - projectedItems.length - 1);
  if (input.snapshot) {
    const allStats = Object.values(input.snapshot.misconceptionStats).sort(
      (a, b) => b.recentWeightedCount - a.recentWeightedCount || a.misconceptionId.localeCompare(b.misconceptionId)
    );

    let addedMisconceptions = 0;
    for (const stat of allStats) {
      const ruleId = `misconception:${stat.misconceptionId}`;
      if (stat.muted || isMisconceptionMuted(input.overrides, stat.misconceptionId)) {
        excludedRules.push({ id: ruleId, reason: "muted_by_user" });
        continue;
      }
      if (stat.recentWeightedCount < minWeight) {
        excludedRules.push({ id: ruleId, reason: "below_weight_threshold" });
        continue;
      }
      const relevant =
        normalizedProblemTags.length === 0 ||
        isMisconceptionRelevantToContext(stat.misconceptionId, normalizedProblemTags, input.language);
      if (!relevant) {
        excludedRules.push({ id: ruleId, reason: "irrelevant_to_problem" });
        continue;
      }
      if (addedMisconceptions >= maxMisconceptions) {
        excludedRules.push({ id: ruleId, reason: "item_limit_reached" });
        continue;
      }

      const def = getMisconceptionDefinition(stat.misconceptionId);
      const labelName = uiLanguage === "en-US" ? def?.labelEn ?? stat.misconceptionId : def?.labelZh ?? stat.misconceptionId;
      const item: ProjectedContextItem = {
        id: ruleId,
        kind: "active_misconception",
        label:
          uiLanguage === "en-US"
            ? `Watch recurring pitfall: ${labelName} (${stat.uniqueProblemKeys.length} problems)`
            : `近期高频盲区：${labelName}（跨 ${stat.uniqueProblemKeys.length} 题）`,
        sourceKey: stat.misconceptionId,
        muteable: true
      };

      if (tryPush(item)) {
        addedMisconceptions += 1;
      }
    }
  }

  // 3. Project explicit teaching preferences
  tryPush(preferenceItem);

  const formattedPromptBlock = projectedItems.map((item) => `- ${item.label}`).join("\n");

  return {
    items: projectedItems,
    formattedPromptBlock,
    audit: {
      route: "coach",
      language: input.language,
      renderer,
      includedRuleIds,
      excludedRules,
      projectedItems,
      characterBudgetUsed: formattedPromptBlock.length,
      characterBudgetMax: maxChars
    }
  };
}

/**
 * Stateless deterministic projection for the Autocomplete route:
 * Strictly limited to <= 2 enabled code habits matching the active language,
 * capped at <= 160 characters total. Never reads problem statements, mastery, or mistakes.
 */
export function projectAutocompleteContext(
  input: ProjectAutocompleteContextInput
): AutocompleteContextProjectionResult {
  const maxHabits = Math.max(0, Math.min(AUTOCOMPLETE_MAX_HABITS, input.maxHabits ?? AUTOCOMPLETE_MAX_HABITS));
  const maxChars = Math.max(0, Math.min(AUTOCOMPLETE_MAX_CHAR_BUDGET, input.maxChars ?? AUTOCOMPLETE_MAX_CHAR_BUDGET));
  const renderer = input.renderer ?? "deepseek-fim";

  const selectedHabits: AutocompleteCodeHabit[] = [];
  const projectedItems: ProjectedContextItem[] = [];
  const includedRuleIds: string[] = [];
  const excludedRules: Array<{ id: string; reason: string }> = [];
  const lines: string[] = [];

  for (const habit of input.overrides.autocompleteCodeHabits) {
    const ruleId = `habit:${habit.id}`;
    if (!habit.enabled) {
      excludedRules.push({ id: ruleId, reason: "disabled_by_user" });
      continue;
    }
    if (habit.language !== input.language && habit.language !== "generic") {
      excludedRules.push({ id: ruleId, reason: "language_mismatch" });
      continue;
    }
    const cleanText = habit.ruleText.replace(/\s+/g, " ").trim();
    if (!cleanText) {
      excludedRules.push({ id: ruleId, reason: "empty_rule" });
      continue;
    }
    if (selectedHabits.length >= maxHabits) {
      excludedRules.push({ id: ruleId, reason: "habit_limit_reached" });
      continue;
    }

    const candidateLines = [...lines, cleanText];
    const candidateBlock = candidateLines.join("\n");
    if (candidateBlock.length > maxChars) {
      excludedRules.push({ id: ruleId, reason: "character_budget_exceeded" });
      continue;
    }

    lines.push(cleanText);
    selectedHabits.push(habit);
    includedRuleIds.push(ruleId);
    projectedItems.push({
      id: ruleId,
      kind: "code_habit",
      label: cleanText,
      sourceKey: habit.id,
      muteable: true
    });
  }

  const formattedCommentBlock = lines.join("\n");

  return {
    habits: selectedHabits,
    items: projectedItems,
    formattedCommentBlock,
    audit: {
      route: "autocomplete",
      language: input.language,
      renderer,
      includedRuleIds,
      excludedRules,
      projectedItems,
      characterBudgetUsed: formattedCommentBlock.length,
      characterBudgetMax: maxChars
    }
  };
}

function formatTeachingPreferences(
  prefs: UserOverridesV2["teachingPreferences"],
  uiLanguage: "zh-CN" | "en-US"
): string {
  if (uiLanguage === "en-US") {
    return `Preferences: style=${prefs.hintStyle}, verbosity=${prefs.verbosity}, goal=${prefs.targetGoal}`;
  }
  const styleZh =
    prefs.hintStyle === "dry_run_first"
      ? "优先反例干跑"
      : prefs.hintStyle === "direct_minimal"
        ? "直击要点极简提示"
        : "苏格拉底提问引导";
  const verbosityZh = prefs.verbosity === "detailed" ? "详细拆解" : "精炼简洁";
  const goalZh =
    prefs.targetGoal === "contest_icpc_oi"
      ? "竞赛训练(OI/ICPC)"
      : prefs.targetGoal === "beginner_cs"
        ? "入门夯实基础"
        : "算法面试训练";
  return `教学偏好：${styleZh} / ${verbosityZh} / ${goalZh}`;
}

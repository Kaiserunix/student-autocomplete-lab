import type {
  LearnerSnapshotV2,
  RecommendationCandidate,
  RecommendationItem,
  UserOverridesV2
} from "../contracts";
import { computeCardRetrievability } from "./deriveProfile";
import { isMisconceptionMuted } from "./overridesStore";
import {
  getConceptTagDefinition,
  getMisconceptionDefinition,
  getRelatedConceptTagsForMisconception,
  normalizeConceptTagOrRaw
} from "./taxonomy";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RecommendNextProblemsInput {
  snapshot: LearnerSnapshotV2;
  overrides: UserOverridesV2;
  candidates: readonly RecommendationCandidate[];
  now?: Date | string;
  limit?: number;
  uiLanguage?: "zh-CN" | "en-US";
  minMisconceptionWeight?: number;
  retrievabilityDueThreshold?: number;
}

/**
 * 0-Token deterministic 3-bucket next-problem recommender:
 * - Bucket 1 (`fsrs_due`): Due / decaying mistake notebook entries for spaced retrieval.
 * - Bucket 2 (`targeted_transfer`): Unmuted active misconceptions -> same-tag, same-tier transfer problem.
 * - Bucket 3 (`zpd_stretch`): Strictly per-tag ZPD stretch (`tier + 1`) ONLY when
 *   `independentAcCount >= 2 && fsrsCard.stability >= 7` for THAT specific tag.
 */
export function recommendNextProblems(input: RecommendNextProblemsInput): RecommendationItem[] {
  const nowDate =
    input.now === undefined
      ? new Date()
      : typeof input.now === "string"
        ? new Date(input.now)
        : input.now;
  const nowMs = nowDate.getTime();
  const limit = input.limit ?? 5;
  const uiLanguage = input.uiLanguage ?? "zh-CN";
  const minMisconceptionWeight = input.minMisconceptionWeight ?? 1.5;
  const retrievabilityThreshold = input.retrievabilityDueThreshold ?? 0.85;

  const bucket1: RecommendationItem[] = [];
  const bucket2: RecommendationItem[] = [];
  const bucket3: RecommendationItem[] = [];

  // Build normalized lookup of solved/attempted problem keys
  const solvedProblemKeys = new Set<string>();
  for (const candidate of input.candidates) {
    if (candidate.solved) {
      solvedProblemKeys.add(candidate.problemKey);
    }
  }
  for (const entry of Object.values(input.snapshot.mistakeNotebook)) {
    if (entry.lastStatus === "independent_ac") {
      solvedProblemKeys.add(entry.problemKey);
    }
  }

  // -------------------------------------------------------------------------
  // Bucket 1: FSRS Due Mistake Review
  // -------------------------------------------------------------------------
  for (const entry of Object.values(input.snapshot.mistakeNotebook)) {
    if (isEntryReviewPaused(entry.conceptTags, input.overrides)) {
      continue;
    }

    const dueMs = Date.parse(entry.fsrsCard.due);
    const retrievability = computeCardRetrievability(entry.fsrsCard, nowDate);
    const isDue = !Number.isNaN(dueMs) && dueMs <= nowMs;
    const isLowRetention = retrievability < retrievabilityThreshold;

    if (!isDue && !isLowRetention) {
      continue;
    }

    const overdueDays = !Number.isNaN(dueMs) ? Math.max(0, (nowMs - dueMs) / MS_PER_DAY) : 0;
    const retentionPct = Math.round(retrievability * 100);
    const elapsedSinceAttempt = Math.max(
      0,
      Math.round((nowMs - Date.parse(entry.lastAttemptAt)) / MS_PER_DAY)
    );
    const score = roundScore(100 + overdueDays * 6 + (1 - retrievability) * 40);
    const targetTag = entry.conceptTags[0];

    const rationale =
      uiLanguage === "en-US"
        ? `Due for FSRS review (${elapsedSinceAttempt}d since last attempt, est. retention ${retentionPct}%, last status: ${entry.lastStatus}). Re-solve independently without hints.`
        : `FSRS 到期复习（距上次尝试 ${elapsedSinceAttempt} 天，预计记忆留存 ${retentionPct}%，上次状态：${formatStatusZh(entry.lastStatus)}），建议闭卷独立重刷检验巩固度。`;

    bucket1.push({
      problemKey: entry.problemKey,
      title: entry.title,
      bucket: "fsrs_due",
      targetTag,
      difficultyTier: entry.difficultyTier,
      score,
      rationale
    });
  }

  bucket1.sort((a, b) => b.score - a.score || a.problemKey.localeCompare(b.problemKey));

  // -------------------------------------------------------------------------
  // Bucket 2: Targeted Transfer (Unmuted High-Frequency Misconceptions, Same Tag + Same Tier)
  // -------------------------------------------------------------------------
  const activeMisconceptions = Object.values(input.snapshot.misconceptionStats)
    .filter(
      (stat) =>
        !stat.muted &&
        !isMisconceptionMuted(input.overrides, stat.misconceptionId) &&
        stat.recentWeightedCount >= minMisconceptionWeight
    )
    .sort((a, b) => b.recentWeightedCount - a.recentWeightedCount);

  const normalizedCandidates = input.candidates.map((cand) => ({
    candidate: cand,
    tags: new Set(cand.conceptTags.map(normalizeConceptTagOrRaw))
  }));

  const seenBucket2Keys = new Set<string>();
  for (const stat of activeMisconceptions) {
    const relatedTags = collectRelatedTagsForMisconception(stat.misconceptionId, input.snapshot);
    const misconceptionDef = getMisconceptionDefinition(stat.misconceptionId);
    const misconceptionLabel =
      uiLanguage === "en-US"
        ? misconceptionDef?.labelEn ?? stat.misconceptionId
        : misconceptionDef?.labelZh ?? stat.misconceptionId;

    for (const tag of relatedTags) {
      if (input.overrides.manualConceptOverrides[tag]?.pauseReview) {
        continue;
      }
      const targetTier = resolveSameTierForTag(tag, input.snapshot);
      const matching = normalizedCandidates.filter(
        ({ candidate, tags }) =>
          !candidate.solved &&
          !solvedProblemKeys.has(candidate.problemKey) &&
          !input.snapshot.mistakeNotebook[candidate.problemKey] &&
          !seenBucket2Keys.has(candidate.problemKey) &&
          tags.has(tag) &&
          candidate.difficultyTier === targetTier
      );

      for (const { candidate } of matching) {
        seenBucket2Keys.add(candidate.problemKey);
        const tagDef = getConceptTagDefinition(tag);
        const tagLabel = uiLanguage === "en-US" ? tagDef?.labelEn ?? tag : tagDef?.labelZh ?? tag;
        const score = roundScore(60 + stat.recentWeightedCount * 10);
        const rationale =
          uiLanguage === "en-US"
            ? `Targeted same-tier (T${targetTier}) transfer on ${tagLabel} to address active misconception "${misconceptionLabel}" (weighted count ${stat.recentWeightedCount.toFixed(2)} across ${stat.uniqueProblemKeys.length} problems).`
            : `针对高频错因「${misconceptionLabel}」（跨 ${stat.uniqueProblemKeys.length} 题衰减权重 ${stat.recentWeightedCount.toFixed(2)}），在「${tagLabel}」同难度（T${targetTier}）做定向迁移巩固。`;

        bucket2.push({
          problemKey: candidate.problemKey,
          title: candidate.title,
          bucket: "targeted_transfer",
          targetTag: tag,
          difficultyTier: candidate.difficultyTier,
          score,
          rationale
        });
      }
    }
  }

  bucket2.sort((a, b) => b.score - a.score || a.problemKey.localeCompare(b.problemKey));

  // -------------------------------------------------------------------------
  // Bucket 3: ZPD Stretch (Strictly Per-Tag Isolated: independentAcCount >= 2 && stability >= 7)
  // -------------------------------------------------------------------------
  const seenBucket3Keys = new Set<string>();
  const qualifyingMasteries = Object.values(input.snapshot.conceptMastery)
    .filter(
      (mastery) =>
        mastery.independentAcCount >= 2 &&
        mastery.fsrsCard.stability >= 7 &&
        !input.overrides.manualConceptOverrides[mastery.conceptTag]?.pauseReview
    )
    .sort((a, b) => b.fsrsCard.stability - a.fsrsCard.stability || a.conceptTag.localeCompare(b.conceptTag));

  for (const mastery of qualifyingMasteries) {
    const baseTier = Math.max(1, mastery.highestIndependentTier);
    if (baseTier >= 5) {
      continue; // Already at max tier 5
    }
    const stretchTier = (baseTier + 1) as 2 | 3 | 4 | 5;
    const tag = mastery.conceptTag;
    const tagDef = getConceptTagDefinition(tag);
    const tagLabel = uiLanguage === "en-US" ? tagDef?.labelEn ?? tag : tagDef?.labelZh ?? tag;

    const matching = normalizedCandidates.filter(
      ({ candidate, tags }) =>
        !candidate.solved &&
        !solvedProblemKeys.has(candidate.problemKey) &&
        !input.snapshot.mistakeNotebook[candidate.problemKey] &&
        !seenBucket3Keys.has(candidate.problemKey) &&
        tags.has(tag) &&
        candidate.difficultyTier === stretchTier
    );

    for (const { candidate } of matching) {
      seenBucket3Keys.add(candidate.problemKey);
      const score = roundScore(30 + Math.min(20, mastery.fsrsCard.stability) + mastery.independentAcCount * 2);
      const rationale =
        uiLanguage === "en-US"
          ? `Single-tag ZPD stretch for ${tagLabel} (T${baseTier} -> T${stretchTier}): ${mastery.independentAcCount} independent ACs and FSRS stability ${mastery.fsrsCard.stability.toFixed(1)}d (>= 7d).`
          : `单标签「${tagLabel}」满足进阶门槛（独立 AC ${mastery.independentAcCount} 次、FSRS 稳定度 ${mastery.fsrsCard.stability.toFixed(1)} 天 ≥ 7 天），开放 T${baseTier} → T${stretchTier} 舒适区上探。`;

      bucket3.push({
        problemKey: candidate.problemKey,
        title: candidate.title,
        bucket: "zpd_stretch",
        targetTag: tag,
        difficultyTier: candidate.difficultyTier,
        score,
        rationale
      });
    }
  }

  bucket3.sort((a, b) => b.score - a.score || a.problemKey.localeCompare(b.problemKey));

  // Merge strictly in priority order: Bucket 1 -> Bucket 2 -> Bucket 3, deduplicating by problemKey
  const merged: RecommendationItem[] = [];
  const emittedKeys = new Set<string>();

  for (const list of [bucket1, bucket2, bucket3]) {
    for (const item of list) {
      if (emittedKeys.has(item.problemKey)) {
        continue;
      }
      emittedKeys.add(item.problemKey);
      merged.push(item);
      if (merged.length >= limit) {
        return merged;
      }
    }
  }

  return merged;
}

function isEntryReviewPaused(conceptTags: readonly string[], overrides: UserOverridesV2): boolean {
  if (conceptTags.length === 0) {
    return false;
  }
  return conceptTags.every((tag) => {
    const normalized = normalizeConceptTagOrRaw(tag);
    return Boolean(overrides.manualConceptOverrides[normalized]?.pauseReview);
  });
}

function collectRelatedTagsForMisconception(
  misconceptionId: string,
  snapshot: LearnerSnapshotV2
): string[] {
  const tags = new Set<string>();
  for (const tag of getRelatedConceptTagsForMisconception(misconceptionId)) {
    tags.add(tag);
  }
  for (const entry of Object.values(snapshot.mistakeNotebook)) {
    if (entry.misconceptionIds.includes(misconceptionId)) {
      for (const tag of entry.conceptTags) {
        tags.add(normalizeConceptTagOrRaw(tag));
      }
    }
  }
  return Array.from(tags);
}

function resolveSameTierForTag(tag: string, snapshot: LearnerSnapshotV2): 1 | 2 | 3 | 4 | 5 {
  const mastery = snapshot.conceptMastery[tag];
  if (mastery && mastery.highestIndependentTier !== 0) {
    return mastery.highestIndependentTier;
  }
  // Fall back to the lowest tier attempted for this tag in mistakeNotebook, or tier 1
  let fallbackTier: 1 | 2 | 3 | 4 | 5 = 1;
  let found = false;
  for (const entry of Object.values(snapshot.mistakeNotebook)) {
    if (entry.conceptTags.map(normalizeConceptTagOrRaw).includes(tag)) {
      if (!found || entry.difficultyTier < fallbackTier) {
        fallbackTier = entry.difficultyTier;
        found = true;
      }
    }
  }
  return fallbackTier;
}

function formatStatusZh(status: string): string {
  switch (status) {
    case "independent_ac":
      return "独立 AC";
    case "assisted_ac":
      return "提示辅助 AC";
    case "abandoned":
      return "曾放弃";
    default:
      return "未完全解决";
  }
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade
} from "ts-fsrs";
import type {
  ConceptMastery,
  FsrsRatingValue,
  LearnerSnapshotV2,
  LearningEventKind,
  LearningEventV2,
  MisconceptionStat,
  MistakeEntry,
  SerializedFsrsCard,
  UserOverridesV2
} from "../contracts";
import { deduplicateLearningEvents } from "./eventStore";
import { isMisconceptionMuted } from "./overridesStore";
import { normalizeConceptTagOrRaw, normalizeMisconceptionIdOrRaw } from "./taxonomy";

export const MISCONCEPTION_HALF_LIFE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const TERMINAL_EVENT_KINDS = new Set<LearningEventKind>([
  "attempt_completed",
  "attempt_abandoned",
  "review_completed"
]);

/**
 * Deterministic FSRS scheduler (no random fuzz, day-scale intervals suited to OJ practice).
 */
const DETERMINISTIC_FSRS = fsrs({
  enable_fuzz: false,
  enable_short_term: false
});

export function isTerminalLearningEvent(event: Pick<LearningEventV2, "kind">): boolean {
  return TERMINAL_EVENT_KINDS.has(event.kind);
}

export function isIndependentAcEvent(event: LearningEventV2): boolean {
  return (
    event.verdict === "AC" &&
    event.verdictSource !== "ai_estimate" &&
    !event.independence.revealedSolution &&
    event.independence.hintsUsed === 0 &&
    event.independence.maxHintLevel === 0
  );
}

export function isAssistedAcEvent(event: LearningEventV2): boolean {
  return (
    event.verdict === "AC" &&
    event.verdictSource !== "ai_estimate" &&
    !isIndependentAcEvent(event)
  );
}

export function inferFsrsRating(event: LearningEventV2): FsrsRatingValue {
  if (
    event.kind === "attempt_abandoned" ||
    event.verdict !== "AC" ||
    event.independence.revealedSolution
  ) {
    return 1; // Rating.Again
  }

  if (event.verdictSource === "ai_estimate") {
    return 2; // Rating.Hard — static estimate cannot inflate stability
  }

  const assisted = event.independence.hintsUsed > 0 || event.independence.maxHintLevel > 0;
  const explicit = event.independence.fsrsRating;

  if (assisted) {
    // Heavy or any hint assistance caps rating at Hard (2)
    return explicit === 1 ? 1 : 2;
  }

  if (explicit === 1 || explicit === 2 || explicit === 3 || explicit === 4) {
    return explicit;
  }

  // Independent AC with no hints
  if (event.independence.elapsedSec > 0 && event.independence.elapsedSec <= 300) {
    return 4; // Rating.Easy
  }
  return 3; // Rating.Good
}

export function serializeFsrsCard(card: Card): SerializedFsrsCard {
  return {
    due: card.due.toISOString(),
    stability: roundMetric(card.stability, 4),
    difficulty: roundMetric(card.difficulty, 4),
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: Number(card.state),
    ...(card.last_review ? { lastReview: card.last_review.toISOString() } : {})
  };
}

export function deserializeFsrsCard(serialized: SerializedFsrsCard): Card {
  return {
    due: new Date(serialized.due),
    stability: serialized.stability,
    difficulty: serialized.difficulty,
    elapsed_days: serialized.elapsedDays,
    scheduled_days: serialized.scheduledDays,
    learning_steps: 0,
    reps: serialized.reps,
    lapses: serialized.lapses,
    state: serialized.state as State,
    last_review: serialized.lastReview ? new Date(serialized.lastReview) : undefined
  };
}

export function computeCardRetrievability(
  card: SerializedFsrsCard,
  now: Date | string = new Date()
): number {
  if (card.reps === 0 || card.stability <= 0) {
    return 0;
  }
  const nowDate = typeof now === "string" ? new Date(now) : now;
  const fsrsCard = deserializeFsrsCard(card);
  const value = DETERMINISTIC_FSRS.get_retrievability(fsrsCard, nowDate, false);
  return roundMetric(Math.max(0, Math.min(1, value)), 4);
}

interface ConceptAccumulator {
  conceptTag: string;
  attemptedCount: number;
  independentAcCount: number;
  assistedAcCount: number;
  highestIndependentTier: 0 | 1 | 2 | 3 | 4 | 5;
  card: Card;
}

interface MistakeAccumulator {
  problemKey: string;
  title: string;
  conceptTags: string[];
  difficultyTier: 1 | 2 | 3 | 4 | 5;
  lastStatus: MistakeEntry["lastStatus"];
  misconceptionIds: string[];
  takeaway: string;
  lastAttemptAt: string;
  card: Card;
}

/**
 * Pure deterministic reducer: derives the complete Open Learner Model snapshot
 * from immutable learning events and orthogonal human overrides.
 *
 * Core invariants:
 * 1. `hint_requested` & `self_check` NEVER advance mastery, FSRS, or misconception weights.
 * 2. Duplicate `eventId`s are deduplicated idempotently.
 * 3. `overrides.voidedEventIds` are filtered out completely prior to derivation.
 * 4. `conceptMastery` and its FSRS cards are strictly isolated per `conceptTag`.
 * 5. `misconceptionStats.recentWeightedCount` aggregates by unique `problemKey` with 14-day half-life decay.
 */
export function deriveLearnerSnapshot(
  events: readonly LearningEventV2[],
  overrides: UserOverridesV2,
  nowInput: Date | string = new Date()
): LearnerSnapshotV2 {
  const nowDate = typeof nowInput === "string" ? new Date(nowInput) : nowInput;
  const nowMs = nowDate.getTime();
  const derivedAt = nowDate.toISOString();

  const voidedIds = new Set(overrides.voidedEventIds);
  const uniqueEvents = deduplicateLearningEvents(events).filter((evt) => !voidedIds.has(evt.eventId));

  // Only terminal events drive mastery, FSRS, mistake notebook, and misconception weights
  const terminalEvents = uniqueEvents.filter(isTerminalLearningEvent);

  const conceptMap = new Map<string, ConceptAccumulator>();
  const mistakeMap = new Map<string, MistakeAccumulator>();
  // misconceptionId -> (problemKey -> latestEventTimestampMs)
  const misconceptionByProblem = new Map<string, Map<string, number>>();

  for (const event of terminalEvents) {
    const eventDate = new Date(event.timestamp);
    const eventMs = eventDate.getTime();
    const rating = toFsrsGrade(inferFsrsRating(event));
    const independentAc = isIndependentAcEvent(event);
    const assistedAc = isAssistedAcEvent(event);

    const normalizedTags = Array.from(
      new Set(
        event.problemRef.conceptTags
          .map(normalizeConceptTagOrRaw)
          .filter((tag) => tag.length > 0)
      )
    );

    const normalizedMisconceptions = Array.from(
      new Set(
        (event.diagnosis?.misconceptionIds ?? [])
          .map(normalizeMisconceptionIdOrRaw)
          .filter((id) => id.length > 0)
      )
    );

    // 1. Update strictly isolated per-conceptTag mastery & FSRS
    for (const tag of normalizedTags) {
      let acc = conceptMap.get(tag);
      if (!acc) {
        acc = {
          conceptTag: tag,
          attemptedCount: 0,
          independentAcCount: 0,
          assistedAcCount: 0,
          highestIndependentTier: 0,
          card: createEmptyCard(eventDate)
        };
        conceptMap.set(tag, acc);
      }
      acc.attemptedCount += 1;
      if (independentAc) {
        acc.independentAcCount += 1;
        if (event.problemRef.difficultyTier > acc.highestIndependentTier) {
          acc.highestIndependentTier = event.problemRef.difficultyTier;
        }
      } else if (assistedAc) {
        acc.assistedAcCount += 1;
      }

      const scheduled = DETERMINISTIC_FSRS.next(acc.card, eventDate, rating);
      acc.card = scheduled.card;
    }

    // 2. Update mistake notebook (tracks struggled problems & review outcomes)
    const problemKey = event.problemRef.problemKey;
    const existingMistake = mistakeMap.get(problemKey);
    const status = classifyAttemptStatus(event, independentAc, assistedAc);
    const shouldTrackInMistakeNotebook =
      existingMistake !== undefined ||
      status !== "independent_ac" ||
      normalizedMisconceptions.length > 0;

    if (shouldTrackInMistakeNotebook) {
      const prevCard: Card = existingMistake ? existingMistake.card : createEmptyCard(eventDate);
      const nextCard = DETERMINISTIC_FSRS.next(prevCard, eventDate, rating).card;
      const mergedMisconceptions =
        normalizedMisconceptions.length > 0
          ? normalizedMisconceptions
          : existingMistake?.misconceptionIds ?? [];

      mistakeMap.set(problemKey, {
        problemKey,
        title: event.problemRef.title ?? existingMistake?.title ?? problemKey,
        conceptTags: normalizedTags.length > 0 ? normalizedTags : existingMistake?.conceptTags ?? [],
        difficultyTier: event.problemRef.difficultyTier,
        lastStatus: status,
        misconceptionIds: mergedMisconceptions,
        takeaway:
          event.diagnosis?.minimalFixHint ??
          event.diagnosis?.summary ??
          existingMistake?.takeaway ??
          "",
        lastAttemptAt: event.timestamp,
        card: nextCard
      });
    }

    // 3. Aggregate misconceptions strictly by unique problemKey (keeping latest timestamp per problem)
    for (const misconceptionId of normalizedMisconceptions) {
      let byProblem = misconceptionByProblem.get(misconceptionId);
      if (!byProblem) {
        byProblem = new Map<string, number>();
        misconceptionByProblem.set(misconceptionId, byProblem);
      }
      const prevMs = byProblem.get(problemKey);
      if (prevMs === undefined || eventMs > prevMs) {
        byProblem.set(problemKey, eventMs);
      }
    }
  }

  // Finalize conceptMastery with manual floorTier overrides & computed masteryScore
  const conceptMastery: Record<string, ConceptMastery> = {};
  for (const [tag, acc] of conceptMap.entries()) {
    const serializedCard = serializeFsrsCard(acc.card);
    const manualFloor = overrides.manualConceptOverrides[tag]?.floorTier;
    const highestTier =
      manualFloor && manualFloor > acc.highestIndependentTier
        ? manualFloor
        : acc.highestIndependentTier;
    const retrievability = computeCardRetrievability(serializedCard, nowDate);
    const masteryScore = computeConceptMasteryScore({
      attemptedCount: acc.attemptedCount,
      independentAcCount: acc.independentAcCount,
      assistedAcCount: acc.assistedAcCount,
      highestIndependentTier: highestTier,
      stability: serializedCard.stability,
      retrievability
    });

    conceptMastery[tag] = {
      conceptTag: tag,
      attemptedCount: acc.attemptedCount,
      independentAcCount: acc.independentAcCount,
      assistedAcCount: acc.assistedAcCount,
      highestIndependentTier: highestTier,
      masteryScore,
      fsrsCard: serializedCard
    };
  }

  // Finalize mistakeNotebook
  const mistakeNotebook: Record<string, MistakeEntry> = {};
  for (const [problemKey, entry] of mistakeMap.entries()) {
    mistakeNotebook[problemKey] = {
      problemKey: entry.problemKey,
      title: entry.title,
      conceptTags: entry.conceptTags,
      difficultyTier: entry.difficultyTier,
      lastStatus: entry.lastStatus,
      misconceptionIds: entry.misconceptionIds,
      takeaway: entry.takeaway,
      lastAttemptAt: entry.lastAttemptAt,
      fsrsCard: serializeFsrsCard(entry.card)
    };
  }

  // Finalize misconceptionStats with 14-day half-life exponential decay across unique problems
  const misconceptionStats: Record<string, MisconceptionStat> = {};
  for (const [misconceptionId, byProblem] of misconceptionByProblem.entries()) {
    let weightedSum = 0;
    let latestMs = 0;
    const uniqueKeys: string[] = [];

    for (const [problemKey, lastMs] of byProblem.entries()) {
      uniqueKeys.push(problemKey);
      if (lastMs > latestMs) {
        latestMs = lastMs;
      }
      const ageDays = Math.max(0, (nowMs - lastMs) / MS_PER_DAY);
      const decayWeight = Math.pow(0.5, ageDays / MISCONCEPTION_HALF_LIFE_DAYS);
      weightedSum += decayWeight;
    }

    uniqueKeys.sort();
    misconceptionStats[misconceptionId] = {
      misconceptionId,
      recentWeightedCount: roundMetric(weightedSum, 4),
      uniqueProblemKeys: uniqueKeys,
      lastSeenAt: new Date(latestMs).toISOString(),
      muted: isMisconceptionMuted(overrides, misconceptionId)
    };
  }

  // Compute recentTrajectory (last 7 days relative to now)
  const sevenDaysAgoMs = nowMs - 7 * MS_PER_DAY;
  const recentTerminal = terminalEvents.filter((evt) => {
    const ts = Date.parse(evt.timestamp);
    return ts >= sevenDaysAgoMs && ts <= nowMs;
  });
  const last7dAttempts = recentTerminal.length;
  const recentIndependentCount = recentTerminal.filter(isIndependentAcEvent).length;
  const avgHintLevel =
    last7dAttempts > 0
      ? roundMetric(
          recentTerminal.reduce((sum, evt) => sum + evt.independence.maxHintLevel, 0) / last7dAttempts,
          2
        )
      : 0;

  return {
    schemaVersion: "2.0",
    derivedAt,
    totalTerminalEvents: terminalEvents.length,
    conceptMastery,
    mistakeNotebook,
    misconceptionStats,
    recentTrajectory: {
      last7dAttempts,
      independentAcRate: last7dAttempts > 0 ? roundMetric(recentIndependentCount / last7dAttempts, 4) : 0,
      avgHintLevel
    }
  };
}

function classifyAttemptStatus(
  event: LearningEventV2,
  independentAc: boolean,
  assistedAc: boolean
): MistakeEntry["lastStatus"] {
  if (independentAc) {
    return "independent_ac";
  }
  if (assistedAc) {
    return "assisted_ac";
  }
  if (event.kind === "attempt_abandoned" || event.verdict === "ABANDONED") {
    return "abandoned";
  }
  return "unresolved";
}

function computeConceptMasteryScore(params: {
  attemptedCount: number;
  independentAcCount: number;
  assistedAcCount: number;
  highestIndependentTier: number;
  stability: number;
  retrievability: number;
}): number {
  if (params.attemptedCount <= 0) {
    return 0;
  }
  const independenceRatio =
    (params.independentAcCount + 0.35 * params.assistedAcCount) / params.attemptedCount;
  const stabilityFactor = Math.min(1, params.stability / 14);
  const tierFactor = params.highestIndependentTier / 5;

  const raw =
    independenceRatio * 45 +
    stabilityFactor * 30 +
    params.retrievability * 15 +
    tierFactor * 10;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

function toFsrsGrade(value: FsrsRatingValue): Grade {
  switch (value) {
    case 1:
      return Rating.Again;
    case 2:
      return Rating.Hard;
    case 3:
      return Rating.Good;
    case 4:
      return Rating.Easy;
  }
}

function roundMetric(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

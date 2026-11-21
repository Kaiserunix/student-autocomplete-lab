import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AutocompleteCodeHabit,
  TeachingPreferences,
  UserOverridesV2
} from "../contracts";
import { normalizeConceptTagOrRaw, normalizeMisconceptionIdOrRaw } from "./taxonomy";

export const DEFAULT_TEACHING_PREFERENCES: TeachingPreferences = {
  hintStyle: "socratic",
  verbosity: "concise",
  targetGoal: "interview_leetcode"
};

export function createDefaultUserOverrides(now: string = new Date().toISOString()): UserOverridesV2 {
  return {
    schemaVersion: "2.0",
    updatedAt: now,
    teachingPreferences: { ...DEFAULT_TEACHING_PREFERENCES },
    autocompleteCodeHabits: [],
    mutedMisconceptionIds: {},
    manualConceptOverrides: {},
    voidedEventIds: []
  };
}

export function muteMisconception(
  overrides: UserOverridesV2,
  misconceptionId: string,
  reason: string,
  now: string = new Date().toISOString()
): UserOverridesV2 {
  const key = normalizeMisconceptionIdOrRaw(misconceptionId);
  return {
    ...overrides,
    updatedAt: now,
    mutedMisconceptionIds: {
      ...overrides.mutedMisconceptionIds,
      [key]: {
        mutedAt: now,
        reason: reason.trim() || "Muted by learner"
      }
    }
  };
}

export function unmuteMisconception(
  overrides: UserOverridesV2,
  misconceptionId: string,
  now: string = new Date().toISOString()
): UserOverridesV2 {
  const key = normalizeMisconceptionIdOrRaw(misconceptionId);
  const nextMuted = { ...overrides.mutedMisconceptionIds };
  delete nextMuted[key];
  delete nextMuted[misconceptionId];
  return {
    ...overrides,
    updatedAt: now,
    mutedMisconceptionIds: nextMuted
  };
}

export function voidLearningEvent(
  overrides: UserOverridesV2,
  eventId: string,
  now: string = new Date().toISOString()
): UserOverridesV2 {
  const trimmed = eventId.trim();
  if (!trimmed || overrides.voidedEventIds.includes(trimmed)) {
    return overrides;
  }
  return {
    ...overrides,
    updatedAt: now,
    voidedEventIds: [...overrides.voidedEventIds, trimmed]
  };
}

export function unvoidLearningEvent(
  overrides: UserOverridesV2,
  eventId: string,
  now: string = new Date().toISOString()
): UserOverridesV2 {
  const trimmed = eventId.trim();
  if (!overrides.voidedEventIds.includes(trimmed)) {
    return overrides;
  }
  return {
    ...overrides,
    updatedAt: now,
    voidedEventIds: overrides.voidedEventIds.filter((id) => id !== trimmed)
  };
}

export function upsertCodeHabit(
  overrides: UserOverridesV2,
  habit: AutocompleteCodeHabit,
  now: string = new Date().toISOString()
): UserOverridesV2 {
  const cleaned: AutocompleteCodeHabit = {
    id: habit.id.trim(),
    language: habit.language,
    ruleText: habit.ruleText.trim(),
    enabled: Boolean(habit.enabled)
  };
  const exists = overrides.autocompleteCodeHabits.some((h) => h.id === cleaned.id);
  const nextHabits = exists
    ? overrides.autocompleteCodeHabits.map((h) => (h.id === cleaned.id ? cleaned : h))
    : [...overrides.autocompleteCodeHabits, cleaned];
  return {
    ...overrides,
    updatedAt: now,
    autocompleteCodeHabits: nextHabits
  };
}

export function setCodeHabitEnabled(
  overrides: UserOverridesV2,
  habitId: string,
  enabled: boolean,
  now: string = new Date().toISOString()
): UserOverridesV2 {
  return {
    ...overrides,
    updatedAt: now,
    autocompleteCodeHabits: overrides.autocompleteCodeHabits.map((habit) =>
      habit.id === habitId ? { ...habit, enabled } : habit
    )
  };
}

export function removeCodeHabit(
  overrides: UserOverridesV2,
  habitId: string,
  now: string = new Date().toISOString()
): UserOverridesV2 {
  return {
    ...overrides,
    updatedAt: now,
    autocompleteCodeHabits: overrides.autocompleteCodeHabits.filter((habit) => habit.id !== habitId)
  };
}

export function updateTeachingPreferences(
  overrides: UserOverridesV2,
  patch: Partial<TeachingPreferences>,
  now: string = new Date().toISOString()
): UserOverridesV2 {
  return {
    ...overrides,
    updatedAt: now,
    teachingPreferences: {
      ...overrides.teachingPreferences,
      ...patch
    }
  };
}

export function setManualConceptOverride(
  overrides: UserOverridesV2,
  conceptTag: string,
  override: { floorTier?: 1 | 2 | 3 | 4 | 5; pauseReview?: boolean } | null,
  now: string = new Date().toISOString()
): UserOverridesV2 {
  const key = normalizeConceptTagOrRaw(conceptTag);
  const next = { ...overrides.manualConceptOverrides };
  if (override === null) {
    delete next[key];
  } else {
    next[key] = { ...override };
  }
  return {
    ...overrides,
    updatedAt: now,
    manualConceptOverrides: next
  };
}

export function isMisconceptionMuted(overrides: UserOverridesV2, misconceptionId: string): boolean {
  const key = normalizeMisconceptionIdOrRaw(misconceptionId);
  return Boolean(overrides.mutedMisconceptionIds[key] || overrides.mutedMisconceptionIds[misconceptionId]);
}

export interface UserOverridesStore {
  load(): Promise<UserOverridesV2>;
  save(overrides: UserOverridesV2): Promise<void>;
  update(mutator: (current: UserOverridesV2) => UserOverridesV2): Promise<UserOverridesV2>;
}

export class InMemoryUserOverridesStore implements UserOverridesStore {
  private current: UserOverridesV2;

  constructor(initial?: UserOverridesV2) {
    this.current = initial ? structuredClone(initial) : createDefaultUserOverrides();
  }

  public async load(): Promise<UserOverridesV2> {
    return structuredClone(this.current);
  }

  public async save(overrides: UserOverridesV2): Promise<void> {
    this.current = structuredClone(overrides);
  }

  public async update(mutator: (current: UserOverridesV2) => UserOverridesV2): Promise<UserOverridesV2> {
    const next = mutator(structuredClone(this.current));
    this.current = structuredClone(next);
    return structuredClone(next);
  }
}

/**
 * Orthogonal human-explicit-will store (`userOverrides.v2.json`).
 * Never overwritten by learning event replay or snapshot recalculation.
 */
export class JsonUserOverridesStore implements UserOverridesStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public get path(): string {
    return this.filePath;
  }

  public async load(): Promise<UserOverridesV2> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<UserOverridesV2>;
      return normalizeLoadedOverrides(parsed);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        return createDefaultUserOverrides();
      }
      throw error;
    }
  }

  public async save(overrides: UserOverridesV2): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(overrides, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }

  public async update(mutator: (current: UserOverridesV2) => UserOverridesV2): Promise<UserOverridesV2> {
    const current = await this.load();
    const next = mutator(current);
    await this.save(next);
    return next;
  }
}

function normalizeLoadedOverrides(parsed: Partial<UserOverridesV2>): UserOverridesV2 {
  const defaults = createDefaultUserOverrides(parsed.updatedAt ?? new Date().toISOString());
  return {
    schemaVersion: "2.0",
    updatedAt: parsed.updatedAt ?? defaults.updatedAt,
    teachingPreferences: {
      ...defaults.teachingPreferences,
      ...(parsed.teachingPreferences ?? {})
    },
    autocompleteCodeHabits: Array.isArray(parsed.autocompleteCodeHabits)
      ? parsed.autocompleteCodeHabits
      : [],
    mutedMisconceptionIds:
      parsed.mutedMisconceptionIds && typeof parsed.mutedMisconceptionIds === "object"
        ? { ...parsed.mutedMisconceptionIds }
        : {},
    manualConceptOverrides:
      parsed.manualConceptOverrides && typeof parsed.manualConceptOverrides === "object"
        ? { ...parsed.manualConceptOverrides }
        : {},
    voidedEventIds: Array.isArray(parsed.voidedEventIds)
      ? Array.from(new Set(parsed.voidedEventIds.filter((id): id is string => typeof id === "string")))
      : []
  };
}

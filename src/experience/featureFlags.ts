import {
  PRESET_DEFAULTS,
  type CoachStrictness,
  type FeatureFlags,
  type GhostTextMode,
  type MicroFrictionMode,
  type PresetMode,
  type TypingSoundPack
} from "../core/contracts";

export type ConfigTarget = "workspace" | "global";

export interface ConfigInspection<T = unknown> {
  key: string;
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
}

export interface WorkspaceConfigPort {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  inspect<T>(key: string): ConfigInspection<T> | undefined;
  update(key: string, value: unknown, target: ConfigTarget): Promise<void> | void;
}

export interface MementoPort {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Promise<void> | void;
}

export interface DisposableLike {
  dispose(): void;
}

export const FEATURE_FLAG_CONFIG_KEYS: Readonly<Record<keyof FeatureFlags, string>> = {
  preset: "algoCoach.preset",
  uiLanguage: "algoCoach.ui.language",
  starterPackEnabled: "algoCoach.starterPack.enabled",
  shortcutHintsEnabled: "algoCoach.onboarding.shortcutHints.enabled",
  ghostTextMode: "algoCoach.ghostText.mode",
  strictWordAccept: "algoCoach.ghostText.strictWordAccept",
  microFriction: "algoCoach.ghostText.microFriction",
  coachStrictness: "algoCoach.coach.strictness",
  patternMapperEnabled: "algoCoach.coach.patternMapper.enabled",
  mockInterviewEnabled: "algoCoach.coach.mockInterview.enabled",
  stylishRankEnabled: "algoCoach.stylishRank.enabled",
  typingSoundEnabled: "algoCoach.feedback.typingSound.enabled",
  typingSoundPack: "algoCoach.feedback.typingSound.pack",
  typingSoundVolume: "algoCoach.feedback.typingSound.volume",
  celebrationSoundEnabled: "algoCoach.feedback.celebrationSound.enabled",
  celebrationSoundVolume: "algoCoach.feedback.celebrationSound.volume"
};

export const BASE_FEATURE_FLAG_DEFAULTS: Readonly<FeatureFlags> = {
  preset: "focus",
  uiLanguage: "zh-CN",
  starterPackEnabled: false,
  shortcutHintsEnabled: false,
  ghostTextMode: "adaptive",
  strictWordAccept: false,
  microFriction: "off",
  coachStrictness: "standard",
  patternMapperEnabled: true,
  mockInterviewEnabled: false,
  stylishRankEnabled: true,
  typingSoundEnabled: false,
  typingSoundPack: "muted-brown",
  typingSoundVolume: 0.25,
  celebrationSoundEnabled: false,
  celebrationSoundVolume: 0.35
};

const VALID_PRESETS = new Set<PresetMode>(["starter", "focus", "contest"]);
const VALID_LANGUAGES = new Set<FeatureFlags["uiLanguage"]>(["zh-CN", "en-US"]);
const VALID_GHOST_MODES = new Set<GhostTextMode>(["adaptive", "fast-syntax", "manual", "off"]);
const VALID_MICRO_FRICTION = new Set<MicroFrictionMode>(["off", "multi-choice", "lead-and-reveal"]);
const VALID_STRICTNESS = new Set<CoachStrictness>(["gentle", "standard", "strict"]);
const VALID_SOUND_PACKS = new Set<TypingSoundPack>(["crisp-blue", "muted-brown", "soft-drop"]);

function readExplicitValue<T>(config: WorkspaceConfigPort, key: string): T | undefined {
  const inspected = config.inspect<T>(key);
  if (!inspected) {
    return undefined;
  }
  if (inspected.workspaceFolderValue !== undefined) {
    return inspected.workspaceFolderValue;
  }
  if (inspected.workspaceValue !== undefined) {
    return inspected.workspaceValue;
  }
  if (inspected.globalValue !== undefined) {
    return inspected.globalValue;
  }
  return undefined;
}

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function pickEnum<T extends string>(value: unknown, valid: Set<T>, fallback: T): T {
  return typeof value === "string" && valid.has(value as T) ? (value as T) : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Pure synthesizer that merges a PresetMode with optional explicit user overrides.
 */
export function resolveFeatureFlagsFromOverrides(
  preset: PresetMode = BASE_FEATURE_FLAG_DEFAULTS.preset,
  explicitOverrides: Partial<FeatureFlags> = {}
): FeatureFlags {
  const safePreset = pickEnum(preset, VALID_PRESETS, BASE_FEATURE_FLAG_DEFAULTS.preset);
  const presetLayer = PRESET_DEFAULTS[safePreset];
  const mergedBase: FeatureFlags = {
    ...BASE_FEATURE_FLAG_DEFAULTS,
    ...presetLayer,
    preset: safePreset
  };

  return {
    preset: safePreset,
    uiLanguage: pickEnum(explicitOverrides.uiLanguage, VALID_LANGUAGES, mergedBase.uiLanguage),
    starterPackEnabled: pickBoolean(
      explicitOverrides.starterPackEnabled,
      mergedBase.starterPackEnabled
    ),
    shortcutHintsEnabled: pickBoolean(
      explicitOverrides.shortcutHintsEnabled,
      mergedBase.shortcutHintsEnabled
    ),
    ghostTextMode: pickEnum(
      explicitOverrides.ghostTextMode,
      VALID_GHOST_MODES,
      mergedBase.ghostTextMode
    ),
    strictWordAccept: pickBoolean(explicitOverrides.strictWordAccept, mergedBase.strictWordAccept),
    microFriction: pickEnum(
      explicitOverrides.microFriction,
      VALID_MICRO_FRICTION,
      mergedBase.microFriction
    ),
    coachStrictness: pickEnum(
      explicitOverrides.coachStrictness,
      VALID_STRICTNESS,
      mergedBase.coachStrictness
    ),
    patternMapperEnabled: pickBoolean(
      explicitOverrides.patternMapperEnabled,
      mergedBase.patternMapperEnabled
    ),
    mockInterviewEnabled: pickBoolean(
      explicitOverrides.mockInterviewEnabled,
      mergedBase.mockInterviewEnabled
    ),
    stylishRankEnabled: pickBoolean(
      explicitOverrides.stylishRankEnabled,
      mergedBase.stylishRankEnabled
    ),
    typingSoundEnabled: pickBoolean(
      explicitOverrides.typingSoundEnabled,
      mergedBase.typingSoundEnabled
    ),
    typingSoundPack: pickEnum(
      explicitOverrides.typingSoundPack,
      VALID_SOUND_PACKS,
      mergedBase.typingSoundPack
    ),
    typingSoundVolume: clampVolume(
      explicitOverrides.typingSoundVolume,
      mergedBase.typingSoundVolume
    ),
    celebrationSoundEnabled: pickBoolean(
      explicitOverrides.celebrationSoundEnabled,
      mergedBase.celebrationSoundEnabled
    ),
    celebrationSoundVolume: clampVolume(
      explicitOverrides.celebrationSoundVolume,
      mergedBase.celebrationSoundVolume
    )
  };
}

/**
 * Resolves effective FeatureFlags from a WorkspaceConfigPort by inspecting explicit
 * user overrides (workspaceFolder > workspace > global) over PresetMode defaults.
 */
export function resolveFeatureFlags(config: WorkspaceConfigPort): FeatureFlags {
  const explicitPreset =
    readExplicitValue<PresetMode>(config, FEATURE_FLAG_CONFIG_KEYS.preset) ??
    config.get<PresetMode>(FEATURE_FLAG_CONFIG_KEYS.preset);

  const safePreset = pickEnum(explicitPreset, VALID_PRESETS, BASE_FEATURE_FLAG_DEFAULTS.preset);

  const overrides: Partial<FeatureFlags> = {
    uiLanguage: readExplicitValue<FeatureFlags["uiLanguage"]>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.uiLanguage
    ),
    starterPackEnabled: readExplicitValue<boolean>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.starterPackEnabled
    ),
    shortcutHintsEnabled: readExplicitValue<boolean>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.shortcutHintsEnabled
    ),
    ghostTextMode: readExplicitValue<GhostTextMode>(config, FEATURE_FLAG_CONFIG_KEYS.ghostTextMode),
    strictWordAccept: readExplicitValue<boolean>(config, FEATURE_FLAG_CONFIG_KEYS.strictWordAccept),
    microFriction: readExplicitValue<MicroFrictionMode>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.microFriction
    ),
    coachStrictness: readExplicitValue<CoachStrictness>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.coachStrictness
    ),
    patternMapperEnabled: readExplicitValue<boolean>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.patternMapperEnabled
    ),
    mockInterviewEnabled: readExplicitValue<boolean>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.mockInterviewEnabled
    ),
    stylishRankEnabled: readExplicitValue<boolean>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.stylishRankEnabled
    ),
    typingSoundEnabled: readExplicitValue<boolean>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.typingSoundEnabled
    ),
    typingSoundPack: readExplicitValue<TypingSoundPack>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.typingSoundPack
    ),
    typingSoundVolume: readExplicitValue<number>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.typingSoundVolume
    ),
    celebrationSoundEnabled: readExplicitValue<boolean>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.celebrationSoundEnabled
    ),
    celebrationSoundVolume: readExplicitValue<number>(
      config,
      FEATURE_FLAG_CONFIG_KEYS.celebrationSoundVolume
    )
  };

  return resolveFeatureFlagsFromOverrides(safePreset, overrides);
}

/**
 * Switches the active PresetMode in configuration.
 * When `resetPresetControlledOverrides` is true, explicit overrides for keys managed
 * by the preset are cleared on the specified target so the preset takes full effect.
 */
export async function applyPresetToConfig(
  config: WorkspaceConfigPort,
  preset: PresetMode,
  target: ConfigTarget = "workspace",
  resetPresetControlledOverrides = false
): Promise<FeatureFlags> {
  const safePreset = pickEnum(preset, VALID_PRESETS, BASE_FEATURE_FLAG_DEFAULTS.preset);
  await config.update(FEATURE_FLAG_CONFIG_KEYS.preset, safePreset, target);

  if (resetPresetControlledOverrides) {
    const presetKeys = Object.keys(PRESET_DEFAULTS[safePreset]) as Array<keyof FeatureFlags>;
    for (const flagKey of presetKeys) {
      if (flagKey === "preset") {
        continue;
      }
      const configKey = FEATURE_FLAG_CONFIG_KEYS[flagKey];
      await config.update(configKey, undefined, target);
    }
  }

  return resolveFeatureFlags(config);
}

export interface ManagedModuleDescriptor<TInstance extends DisposableLike = DisposableLike> {
  readonly id: string;
  isEnabled(flags: FeatureFlags): boolean;
  create(flags: FeatureFlags): TInstance;
  onUpdate?(instance: TInstance, flags: FeatureFlags): void;
}

/**
 * Lightweight lifecycle manager guaranteeing that disabling any feature flag immediately
 * calls `dispose()` on that module and removes all references (zero lingering listeners/CPU).
 */
export class ManagedModuleController implements DisposableLike {
  private readonly descriptors = new Map<string, ManagedModuleDescriptor<DisposableLike>>();
  private readonly activeInstances = new Map<string, DisposableLike>();
  private disposed = false;

  register<TInstance extends DisposableLike>(descriptor: ManagedModuleDescriptor<TInstance>): this {
    if (this.disposed) {
      throw new Error("Cannot register module on a disposed ManagedModuleController");
    }
    if (this.descriptors.has(descriptor.id)) {
      throw new Error(`Managed module '${descriptor.id}' is already registered`);
    }
    this.descriptors.set(descriptor.id, descriptor as ManagedModuleDescriptor<DisposableLike>);
    return this;
  }

  sync(flags: FeatureFlags): { activated: string[]; deactivated: string[]; updated: string[] } {
    if (this.disposed) {
      return { activated: [], deactivated: [], updated: [] };
    }

    const activated: string[] = [];
    const deactivated: string[] = [];
    const updated: string[] = [];

    for (const [id, descriptor] of this.descriptors) {
      const shouldBeActive = descriptor.isEnabled(flags);
      const current = this.activeInstances.get(id);

      if (shouldBeActive && !current) {
        const instance = descriptor.create(flags);
        this.activeInstances.set(id, instance);
        activated.push(id);
      } else if (!shouldBeActive && current) {
        this.activeInstances.delete(id);
        current.dispose();
        deactivated.push(id);
      } else if (shouldBeActive && current) {
        descriptor.onUpdate?.(current, flags);
        updated.push(id);
      }
    }

    return { activated, deactivated, updated };
  }

  isActive(id: string): boolean {
    return this.activeInstances.has(id);
  }

  getInstance<TInstance extends DisposableLike>(id: string): TInstance | undefined {
    return this.activeInstances.get(id) as TInstance | undefined;
  }

  getActiveModuleIds(): string[] {
    return Array.from(this.activeInstances.keys());
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    const instances = Array.from(this.activeInstances.values());
    this.activeInstances.clear();
    this.descriptors.clear();

    for (const instance of instances) {
      instance.dispose();
    }
  }
}

/**
 * Utility in-memory WorkspaceConfigPort for pure TypeScript tests and dry runs.
 */
export function createMemoryConfigPort(initial?: {
  defaults?: Record<string, unknown>;
  global?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
  workspaceFolder?: Record<string, unknown>;
}): WorkspaceConfigPort {
  const defaults = new Map<string, unknown>(Object.entries(initial?.defaults ?? {}));
  const globalStore = new Map<string, unknown>(Object.entries(initial?.global ?? {}));
  const workspaceStore = new Map<string, unknown>(Object.entries(initial?.workspace ?? {}));
  const workspaceFolderStore = new Map<string, unknown>(
    Object.entries(initial?.workspaceFolder ?? {})
  );

  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      if (workspaceFolderStore.has(key)) {
        return workspaceFolderStore.get(key) as T;
      }
      if (workspaceStore.has(key)) {
        return workspaceStore.get(key) as T;
      }
      if (globalStore.has(key)) {
        return globalStore.get(key) as T;
      }
      if (defaults.has(key)) {
        return defaults.get(key) as T;
      }
      return defaultValue;
    },
    inspect<T>(key: string): ConfigInspection<T> {
      return {
        key,
        defaultValue: defaults.get(key) as T | undefined,
        globalValue: globalStore.get(key) as T | undefined,
        workspaceValue: workspaceStore.get(key) as T | undefined,
        workspaceFolderValue: workspaceFolderStore.get(key) as T | undefined
      };
    },
    update(key: string, value: unknown, target: ConfigTarget): void {
      const store = target === "global" ? globalStore : workspaceStore;
      if (value === undefined) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    }
  } as WorkspaceConfigPort;
}

/**
 * Utility in-memory MementoPort for pure TypeScript tests and dry runs.
 */
export function createMemoryMementoPort(initial?: Record<string, unknown>): MementoPort {
  const store = new Map<string, unknown>(Object.entries(initial ?? {}));
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      if (!store.has(key)) {
        return defaultValue;
      }
      return store.get(key) as T;
    },
    update(key: string, value: unknown): void {
      if (value === undefined) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    }
  } as MementoPort;
}

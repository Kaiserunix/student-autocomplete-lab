import type { ConfigTarget, MementoPort, WorkspaceConfigPort } from "./featureFlags";

export const STARTER_VISUAL_PRESET_SNAPSHOT_KEY = "algoCoach.starterVisualPreset.snapshots.v1";

/**
 * Native VS Code beginner-friendly visual preset for algorithm training.
 * Uses only built-in VS Code settings (no custom bracket decorators).
 */
export const STARTER_VISUAL_PRESET_SETTINGS: Readonly<Record<string, boolean | string>> = {
  "editor.bracketPairColorization.enabled": true,
  "editor.bracketPairColorization.independentColorPoolPerBracketType": true,
  "editor.guides.bracketPairs": "active",
  "editor.guides.bracketPairsHorizontal": "active",
  "editor.guides.indentation": true,
  "editor.guides.highlightActiveIndentation": true,
  "editor.stickyScroll.enabled": true,
  "editor.inlineSuggest.enabled": true,
  "editor.inlineSuggest.showToolbar": "onHover",
  "editor.inlayHints.enabled": "offUnlessPressed"
};

export interface VisualSettingBackupEntry {
  key: string;
  /** Distinguishes explicit `undefined` (unset) from a configured value across JSON serialization. */
  hadValue: boolean;
  previousValue?: unknown;
}

export interface StarterVisualPresetSnapshot {
  schemaVersion: "starter-visual-preset/v1";
  target: ConfigTarget;
  appliedAt: string;
  entries: VisualSettingBackupEntry[];
}

type SnapshotBag = Partial<Record<ConfigTarget, StarterVisualPresetSnapshot>>;

export interface ApplyVisualPresetResult {
  applied: boolean;
  target: ConfigTarget;
  appliedKeys: string[];
  snapshotPreserved: boolean;
  snapshot: StarterVisualPresetSnapshot;
}

export interface RestoreVisualPresetResult {
  restored: boolean;
  target: ConfigTarget;
  reason?: "no_snapshot";
  restoredKeys: string[];
  clearedUndefinedKeys: string[];
  snapshot?: StarterVisualPresetSnapshot;
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  return structuredClone(value);
}

/**
 * Applies the native VS Code beginner visual preset (workspace-scoped by default)
 * and stores an exact lossless `inspect()` snapshot for 100% reversible one-click restore.
 */
export class StarterVisualPresetManager {
  private readonly now: () => Date;

  constructor(
    private readonly config: WorkspaceConfigPort,
    private readonly memento: MementoPort,
    options?: { now?: () => Date }
  ) {
    this.now = options?.now ?? (() => new Date());
  }

  private readSnapshotBag(): SnapshotBag {
    const raw = this.memento.get<SnapshotBag>(STARTER_VISUAL_PRESET_SNAPSHOT_KEY);
    if (!raw || typeof raw !== "object") {
      return {};
    }
    return { ...raw };
  }

  private async writeSnapshotBag(bag: SnapshotBag): Promise<void> {
    if (!bag.workspace && !bag.global) {
      await this.memento.update(STARTER_VISUAL_PRESET_SNAPSHOT_KEY, undefined);
      return;
    }
    await this.memento.update(STARTER_VISUAL_PRESET_SNAPSHOT_KEY, bag);
  }

  getSnapshot(target: ConfigTarget = "workspace"): StarterVisualPresetSnapshot | undefined {
    const bag = this.readSnapshotBag();
    const snap = bag[target];
    return snap ? cloneValue(snap) : undefined;
  }

  hasSnapshot(target: ConfigTarget = "workspace"): boolean {
    return this.getSnapshot(target) !== undefined;
  }

  isPresetCurrentlyApplied(target: ConfigTarget = "workspace"): boolean {
    for (const [key, expected] of Object.entries(STARTER_VISUAL_PRESET_SETTINGS)) {
      const inspected = this.config.inspect(key);
      const actual = target === "global" ? inspected?.globalValue : inspected?.workspaceValue;
      if (actual !== expected) {
        return false;
      }
    }
    return true;
  }

  async apply(target: ConfigTarget = "workspace"): Promise<ApplyVisualPresetResult> {
    const bag = this.readSnapshotBag();
    const existingSnapshot = bag[target];
    let snapshot: StarterVisualPresetSnapshot;
    let snapshotPreserved = false;

    if (existingSnapshot) {
      snapshot = cloneValue(existingSnapshot);
      snapshotPreserved = true;
    } else {
      const entries: VisualSettingBackupEntry[] = [];
      for (const key of Object.keys(STARTER_VISUAL_PRESET_SETTINGS)) {
        const inspected = this.config.inspect(key);
        const existingValue =
          target === "global" ? inspected?.globalValue : inspected?.workspaceValue;
        const hadValue = existingValue !== undefined;
        entries.push(
          hadValue
            ? { key, hadValue: true, previousValue: cloneValue(existingValue) }
            : { key, hadValue: false }
        );
      }

      snapshot = {
        schemaVersion: "starter-visual-preset/v1",
        target,
        appliedAt: this.now().toISOString(),
        entries
      };

      bag[target] = snapshot;
      await this.writeSnapshotBag(bag);
    }

    const appliedKeys: string[] = [];
    for (const [key, value] of Object.entries(STARTER_VISUAL_PRESET_SETTINGS)) {
      await this.config.update(key, value, target);
      appliedKeys.push(key);
    }

    return {
      applied: true,
      target,
      appliedKeys,
      snapshotPreserved,
      snapshot: cloneValue(snapshot)
    };
  }

  async restore(target: ConfigTarget = "workspace"): Promise<RestoreVisualPresetResult> {
    const bag = this.readSnapshotBag();
    const snapshot = bag[target];

    if (!snapshot) {
      return {
        restored: false,
        target,
        reason: "no_snapshot",
        restoredKeys: [],
        clearedUndefinedKeys: []
      };
    }

    const restoredKeys: string[] = [];
    const clearedUndefinedKeys: string[] = [];

    for (const entry of snapshot.entries) {
      if (entry.hadValue) {
        await this.config.update(entry.key, cloneValue(entry.previousValue), snapshot.target);
        restoredKeys.push(entry.key);
      } else {
        await this.config.update(entry.key, undefined, snapshot.target);
        restoredKeys.push(entry.key);
        clearedUndefinedKeys.push(entry.key);
      }
    }

    delete bag[target];
    await this.writeSnapshotBag(bag);

    return {
      restored: true,
      target: snapshot.target,
      restoredKeys,
      clearedUndefinedKeys,
      snapshot: cloneValue(snapshot)
    };
  }
}

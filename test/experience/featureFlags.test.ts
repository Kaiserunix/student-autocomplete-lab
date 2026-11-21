import { describe, expect, it, vi } from "vitest";
import {
  applyPresetToConfig,
  BASE_FEATURE_FLAG_DEFAULTS,
  createMemoryConfigPort,
  FEATURE_FLAG_CONFIG_KEYS,
  ManagedModuleController,
  resolveFeatureFlags,
  resolveFeatureFlagsFromOverrides
} from "../../src/experience";

describe("featureFlags & ManagedModuleController", () => {
  it("resolves starter, focus, and contest presets with accurate defaults", () => {
    const starter = resolveFeatureFlagsFromOverrides("starter");
    expect(starter.preset).toBe("starter");
    expect(starter.starterPackEnabled).toBe(true);
    expect(starter.shortcutHintsEnabled).toBe(true);
    expect(starter.coachStrictness).toBe("gentle");
    expect(starter.ghostTextMode).toBe("adaptive");
    expect(starter.typingSoundEnabled).toBe(false);
    expect(starter.celebrationSoundEnabled).toBe(false);

    const focus = resolveFeatureFlagsFromOverrides("focus");
    expect(focus.preset).toBe("focus");
    expect(focus.starterPackEnabled).toBe(false);
    expect(focus.shortcutHintsEnabled).toBe(false);
    expect(focus.coachStrictness).toBe("standard");
    expect(focus.patternMapperEnabled).toBe(true);
    expect(focus.mockInterviewEnabled).toBe(false);

    const contest = resolveFeatureFlagsFromOverrides("contest");
    expect(contest.preset).toBe("contest");
    expect(contest.ghostTextMode).toBe("manual");
    expect(contest.coachStrictness).toBe("strict");
    expect(contest.patternMapperEnabled).toBe(false);
    expect(contest.mockInterviewEnabled).toBe(true);
    expect(contest.stylishRankEnabled).toBe(true);
  });

  it("applies preset layer over package.json defaults while honoring explicit user overrides", () => {
    // Simulate VS Code where package.json defaults exist for every key
    const config = createMemoryConfigPort({
      defaults: {
        [FEATURE_FLAG_CONFIG_KEYS.preset]: "focus",
        [FEATURE_FLAG_CONFIG_KEYS.starterPackEnabled]: false,
        [FEATURE_FLAG_CONFIG_KEYS.shortcutHintsEnabled]: false,
        [FEATURE_FLAG_CONFIG_KEYS.coachStrictness]: "standard",
        [FEATURE_FLAG_CONFIG_KEYS.typingSoundEnabled]: false
      },
      global: {
        [FEATURE_FLAG_CONFIG_KEYS.preset]: "starter",
        [FEATURE_FLAG_CONFIG_KEYS.typingSoundEnabled]: true,
        [FEATURE_FLAG_CONFIG_KEYS.typingSoundVolume]: 0.5
      },
      workspace: {
        // Explicit workspace override beats global and preset
        [FEATURE_FLAG_CONFIG_KEYS.coachStrictness]: "strict",
        [FEATURE_FLAG_CONFIG_KEYS.typingSoundVolume]: 0.2
      },
      workspaceFolder: {
        [FEATURE_FLAG_CONFIG_KEYS.uiLanguage]: "en-US"
      }
    });

    const resolved = resolveFeatureFlags(config);
    // Preset 'starter' enabled starterPack & shortcutHints despite package.json default=false
    expect(resolved.preset).toBe("starter");
    expect(resolved.starterPackEnabled).toBe(true);
    expect(resolved.shortcutHintsEnabled).toBe(true);
    // Global override applied
    expect(resolved.typingSoundEnabled).toBe(true);
    // Workspace override beats global & preset
    expect(resolved.coachStrictness).toBe("strict");
    expect(resolved.typingSoundVolume).toBe(0.2);
    // WorkspaceFolder override beats all
    expect(resolved.uiLanguage).toBe("en-US");
  });

  it("sanitizes invalid enum values and clamps sound volumes to [0, 1]", () => {
    const config = createMemoryConfigPort({
      workspace: {
        [FEATURE_FLAG_CONFIG_KEYS.preset]: "nonexistent-preset",
        [FEATURE_FLAG_CONFIG_KEYS.ghostTextMode]: "invalid-mode",
        [FEATURE_FLAG_CONFIG_KEYS.typingSoundVolume]: 5.2,
        [FEATURE_FLAG_CONFIG_KEYS.celebrationSoundVolume]: -0.4
      }
    });

    const resolved = resolveFeatureFlags(config);
    expect(resolved.preset).toBe(BASE_FEATURE_FLAG_DEFAULTS.preset);
    expect(resolved.ghostTextMode).toBe("adaptive");
    expect(resolved.typingSoundVolume).toBe(1);
    expect(resolved.celebrationSoundVolume).toBe(0);
  });

  it("applyPresetToConfig updates preset and can reset explicit preset-managed overrides", async () => {
    const config = createMemoryConfigPort({
      workspace: {
        [FEATURE_FLAG_CONFIG_KEYS.preset]: "focus",
        [FEATURE_FLAG_CONFIG_KEYS.ghostTextMode]: "fast-syntax",
        [FEATURE_FLAG_CONFIG_KEYS.uiLanguage]: "en-US"
      }
    });

    // Without reset: explicit ghostTextMode override stays
    const keepOverride = await applyPresetToConfig(config, "contest", "workspace", false);
    expect(keepOverride.preset).toBe("contest");
    expect(keepOverride.ghostTextMode).toBe("fast-syntax");
    expect(keepOverride.coachStrictness).toBe("strict");

    // With reset: preset-managed keys cleared, non-preset keys (uiLanguage) preserved
    const cleanSwitch = await applyPresetToConfig(config, "contest", "workspace", true);
    expect(cleanSwitch.preset).toBe("contest");
    expect(cleanSwitch.ghostTextMode).toBe("manual");
    expect(cleanSwitch.uiLanguage).toBe("en-US");
  });

  it("ManagedModuleController disposes disabled modules immediately with zero lingering listeners", () => {
    const controller = new ManagedModuleController();
    const activeListeners = new Set<string>();

    const rankDispose = vi.fn(() => activeListeners.delete("stylishRank"));
    const rankUpdate = vi.fn();
    const soundDispose = vi.fn(() => activeListeners.delete("sound"));
    const shortcutDispose = vi.fn(() => activeListeners.delete("shortcuts"));

    controller
      .register({
        id: "stylishRank",
        isEnabled: (flags) => flags.stylishRankEnabled,
        create: () => {
          activeListeners.add("stylishRank");
          return { dispose: rankDispose, tag: "rank-instance" };
        },
        onUpdate: rankUpdate
      })
      .register({
        id: "sound",
        isEnabled: (flags) => flags.typingSoundEnabled || flags.celebrationSoundEnabled,
        create: () => {
          activeListeners.add("sound");
          return { dispose: soundDispose };
        }
      })
      .register({
        id: "shortcuts",
        isEnabled: (flags) => flags.shortcutHintsEnabled,
        create: () => {
          activeListeners.add("shortcuts");
          return { dispose: shortcutDispose };
        }
      });

    // 1. Focus preset: stylishRank active, sound & shortcuts inactive
    const focusFlags = resolveFeatureFlagsFromOverrides("focus");
    const firstSync = controller.sync(focusFlags);
    expect(firstSync.activated).toEqual(["stylishRank"]);
    expect(firstSync.deactivated).toEqual([]);
    expect(controller.isActive("stylishRank")).toBe(true);
    expect(controller.isActive("sound")).toBe(false);
    expect(activeListeners.size).toBe(1);

    // 2. Enable sound & shortcuts, keep stylishRank enabled -> onUpdate called for stylishRank
    const secondSync = controller.sync(
      resolveFeatureFlagsFromOverrides("starter", { typingSoundEnabled: true })
    );
    expect(secondSync.activated.sort()).toEqual(["shortcuts", "sound"]);
    expect(secondSync.updated).toEqual(["stylishRank"]);
    expect(rankUpdate).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(3);

    // 3. Disable sound and stylishRank -> immediate dispose(), references removed
    const thirdSync = controller.sync(
      resolveFeatureFlagsFromOverrides("starter", {
        stylishRankEnabled: false,
        typingSoundEnabled: false,
        celebrationSoundEnabled: false
      })
    );
    expect(thirdSync.deactivated.sort()).toEqual(["sound", "stylishRank"]);
    expect(rankDispose).toHaveBeenCalledTimes(1);
    expect(soundDispose).toHaveBeenCalledTimes(1);
    expect(controller.isActive("stylishRank")).toBe(false);
    expect(controller.isActive("sound")).toBe(false);
    expect(controller.getInstance("stylishRank")).toBeUndefined();
    expect(activeListeners).toEqual(new Set(["shortcuts"]));

    // 4. Controller dispose tears down remaining modules idempotently
    controller.dispose();
    controller.dispose();
    expect(shortcutDispose).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(0);
    expect(controller.getActiveModuleIds()).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  createMemoryConfigPort,
  createMemoryMementoPort,
  STARTER_VISUAL_PRESET_SETTINGS,
  StarterVisualPresetManager
} from "../../src/experience";

describe("StarterVisualPresetManager", () => {
  it("defines all 10 required VS Code native beginner visual settings", () => {
    expect(STARTER_VISUAL_PRESET_SETTINGS).toEqual({
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
    });
  });

  it("snapshots original values (including undefined markers) and restores 100% losslessly", async () => {
    const config = createMemoryConfigPort({
      global: {
        "editor.stickyScroll.enabled": false
      },
      workspace: {
        "editor.bracketPairColorization.enabled": false,
        "editor.guides.bracketPairs": false,
        "editor.inlayHints.enabled": "on"
        // All other 7 keys are explicitly undefined at workspace scope
      }
    });
    const memento = createMemoryMementoPort();
    const manager = new StarterVisualPresetManager(config, memento, {
      now: () => new Date("2026-11-22T00:00:00.000Z")
    });

    expect(manager.hasSnapshot("workspace")).toBe(false);
    expect(manager.isPresetCurrentlyApplied("workspace")).toBe(false);

    const applyResult = await manager.apply("workspace");
    expect(applyResult.applied).toBe(true);
    expect(applyResult.snapshotPreserved).toBe(false);
    expect(applyResult.appliedKeys).toHaveLength(10);
    expect(manager.hasSnapshot("workspace")).toBe(true);
    expect(manager.isPresetCurrentlyApplied("workspace")).toBe(true);

    // Global settings remain untouched
    expect(config.inspect("editor.stickyScroll.enabled")?.globalValue).toBe(false);
    expect(config.inspect("editor.stickyScroll.enabled")?.workspaceValue).toBe(true);

    // Verify snapshot accurately distinguished defined vs undefined entries
    const definedEntry = applyResult.snapshot.entries.find(
      (e) => e.key === "editor.bracketPairColorization.enabled"
    );
    const undefinedEntry = applyResult.snapshot.entries.find(
      (e) => e.key === "editor.stickyScroll.enabled"
    );
    expect(definedEntry).toEqual({
      key: "editor.bracketPairColorization.enabled",
      hadValue: true,
      previousValue: false
    });
    expect(undefinedEntry).toEqual({
      key: "editor.stickyScroll.enabled",
      hadValue: false
    });

    // Restore 100% losslessly
    const restoreResult = await manager.restore("workspace");
    expect(restoreResult.restored).toBe(true);
    expect(restoreResult.restoredKeys).toHaveLength(10);
    expect(restoreResult.clearedUndefinedKeys).toHaveLength(7);
    expect(manager.hasSnapshot("workspace")).toBe(false);

    // Previously defined keys restored to exact original values
    expect(config.inspect("editor.bracketPairColorization.enabled")?.workspaceValue).toBe(false);
    expect(config.inspect("editor.guides.bracketPairs")?.workspaceValue).toBe(false);
    expect(config.inspect("editor.inlayHints.enabled")?.workspaceValue).toBe("on");

    // Previously unset keys restored to explicit undefined (not left behind)
    expect(config.inspect("editor.stickyScroll.enabled")?.workspaceValue).toBeUndefined();
    expect(config.inspect("editor.guides.indentation")?.workspaceValue).toBeUndefined();
    expect(config.inspect("editor.inlineSuggest.showToolbar")?.workspaceValue).toBeUndefined();
    // Global setting still intact
    expect(config.inspect("editor.stickyScroll.enabled")?.globalValue).toBe(false);
  });

  it("preserves original snapshot when apply() is invoked repeatedly before restore()", async () => {
    const config = createMemoryConfigPort({
      workspace: {
        "editor.guides.indentation": false
      }
    });
    const memento = createMemoryMementoPort();
    const manager = new StarterVisualPresetManager(config, memento);

    const first = await manager.apply("workspace");
    expect(first.snapshotPreserved).toBe(false);

    // User manually tweaks one key then clicks apply again
    config.update("editor.guides.indentation", false, "workspace");
    const second = await manager.apply("workspace");
    expect(second.snapshotPreserved).toBe(true);
    expect(manager.isPresetCurrentlyApplied("workspace")).toBe(true);

    // Restoring still recovers the very first original workspace state
    await manager.restore("workspace");
    expect(config.inspect("editor.guides.indentation")?.workspaceValue).toBe(false);
    expect(config.inspect("editor.stickyScroll.enabled")?.workspaceValue).toBeUndefined();
  });

  it("returns no_snapshot when restore() is called without an active backup", async () => {
    const config = createMemoryConfigPort();
    const memento = createMemoryMementoPort();
    const manager = new StarterVisualPresetManager(config, memento);

    const result = await manager.restore("workspace");
    expect(result.restored).toBe(false);
    expect(result.reason).toBe("no_snapshot");
    expect(result.restoredKeys).toEqual([]);
  });
});

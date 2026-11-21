import * as vscode from "vscode";
import type { FeatureFlags, PresetMode, StylishRankState } from "../core/contracts";
import {
  formatStylishRankTooltip,
  SHORTCUT_HINT_DURATION_MS,
  type ShortcutHintNotification,
  type SoundStatusBarIndicator
} from "../experience";

function formatPresetLabel(preset: PresetMode, uiLanguage: "zh-CN" | "en-US"): string {
  if (uiLanguage === "zh-CN") {
    switch (preset) {
      case "starter":
        return "入门";
      case "focus":
        return "专注";
      case "contest":
        return "竞赛";
    }
  }
  switch (preset) {
    case "starter":
      return "Starter";
    case "focus":
      return "Focus";
    case "contest":
      return "Contest";
  }
}

/**
 * Manages Algo Coach status bar items using exclusively official VS Code Codicons
 * (zero Unicode Emoji, zero toast notifications, zero progress bars).
 */
export class StatusBarController implements vscode.Disposable {
  private readonly presetItem: vscode.StatusBarItem;
  private readonly rankItem: vscode.StatusBarItem;
  private readonly muteItem: vscode.StatusBarItem;
  private readonly whisperItem: vscode.StatusBarItem;
  private whisperTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor() {
    this.presetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 103);
    this.presetItem.name = "Algo Coach Preset";
    this.presetItem.command = "algoCoach.selectPreset";

    this.rankItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
    this.rankItem.name = "Algo Coach Stylish Rank";
    this.rankItem.command = "algoCoach.openSidebar";

    this.muteItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    this.muteItem.name = "Algo Coach Sound Mute";
    this.muteItem.command = "algoCoach.toggleSound";

    this.whisperItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.whisperItem.name = "Algo Coach Shortcut Whisper";
  }

  updatePreset(flags: FeatureFlags): void {
    if (this.disposed) {
      return;
    }
    const label = formatPresetLabel(flags.preset, flags.uiLanguage);
    this.presetItem.text = `$(mortar-board) Algo Coach: ${label}`;
    this.presetItem.tooltip =
      flags.uiLanguage === "zh-CN"
        ? `当前模式: ${label}（幽灵代码: ${flags.ghostTextMode}，严厉度: ${flags.coachStrictness}）。点击切换 Preset。`
        : `Active preset: ${label} (Ghost Text: ${flags.ghostTextMode}, Strictness: ${flags.coachStrictness}). Click to switch.`;
    this.presetItem.show();
  }

  updateStylishRank(flags: FeatureFlags, state?: StylishRankState): void {
    if (this.disposed) {
      return;
    }
    if (!flags.stylishRankEnabled || !state) {
      this.rankItem.hide();
      return;
    }
    // Single-line restrained monospace-style label (e.g. "S · Sharp"), zero progress bars, zero Emoji
    this.rankItem.text = state.meta.statusBarLabel;
    this.rankItem.tooltip = formatStylishRankTooltip(state, { locale: flags.uiLanguage });
    this.rankItem.show();
  }

  updateAudioIndicator(indicator?: SoundStatusBarIndicator): void {
    if (this.disposed) {
      return;
    }
    if (!indicator || !indicator.visible) {
      this.muteItem.hide();
      return;
    }
    this.muteItem.text = indicator.codicon;
    this.muteItem.tooltip = indicator.tooltip;
    this.muteItem.show();
  }

  /**
   * Displays a non-intrusive shortcut whisper in the status bar for 6 seconds (never a toast).
   */
  showShortcutWhisper(hint: ShortcutHintNotification): void {
    if (this.disposed) {
      return;
    }
    this.clearWhisperTimer();
    this.whisperItem.text = `$(lightbulb) ${hint.text}`;
    this.whisperItem.tooltip = hint.tooltip;
    this.whisperItem.show();

    const durationMs = hint.durationMs > 0 ? hint.durationMs : SHORTCUT_HINT_DURATION_MS;
    this.whisperTimer = setTimeout(() => {
      this.whisperTimer = undefined;
      if (!this.disposed) {
        this.whisperItem.hide();
      }
    }, durationMs);
  }

  hideShortcutWhisper(): void {
    this.clearWhisperTimer();
    if (!this.disposed) {
      this.whisperItem.hide();
    }
  }

  private clearWhisperTimer(): void {
    if (this.whisperTimer !== undefined) {
      clearTimeout(this.whisperTimer);
      this.whisperTimer = undefined;
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.clearWhisperTimer();
    this.presetItem.dispose();
    this.rankItem.dispose();
    this.muteItem.dispose();
    this.whisperItem.dispose();
  }
}

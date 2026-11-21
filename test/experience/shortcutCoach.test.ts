import { describe, expect, it } from "vitest";
import {
  createMemoryMementoPort,
  SHORTCUT_HINT_DURATION_MS,
  SHORTCUT_TIP_COOLDOWN_MS,
  ShortcutCoach,
  type ShortcutHintNotification
} from "../../src/experience";

const EMOJI_RE = /\p{Extended_Pictographic}/u;

function makeBackspaceEvent(offset: number, timestampMs: number, uri = "file:///sol.cpp") {
  return {
    documentUri: uri,
    timestampMs,
    contentChanges: [
      {
        rangeOffset: offset,
        rangeLength: 1,
        range: { startLine: 5, startCharacter: offset, endLine: 5, endCharacter: offset + 1 },
        text: ""
      }
    ]
  };
}

describe("ShortcutCoach (zero OS hook, anti-nagging protocol)", () => {
  it("detects >= 12 consecutive single-char backspaces and adapts key labels for Win vs macOS", () => {
    let nowMs = 10_000;
    const winCoach = new ShortcutCoach({
      memento: createMemoryMementoPort(),
      platform: "win32",
      now: () => nowMs
    });

    let emitted: ShortcutHintNotification | null = null;
    for (let i = 0; i < 11; i += 1) {
      nowMs += 100;
      emitted = winCoach.handleDocumentChange(makeBackspaceEvent(40 - i, nowMs));
      expect(emitted).toBeNull();
    }

    nowMs += 100;
    emitted = winCoach.handleDocumentChange(makeBackspaceEvent(40 - 11, nowMs));
    expect(emitted).not.toBeNull();
    expect(emitted?.tipId).toBe("delete-line");
    expect(emitted?.channel).toBe("statusBar");
    expect(emitted?.durationMs).toBe(SHORTCUT_HINT_DURATION_MS);
    expect(emitted?.shortcutLabel).toBe("Ctrl+Shift+K");
    expect(EMOJI_RE.test(emitted?.text ?? "")).toBe(false);
    expect(EMOJI_RE.test(emitted?.tooltip ?? "")).toBe(false);

    // macOS adapts to Cmd+Shift+K
    const macCoach = new ShortcutCoach({
      memento: createMemoryMementoPort(),
      platform: "darwin",
      locale: "en-US"
    });
    let macHint: ShortcutHintNotification | null = null;
    for (let i = 0; i < 12; i += 1) {
      macHint = macCoach.handleDocumentChange(makeBackspaceEvent(30 - i, 1000 + i * 80));
    }
    expect(macHint?.shortcutLabel).toBe("Cmd+Shift+K");
    expect(macHint?.text).toContain("Cmd+Shift+K");
    expect(EMOJI_RE.test(macHint?.text ?? "")).toBe(false);
  });

  it("detects cutting a whole line followed by adjacent paste move (Alt+Up/Down / Option+Up/Down)", () => {
    const coach = new ShortcutCoach({
      memento: createMemoryMementoPort(),
      platform: "darwin"
    });

    // Cut entire line 5 (Ctrl+X / Cmd+X)
    const cutRes = coach.handleDocumentChange({
      documentUri: "file:///a.py",
      timestampMs: 5_000,
      contentChanges: [
        {
          rangeOffset: 100,
          rangeLength: 18,
          range: { startLine: 5, startCharacter: 0, endLine: 6, endCharacter: 0 },
          text: "",
          deletedText: "    ans += nums[i]\n"
        }
      ]
    });
    expect(cutRes).toBeNull();

    // Immediately paste onto adjacent line 4
    const pasteRes = coach.handleDocumentChange({
      documentUri: "file:///a.py",
      timestampMs: 6_200,
      contentChanges: [
        {
          rangeOffset: 80,
          rangeLength: 0,
          range: { startLine: 4, startCharacter: 0, endLine: 4, endCharacter: 0 },
          text: "    ans += nums[i]\n"
        }
      ]
    });

    expect(pasteRes).not.toBeNull();
    expect(pasteRes?.tipId).toBe("move-line");
    expect(pasteRes?.shortcutLabel).toBe("Option+Up/Down");
    expect(pasteRes?.channel).toBe("statusBar");
  });

  it("detects 3 consecutive lines manually commented with // (two-keystroke or single) or #", () => {
    // Two-keystroke '/' + '/' across lines 10, 11, 12
    const cppCoach = new ShortcutCoach({
      memento: createMemoryMementoPort(),
      platform: "win32"
    });
    let hint: ShortcutHintNotification | null = null;
    for (let idx = 0; idx < 3; idx += 1) {
      const line = 10 + idx;
      const t = 2_000 + idx * 1_000;
      expect(
        cppCoach.handleDocumentChange({
          documentUri: "file:///main.cpp",
          timestampMs: t,
          contentChanges: [
            {
              rangeOffset: line * 20,
              rangeLength: 0,
              range: { startLine: line, startCharacter: 4, endLine: line, endCharacter: 4 },
              text: "/",
              linePrefixBeforeChange: "    "
            }
          ]
        })
      ).toBeNull();

      hint = cppCoach.handleDocumentChange({
        documentUri: "file:///main.cpp",
        timestampMs: t + 120,
        contentChanges: [
          {
            rangeOffset: line * 20 + 1,
            rangeLength: 0,
            range: { startLine: line, startCharacter: 5, endLine: line, endCharacter: 5 },
            text: "/",
            linePrefixBeforeChange: "    /"
          }
        ]
      });
    }
    expect(hint?.tipId).toBe("toggle-comment");
    expect(hint?.shortcutLabel).toBe("Ctrl+/");

    // Python '#' across 3 consecutive lines
    const pyCoach = new ShortcutCoach({
      memento: createMemoryMementoPort(),
      platform: "darwin"
    });
    let pyHint: ShortcutHintNotification | null = null;
    for (const line of [2, 3, 4]) {
      pyHint = pyCoach.handleDocumentChange({
        documentUri: "file:///sol.py",
        timestampMs: 5_000 + line * 500,
        contentChanges: [
          {
            rangeOffset: line * 10,
            rangeLength: 0,
            range: { startLine: line, startCharacter: 0, endLine: line, endCharacter: 0 },
            text: "#",
            linePrefixBeforeChange: ""
          }
        ]
      });
    }
    expect(pyHint?.tipId).toBe("toggle-comment");
    expect(pyHint?.shortcutLabel).toBe("Cmd+/");
  });

  it("triggers sidebar mouse-click shortcuts after >= 3 clicks for runSamples and requestHint", () => {
    const coach = new ShortcutCoach({
      memento: createMemoryMementoPort(),
      platform: "win32"
    });

    expect(coach.recordSidebarClick("runSamples", 1_000)).toBeNull();
    expect(coach.recordSidebarClick("runSamples", 2_000)).toBeNull();
    const runHint = coach.recordSidebarClick("runSamples", 3_000);
    expect(runHint?.tipId).toBe("run-samples");
    expect(runHint?.shortcutLabel).toBe("Ctrl+Alt+R");

    expect(coach.recordSidebarClick("requestHint", 4_000)).toBeNull();
    expect(coach.recordSidebarClick("requestHint", 5_000)).toBeNull();
    const hintTip = coach.recordSidebarClick("requestHint", 6_000);
    expect(hintTip?.tipId).toBe("request-hint");
    expect(hintTip?.shortcutLabel).toBe("Ctrl+Alt+H");
  });

  it("enforces 30m per-tip cooldown, max 2 tips/session, and permanent graduation via 2 uses or dismissal", () => {
    const memento = createMemoryMementoPort();
    const session1 = new ShortcutCoach({ memento, platform: "win32" });

    // Tip #1: run-samples at t=1000
    session1.recordSidebarClick("runSamples", 1_000);
    session1.recordSidebarClick("runSamples", 1_100);
    const tip1 = session1.recordSidebarClick("runSamples", 1_200);
    expect(tip1?.tipId).toBe("run-samples");

    // Within 30m cooldown -> suppressed even after 3 more clicks
    session1.recordSidebarClick("runSamples", 1_200 + SHORTCUT_TIP_COOLDOWN_MS - 500);
    session1.recordSidebarClick("runSamples", 1_200 + SHORTCUT_TIP_COOLDOWN_MS - 300);
    expect(
      session1.recordSidebarClick("runSamples", 1_200 + SHORTCUT_TIP_COOLDOWN_MS - 100)
    ).toBeNull();

    // Tip #2: request-hint at t=2000 (hits max 2 tips per session)
    session1.recordSidebarClick("requestHint", 2_000);
    session1.recordSidebarClick("requestHint", 2_100);
    const tip2 = session1.recordSidebarClick("requestHint", 2_200);
    expect(tip2?.tipId).toBe("request-hint");
    expect(session1.getSessionHintsShown()).toBe(2);

    // Tip #3 in same session (delete-line) -> suppressed by session cap of 2!
    let tip3: ShortcutHintNotification | null = null;
    for (let i = 0; i < 12; i += 1) {
      tip3 = session1.handleDocumentChange(makeBackspaceEvent(40 - i, 3_000 + i * 50));
    }
    expect(tip3).toBeNull();

    // Graduate 'run-samples' permanently by using it twice
    session1.recordShortcutUsed("run-samples");
    expect(session1.isGraduated("run-samples")).toBe(false);
    session1.recordShortcutUsed("run-samples");
    expect(session1.isGraduated("run-samples")).toBe(true);

    // Permanently graduate 'request-hint' by manual dismiss
    session1.dismissTip("request-hint");
    expect(session1.isGraduated("request-hint")).toBe(true);

    // Start new session after > 30m cooldown with the same MementoPort
    const session2 = new ShortcutCoach({ memento, platform: "win32" });
    const later = 1_200 + SHORTCUT_TIP_COOLDOWN_MS + 10_000;

    // Both graduated tips remain permanently silent
    for (let i = 0; i < 3; i += 1) {
      expect(session2.recordSidebarClick("runSamples", later + i * 100)).toBeNull();
      expect(session2.recordSidebarClick("requestHint", later + 1_000 + i * 100)).toBeNull();
    }

    // Non-graduated tip still fires in new session
    let session2DeleteTip: ShortcutHintNotification | null = null;
    for (let i = 0; i < 12; i += 1) {
      session2DeleteTip = session2.handleDocumentChange(makeBackspaceEvent(50 - i, later + 5_000 + i * 50));
    }
    expect(session2DeleteTip?.tipId).toBe("delete-line");
  });

  it("auto-graduates toggle-comment after 2 multi-line simultaneous comment edits", () => {
    const coach = new ShortcutCoach({ memento: createMemoryMementoPort(), platform: "win32" });

    for (let use = 0; use < 2; use += 1) {
      coach.handleDocumentChange({
        documentUri: "file:///a.cpp",
        timestampMs: 1_000 + use * 2_000,
        contentChanges: [
          {
            rangeOffset: 10,
            rangeLength: 0,
            range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 },
            text: "// "
          },
          {
            rangeOffset: 25,
            rangeLength: 0,
            range: { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 0 },
            text: "// "
          }
        ]
      });
    }

    expect(coach.isGraduated("toggle-comment")).toBe(true);
  });

  it("ignores Undo/non-consecutive edits and produces no hints after disable or dispose", () => {
    const coach = new ShortcutCoach({ memento: createMemoryMementoPort(), platform: "win32" });

    // Non-consecutive lines (1, 3, 5) must NOT trigger toggle-comment
    for (const line of [1, 3, 5]) {
      expect(
        coach.handleDocumentChange({
          documentUri: "file:///a.py",
          timestampMs: 1_000 + line * 200,
          contentChanges: [
            {
              rangeOffset: line * 10,
              rangeLength: 0,
              range: { startLine: line, startCharacter: 0, endLine: line, endCharacter: 0 },
              text: "#",
              linePrefixBeforeChange: ""
            }
          ]
        })
      ).toBeNull();
    }

    // Backspace streak interrupted by Undo at 8th delete must NOT trigger delete-line
    for (let i = 0; i < 8; i += 1) {
      coach.handleDocumentChange(makeBackspaceEvent(40 - i, 5_000 + i * 50));
    }
    coach.handleDocumentChange({
      ...makeBackspaceEvent(32, 5_500),
      reason: "undo"
    });
    for (let i = 0; i < 8; i += 1) {
      expect(
        coach.handleDocumentChange(makeBackspaceEvent(31 - i, 5_600 + i * 50))
      ).toBeNull();
    }

    // Disabled / disposed coach emits nothing
    coach.setEnabled(false);
    expect(coach.recordSidebarClick("runSamples", 10_000)).toBeNull();
    expect(coach.recordSidebarClick("runSamples", 10_100)).toBeNull();
    expect(coach.recordSidebarClick("runSamples", 10_200)).toBeNull();

    coach.setEnabled(true);
    coach.dispose();
    expect(coach.recordSidebarClick("runSamples", 11_000)).toBeNull();
    expect(coach.recordSidebarClick("runSamples", 11_100)).toBeNull();
    expect(coach.recordSidebarClick("runSamples", 11_200)).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  prepareInlineCompletionRequest,
  runInlineCompletionPipeline
} from "../../src/core/autocomplete";

describe("inlineCompletionCore end-to-end pipeline", () => {
  it("suppresses automatic triggers in Red zone without invoking transport (zero wasted calls)", async () => {
    const transport = vi.fn(async () => "l + (r - l) / 2;");

    const result = await runInlineCompletionPipeline({
      mode: "adaptive",
      triggerKind: "automatic",
      context: {
        language: "cpp",
        prefix: "int binary_search(vector<int>& a, int target) {\n    int l = 0, r = a.size();\n    mid = ",
        suffix: "\n}"
      },
      transport
    });

    expect(result.status).toBe("suppressed");
    expect(result.zone.zone).toBe("algo_core");
    expect(result.trigger.shouldTrigger).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it("allows manual invoke in Red zone with 1-line faded placeholder skeleton and returns exact selection range", async () => {
    const transport = vi.fn(async (req) => {
      expect(req.renderer).toBe("deepseek-fim");
      if (req.renderer === "deepseek-fim") {
        expect(req.payload.maxLines).toBe(1);
        expect(req.payload.maxTokens).toBe(32);
        expect(req.payload.suffix).toBe("\n}");
      }
      return "while (/* 条件 */) {";
    });

    const result = await runInlineCompletionPipeline({
      mode: "adaptive",
      triggerKind: "manual",
      context: {
        language: "cpp",
        prefix: "void solve() {\n    ",
        suffix: "\n}"
      },
      transport
    });

    expect(result.status).toBe("accepted");
    expect(result.zone.zone).toBe("algo_core");
    expect(result.suggestion).toBe("while (/* 条件 */) {");
    expect(result.primaryPlaceholder).toMatchObject({
      text: "/* 条件 */",
      label: "条件",
      line: 0,
      startCharacter: 7,
      endCharacter: 15
    });
    expect(result.audit?.renderer).toBe("deepseek-fim");
    expect(result.safeAuditView?.route).toBe("autocomplete");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("prepares requests synchronously with debounce metadata and supports chat/anthropic/generic renderers", async () => {
    const prepared = prepareInlineCompletionRequest({
      mode: "adaptive",
      triggerKind: "automatic",
      renderer: "chat-messages",
      context: {
        language: "python",
        prefix: "from collections import deque\nq = deque()\nq.app",
        suffix: "\nprint(q)"
      }
    });

    expect(prepared.shouldInvokeTransport).toBe(true);
    expect(prepared.zone.zone).toBe("api_syntax");
    expect(prepared.trigger.debounceMs).toBe(500);
    expect(prepared.renderedRequest?.renderer).toBe("chat-messages");

    for (const renderer of [
      "deepseek-fim",
      "chat-messages",
      "anthropic-messages",
      "generic-completion"
    ] as const) {
      const res = await runInlineCompletionPipeline({
        mode: "fast-syntax",
        triggerKind: "automatic",
        renderer,
        context: {
          language: "python",
          prefix: "q = deque()\nq.app",
          suffix: ""
        },
        transport: async (req) => {
          expect(req.renderer).toBe(renderer);
          return "q.append(node)";
        }
      });
      expect(res.status).toBe("accepted");
      expect(res.suggestion).toBe("end(node)");
      expect(res.audit?.renderer).toBe(renderer);
    }
  });

  it("handles output rejection, empty response, abort signal, and redacted transport errors cleanly", async () => {
    // Rejected stealth loop in Neutral zone
    const rejected = await runInlineCompletionPipeline({
      mode: "adaptive",
      triggerKind: "automatic",
      context: {
        language: "cpp",
        prefix: "void helper(int n) {\n    int scale = ",
        suffix: "\n}"
      },
      transport: async () => "0; for (int i = 0; i < n; i++) dp[i] = dp[i-1] + 1;"
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectionReason).toBe("neutral-loop-state-update");

    // Empty output
    const empty = await runInlineCompletionPipeline({
      mode: "adaptive",
      triggerKind: "automatic",
      context: {
        language: "cpp",
        prefix: "#include <bits/",
        suffix: ""
      },
      transport: async () => "   "
    });
    expect(empty.status).toBe("empty");

    // Aborted before transport
    const ac = new AbortController();
    ac.abort();
    const transport = vi.fn(async () => "stdc++.h>");
    const aborted = await runInlineCompletionPipeline({
      mode: "adaptive",
      triggerKind: "automatic",
      context: {
        language: "cpp",
        prefix: "#include <bits/",
        suffix: ""
      },
      signal: ac.signal,
      transport
    });
    expect(aborted.status).toBe("aborted");
    expect(transport).not.toHaveBeenCalled();

    // Transport error redacts leaked API key
    const errored = await runInlineCompletionPipeline({
      mode: "adaptive",
      triggerKind: "automatic",
      context: {
        language: "cpp",
        prefix: "#include <bits/",
        suffix: ""
      },
      transport: async () => {
        throw new Error("401 Unauthorized for key sk-secret1234567890");
      }
    });
    expect(errored.status).toBe("transport-error");
    expect(errored.errorMessage).not.toContain("sk-secret1234567890");
    expect(errored.errorMessage).toContain("[REDACTED_KEY]");

    // Stop sequences omit single "\n" so leading-newline completions survive and trim cleanly
    const leadingNewline = await runInlineCompletionPipeline({
      mode: "adaptive",
      triggerKind: "automatic",
      context: {
        language: "cpp",
        prefix: "void helper(int n) {\n    int scale = ",
        suffix: "\n}"
      },
      transport: async (req) => {
        if (req.renderer === "deepseek-fim") {
          expect(req.payload.stop).not.toContain("\n");
        }
        return "\n    n * 2;";
      }
    });
    expect(leadingNewline.status).toBe("accepted");
    expect(leadingNewline.suggestion).toBe("n * 2;");
  });
});

import {
  ProblemAdapterError,
  type AdapterCapabilities,
  type ProblemDocument,
  type ProblemSourceAdapter
} from "../../core/contracts";

/**
 * Honest L2/L3 guided adapter for NowCoder (牛客).
 * NowCoder has no public anonymous statement API and relies on dynamic SPA + login/captcha walls.
 * Rather than shipping a brittle scraper or bypassing anti-bot checks, this adapter recognizes
 * NowCoder URLs/IDs and directs users cleanly to L2 Competitive Companion or L3 Clipboard/Markdown import.
 */
export class NowCoderAdapter implements ProblemSourceAdapter {
  readonly id = "nowcoder" as const;
  readonly displayName = "牛客 (NowCoder)";
  readonly capabilities: AdapterCapabilities = {
    search: false,
    problemLists: false,
    directStatementFetch: false,
    directSamplesFetch: false,
    ioModes: ["stdio"],
    supportsOptionalUserSession: false
  };

  canHandleUrl(url: string): boolean {
    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname.toLowerCase();
      if (host !== "ac.nowcoder.com" && host !== "www.nowcoder.com" && host !== "nowcoder.com") {
        return false;
      }
      return (
        /^\/acm\/problem\/\d+/i.test(parsed.pathname) ||
        /^\/acm\/contest\/\d+\/[A-Za-z0-9]+/i.test(parsed.pathname) ||
        /^\/practice\/[a-f0-9]+/i.test(parsed.pathname) ||
        /^\/questionTerminal\/[a-f0-9]+/i.test(parsed.pathname)
      );
    } catch {
      return false;
    }
  }

  resolveRef(input: string): { sourceId: string; canonicalUrl?: string } | null {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      if (!this.canHandleUrl(trimmed)) {
        return null;
      }
      const parsed = new URL(trimmed);

      const acmProb = parsed.pathname.match(/^\/acm\/problem\/(\d+)/i);
      if (acmProb?.[1]) {
        return {
          sourceId: `acm-${acmProb[1]}`,
          canonicalUrl: `https://ac.nowcoder.com/acm/problem/${acmProb[1]}`
        };
      }

      const acmContest = parsed.pathname.match(/^\/acm\/contest\/(\d+)\/([A-Za-z0-9]+)/i);
      if (acmContest?.[1] && acmContest?.[2]) {
        const letter = acmContest[2].toUpperCase();
        return {
          sourceId: `contest-${acmContest[1]}-${letter}`,
          canonicalUrl: `https://ac.nowcoder.com/acm/contest/${acmContest[1]}/${letter}`
        };
      }

      const practice = parsed.pathname.match(/^\/(?:practice|questionTerminal)\/([a-f0-9]+)/i);
      if (practice?.[1]) {
        const id = practice[1].toLowerCase();
        return {
          sourceId: `practice-${id}`,
          canonicalUrl: `https://www.nowcoder.com/practice/${id}`
        };
      }
      return null;
    }

    const prefix = trimmed.match(/^(?:nowcoder|nc):(.+)$/i);
    if (prefix?.[1]) {
      const body = prefix[1].trim();
      const acmNum = body.match(/^(?:acm-?)?(\d+)$/i);
      if (acmNum?.[1]) {
        return {
          sourceId: `acm-${acmNum[1]}`,
          canonicalUrl: `https://ac.nowcoder.com/acm/problem/${acmNum[1]}`
        };
      }
      const contest = body.match(/^contest-?(\d+)[/-]([A-Za-z0-9]+)$/i);
      if (contest?.[1] && contest?.[2]) {
        const letter = contest[2].toUpperCase();
        return {
          sourceId: `contest-${contest[1]}-${letter}`,
          canonicalUrl: `https://ac.nowcoder.com/acm/contest/${contest[1]}/${letter}`
        };
      }
      const practice = body.match(/^(?:practice-?)?([a-f0-9]{16,64})$/i);
      if (practice?.[1]) {
        const id = practice[1].toLowerCase();
        return {
          sourceId: `practice-${id}`,
          canonicalUrl: `https://www.nowcoder.com/practice/${id}`
        };
      }
    }

    return null;
  }

  async fetchProblem(
    ref: string,
    _opts?: { forceRefresh?: boolean; signal?: AbortSignal }
  ): Promise<ProblemDocument> {
    const resolved = this.resolveRef(ref);
    if (!resolved) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        "nowcoder",
        `Unrecognized NowCoder reference: "${ref}".`
      );
    }

    throw new ProblemAdapterError(
      "AUTH_REQUIRED",
      "nowcoder",
      `NowCoder (${resolved.canonicalUrl}) does not expose a public anonymous problem API. Use Competitive Companion (Localhost Bridge) from your logged-in browser or paste the problem text via Markdown/Clipboard import.`
    );
  }

  async healthCheck(): Promise<{ ok: boolean; code?: ProblemAdapterError["code"]; message?: string }> {
    return {
      ok: true,
      message:
        "NowCoder operates in guided L2/L3 mode: open the problem in your browser and send samples via Competitive Companion or import statement via Clipboard/Markdown."
    };
  }
}

import { ProblemAdapterError, type ProblemSourceId } from "../../core/contracts";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) AlgoCoach/0.2.0";

export const DEFAULT_HTTP_TIMEOUT_MS = 15_000;

export interface TimeoutSignalHandle {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
}

/**
 * Creates a composed AbortSignal that aborts when either the timeout expires
 * or the optional caller signal aborts. Always call `cleanup()` in a `finally` block.
 */
export function createTimeoutSignal(
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  callerSignal?: AbortSignal
): TimeoutSignalHandle {
  const controller = new AbortController();
  let timedOut = false;

  const onCallerAbort = (): void => {
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_HTTP_TIMEOUT_MS;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`Request timed out after ${effectiveTimeoutMs}ms`));
  }, effectiveTimeoutMs);

  if (
    typeof timer === "object" &&
    timer !== null &&
    "unref" in timer &&
    typeof (timer as { unref?: unknown }).unref === "function"
  ) {
    (timer as { unref: () => void }).unref();
  }

  const cleanup = (): void => {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  };

  return {
    signal: controller.signal,
    cleanup,
    didTimeout: () => timedOut
  };
}

/**
 * Executes `fetchImpl` with a composed timeout + caller AbortSignal and guaranteed timer cleanup.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
): Promise<Response> {
  const callerSignal = init?.signal ?? undefined;
  const { signal, cleanup, didTimeout } = createTimeoutSignal(timeoutMs, callerSignal);

  try {
    return await fetchImpl(url, {
      ...init,
      signal
    });
  } catch (error) {
    if (didTimeout()) {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    cleanup();
  }
}

const HARD_CHALLENGE_PATTERNS: readonly RegExp[] = [
  /cf-turnstile/i,
  /challenges\.cloudflare\.com\/turnstile/i,
  /\bid=["'](?:challenge-form|cf-challenge-running|challenge-running|challenge-error-title)["']/i,
  /\b(?:window\.)?_cf_chl_opt\b/i,
  /Attention Required!\s*\|\s*Cloudflare/i,
  /Checking (?:if the site connection is secure|your browser before accessing)/i,
  /Verify you are human/i,
  /Enable JavaScript and cookies to continue/i,
  /<title[^>]*>\s*(?:Just a moment\b|Attention Required!|安全验证|人机验证|滑动验证)/i,
  /\/cdn-cgi\/challenge-platform\/(?:[^"'<>]*\/)?orchestrate\/(?:chl_page|managed|jsch)/i
];

const SOFT_INTERSTITIAL_PATTERNS: readonly RegExp[] = [
  /Just a moment\.\.\./i,
  /(?:请完成安全验证|滑动验证|人机验证|行为验证码|acw_sc__v2|waf-captcha)/i
];

const KNOWN_SAFE_CONTENT_MARKERS: readonly string[] = [
  'id="lentille-context"',
  "id='lentille-context'",
  "window._feInjection",
  'id="task-statement"',
  "id='task-statement'",
  "subject-describe",
  "question-oi"
];

/**
 * Detects genuine Cloudflare / Turnstile / WAF anti-bot challenge responses while avoiding
 * false positives on normal pages carrying benign Cloudflare JS telemetry tags such as
 * `/cdn-cgi/challenge-platform/.../scripts/jsd`.
 */
export function isAntiBotChallenge(
  res: Response,
  body = "",
  expectedContentMarkers?: readonly string[]
): boolean {
  const cfMitigated = res.headers?.get?.("cf-mitigated")?.toLowerCase() ?? "";
  if (cfMitigated.includes("challenge")) {
    return true;
  }

  if (!body) {
    return false;
  }

  if (expectedContentMarkers?.some((marker) => marker.length > 0 && body.includes(marker))) {
    return false;
  }

  const hasKnownContent = KNOWN_SAFE_CONTENT_MARKERS.some((marker) => body.includes(marker));
  if (res.status === 200 && hasKnownContent) {
    return false;
  }

  // Strip benign Cloudflare JS detection beacon script references before pattern inspection
  const sanitized = body.replace(
    /\/cdn-cgi\/challenge-platform\/(?:[^"'<>\s]*\/)?scripts\/jsd[^"'<>\s]*/gi,
    ""
  );

  for (const pattern of HARD_CHALLENGE_PATTERNS) {
    if (pattern.test(sanitized)) {
      return true;
    }
  }

  if (res.status === 403 || res.status === 503 || sanitized.length < 20_000) {
    for (const pattern of SOFT_INTERSTITIAL_PATTERNS) {
      if (pattern.test(sanitized)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Maps non-2xx HTTP status codes to standardized `ProblemAdapterError` instances.
 */
export function mapHttpStatusError(
  source: ProblemSourceId,
  status: number,
  url: string,
  guidance?: string
): ProblemAdapterError {
  const suffix = guidance ? ` ${guidance}` : "";
  if (status === 404) {
    return new ProblemAdapterError(
      "NOT_FOUND",
      source,
      `Resource not found (HTTP 404): ${url}.${suffix}`
    );
  }
  if (status === 401) {
    return new ProblemAdapterError(
      "AUTH_REQUIRED",
      source,
      `Authentication required (HTTP 401) for ${url}.${suffix}`
    );
  }
  if (status === 403) {
    return new ProblemAdapterError(
      "ANTIBOT_BLOCKED",
      source,
      `Request blocked or forbidden (HTTP 403) for ${url}.${suffix}`
    );
  }
  if (status === 418 || status === 429 || status === 503) {
    return new ProblemAdapterError(
      "RATE_LIMITED",
      source,
      `Rate-limited or temporarily unavailable (HTTP ${status}) for ${url}.${suffix}`
    );
  }
  return new ProblemAdapterError(
    "NETWORK_ERROR",
    source,
    `HTTP request failed with status ${status} for ${url}.${suffix}`
  );
}

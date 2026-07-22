export interface AutocompleteRequestGateOptions {
  minAutomaticIntervalMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

export interface CachedAutocompleteSuggestion {
  key: string;
  suggestion: string;
}

interface LastSuccess {
  key: string;
  createdAt: number;
  suggestion: string;
}

export class AutocompleteRequestGate {
  private readonly minAutomaticIntervalMs: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private inFlight = false;
  private lastAutomaticRequestAt = 0;
  private lastSuccess: LastSuccess | undefined;

  constructor(options: AutocompleteRequestGateOptions = {}) {
    this.minAutomaticIntervalMs = options.minAutomaticIntervalMs ?? 1500;
    this.cacheTtlMs = options.cacheTtlMs ?? 5000;
    this.now = options.now ?? Date.now;
  }

  cachedSuggestion(key: string): CachedAutocompleteSuggestion | undefined {
    const current = this.now();
    if (this.lastSuccess && this.lastSuccess.key === key && current - this.lastSuccess.createdAt <= this.cacheTtlMs) {
      return {
        key,
        suggestion: this.lastSuccess.suggestion
      };
    }

    return undefined;
  }

  beginRequest(isExplicit: boolean): boolean {
    const current = this.now();
    if (this.inFlight) {
      return false;
    }
    if (!isExplicit && current - this.lastAutomaticRequestAt < this.minAutomaticIntervalMs) {
      return false;
    }

    this.inFlight = true;
    if (!isExplicit) {
      this.lastAutomaticRequestAt = current;
    }
    return true;
  }

  completeSuccess(key: string, suggestion: string): void {
    this.lastSuccess = {
      key,
      suggestion,
      createdAt: this.now()
    };
  }

  finishRequest(): void {
    this.inFlight = false;
  }
}

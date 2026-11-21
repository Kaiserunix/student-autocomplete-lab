import type { AutocompleteProviderConfig } from "../config/modelEnv";
import type { CodexOAuthProviderConfig, ModelRoute } from "../models/providerContracts";
import type { StudentSkill } from "../teaching/studentSkill";
import { buildAutocompleteInputFromText } from "./context";
import { inlineCompletionPresentation } from "./inlineCompletionPresentation";
import {
  requestMimoAutocompleteDetailed,
  type MimoAutocompleteInput,
  type MimoAutocompleteResult
} from "./mimoAutocomplete";
import { AutocompleteRequestGate } from "./requestGate";
import { isSupportedAutocompleteLanguage, shouldRequestInlineCompletion } from "./triggerPolicy";

export interface InlineCompletionEvent {
  type: "request" | "success" | "empty" | "rejected" | "error";
  message: string;
}

export interface InlineCursorPosition {
  line: number;
  character: number;
}

export interface InlineSelectedCompletion {
  text: string;
  rangeStartLine: number;
  rangeEndLine: number;
  rangeStartCharacter: number;
  rangeEndCharacter: number;
}

export interface InlineDocumentSnapshot {
  uri: string;
  filePath: string;
  languageId: string;
  version: number;
  lineTextAt(line: number): string;
  offsetAt(position: InlineCursorPosition): number;
  getText(): string;
}

export interface InlineCancellationToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export interface DecoupledInlineCompletionCandidate {
  insertText: string;
  useSelectedCompletionRange: boolean;
  filterText?: string;
}

export interface InlineCompletionEngineOptions {
  loadRoute: () => Promise<ModelRoute<AutocompleteProviderConfig | CodexOAuthProviderConfig>>;
  loadStudentSkill: () => Promise<StudentSkill>;
  requestAutocomplete?: (
    config: AutocompleteProviderConfig | CodexOAuthProviderConfig,
    input: MimoAutocompleteInput
  ) => Promise<MimoAutocompleteResult>;
  buildInput?: typeof buildAutocompleteInputFromText;
  onEvent?: (event: InlineCompletionEvent) => void;
  minAutomaticIntervalMs?: number;
  automaticDebounceMs?: number;
  cacheTtlMs?: number;
}

export interface InlineCompletionEngine {
  provideCompletion(
    document: InlineDocumentSnapshot,
    position: InlineCursorPosition,
    trigger: {
      explicit: boolean;
      selectedCompletion?: InlineSelectedCompletion;
    },
    token: InlineCancellationToken
  ): Promise<DecoupledInlineCompletionCandidate | undefined>;
}

export function createInlineCompletionEngine(
  options: InlineCompletionEngineOptions
): InlineCompletionEngine {
  const requestGate = new AutocompleteRequestGate({
    minAutomaticIntervalMs: options.minAutomaticIntervalMs ?? 0,
    cacheTtlMs: options.cacheTtlMs
  });
  const automaticDebounceMs = options.automaticDebounceMs ?? 350;
  const requestAutocomplete = options.requestAutocomplete ?? requestMimoAutocompleteDetailed;
  const buildInput = options.buildInput ?? buildAutocompleteInputFromText;

  return {
    async provideCompletion(document, position, trigger, token) {
      if (!isSupportedAutocompleteLanguage(document.languageId)) {
        return undefined;
      }
      if (token.isCancellationRequested) {
        return undefined;
      }

      const lineText = document.lineTextAt(position.line);
      const linePrefix = lineText.slice(0, position.character);
      const isExplicit = trigger.explicit;
      if (!shouldRequestInlineCompletion(linePrefix, { languageId: document.languageId, explicit: isExplicit })) {
        return undefined;
      }

      const requestKey = [
        document.uri,
        document.version,
        position.line,
        position.character,
        linePrefix
      ].join(":");
      const cached = requestGate.cachedSuggestion(requestKey);
      if (cached) {
        return resolveCompletionCandidate(cached.suggestion, lineText, linePrefix, position, trigger.selectedCompletion);
      }

      if (!isExplicit && !(await waitUnlessCancelled(automaticDebounceMs, token))) {
        return undefined;
      }
      if (!(await waitForRequestSlot(requestGate, isExplicit, token))) {
        return undefined;
      }

      const abortController = new AbortController();
      const cancellationSubscription = token.onCancellationRequested(() => abortController.abort());
      if (token.isCancellationRequested) {
        abortController.abort();
      }
      try {
        options.onEvent?.({
          type: "request",
          message: `${document.languageId} line ${position.line + 1}`
        });
        if (token.isCancellationRequested) {
          return undefined;
        }
        const route = await options.loadRoute();
        const studentSkill = await options.loadStudentSkill();
        const offset = document.offsetAt(position);
        const input = buildInput({
          text: document.getText(),
          offset,
          language: document.languageId,
          filePath: document.filePath
        });
        if (!input.prefix.trim()) {
          options.onEvent?.({
            type: "empty",
            message: "No student code context remained after autocomplete safety filtering."
          });
          return undefined;
        }

        const result = await requestAutocomplete(route.config, {
          ...input,
          studentSkill: studentSkill,
          capabilities: route.capabilities,
          signal: abortController.signal
        });

        if (token.isCancellationRequested) {
          return undefined;
        }
        if (result.status === "model-empty") {
          options.onEvent?.({
            type: "empty",
            message: "The autocomplete model returned no continuation."
          });
          return undefined;
        }
        if (result.status === "validator-rejected") {
          options.onEvent?.({
            type: "rejected",
            message: "Autocomplete output rejected by policy: " + (result.rejectionReason ?? "unknown")
          });
          return undefined;
        }

        requestGate.completeSuccess(requestKey, result.suggestion);
        const candidate = resolveCompletionCandidate(
          result.suggestion,
          lineText,
          linePrefix,
          position,
          trigger.selectedCompletion
        );
        if (!candidate) {
          options.onEvent?.({
            type: "empty",
            message: "The autocomplete result could not extend the current editor completion."
          });
          return undefined;
        }

        options.onEvent?.({
          type: "success",
          message: `${document.languageId} line ${position.line + 1} ${candidate.insertText.split(/\r?\n/).length} line(s)`
        });
        return candidate;
      } catch (error) {
        if (token.isCancellationRequested || abortController.signal.aborted || isAbortError(error)) {
          return undefined;
        }
        options.onEvent?.({
          type: "error",
          message: error instanceof Error ? error.message : String(error)
        });
        return undefined;
      } finally {
        cancellationSubscription.dispose();
        requestGate.finishRequest();
      }
    }
  };
}

export function resolveCompletionCandidate(
  suggestion: string,
  lineText: string,
  linePrefix: string,
  position: InlineCursorPosition,
  rawSelected?: InlineSelectedCompletion
): DecoupledInlineCompletionCandidate | undefined {
  const selectedCompletion = validSelectedCompletionAtPosition(rawSelected, position);
  if (rawSelected && !selectedCompletion) {
    return undefined;
  }

  const presentation = inlineCompletionPresentation({
    linePrefix,
    lineSuffix: lineText.slice(selectedCompletion?.rangeEndCharacter ?? position.character),
    suggestion,
    selectedCompletion: selectedCompletion
      ? {
          text: selectedCompletion.text,
          rangeStartCharacter: selectedCompletion.rangeStartCharacter
        }
      : undefined
  });
  if (!presentation) {
    return undefined;
  }

  let filterText: string | undefined;
  if (selectedCompletion) {
    const originalRangeText = lineText.slice(
      selectedCompletion.rangeStartCharacter,
      selectedCompletion.rangeEndCharacter
    );
    filterText = originalRangeText + presentation.insertText.slice(selectedCompletion.text.length);
  }

  return {
    insertText: presentation.insertText,
    useSelectedCompletionRange: Boolean(presentation.useSelectedCompletionRange && selectedCompletion),
    filterText
  };
}

function validSelectedCompletionAtPosition(
  selected: InlineSelectedCompletion | undefined,
  position: InlineCursorPosition
): InlineSelectedCompletion | undefined {
  if (
    !selected ||
    selected.rangeStartLine !== position.line ||
    selected.rangeEndLine !== position.line ||
    selected.rangeStartCharacter > position.character ||
    selected.rangeEndCharacter < position.character
  ) {
    return undefined;
  }
  return selected;
}

async function waitForRequestSlot(
  gate: AutocompleteRequestGate,
  isExplicit: boolean,
  token: InlineCancellationToken
): Promise<boolean> {
  do {
    if (token.isCancellationRequested) {
      return false;
    }
    if (gate.beginRequest(isExplicit)) {
      return true;
    }
    if (!(await waitUnlessCancelled(50, token))) {
      return false;
    }
  } while (true);
}

function waitUnlessCancelled(delayMs: number, token: InlineCancellationToken): Promise<boolean> {
  if (token.isCancellationRequested) {
    return Promise.resolve(false);
  }
  if (delayMs <= 0) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    let cancellation: { dispose(): void } | undefined;
    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cancellation?.dispose();
      resolve(value);
    };
    const timer = setTimeout(() => finish(true), delayMs);
    cancellation = token.onCancellationRequested(() => finish(false));
    if (settled) {
      cancellation.dispose();
    }
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

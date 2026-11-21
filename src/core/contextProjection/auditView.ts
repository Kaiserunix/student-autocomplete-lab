import type {
  ProjectedContextItem,
  ProjectionAudit,
  SupportedLanguage
} from "../contracts";

export interface SafeProjectionAuditView {
  route: ProjectionAudit["route"];
  language: SupportedLanguage;
  renderer: ProjectionAudit["renderer"];
  includedCount: number;
  excludedCount: number;
  projectedItemCount: number;
  includedRuleIds: string[];
  excludedRules: Array<{ id: string; reason: string }>;
  projectedItems: ProjectedContextItem[];
  characterBudgetUsed: number;
  characterBudgetMax: number;
  budgetRatio: number;
  redactedCount: number;
}

const MAX_AUDIT_LABEL_CHARS = 120;
const MAX_AUDIT_REASON_CHARS = 96;

const SECRET_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/g, replacement: "[REDACTED_KEY]" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, replacement: "[REDACTED_TOKEN]" },
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, replacement: "Bearer [REDACTED]" },
  {
    pattern: /\b(?:api[_-]?key|token|secret|LEETCODE_SESSION|csrftoken)\s*[:=]\s*[^\s,;'"`]+/gi,
    replacement: "[REDACTED_CREDENTIAL]"
  },
  {
    pattern: /[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\s"'`,;]+/g,
    replacement: "[REDACTED_PATH]"
  },
  {
    pattern: /(^|[\s"'`(])\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/[^\s"'`,;)]*)?/g,
    replacement: "$1[REDACTED_PATH]"
  },
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[REDACTED_EMAIL]"
  }
];

export function sanitizeAuditText(
  raw: string,
  maxChars = MAX_AUDIT_LABEL_CHARS
): { text: string; redacted: boolean } {
  let text = raw.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  let redacted = false;

  for (const { pattern, replacement } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      redacted = true;
      pattern.lastIndex = 0;
      text = text.replace(pattern, replacement);
    }
  }

  text = text.replace(/\s+/g, " ").trim();
  if (text.length > maxChars) {
    text = `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }

  return { text, redacted };
}

export function createSafeAuditView(
  audit: ProjectionAudit
): SafeProjectionAuditView {
  let redactedCount = 0;

  const safeProjectedItems: ProjectedContextItem[] = audit.projectedItems.map(
    (item) => {
      const labelResult = sanitizeAuditText(item.label, MAX_AUDIT_LABEL_CHARS);
      if (labelResult.redacted) {
        redactedCount += 1;
      }

      let safeSourceKey: string | undefined;
      if (item.sourceKey !== undefined) {
        const keyResult = sanitizeAuditText(
          item.sourceKey,
          MAX_AUDIT_REASON_CHARS
        );
        if (keyResult.redacted) {
          redactedCount += 1;
        }
        safeSourceKey = keyResult.text;
      }

      return {
        id: item.id,
        kind: item.kind,
        label: labelResult.text,
        sourceKey: safeSourceKey,
        muteable: item.muteable
      };
    }
  );

  const safeExcludedRules = audit.excludedRules.map((entry) => {
    const reasonResult = sanitizeAuditText(
      entry.reason,
      MAX_AUDIT_REASON_CHARS
    );
    if (reasonResult.redacted) {
      redactedCount += 1;
    }
    return {
      id: entry.id,
      reason: reasonResult.text
    };
  });

  const budgetRatio =
    audit.characterBudgetMax > 0
      ? Math.min(
          1,
          Math.round((audit.characterBudgetUsed / audit.characterBudgetMax) * 1000) /
            1000
        )
      : 0;

  return {
    route: audit.route,
    language: audit.language,
    renderer: audit.renderer,
    includedCount: audit.includedRuleIds.length,
    excludedCount: safeExcludedRules.length,
    projectedItemCount: safeProjectedItems.length,
    includedRuleIds: [...audit.includedRuleIds],
    excludedRules: safeExcludedRules,
    projectedItems: safeProjectedItems,
    characterBudgetUsed: audit.characterBudgetUsed,
    characterBudgetMax: audit.characterBudgetMax,
    budgetRatio,
    redactedCount
  };
}

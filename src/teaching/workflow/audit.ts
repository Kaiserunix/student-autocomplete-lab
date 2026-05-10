import type { TeachingWorkflowAudit } from "./schema";

export function buildTeachingWorkflowAudit(input: {
  action: string;
  included: string[];
  excluded: string[];
}): TeachingWorkflowAudit {
  return {
    action: input.action,
    included: uniqueSorted(input.included),
    excluded: uniqueSorted(input.excluded)
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}

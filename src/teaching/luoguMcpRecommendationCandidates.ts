import { recommendProblemsByPainPoint, searchLuoguProblemsForMcp } from "../mcp/problemSearchTools";
import type { RecommendationCandidateInput, RankedPainPoint } from "../recommendation/schema";

export interface LuoguMcpRecommendationCandidateResult {
  candidates: RecommendationCandidateInput[];
  searchHints: string[];
  queryCount: number;
  errorMessages: string[];
}

export async function buildLuoguMcpRecommendationCandidates(
  painPoints: Array<RankedPainPoint | string>,
  fetchImpl: typeof fetch = fetch
): Promise<LuoguMcpRecommendationCandidateResult> {
  const targetPainPoints =
    painPoints.length > 0 ? painPoints.slice(0, 2).map(getPainPointLabel) : ["needs_teacher_review"];
  const hintPainPointPairs = targetPainPoints.flatMap((painPoint) =>
    recommendProblemsByPainPoint({ painPoint, limit: 1 })
      .searchHints.slice(0, 2)
      .map((hint) => ({ hint, painPoint }))
  );
  const searchHints = unique(hintPainPointPairs.map((pair) => pair.hint)).slice(0, 4);
  const candidates = new Map<string, RecommendationCandidateInput>();
  const errorMessages: string[] = [];
  let queryCount = 0;

  for (const hint of searchHints) {
    const painPoint = hintPainPointPairs.find((pair) => pair.hint === hint)?.painPoint ?? "needs_teacher_review";
    try {
      const result = await searchLuoguProblemsForMcp({ keyword: hint, limit: 8 }, fetchImpl);
      queryCount += 1;
      for (const item of result.items) {
        const key = `${item.platform}:${item.id.toUpperCase()}`;
        const existing = candidates.get(key);
        candidates.set(key, {
          platform: item.platform,
          id: item.id,
          title: item.title,
          sourceUrl: item.sourceUrl,
          difficulty: item.difficulty,
          tags: item.tags,
          targetPainPoints: unique([...(existing?.targetPainPoints ?? []), painPoint]),
          reason: existing?.reason ?? `来自 Luogu MCP 搜索「${hint}」，用于补齐本地题库之外的候选。`
        });
      }
    } catch (error) {
      errorMessages.push(`${hint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    candidates: [...candidates.values()],
    searchHints,
    queryCount,
    errorMessages
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function getPainPointLabel(painPoint: RankedPainPoint | string): string {
  return typeof painPoint === "string" ? painPoint : painPoint.label;
}

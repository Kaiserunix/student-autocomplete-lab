export const formalSidebarDestinations = [
  { pageId: "aiPage", tabId: "tabAi", label: "作答现场" },
  { pageId: "problemPage", tabId: "tabProblem", label: "题目张贴板" },
  { pageId: "skillPage", tabId: "tabSkill", label: "学习档案" }
] as const;

export const formalSidebarLandmarkIds = [
  "sessionMasthead",
  "problemPoster",
  "learningDossier",
  "submissionDocket",
  "accountModelDrawer"
] as const;

export interface FrontendSource {
  name: string;
  source: string;
}

export function frontendCommentViolations(sources: readonly FrontendSource[]): string[] {
  const htmlMarker = ["<", "!", "-", "-"].join("");
  const blockMarker = ["/", "*"].join("");
  const lineMarker = ["/", "/"].join("");
  return sources.flatMap(({ name, source }) => {
    const violations: string[] = [];
    if (source.includes(htmlMarker)) {
      violations.push(`${name}:html`);
    }
    if (source.includes(blockMarker)) {
      violations.push(`${name}:block`);
    }
    if (source.split(/\r?\n/).some((line) => line.trimStart().startsWith(lineMarker))) {
      violations.push(`${name}:line`);
    }
    return violations;
  });
}

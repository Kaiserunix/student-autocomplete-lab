import { luoguSeedProblems } from "./seedLuogu";
import type { ProblemPlatform, SeedProblem } from "./types";

export { luoguSeedProblems };

export const seedProblems: SeedProblem[] = [...luoguSeedProblems];

export function findSeedProblem(platform: ProblemPlatform, id: string): SeedProblem | undefined {
  return seedProblems.find((problem) => problem.platform === platform && problem.id === id);
}

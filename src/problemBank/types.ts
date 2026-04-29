export type ProblemPlatform = "luogu" | "leetcode" | "manual";

export type SourcePolicyMode = "public-fetch" | "optional-adapter" | "manual-paste";

export interface SourcePolicy {
  platform: ProblemPlatform;
  primary: SourcePolicyMode;
  fallback: SourcePolicyMode;
  defaultEnabled: boolean;
  notes: string;
}

export interface SeedProblem {
  platform: ProblemPlatform;
  id: string;
  title: string;
  url: string;
  source: "user-supplied";
}

export interface ProblemSample {
  input: string;
  output: string;
}

export interface ProblemRecord {
  platform: ProblemPlatform;
  id: string;
  title: string;
  sourceUrl?: string;
  difficulty?: number;
  tags: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  samples: ProblemSample[];
  hint?: string;
}

export interface ProblemSetProblemSummary {
  id: string;
  title: string;
  sourceUrl: string;
  difficulty?: number;
  tags: string[];
}

export interface ProblemSetRecord {
  platform: ProblemPlatform;
  id: string;
  title: string;
  sourceUrl: string;
  description: string;
  problemCount: number;
  problems: ProblemSetProblemSummary[];
}

export type OfficialOjVerdict =
  | "AC"
  | "WA"
  | "CE"
  | "RE"
  | "TLE"
  | "MLE"
  | "OLE"
  | "PE"
  | "PARTIAL"
  | "SKIPPED"
  | "UNKNOWN";

export interface CodeforcesTarget {
  platform: "codeforces";
  contestKind: "contest" | "gym";
  contestId: number;
  problemIndex: string;
  canonicalUrl: string;
}

export interface EditorSubmissionIdentity {
  uri: string;
  filePath: string;
  version: number;
  languageId: string;
  codeSize: number;
}

export interface OjSubmissionPreview {
  confirmationId: string;
  problemKey: string;
  target: CodeforcesTarget;
  editor: EditorSubmissionIdentity;
  codeforcesHandle?: string;
  createdAt: string;
  expiresAt: string;
}

export type OjCliStatus = "submitted" | "login_required" | "unavailable" | "failed";

export interface OjCliResult {
  status: OjCliStatus;
  message: string;
  submissionUrl?: string;
}

export interface OjToolAvailability {
  available: boolean;
  message: string;
  version?: string;
}

export interface OjSubmissionResult {
  status: "submitted" | "judged" | "login_required" | "unavailable" | "failed";
  message: string;
  submissionUrl?: string;
  submissionId?: number;
  verdict?: OfficialOjVerdict;
  passedTestCount?: number;
}

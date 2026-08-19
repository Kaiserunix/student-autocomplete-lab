import type { OfficialOjVerdict, SubmissionTarget } from "../submission/types";

export type SubmissionMode = "demo" | "real";
export type DemoScenario = "accepted" | "wrong_answer" | "compile_error" | "unknown" | "login_required";
export type SubmissionJobState =
  | "created"
  | "submitting"
  | "queued"
  | "judging"
  | "submitted"
  | "accepted"
  | "rejected"
  | "unknown"
  | "failed";

export class OjConsoleError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "OjConsoleError";
  }
}

export interface SourceMetadata {
  sourceId: string;
  fileName: string;
  language: string;
  byteSize: number;
  digest: string;
  expiresAt: string;
}

export interface SourceRecord {
  metadata: SourceMetadata;
  bytes: Buffer;
  contentDigest: string;
}

export interface SubmissionPreview {
  confirmationId: string;
  mode: SubmissionMode;
  scenario?: DemoScenario;
  source: SourceMetadata;
  target: SubmissionTarget;
  codeforcesHandle?: string;
  createdAt: string;
  expiresAt: string;
  toolVersion?: string;
}

export interface SubmissionJobView {
  jobId: string;
  mode: SubmissionMode;
  scenario?: DemoScenario;
  state: SubmissionJobState;
  source: SourceMetadata;
  target: SubmissionTarget;
  codeforcesHandle?: string;
  createdAt: string;
  updatedAt: string;
  message: string;
  verdict?: OfficialOjVerdict;
  submissionUrl?: string;
  submissionId?: number;
  passedTestCount?: number;
}

export interface OjToolStatusView {
  available: boolean;
  message: string;
  version?: string;
}

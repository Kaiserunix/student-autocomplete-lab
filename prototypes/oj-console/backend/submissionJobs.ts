import { randomUUID } from "node:crypto";
import type { CodeforcesTarget, OfficialOjVerdict } from "../../../src/submission/types";
import {
  OjConsoleError,
  type DemoScenario,
  type SourceMetadata,
  type SubmissionJobState,
  type SubmissionJobView,
  type SubmissionMode
} from "./contracts";

export interface CreateSubmissionJobInput {
  mode: SubmissionMode;
  scenario?: DemoScenario;
  source: SourceMetadata;
  target: CodeforcesTarget;
  codeforcesHandle?: string;
}

export interface SubmissionJobPatch {
  state: SubmissionJobState;
  message: string;
  verdict?: OfficialOjVerdict;
  submissionUrl?: string;
  submissionId?: number;
  passedTestCount?: number;
}

export interface SubmissionJobStoreOptions {
  now?: () => number;
  createId?: () => string;
  onChange?: (view: SubmissionJobView) => void;
  maxJobs?: number;
  terminalTtlMs?: number;
}

const allowedTransitions: Record<SubmissionJobState, SubmissionJobState[]> = {
  created: ["submitting", "queued", "failed"],
  submitting: ["queued", "accepted", "rejected", "unknown", "failed"],
  queued: ["judging", "accepted", "rejected", "unknown", "failed"],
  judging: ["accepted", "rejected", "unknown", "failed"],
  accepted: [],
  rejected: [],
  unknown: [],
  failed: []
};

const terminalStates = new Set<SubmissionJobState>(["accepted", "rejected", "unknown", "failed"]);

export class SubmissionJobStore {
  private readonly records = new Map<string, SubmissionJobView>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly onChange?: (view: SubmissionJobView) => void;
  private readonly maxJobs: number;
  private readonly terminalTtlMs: number;

  public constructor(options: SubmissionJobStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    this.onChange = options.onChange;
    this.maxJobs = options.maxJobs ?? 32;
    this.terminalTtlMs = options.terminalTtlMs ?? 10 * 60_000;
  }

  public create(input: CreateSubmissionJobInput): SubmissionJobView {
    this.pruneExpiredTerminalJobs();
    if (this.records.size >= this.maxJobs) {
      throw new OjConsoleError("job_limit_reached", `本次运行的任务数量不能超过 ${this.maxJobs} 个。`, 409);
    }
    const now = new Date(this.now()).toISOString();
    const job: SubmissionJobView = {
      jobId: this.createId(),
      mode: input.mode,
      ...(input.scenario ? { scenario: input.scenario } : {}),
      state: "created",
      source: { ...input.source },
      target: { ...input.target },
      ...(input.codeforcesHandle ? { codeforcesHandle: input.codeforcesHandle } : {}),
      createdAt: now,
      updatedAt: now,
      message: "提交任务已创建。"
    };
    this.records.set(job.jobId, job);
    this.emit(job);
    return cloneJob(job);
  }

  public update(jobId: string, patch: SubmissionJobPatch): SubmissionJobView {
    const current = this.requireJob(jobId);
    if (!allowedTransitions[current.state].includes(patch.state)) {
      throw new OjConsoleError(
        "invalid_job_transition",
        `提交任务不能从 ${current.state} 变为 ${patch.state}。`,
        409
      );
    }
    const updated: SubmissionJobView = {
      ...current,
      ...patch,
      updatedAt: new Date(this.now()).toISOString()
    };
    this.records.set(jobId, updated);
    this.emit(updated);
    return cloneJob(updated);
  }

  public get(jobId: string): SubmissionJobView {
    return cloneJob(this.requireJob(jobId));
  }

  public count(): number {
    this.pruneExpiredTerminalJobs();
    return this.records.size;
  }

  private requireJob(jobId: string): SubmissionJobView {
    this.pruneExpiredTerminalJobs();
    const job = this.records.get(jobId);
    if (!job) {
      throw new OjConsoleError("job_missing", "找不到提交任务。", 404);
    }
    return job;
  }

  private pruneExpiredTerminalJobs(): void {
    const now = this.now();
    for (const [jobId, job] of this.records) {
      if (terminalStates.has(job.state) && now > Date.parse(job.updatedAt) + this.terminalTtlMs) {
        this.records.delete(jobId);
      }
    }
  }

  private emit(job: SubmissionJobView): void {
    this.onChange?.(cloneJob(job));
  }
}

function cloneJob(job: SubmissionJobView): SubmissionJobView {
  return {
    ...job,
    source: { ...job.source },
    target: { ...job.target }
  };
}

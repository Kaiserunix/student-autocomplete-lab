import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { loadModelEnv, requireMimoTeachingConfig } from "../config/modelEnv";
import type { ChatCompletionUsage } from "../models/chatCompletionsClient";
import { fetchLuoguProblemSet } from "../problemBank/luoguProblemSetClient";
import type { ProblemSetRecord } from "../problemBank/types";
import {
  buildJourneyDiagnosisCases,
  buildJourneyOptimizationCases,
  buildJourneyTeachingContext,
  JOURNEY_TRAINING_IDS,
  type JourneyTrialVariant,
  scoreJourneyDiagnosis,
  scoreJourneyOptimization
} from "../teaching/journeyTrial";
import { requestMimoTeachingDiagnosis } from "../teaching/mimoTeacher";
import { requestMimoOptimizationReport } from "../teaching/optimizationReport";
import { createEmptyStudentProfile, profileSummary, type StudentProfile } from "../teaching/studentProfile";
import { runTeachingCycle } from "../teaching/teachingCycle";
import {
  buildTransferValidationProbes,
  scoreTransferValidationProbe,
  summarizeTransferValidation,
  type TransferValidationSummary
} from "../teaching/transferValidation";

interface JourneyRunOutput {
  runIndex: number;
  diagnosisSteps: Array<Record<string, unknown>>;
  optimizationSteps: Array<Record<string, unknown>>;
  transferSteps: Array<Record<string, unknown>>;
  transferSummary: TransferValidationSummary;
  finalProfile: StudentProfile;
  readySkills: string[];
  usage: TokenUsageSummary;
  scores: {
    diagnosisPainPointAccuracy: number;
    diagnosisPrimaryPainPointAccuracy: number;
    diagnosisSkillCandidateAccuracy: number;
    optimizationVerdictAccuracy: number;
    transferPassRate: number;
  };
}

type JourneyProfileMode = "independent" | "carry";

interface TokenUsageSummary {
  callsWithUsage: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runs = readNumberArg(args, "--runs") ?? 3;
  const outPath = readStringArg(args, "--out") ?? path.join(".runtime", "mimo-journey-trial.json");
  const profileMode = readProfileMode(args);
  const variant = readVariant(args);
  const transferCheck = args.includes("--transfer-check");
  const config = requireMimoTeachingConfig(await loadModelEnv(path.join(process.cwd(), "secrets", "models.env")));
  const problemSets = await fetchJourneyProblemSets();
  const diagnosisCases = buildJourneyDiagnosisCases(problemSets, { variant });
  const transferCases = transferCheck ? buildTransferCases(problemSets, diagnosisCases) : [];
  const optimizationCases = buildJourneyOptimizationCases(problemSets);
  const outputs: JourneyRunOutput[] = [];
  let carriedProfile = createEmptyStudentProfile("mimo-journey-carry");

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const initialProfile =
      profileMode === "carry" ? carriedProfile : createEmptyStudentProfile(`mimo-journey-run-${runIndex + 1}`);
    const output = await runOneJourney(
      runIndex,
      config,
      diagnosisCases,
      optimizationCases,
      transferCases,
      initialProfile
    );
    outputs.push(output);

    if (profileMode === "carry") {
      carriedProfile = output.finalProfile;
    }
  }

  const output = {
    provider: "mimo-journey-trial",
    model: config.model,
    generatedAt: new Date().toISOString(),
    runs,
    profileMode,
    variant,
    transferCheck,
    trainingRange: `${JOURNEY_TRAINING_IDS[0]}-${JOURNEY_TRAINING_IDS[JOURNEY_TRAINING_IDS.length - 1]}`,
    diagnosisCaseCount: diagnosisCases.length,
    optimizationCaseCount: optimizationCases.length,
    transferCaseCount: transferCases.length,
    problemSets: problemSets.map((item) => ({
      id: item.id,
      title: item.title,
      problemCount: item.problemCount,
      usableProblems: item.problems.length
    })),
    aggregateUsage: aggregateUsage(outputs),
    aggregateScores: aggregateScores(outputs),
    outputs
  };

  const absoluteOutPath = path.resolve(process.cwd(), outPath);
  await mkdir(path.dirname(absoluteOutPath), { recursive: true });
  await writeFile(absoluteOutPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        provider: output.provider,
        model: output.model,
        runs,
        profileMode,
        variant,
        transferCheck,
        trainingRange: output.trainingRange,
        diagnosisCaseCount: output.diagnosisCaseCount,
        optimizationCaseCount: output.optimizationCaseCount,
        transferCaseCount: output.transferCaseCount,
        aggregateScores: output.aggregateScores,
        aggregateUsage: output.aggregateUsage,
        transferSummaryByRun: outputs.map((item) => item.transferSummary),
        readySkillsByRun: outputs.map((item) => item.readySkills),
        outPath
      },
      null,
      2
    )
  );
}

async function fetchJourneyProblemSets(): Promise<ProblemSetRecord[]> {
  const problemSets: ProblemSetRecord[] = [];
  for (const id of JOURNEY_TRAINING_IDS) {
    problemSets.push(await fetchLuoguProblemSet(id));
  }

  return problemSets;
}

function buildTransferCases(
  problemSets: ProblemSetRecord[],
  trainedCases: ReturnType<typeof buildJourneyDiagnosisCases>
): ReturnType<typeof buildJourneyDiagnosisCases> {
  const trainedCaseIds = new Set(trainedCases.map((item) => item.caseId));
  return buildJourneyDiagnosisCases(problemSets, { variant: "long" }).filter((item) => !trainedCaseIds.has(item.caseId));
}

async function runOneJourney(
  runIndex: number,
  config: ReturnType<typeof requireMimoTeachingConfig>,
  diagnosisCases: ReturnType<typeof buildJourneyDiagnosisCases>,
  optimizationCases: ReturnType<typeof buildJourneyOptimizationCases>,
  transferCases: ReturnType<typeof buildJourneyDiagnosisCases>,
  initialProfile: StudentProfile
): Promise<JourneyRunOutput> {
  let profile = initialProfile;
  const diagnosisSteps: JourneyRunOutput["diagnosisSteps"] = [];
  const optimizationSteps: JourneyRunOutput["optimizationSteps"] = [];
  const transferSteps: JourneyRunOutput["transferSteps"] = [];
  const usage = emptyUsageSummary();

  for (const [index, item] of diagnosisCases.entries()) {
    console.log(
      `[journey] run ${runIndex + 1} diagnosis ${index + 1}/${diagnosisCases.length} ${item.caseId} ${item.problemId}`
    );
    const context = buildJourneyTeachingContext(item, profileSummary(profile));
    let stepUsage: ChatCompletionUsage | undefined;
    const report = await requestMimoTeachingDiagnosis(config, context, fetch, (event) => {
      stepUsage = event;
      addUsage(usage, event);
    });
    const cycle = await runTeachingCycle(
      context,
      profile,
      async () => report,
      occurredAtForStep(runIndex, index)
    );
    profile = cycle.updatedProfile;
    const score = scoreJourneyDiagnosis(item, cycle.report);
    diagnosisSteps.push({
      index,
      trainingId: item.trainingId,
      trainingTitle: item.trainingTitle,
      stage: item.stage,
      caseId: item.caseId,
      problemId: item.problemId,
      problemTitle: item.problemTitle,
      score,
      report: cycle.report,
      usage: stepUsage,
      profileAfter: profileSummary(profile)
    });
  }

  const transferProbes = buildTransferValidationProbes(
    diagnosisCases,
    transferCases,
    profileSummary(profile).activeSkills,
    2
  );
  for (const [index, probe] of transferProbes.entries()) {
    console.log(
      `[journey] run ${runIndex + 1} transfer ${index + 1}/${transferProbes.length} ${probe.transferCase.caseId} ${probe.transferCase.problemId}`
    );
    const context = buildJourneyTeachingContext(probe.transferCase, profileSummary(profile));
    let stepUsage: ChatCompletionUsage | undefined;
    const report = await requestMimoTeachingDiagnosis(config, context, fetch, (event) => {
      stepUsage = event;
      addUsage(usage, event);
    });
    transferSteps.push({
      index,
      skillCandidate: probe.skillCandidate,
      trainedCaseIds: probe.trainedCaseIds,
      caseId: probe.transferCase.caseId,
      trainingId: probe.transferCase.trainingId,
      problemId: probe.transferCase.problemId,
      problemTitle: probe.transferCase.problemTitle,
      score: scoreTransferValidationProbe(probe, report),
      report,
      usage: stepUsage
    });
  }

  const profileAfterDiagnosis = profileSummary(profile);
  for (const [index, item] of optimizationCases.entries()) {
    console.log(
      `[journey] run ${runIndex + 1} optimization ${index + 1}/${optimizationCases.length} ${item.trainingId} ${item.problemId}`
    );
    let stepUsage: ChatCompletionUsage | undefined;
    const report = await requestMimoOptimizationReport(
      config,
      {
        problem: {
          id: item.problemId,
          title: item.problemTitle,
          summary: [
            `洛谷题单 ${item.trainingId}：${item.trainingTitle}`,
            "这是从小白到精英旅程内测的 AC 后优化复盘样本。"
          ].join("\n")
        },
        language: "python",
        studentCode: item.studentCode,
        archivedReason: item.archivedReason,
        previousScoreSummary: item.previousScoreSummary,
        studentProfile: profileAfterDiagnosis,
        studentRequest: item.studentRequest
      },
      fetch,
      (event) => {
        stepUsage = event;
        addUsage(usage, event);
      }
    );
    optimizationSteps.push({
      index,
      trainingId: item.trainingId,
      trainingTitle: item.trainingTitle,
      problemId: item.problemId,
      problemTitle: item.problemTitle,
      score: scoreJourneyOptimization(item, report),
      report,
      usage: stepUsage
    });
  }

  return {
    runIndex,
    diagnosisSteps,
    optimizationSteps,
    transferSteps,
    transferSummary: summarizeTransferValidation(
      transferSteps.map((step) => step.score as ReturnType<typeof scoreTransferValidationProbe>)
    ),
    finalProfile: profile,
    readySkills: profileSummary(profile).activeSkills,
    usage,
    scores: {
      diagnosisPainPointAccuracy: ratio(
        diagnosisSteps.filter((step) => (step.score as { painPointHit: boolean }).painPointHit).length,
        diagnosisSteps.length
      ),
      diagnosisPrimaryPainPointAccuracy: ratio(
        diagnosisSteps.filter((step) => (step.score as { primaryPainPointHit: boolean }).primaryPainPointHit).length,
        diagnosisSteps.length
      ),
      diagnosisSkillCandidateAccuracy: ratio(
        diagnosisSteps.filter((step) => (step.score as { skillCandidateHit: boolean }).skillCandidateHit).length,
        diagnosisSteps.length
      ),
      optimizationVerdictAccuracy: ratio(
        optimizationSteps.filter((step) => (step.score as { verdictHit: boolean }).verdictHit).length,
        optimizationSteps.length
      ),
      transferPassRate: summarizeTransferValidation(
        transferSteps.map((step) => step.score as ReturnType<typeof scoreTransferValidationProbe>)
      ).transferPassRate
    }
  };
}

function aggregateUsage(outputs: JourneyRunOutput[]): TokenUsageSummary {
  return outputs.reduce((summary, output) => mergeUsage(summary, output.usage), emptyUsageSummary());
}

function emptyUsageSummary(): TokenUsageSummary {
  return {
    callsWithUsage: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };
}

function mergeUsage(left: TokenUsageSummary, right: TokenUsageSummary): TokenUsageSummary {
  return {
    callsWithUsage: left.callsWithUsage + right.callsWithUsage,
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    totalTokens: left.totalTokens + right.totalTokens
  };
}

function addUsage(summary: TokenUsageSummary, usage: ChatCompletionUsage): void {
  summary.callsWithUsage += 1;
  summary.promptTokens += usage.promptTokens ?? usage.inputTokens ?? 0;
  summary.completionTokens += usage.completionTokens ?? usage.outputTokens ?? 0;
  summary.totalTokens +=
    usage.totalTokens ??
    (usage.promptTokens ?? usage.inputTokens ?? 0) + (usage.completionTokens ?? usage.outputTokens ?? 0);
}

function aggregateScores(outputs: JourneyRunOutput[]): JourneyRunOutput["scores"] {
  return {
    diagnosisPainPointAccuracy: average(outputs.map((item) => item.scores.diagnosisPainPointAccuracy)),
    diagnosisPrimaryPainPointAccuracy: average(outputs.map((item) => item.scores.diagnosisPrimaryPainPointAccuracy)),
    diagnosisSkillCandidateAccuracy: average(outputs.map((item) => item.scores.diagnosisSkillCandidateAccuracy)),
    optimizationVerdictAccuracy: average(outputs.map((item) => item.scores.optimizationVerdictAccuracy)),
    transferPassRate: ratio(
      outputs.reduce((sum, item) => sum + item.transferSummary.passedCount, 0),
      outputs.reduce((sum, item) => sum + item.transferSummary.probeCount, 0)
    )
  };
}

function occurredAtForStep(runIndex: number, stepIndex: number): string {
  const date = new Date("2026-04-30T00:00:00.000Z");
  date.setMinutes(runIndex * 60 + stepIndex);
  return date.toISOString();
}

function ratio(hitCount: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Math.round((hitCount / total) * 1000) / 1000;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) / 1000;
}

function readStringArg(args: string[], name: string): string | undefined {
  const flagIndex = args.findIndex((arg) => arg === name);
  if (flagIndex >= 0) {
    return args[flagIndex + 1];
  }

  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

function readNumberArg(args: string[], name: string): number | undefined {
  const value = readStringArg(args, name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readProfileMode(args: string[]): JourneyProfileMode {
  const raw = readStringArg(args, "--profile-mode") ?? "independent";
  if (raw === "independent" || raw === "carry") {
    return raw;
  }

  throw new Error("--profile-mode must be independent or carry.");
}

function readVariant(args: string[]): JourneyTrialVariant {
  const raw = readStringArg(args, "--variant") ?? "standard";
  if (raw === "standard" || raw === "long") {
    return raw;
  }

  throw new Error("--variant must be standard or long.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

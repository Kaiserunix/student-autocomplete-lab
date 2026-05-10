import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { loadModelEnv, requireMimoTeachingConfig } from "../config/modelEnv";
import { requestMimoTeachingDiagnosis } from "../teaching/mimoTeacher";
import {
  generateLongitudinalSelfEvolutionSamples,
  runLongitudinalSelfEvolutionBatch,
  selectLongitudinalBatch,
  type LongitudinalDiagnose,
  type RunLongitudinalSelfEvolutionOptions
} from "../teaching/longitudinalSelfEvolution";

type LongitudinalProvider = "fixture" | "mimo" | "auto";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const count = readNumberArg(args, "--count") ?? 1000;
  const offset = readNumberArg(args, "--offset") ?? 0;
  const limit = readNumberArg(args, "--limit") ?? 25;
  const provider = (readStringArg(args, "--provider") as LongitudinalProvider | undefined) ?? "fixture";
  const retries = readNumberArg(args, "--retries") ?? 1;
  const studentId = readStringArg(args, "--student-id") ?? "longitudinal-mimo-student";
  const resumeFrom = readStringArg(args, "--resume-from");
  const stamp = new Date().toISOString().replace(/[^0-9A-Za-z._-]/g, "-");
  const outPath =
    readStringArg(args, "--out") ?? path.join(".runtime", "longitudinal-self-evolution", `run-${stamp}.json`);
  const summaryOutPath = readStringArg(args, "--summary-out");
  const samplesOutPath =
    readStringArg(args, "--samples-out") ??
    path.join(".runtime", "longitudinal-self-evolution", `samples-${count}.json`);

  const samples = generateLongitudinalSelfEvolutionSamples(count);
  const batch = selectLongitudinalBatch(samples, { offset, limit });
  const teacher = await resolveTeacher(provider, retries);
  const resumeState = resumeFrom ? await readResumeState(path.resolve(process.cwd(), resumeFrom)) : undefined;
  const result = await runLongitudinalSelfEvolutionBatch(batch, {
    studentId,
    profile: resumeState?.profile,
    studentSkill: resumeState?.studentSkill,
    occurredAt: "2026-05-01T00:00:00.000Z",
    patchSource: teacher.model ?? teacher.name,
    diagnose: teacher.diagnose
  });

  const output = {
    provider: "longitudinal-self-evolution-cli",
    teacherProvider: teacher.name,
    model: teacher.model,
    count,
    offset,
    limit,
    retries,
    resumeFrom,
    batchStart: batch[0]?.sampleId,
    batchEnd: batch.at(-1)?.sampleId,
    result
  };

  if (!args.includes("--no-write")) {
    await writeJson(path.resolve(process.cwd(), samplesOutPath), {
      schemaVersion: 1,
      provider: "longitudinal-self-evolution-samples",
      count: samples.length,
      samples
    });
    await writeJson(path.resolve(process.cwd(), outPath), output);
    if (summaryOutPath) {
      await writeJson(path.resolve(process.cwd(), summaryOutPath), {
        schemaVersion: 1,
        provider: "longitudinal-self-evolution-mismatch-summary",
        teacherProvider: teacher.name,
        model: teacher.model,
        count,
        offset,
        limit,
        batchStart: batch[0]?.sampleId,
        batchEnd: batch.at(-1)?.sampleId,
        scores: result.scores,
        usage: result.usage,
        mismatchSummary: result.mismatchSummary
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        provider: output.provider,
        teacherProvider: output.teacherProvider,
        model: output.model,
        count,
        offset,
        limit,
        batchStart: output.batchStart,
        batchEnd: output.batchEnd,
        scores: result.scores,
        errorCount: result.errorCount,
        usage: result.usage,
        mismatchSummary: {
          skillMismatchPairs: result.mismatchSummary.skillMismatchPairs.slice(0, 5),
          primaryPainPointMismatchPairs: result.mismatchSummary.primaryPainPointMismatchPairs.slice(0, 5),
          recommendationMismatchPairs: result.mismatchSummary.recommendationMismatchPairs.slice(0, 5),
          providerErrorCount: result.mismatchSummary.providerErrorCount,
          jsonRetryOrParseErrorCount: result.mismatchSummary.jsonRetryOrParseErrorCount
        },
        finalStudentSkillRevision: result.finalStudentSkill.revision,
        activeSkills: Object.values(result.finalStudentSkill.skills)
          .filter((entry) => entry.status === "active" || entry.status === "mastered")
          .map((entry) => entry.name)
          .sort(),
        outPath: args.includes("--no-write") ? undefined : outPath,
        summaryOutPath: args.includes("--no-write") ? undefined : summaryOutPath,
        samplesOutPath: args.includes("--no-write") ? undefined : samplesOutPath
      },
      null,
      2
    )
  );
}

async function resolveTeacher(provider: LongitudinalProvider, retries: number): Promise<{
  name: "fixture" | "mimo-live";
  model?: string;
  diagnose?: LongitudinalDiagnose;
}> {
  if (provider === "fixture") {
    return { name: "fixture" };
  }

  const config = await tryLoadMimoTeachingConfig();
  if (config) {
    return {
      name: "mimo-live",
      model: config.model,
      diagnose: async (_sample, context, onUsage) => {
        let lastError: unknown;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
          try {
            return await requestMimoTeachingDiagnosis(config, context, fetch, onUsage);
          } catch (error) {
            lastError = error;
            if (attempt >= retries) {
              throw error;
            }
            console.warn(
              `[longitudinal] MiMo diagnosis retry ${attempt + 1}/${retries}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            await delay(500 * (attempt + 1));
          }
        }

        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
    };
  }

  if (provider === "mimo") {
    throw new Error("MiMo live longitudinal run requested, but secrets/models.env is missing MiMo teaching config.");
  }

  return { name: "fixture" };
}

async function tryLoadMimoTeachingConfig(): Promise<ReturnType<typeof requireMimoTeachingConfig> | undefined> {
  try {
    return requireMimoTeachingConfig(await loadModelEnv(path.join(process.cwd(), "secrets", "models.env")));
  } catch {
    return undefined;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readResumeState(filePath: string): Promise<{
  profile: RunLongitudinalSelfEvolutionOptions["profile"];
  studentSkill: RunLongitudinalSelfEvolutionOptions["studentSkill"];
}> {
  const root = JSON.parse(await readFile(filePath, "utf8")) as {
    result?: {
      finalProfile?: RunLongitudinalSelfEvolutionOptions["profile"];
      finalStudentSkill?: RunLongitudinalSelfEvolutionOptions["studentSkill"];
    };
  };
  if (!root.result?.finalProfile || !root.result?.finalStudentSkill) {
    throw new Error(`--resume-from does not contain result.finalProfile and result.finalStudentSkill: ${filePath}`);
  }

  return {
    profile: root.result.finalProfile,
    studentSkill: root.result.finalStudentSkill
  };
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
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

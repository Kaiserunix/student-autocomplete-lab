import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { loadModelEnv, requireMimoTeachingConfig } from "../config/modelEnv";
import { requestMimoTeachingDiagnosis } from "../teaching/mimoTeacher";
import { evaluateSelfEvolutionTrial } from "../teaching/selfEvolutionEval";
import {
  diagnoseFromSelfEvolutionSample,
  loadSelfEvolutionSamples,
  runSelfEvolutionTrial,
  SelfEvolutionDiagnose
} from "../teaching/selfEvolutionTrial";

type EvalProvider = "fixture" | "mimo" | "auto";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const samplesPath = readStringArg(args, "--samples") ?? path.join("fixtures", "practice", "self-evolution", "wrong-python-samples.json");
  const provider = (readStringArg(args, "--provider") as EvalProvider | undefined) ?? "fixture";
  const focus = readStringArg(args, "--focus");
  const repeat = readNumberArg(args, "--repeat") ?? 1;
  const limit = readNumberArg(args, "--limit");
  const outPath = readStringArg(args, "--out") ?? path.join(".runtime", "self-evolution-eval.json");

  const samples = await loadSelfEvolutionSamples(path.resolve(process.cwd(), samplesPath));
  const selectedSamples = selectSamples(samples, focus, repeat, limit);
  const teacher = await resolveTeacher(provider);
  const trial = await runSelfEvolutionTrial(selectedSamples, {
    studentId: "self-evolution-eval-cli",
    occurredAt: "2026-04-30T00:00:00.000Z",
    diagnose: teacher.diagnose
  });
  const evaluation = evaluateSelfEvolutionTrial(selectedSamples, trial);

  const output = {
    provider: "self-evolution-eval-cli",
    teacherProvider: teacher.name,
    model: teacher.model,
    samplesPath,
    focus,
    repeat,
    limit,
    trial,
    evaluation
  };

  if (!args.includes("--no-write")) {
    const absoluteOutPath = path.resolve(process.cwd(), outPath);
    await mkdir(path.dirname(absoluteOutPath), { recursive: true });
    await writeFile(absoluteOutPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        provider: output.provider,
        teacherProvider: output.teacherProvider,
        model: output.model,
        samples: evaluation.sampleCount,
        scores: evaluation.scores,
        biasRecordCount: evaluation.biasRecords.length,
        promptPatchCandidates: evaluation.promptPatchCandidates,
        outPath: args.includes("--no-write") ? undefined : outPath
      },
      null,
      2
    )
  );
}

async function resolveTeacher(provider: EvalProvider): Promise<{
  name: "fixture" | "mimo-live";
  model?: string;
  diagnose: SelfEvolutionDiagnose;
}> {
  if (provider === "fixture") {
    return { name: "fixture", diagnose: diagnoseFromSelfEvolutionSample };
  }

  const config = await tryLoadMimoTeachingConfig();
  if (config) {
    return {
      name: "mimo-live",
      model: config.model,
      diagnose: (_sample, context) => requestMimoTeachingDiagnosis(config, context)
    };
  }

  if (provider === "mimo") {
    throw new Error("MiMo live eval requested, but secrets/models.env is missing MiMo teaching config.");
  }

  return { name: "fixture", diagnose: diagnoseFromSelfEvolutionSample };
}

async function tryLoadMimoTeachingConfig(): Promise<ReturnType<typeof requireMimoTeachingConfig> | undefined> {
  try {
    return requireMimoTeachingConfig(await loadModelEnv(path.join(process.cwd(), "secrets", "models.env")));
  } catch {
    return undefined;
  }
}

function selectSamples<T extends { problemId: string; painPoint: string }>(
  samples: T[],
  focus: string | undefined,
  repeat: number,
  limit: number | undefined
): T[] {
  const focused = focus
    ? samples.filter((sample) => sample.problemId === focus || sample.painPoint === focus)
    : samples;

  if (focused.length === 0) {
    throw new Error(`No self-evolution samples matched focus ${focus}.`);
  }

  const repeated = Array.from({ length: repeat }, () => focused).flat();
  return typeof limit === "number" ? repeated.slice(0, limit) : repeated;
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

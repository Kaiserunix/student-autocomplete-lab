import * as path from "node:path";
import { loadModelEnv, requireMimoTeachingConfig } from "../config/modelEnv";
import { buildFixtureTeachingContext } from "../teaching/fixtureTeachingContext";
import { requestMimoTeachingDiagnosis } from "../teaching/mimoTeacher";
import { loadStudentProfile, saveStudentProfile } from "../teaching/studentProfileStore";
import { stubTeachingDiagnosis } from "../teaching/stubTeacher";
import { runTeachingCycle } from "../teaching/teachingCycle";
import { TeachingDiagnosisContext } from "../teaching/types";

type TeacherProvider = "auto" | "live" | "stub";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fixturePath = readStringArg(args, "--fixture") ?? path.join("fixtures", "practice", "P1030.codex.json");
  const wrongIndex = readNumberArg(args, "--wrong-index") ?? 0;
  const provider = (readStringArg(args, "--provider") as TeacherProvider | undefined) ?? "auto";
  const profilePath = readStringArg(args, "--profile") ?? path.join(".runtime", "student_profile.json");
  const profile = await loadStudentProfile(path.resolve(process.cwd(), profilePath));
  const context = await buildFixtureTeachingContext(fixturePath, wrongIndex, profile);
  const teacher = await resolveTeacher(provider);
  const result = await runTeachingCycle(context, profile, teacher.diagnose);

  if (!args.includes("--no-write-profile")) {
    await saveStudentProfile(path.resolve(process.cwd(), profilePath), result.updatedProfile);
  }

  console.log(
    JSON.stringify(
      {
        provider: "mimo-teacher",
        teacherProvider: teacher.name,
        model: teacher.model,
        fixturePath,
        wrongIndex,
        profilePath: args.includes("--no-write-profile") ? undefined : profilePath,
        report: result.report,
        updatedProfile: result.updatedProfile
      },
      null,
      2
    )
  );
}

async function resolveTeacher(provider: TeacherProvider): Promise<{
  name: "mimo-live" | "stub";
  model?: string;
  diagnose: (context: TeachingDiagnosisContext) => Promise<ReturnType<typeof stubTeachingDiagnosis> extends Promise<infer T> ? T : never>;
}> {
  if (provider === "stub") {
    return { name: "stub", diagnose: stubTeachingDiagnosis };
  }

  const config = await tryLoadMimoTeachingConfig();
  if (config) {
    return {
      name: "mimo-live",
      model: config.model,
      diagnose: (context) => requestMimoTeachingDiagnosis(config, context)
    };
  }

  if (provider === "live") {
    throw new Error("MiMo live teaching requested, but secrets/models.env is missing MiMo teaching config.");
  }

  return { name: "stub", diagnose: stubTeachingDiagnosis };
}

async function tryLoadMimoTeachingConfig(): Promise<ReturnType<typeof requireMimoTeachingConfig> | undefined> {
  try {
    return requireMimoTeachingConfig(await loadModelEnv(path.join(process.cwd(), "secrets", "models.env")));
  } catch {
    return undefined;
  }
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
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }

  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

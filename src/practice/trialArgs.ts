import { PracticeTrialOptions } from "./trialPlan";

export interface PracticeTrialCliOptions extends PracticeTrialOptions {
  baseUrl: string;
  apiKey?: string;
  maxOutputTokens: number;
  temperature: number;
}

const DEFAULT_TRIAL_PROBLEM = {
  problemId: "P1427",
  title: "小鱼的数字游戏",
  statement: "输入一串整数，以 0 结束，倒序输出 0 之前的数。",
  language: "python",
  targetPainPoints: ["output_order", "loop_boundary", "sentinel_input"]
};

export function readPracticeTrialArgs(
  args: string[],
  env: Record<string, string | undefined> = process.env
): PracticeTrialCliOptions {
  const apiKey = env.OPENAI_API_KEY;
  const maxOutputTokens = readNumberFlag(args, "--max-output-tokens") ?? 1_600;

  return {
    ...DEFAULT_TRIAL_PROBLEM,
    problemId: readStringFlag(args, "--problem-id") ?? DEFAULT_TRIAL_PROBLEM.problemId,
    title: readStringFlag(args, "--title") ?? DEFAULT_TRIAL_PROBLEM.title,
    statement: readStringFlag(args, "--statement") ?? DEFAULT_TRIAL_PROBLEM.statement,
    language: readStringFlag(args, "--language") ?? DEFAULT_TRIAL_PROBLEM.language,
    targetPainPoints: readPainPoints(args) ?? DEFAULT_TRIAL_PROBLEM.targetPainPoints,
    model: readStringFlag(args, "--model"),
    maxUsd: readNumberFlag(args, "--max-usd"),
    estimatedOutputTokens: maxOutputTokens,
    spend: args.includes("--spend"),
    apiKeyPresent: Boolean(apiKey),
    apiKey,
    baseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    maxOutputTokens,
    temperature: readNumberFlag(args, "--temperature") ?? 0.2
  };
}

function readPainPoints(args: string[]): string[] | undefined {
  const value = readStringFlag(args, "--pain-points");
  if (!value) {
    return undefined;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readStringFlag(args: string[], name: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.findIndex((arg) => arg === name);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

function readNumberFlag(args: string[], name: string): number | undefined {
  const value = readStringFlag(args, name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }

  return parsed;
}

import * as path from "node:path";
import { requestMimoAutocomplete } from "../autocomplete/mimoAutocomplete";
import { loadModelEnv, requireMimoAutocompleteConfig, withModelOverride } from "../config/modelEnv";

async function main(): Promise<void> {
  const envPath = path.join(process.cwd(), "secrets", "models.env");
  const modelOverride = readModelArg(process.argv.slice(2));
  const config = withModelOverride(requireMimoAutocompleteConfig(await loadModelEnv(envPath)), modelOverride);
  const prefix = [
    "import sys",
    "input = sys.stdin.readline",
    "",
    "def add(a, b):",
    "    "
  ].join("\n");
  const filtered = await requestMimoAutocomplete(config, {
    prefix,
    suffix: "\nprint(add(1, 2))\n",
    language: "python",
    filePath: "trial.py",
    habits: ["Prefer direct Python OJ style.", "Return only the immediate local continuation."]
  });
  console.log(JSON.stringify({ provider: "mimo", model: config.model, filtered }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

function readModelArg(args: string[]): string | undefined {
  const modelFlagIndex = args.findIndex((arg) => arg === "--model");
  if (modelFlagIndex >= 0) {
    return args[modelFlagIndex + 1];
  }

  const inlineModel = args.find((arg) => arg.startsWith("--model="));
  return inlineModel?.slice("--model=".length);
}

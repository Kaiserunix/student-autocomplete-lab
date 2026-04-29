import * as path from "node:path";
import { loadPracticeFixture } from "../practice/fixtureStore";
import { summarizePracticeReport } from "../practice/practiceSummary";

async function main(): Promise<void> {
  const fixturePath = readFixtureArg(process.argv.slice(2)) ?? path.join("fixtures", "practice", "P1427.codex.json");
  const report = await loadPracticeFixture(path.resolve(process.cwd(), fixturePath));
  const summary = summarizePracticeReport(report);

  console.log(
    JSON.stringify(
      {
        provider: "codex-subagent",
        fixturePath,
        dryRun: false,
        report,
        summary
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

function readFixtureArg(args: string[]): string | undefined {
  const flagIndex = args.findIndex((arg) => arg === "--fixture");
  if (flagIndex >= 0) {
    return args[flagIndex + 1];
  }

  const inline = args.find((arg) => arg.startsWith("--fixture="));
  return inline?.slice("--fixture=".length);
}

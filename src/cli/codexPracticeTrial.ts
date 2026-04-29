import * as path from "node:path";
import { loadPracticeFixture } from "../practice/fixtureStore";
import { appendLearningEvents } from "../practice/learningEventStore";
import { summarizePracticeReport } from "../practice/practiceSummary";
import { verifyPracticeReport } from "../practice/practiceVerifier";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fixturePaths = readFixtureArgs(args);
  const writeEventsPath = readStringArg(args, "--write-events");
  const results = [];
  let learningEventCount = 0;

  for (const fixturePath of fixturePaths) {
    const report = await loadPracticeFixture(path.resolve(process.cwd(), fixturePath));
    const summary = summarizePracticeReport(report);
    const verification = await verifyPracticeReport(report);
    learningEventCount += verification.learningEvents.length;

    if (writeEventsPath) {
      await appendLearningEvents(path.resolve(process.cwd(), writeEventsPath), verification.learningEvents);
    }

    results.push({
      fixturePath,
      report,
      summary,
      verification
    });
  }

  console.log(
    JSON.stringify(
      {
        provider: "codex-subagent",
        fixtureCount: results.length,
        dryRun: false,
        writeEventsPath,
        learningEventCount,
        results
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

function readFixtureArgs(args: string[]): string[] {
  const values: string[] = [];

  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--fixture") {
      values.push(args[index + 1]);
    }

    if (args[index].startsWith("--fixture=")) {
      values.push(args[index].slice("--fixture=".length));
    }
  }

  return values.length > 0 ? values : [path.join("fixtures", "practice", "P1427.codex.json")];
}

function readStringArg(args: string[], name: string): string | undefined {
  const flagIndex = args.findIndex((arg) => arg === name);
  if (flagIndex >= 0) {
    return args[flagIndex + 1];
  }

  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

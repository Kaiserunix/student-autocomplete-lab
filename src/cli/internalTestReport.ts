import { readJsonlRecords } from "../storage/jsonlStore";
import { summarizeInternalTestEvents, type InternalTestEvent } from "../internalTesting/internalTestRecorder";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const eventsPath = valueAfter(args, "--events");
  const format = valueAfter(args, "--format") ?? "json";

  if (!eventsPath) {
    throw new Error("Usage: node dist/src/cli/internalTestReport.js --events <internalTestEvents.jsonl> [--format json|markdown]");
  }

  const events = await readJsonlRecords<InternalTestEvent>(eventsPath);
  const summary = summarizeInternalTestEvents(events, { enabled: true, eventsPath });

  if (format === "markdown") {
    console.log(`# Student Autocomplete Lab 内测摘要`);
    console.log("");
    console.log(`- 事件数：${summary.totalEvents}`);
    console.log(`- 题目数：${summary.problemCount}`);
    console.log(`- 提示次数：${summary.hintCount}`);
    console.log(`- 放弃/讲解次数：${summary.giveUpCount}`);
    console.log(`- 学习评分次数：${summary.solutionScoreCount}`);
    console.log(`- 用户纠偏次数：${summary.skillFeedbackCount}`);
    console.log(`- 推荐次数：${summary.recommendationCount}`);
    console.log(`- 补全请求次数：${summary.autocompleteRequestCount}`);
    console.log(`- 模型：${summary.models.join(", ") || "未记录"}`);
    console.log(`- 记录文件：${summary.eventsPath}`);
    console.log("");
    console.log(summary.privacyNotice);
    return;
  }

  console.log(JSON.stringify(summary, null, 2));
}

function valueAfter(args: string[], key: string): string | undefined {
  const index = args.indexOf(key);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

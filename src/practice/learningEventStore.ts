import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { formatLearningEventsJsonl, LearningEvent } from "./learningEvents";

export async function appendLearningEvents(path: string, events: LearningEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, formatLearningEventsJsonl(events), "utf8");
}

import { requestResponseText } from "../models/responsesClient";
import { formatUsd } from "../practice/budget";
import { parsePracticeGeneration } from "../practice/practiceReport";
import { readPracticeTrialArgs } from "../practice/trialArgs";
import { buildPracticeTrialPlan } from "../practice/trialPlan";

async function main(): Promise<void> {
  const options = readPracticeTrialArgs(process.argv.slice(2));
  const plan = buildPracticeTrialPlan(options);

  if (options.spend && !options.apiKey) {
    throw new Error("OPENAI_API_KEY is required when --spend is set.");
  }

  if (plan.dryRun) {
    console.log(
      JSON.stringify(
        {
          provider: "openai",
          endpoint: "responses",
          model: plan.model,
          dryRun: true,
          allowedToSpend: false,
          estimatedInputTokens: plan.estimatedInputTokens,
          estimatedOutputTokens: plan.estimatedOutputTokens,
          estimatedUsd: Number(plan.estimatedUsd.toFixed(6)),
          maxUsd: plan.maxUsd,
          note: `Dry-run only. Add --spend with OPENAI_API_KEY to allow a paid request up to ${formatUsd(plan.maxUsd)}.`,
          promptPreview: plan.prompt.slice(0, 1_200)
        },
        null,
        2
      )
    );
    return;
  }

  const text = await requestResponseText(
    {
      baseUrl: options.baseUrl,
      apiKey: options.apiKey!,
      model: plan.model
    },
    {
      prompt: plan.prompt,
      maxOutputTokens: options.maxOutputTokens,
      temperature: options.temperature
    }
  );
  const report = parsePracticeGeneration(text);

  console.log(
    JSON.stringify(
      {
        provider: "openai",
        endpoint: "responses",
        model: plan.model,
        dryRun: false,
        estimatedUsd: Number(plan.estimatedUsd.toFixed(6)),
        report
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

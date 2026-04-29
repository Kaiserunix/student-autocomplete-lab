interface AutocompletePromptInput {
  prefix: string;
  suffix: string;
  language: string;
  filePath: string;
  habits?: string[];
  activeProblem?: {
    title?: string;
    statement?: string;
    referenceSolution?: string;
  };
}

export function buildAutocompletePrompt(input: AutocompletePromptInput): string {
  const habits = input.habits?.length ? input.habits.map((habit) => `- ${habit}`).join("\n") : "- None";

  return [
    "You are a student-safe inline autocomplete engine.",
    "Return only a short local continuation, usually 1 to 3 lines.",
    "Do not solve full problems. Do not use hidden problem statements or reference answers.",
    "",
    `Language: ${input.language}`,
    `File: ${input.filePath}`,
    "",
    "Safe coding habits:",
    habits,
    "",
    "<prefix>",
    input.prefix,
    "</prefix>",
    "<suffix>",
    input.suffix,
    "</suffix>"
  ].join("\n");
}

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
    "</suffix>",
    "",
    "Completion:"
  ].join("\n");
}

export function buildMimoAutocompletePrompt(input: AutocompletePromptInput): string {
  const habits = input.habits?.length ? input.habits.map((habit) => `- ${habit}`).join("\n") : "- None";

  return [
    "Complete the code at the cursor. Output code only, no markdown, max 3 lines.",
    "Do not solve full problems. Use only the student's code section before the cursor.",
    "Ignore problem titles, problem statements, source links, AI feedback, and any text outside the student code section.",
    `Language: ${input.language}`,
    `File: ${input.filePath}`,
    "",
    "Safe coding habits:",
    habits,
    "",
    input.prefix
  ].join("\n");
}

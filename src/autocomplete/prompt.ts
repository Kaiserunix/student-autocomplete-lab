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
  const fileLabel = stableFileLabel(input.filePath);

  return [
    "You are a student-safe inline autocomplete engine.",
    "Return only a short local continuation, usually 1 to 3 lines.",
    "Do not solve full problems. Do not use hidden problem statements or reference answers.",
    "",
    `Language: ${input.language}`,
    `File: ${fileLabel}`,
    "",
    "Safe coding habits:",
    habits,
    "",
    "<prefix>",
    input.prefix,
    "</prefix>",
    "",
    "Completion:"
  ].join("\n");
}

export function buildMimoAutocompletePrompt(input: AutocompletePromptInput): string {
  const habits = input.habits?.length ? input.habits.map((habit) => `- ${habit}`).join("\n") : "- None";
  const fileLabel = stableFileLabel(input.filePath);

  return [
    "Complete the code at the cursor. Output code only, no markdown, max 3 lines.",
    "Do not solve full problems. Use only the student's code section before the cursor.",
    "Ignore problem titles, problem statements, source links, AI feedback, and any text outside the student code section.",
    `Language: ${input.language}`,
    `File: ${fileLabel}`,
    "",
    "Safe coding habits:",
    habits,
    "",
    input.prefix
  ].join("\n");
}

function stableFileLabel(filePath: string): string {
  const parts = filePath
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  let practiceIndex = -1;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index].toLowerCase() === "practice") {
      practiceIndex = index;
      break;
    }
  }
  if (practiceIndex >= 0 && parts.length > practiceIndex + 1) {
    const platform = sanitizeFileLabelPart(parts[practiceIndex + 1]);
    const extension = fileExtension(parts.at(-1) ?? "");
    return ["practice", platform || "source", `problem${extension}`].join("/");
  }

  const fileName = parts.at(-1);
  if (fileName && /^[A-Z]\d+\.[A-Za-z0-9]+$/i.test(fileName)) {
    const parent = sanitizeFileLabelPart(parts.at(-2) ?? "");
    const extension = fileExtension(fileName);
    return [parent, `problem${extension}`].filter(Boolean).join("/") || `problem${extension}`;
  }

  return parts.slice(-2).map(sanitizeFileLabelPart).join("/") || "current-file";
}

function sanitizeFileLabelPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^_+|_+$/g, "") || "path";
}

function fileExtension(fileName: string): string {
  const match = fileName.match(/(\.[A-Za-z0-9]+)$/);
  return match ? match[1] : "";
}

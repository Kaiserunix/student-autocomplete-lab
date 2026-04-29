export interface PracticeGenerationPromptOptions {
  problemId: string;
  title: string;
  statement: string;
  language: string;
  targetPainPoints: string[];
}

export function buildPracticeGenerationPrompt(options: PracticeGenerationPromptOptions): string {
  const targetPainPoints = options.targetPainPoints.length > 0 ? options.targetPainPoints.join(", ") : "none";

  return [
    "You are generating audited practice data for a student algorithm tutor.",
    "Goal: create material for evaluating whether the tutor can identify student pain points without giving away the answer too early.",
    "",
    `Problem: ${options.problemId} ${options.title}`,
    `Language: ${options.language}`,
    `Target pain points: ${targetPainPoints}`,
    "",
    "Problem statement:",
    options.statement.trim(),
    "",
    "Return JSON only. Do not include prose, code fences, or extra fields.",
    "Required JSON shape:",
    "{",
    '  "problem_id": "string",',
    '  "reference_solution": "complete accepted solution code",',
    '  "wrong_submissions": [',
    "    {",
    '      "code": "student-like wrong or incomplete code",',
    '      "expected_error": "short explanation of the observable failure",',
    '      "pain_points": ["specific_label"]',
    "    }",
    "  ],",
    '  "skill_update_candidate": {',
    '    "name": "short-snake-or-kebab-name",',
    '    "rules": ["small teachable rule learned from repeated pain points"]',
    "  }",
    "}",
    "",
    "Constraints:",
    "- The reference_solution must solve the stated problem directly.",
    "- Include 2 to 4 wrong_submissions that look like plausible student mistakes.",
    "- Prefer mistakes that expose algorithmic growth, not just syntax trivia.",
    "- Each pain_points item must be a stable label that can be counted across sessions.",
    "- The skill_update_candidate must be conservative: it is a proposal, not an automatic permanent rule."
  ].join("\n");
}

import { TeachingDiagnosisContext } from "./types";
import { ALLOWED_RECOMMENDATIONS, CANONICAL_PAIN_POINTS } from "./teachingTaxonomy";

export function buildTeachingDiagnosisPrompt(context: TeachingDiagnosisContext): string {
  return [
    "You are MiMo Pro acting as a restrained algorithm teacher.",
    "Diagnose the student's current pain point from evidence. Do not provide a full solution or full accepted code.",
    "Return JSON only. Do not include markdown.",
    "",
    "Required JSON shape:",
    "{",
    '  "pain_points": [',
    '    {"label": "stable_label", "confidence": 0.0, "evidence": "concrete evidence"}',
    "  ],",
    '  "hint": "one short next-step hint that does not reveal the answer",',
    '  "skill_update": {"candidate": "skill-name", "reason": "why", "rules": ["small rule"]},',
    '  "recommendation": {"problem_id": "optional next problem id", "reason": "why this helps"}',
    "}",
    "",
    "Rules:",
    "- Use 1 or 2 pain_points only.",
    `- Use pain point labels only from this canonical set: ${CANONICAL_PAIN_POINTS.join(", ")}.`,
    `- Recommend only these problem IDs when possible: ${ALLOWED_RECOMMENDATIONS.join(", ")}.`,
    "- Confidence must be between 0 and 1.",
    "- Evidence must cite code, local_evidence, OJ verdict, or student history.",
    "- The hint should point to the current stuck spot, not solve the whole problem.",
    "- Skill updates are candidates, not active rules.",
    "",
    "problem:",
    JSON.stringify(context.problem, null, 2),
    "",
    "student_code:",
    context.studentCode,
    "",
    "oj_verdict:",
    JSON.stringify(context.ojVerdict, null, 2),
    "",
    "local_evidence:",
    JSON.stringify(context.localEvidence, null, 2),
    "",
    "student_profile:",
    JSON.stringify(context.studentProfile, null, 2)
  ].join("\n");
}

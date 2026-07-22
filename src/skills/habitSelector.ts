import type { StudentSkill } from "../teaching/studentSkill";
import { isStudentSkillTeachingActive } from "../teaching/studentSkillLifecycle";
import { normalizeSkillLanguage } from "./languageRegistry";
import type {
  ExcludedSkillRule,
  LearnerRuleSelection,
  NormalizedSkillLanguage,
  SkillRoute,
  SkillRule
} from "./types";

interface HabitDefinition {
  id: string;
  policyKey: string;
  instruction: string;
  compactInstruction: string;
  priority: number;
  aliases: RegExp[];
  relevance: RegExp;
  languages?: NormalizedSkillLanguage[];
}

const HABITS: HabitDefinition[] = [
  {
    id: "learner.loop-boundary",
    policyKey: "habit.loop-boundary",
    instruction: "Check the first and last valid loop or range boundary before continuing.",
    compactInstruction: "check loop bounds",
    priority: 60,
    aliases: [/loop.*bound/i, /range.*(first|last|end)/i, /循环.*边界/, /首.*末.*下标/],
    relevance: /\b(for|while|range)\b|循环/
  },
  {
    id: "learner.initialization",
    policyKey: "habit.initialization",
    instruction: "Check that counters, accumulators, and state are initialized before first use.",
    compactInstruction: "check initialization",
    priority: 50,
    aliases: [/initiali[sz]/i, /accumulator/i, /初始化/, /初值/],
    relevance: /\b(sum|total|count|ans|result|state)\b|累计|计数/
  },
  {
    id: "learner.bounds",
    policyKey: "habit.bounds",
    instruction: "Check indexes and container or array bounds at the current access.",
    compactInstruction: "check indexes and bounds",
    priority: 55,
    aliases: [/array.*bound/i, /index/i, /out.of.bounds/i, /越界/, /下标/],
    relevance: /\[[^\]]+\]|\bat\s*\(|下标/
  },
  {
    id: "learner.indentation",
    policyKey: "habit.indentation",
    instruction: "Preserve the current indentation and block structure.",
    compactInstruction: "preserve indentation",
    priority: 40,
    aliases: [/indent/i, /缩进/],
    relevance: /\n[ \t]+\S/
  },
  {
    id: "learner.pointer",
    policyKey: "habit.pointer",
    instruction: "Check pointer validity and pointee lifetime before dereferencing.",
    compactInstruction: "check pointer validity",
    priority: 55,
    aliases: [/pointer/i, /dereference/i, /指针/, /解引用/],
    relevance: /->|\*\s*[A-Za-z_]|\bnull\b|\bnullptr\b/i,
    languages: ["c", "cpp"]
  },
  {
    id: "learner.local-continuation",
    policyKey: "habit.local-continuation",
    instruction: "Prefer the immediate local continuation over new scaffolding or a full solution.",
    compactInstruction: "continue locally",
    priority: 10,
    aliases: [/direct student code/i, /local continuation/i, /局部续写/, /直接续写/],
    relevance: /[\s\S]*/
  }
];

interface LearnerRuleSelectionInput {
  skill: StudentSkill;
  route: SkillRoute;
  language: string;
  localCode?: string;
}

interface Candidate {
  definition: HabitDefinition;
  target?: string;
  score: number;
  relevant: boolean;
  confirmed: boolean;
  confidence: number;
  evidenceCount: number;
  lastSeen: string;
}

export function selectLearnerRules(input: LearnerRuleSelectionInput): LearnerRuleSelection {
  const language = normalizeSkillLanguage(input.language);
  const localCode = input.localCode ?? "";
  const budget = input.route === "autocomplete" ? 2 : 3;
  const characterBudget = input.route === "autocomplete" ? 160 : 225;
  const wrongTargets = new Set(
    input.skill.correctionLog
      .filter((item) => item.type === "diagnosis_wrong" && item.target)
      .map((item) => item.target as string)
  );
  const helpfulTargets = new Set(
    input.skill.correctionLog
      .filter((item) => item.type === "diagnosis_helpful" && item.target)
      .map((item) => item.target as string)
  );
  const disabledTargets = new Set([
    ...input.skill.hardRules.disabledSkills,
    ...Object.values(input.skill.skills)
      .filter((entry) => entry.status === "disabled")
      .map((entry) => entry.name)
  ]);
  const excluded: ExcludedSkillRule[] = [];
  const candidates: Candidate[] = [];

  const addText = (
    text: string,
    target: string | undefined,
    baseScore: number,
    confidence = 0,
    evidenceCount = 0,
    lastSeen = ""
  ): void => {
    const definition = HABITS.find((habit) => habit.aliases.some((pattern) => pattern.test(text)));
    if (!definition) {
      excluded.push({ id: "learner.unmapped", reason: "unmapped" });
      return;
    }
    if (definition.languages && !definition.languages.includes(language)) {
      excluded.push({ id: definition.id, reason: "not-relevant" });
      return;
    }
    if (target && wrongTargets.has(target)) {
      excluded.push({ id: definition.id, reason: "wrong-diagnosis" });
      return;
    }
    if (target && disabledTargets.has(target)) {
      excluded.push({ id: definition.id, reason: "disabled" });
      return;
    }

    const relevant = definition.relevance.test(localCode);
    candidates.push({
      definition,
      target,
      score: baseScore + definition.priority,
      relevant,
      confirmed: helpfulTargets.has(target ?? ""),
      confidence,
      evidenceCount,
      lastSeen
    });
  };

  for (const rawRule of input.skill.codeHabits.globalRules) {
    addText(rawRule, undefined, 10);
  }
  for (const rawRule of input.skill.codeHabits.languageRules[input.language] ?? []) {
    addText(rawRule, undefined, 15);
  }
  if (language !== input.language) {
    for (const rawRule of input.skill.codeHabits.languageRules[language] ?? []) {
      addText(rawRule, undefined, 15);
    }
  }
  for (const entry of Object.values(input.skill.skills)) {
    const entryText = [
      entry.name,
      entry.reason,
      entry.sourcePainPoints.join(" "),
      entry.rules.join(" ")
    ].join(" ");
    if (
      wrongTargets.has(entry.name) ||
      disabledTargets.has(entry.name)
    ) {
      addText(
        entryText,
        entry.name,
        20,
        0,
        entry.evidenceCount,
        entry.lastSeen
      );
      continue;
    }
    if (
      !isStudentSkillTeachingActive(entry.status) &&
      !helpfulTargets.has(entry.name)
    ) {
      continue;
    }
    addText(
      entryText,
      entry.name,
      20,
      Math.max(0, Math.min(1, entry.score / Math.max(1, entry.evidenceCount))),
      entry.evidenceCount,
      entry.lastSeen
    );
  }

  const byId = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (!candidate.relevant) {
      excluded.push({ id: candidate.definition.id, reason: "not-relevant" });
      continue;
    }
    const previous = byId.get(candidate.definition.id);
    if (!previous) {
      byId.set(candidate.definition.id, candidate);
      continue;
    }
    excluded.push({ id: candidate.definition.id, reason: "duplicate" });
    if (compareCandidates(candidate, previous) < 0) {
      byId.set(candidate.definition.id, candidate);
    }
  }

  const ranked = [...byId.values()].sort(compareCandidates);
  const selected: Candidate[] = [];
  let usedCharacters = 0;
  for (const candidate of ranked) {
    const nextCharacters = usedCharacters + candidate.definition.instruction.length;
    if (selected.length >= budget || nextCharacters > characterBudget) {
      excluded.push({ id: candidate.definition.id, reason: "budget" });
      continue;
    }
    selected.push(candidate);
    usedCharacters = nextCharacters;
  }

  const rules: SkillRule[] = selected.map((candidate, index) => ({
    id: candidate.definition.id,
    policyKey: candidate.definition.policyKey,
    route: input.route,
    layer: "tail",
    strength: "soft",
    source: "learner",
    priority: 300 - index,
    instruction: candidate.definition.instruction,
    compactInstruction: candidate.definition.compactInstruction,
    enforcement: "prompt",
    language
  }));

  return {
    rules,
    excludedRules: uniqueExcluded(excluded),
    budget,
    characterBudget,
    usedCharacters
  };
}

function compareCandidates(left: Candidate, right: Candidate): number {
  return Number(right.relevant) - Number(left.relevant) ||
    Number(right.confirmed) - Number(left.confirmed) ||
    right.confidence - left.confidence ||
    right.lastSeen.localeCompare(left.lastSeen) ||
    right.evidenceCount - left.evidenceCount ||
    right.score - left.score ||
    left.definition.id.localeCompare(right.definition.id);
}

function uniqueExcluded(values: ExcludedSkillRule[]): ExcludedSkillRule[] {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = item.id + "|" + item.reason;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

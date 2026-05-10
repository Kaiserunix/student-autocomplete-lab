import type { AttemptEvent } from "../teaching/attemptEvent";
import type { StudentSkill } from "../teaching/studentSkill";
import { isStudentSkillDisabled, isStudentSkillTeachingActive } from "../teaching/studentSkillLifecycle";
import { normalizePainPointLabel } from "../teaching/teachingTaxonomy";
import { painPointToSkill } from "./candidatePool";
import type {
  RecommendationCandidate,
  RecommendationTransferEvidenceStatus
} from "./schema";

export function collectTransferReadySkills(studentSkill?: StudentSkill): string[] {
  if (!studentSkill) {
    return [];
  }

  return unique(
    Object.entries(studentSkill.transferEvidence)
      .filter(([, transfer]) => transfer.probes > 0 && transfer.passed / transfer.probes >= 0.66)
      .filter(([, transfer]) => transfer.estimatedHintReduction > 0)
      .map(([skillName]) => skillName)
  );
}

export function collectLowHintSuccessSkills(events: AttemptEvent[] = []): string[] {
  const grouped = groupEventsByProblem(events);
  const successCountBySkill = new Map<string, number>();

  for (const problemEvents of grouped.values()) {
    const hintCount = problemEvents.filter(isHintEvent).length;
    const success = problemEvents.some((event) => event.outcome === "ac" || event.outcome === "completed");
    if (!success || hintCount > 1) {
      continue;
    }

    for (const skillName of painPointsToSkills(problemEvents.flatMap((event) => event.painPoints))) {
      successCountBySkill.set(skillName, (successCountBySkill.get(skillName) ?? 0) + 1);
    }
  }

  return [...successCountBySkill.entries()]
    .filter(([, count]) => count >= 2)
    .map(([skillName]) => skillName)
    .sort();
}

export function collectRepeatedFailurePainPoints(events: AttemptEvent[] = []): string[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.outcome !== "abandoned" && event.outcome !== "revealed") {
      continue;
    }

    for (const painPoint of event.painPoints.map(normalizePainPointLabel)) {
      counts.set(painPoint, (counts.get(painPoint) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([painPoint]) => painPoint);
}

export function resolveTransferEvidenceStatus(
  problem: RecommendationCandidate,
  studentSkill?: StudentSkill
): RecommendationTransferEvidenceStatus {
  if (!studentSkill || problem.skillTargets.length === 0) {
    return "not_tested";
  }

  let sawProbe = false;
  for (const skillName of problem.skillTargets) {
    const entry = studentSkill.skills[skillName];
    if (entry && isStudentSkillDisabled(entry.status)) {
      return "failed";
    }

    const transfer = studentSkill.transferEvidence[skillName];
    if (!transfer || transfer.probes <= 0) {
      continue;
    }

    sawProbe = true;
    const passRate = transfer.passed / transfer.probes;
    if (passRate >= 0.66 && transfer.estimatedHintReduction > 0) {
      return "passed";
    }
  }

  return sawProbe ? "probe" : "not_tested";
}

export function canIncreaseDifficulty(
  problem: RecommendationCandidate,
  transferReadySkills: string[],
  lowHintSuccessSkills: string[]
): boolean {
  const ready = new Set([...transferReadySkills, ...lowHintSuccessSkills]);
  return problem.skillTargets.some((skillName) => ready.has(skillName));
}

export function scoreSkillTransfer(problem: RecommendationCandidate, studentSkill?: StudentSkill): {
  score: number;
  signal: string;
} {
  if (!studentSkill || problem.skillTargets.length === 0) {
    return {
      score: 0,
      signal: "暂无迁移证据"
    };
  }

  let score = 0;
  const signals: string[] = [];
  for (const skillName of problem.skillTargets) {
    const skill = studentSkill.skills[skillName];
    if (skill && isStudentSkillDisabled(skill.status)) {
      score -= 80;
      signals.push(`${skillName} 已禁用`);
      continue;
    }

    if (skill && isStudentSkillTeachingActive(skill.status)) {
      score += 8;
      signals.push(`${skillName} ${skill.status === "mastered" ? "已掌握" : "已启用"}`);
    }

    const transfer = studentSkill.transferEvidence[skillName];
    if (transfer && transfer.probes > 0) {
      const passRate = transfer.passed / transfer.probes;
      if (passRate >= 0.66 && transfer.estimatedHintReduction > 0) {
        score += 18 + transfer.estimatedHintReduction * 4;
        signals.push(`迁移证据 ${skillName} ${transfer.passed}/${transfer.probes}`);
      } else {
        score += 3;
        signals.push(`迁移待验证 ${skillName} ${transfer.passed}/${transfer.probes}`);
      }
    }
  }

  return {
    score: roundScore(score),
    signal: signals.join("；") || "暂无迁移证据"
  };
}

function painPointsToSkills(painPoints: string[]): string[] {
  return unique(
    painPoints
      .map(normalizePainPointLabel)
      .map((painPoint) => painPointToSkill[painPoint])
      .filter((skillName): skillName is string => Boolean(skillName))
  );
}

function groupEventsByProblem(events: AttemptEvent[]): Map<string, AttemptEvent[]> {
  const grouped = new Map<string, AttemptEvent[]>();
  for (const event of events) {
    const key = event.problemKey || `${event.platform}:${event.problemId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  return grouped;
}

function isHintEvent(event: AttemptEvent): boolean {
  return (
    event.kind === "hint_requested" ||
    event.kind === "specific_hint_requested" ||
    event.kind === "follow_up_requested"
  );
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}

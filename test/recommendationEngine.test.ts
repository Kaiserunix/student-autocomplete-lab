import { describe, expect, test } from "vitest";
import { buildRecommendationCandidate, recommendNextProblems } from "../src/teaching/recommendationEngine";
import type { StudentProfile } from "../src/teaching/studentProfile";
import { createEmptyStudentSkill } from "../src/teaching/studentSkill";

describe("recommendation engine", () => {
  test("ranks problems by the student's strongest pain points before generic difficulty", () => {
    const profile = studentProfile({
      output_order: { count: 4, score: 3.2 },
      array_indexing: { count: 1, score: 0.6 }
    });

    const result = recommendNextProblems({
      profile,
      candidates: [
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P3369",
          title: "普通平衡树",
          difficulty: 4,
          tags: ["data-structure"],
          targetPainPoints: ["data_structure_semantics"]
        }),
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P1427",
          title: "小鱼的数字游戏",
          difficulty: 1,
          tags: ["array", "output-order"],
          targetPainPoints: ["output_order", "sentinel_input"]
        }),
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P2141",
          title: "珠心算测验",
          difficulty: 2,
          tags: ["counting"],
          targetPainPoints: ["duplicate_handling", "bruteforce_no_growth"]
        })
      ],
      limit: 3
    });

    expect(result.strategy.topPainPoints[0]).toMatchObject({ label: "output_order" });
    expect(result.recommendations[0].problem.id).toBe("P1427");
    expect(result.recommendations[0].matchedPainPoints).toContain("output_order");
    expect(result.recommendations[0].reasons.join(" ")).toContain("痛点匹配");
  });

  test("uses transfer evidence to move from a trained skill into a harder unseen problem", () => {
    const profile = studentProfile({
      traversal_order_confusion: { count: 2, score: 1.6 }
    });
    const studentSkill = createEmptyStudentSkill("local-student", "2026-05-01T00:00:00.000Z");
    studentSkill.skills["binary-tree-traversal-reconstruction"] = {
      name: "binary-tree-traversal-reconstruction",
      status: "active",
      reason: "学生已反复练习遍历重建的根和边界。",
      rules: ["先确认根节点，再切分左右子树。"],
      sourcePainPoints: ["traversal_order_confusion", "root_identification"],
      evidenceCount: 4,
      score: 3.4,
      examples: [],
      lastSeen: "2026-05-01T00:00:00.000Z"
    };
    studentSkill.transferEvidence["binary-tree-traversal-reconstruction"] = {
      probes: 3,
      passed: 3,
      estimatedHintReduction: 2,
      lastSeen: "2026-05-01T00:00:00.000Z"
    };

    const result = recommendNextProblems({
      profile,
      studentSkill,
      attemptEvents: [
        {
          eventId: "1",
          problemKey: "luogu:P1305",
          problemId: "P1305",
          platform: "luogu",
          kind: "solution_scored",
          outcome: "ac",
          occurredAt: "2026-05-01T00:00:00.000Z",
          painPoints: []
        }
      ],
      candidates: [
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P1305",
          title: "新二叉树",
          difficulty: 1,
          tags: ["binary-tree", "traversal"],
          targetPainPoints: ["traversal_order_confusion"],
          skillTargets: ["binary-tree-traversal-reconstruction"]
        }),
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P1030",
          title: "求先序排列",
          difficulty: 2,
          tags: ["binary-tree", "reconstruction"],
          targetPainPoints: ["traversal_order_confusion", "root_identification", "subtree_boundary"],
          skillTargets: ["binary-tree-traversal-reconstruction"]
        }),
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P4913",
          title: "二叉树深度",
          difficulty: 1,
          tags: ["binary-tree", "depth"],
          targetPainPoints: ["depth_definition", "child_indexing"],
          skillTargets: ["binary-tree-depth-numbered-children"]
        })
      ],
      limit: 2
    });

    expect(result.recommendations.map((item) => item.problem.id)).not.toContain("P1305");
    expect(result.recommendations[0].problem.id).toBe("P1030");
    expect(result.recommendations[0].transferSignal).toContain("binary-tree-traversal-reconstruction");
    expect(result.recommendations[0].reasons.join(" ")).toContain("迁移证据");
  });

  test("does not jump to a much harder problem when transfer evidence is missing", () => {
    const profile = studentProfile({
      array_indexing: { count: 5, score: 4.2 }
    });

    const result = recommendNextProblems({
      profile,
      currentProblemId: "P1428",
      candidates: [
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P1161",
          title: "开灯",
          difficulty: 1,
          tags: ["array"],
          targetPainPoints: ["array_indexing", "loop_boundary"]
        }),
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P3369",
          title: "普通平衡树",
          difficulty: 4,
          tags: ["data-structure"],
          targetPainPoints: ["array_indexing", "data_structure_semantics"]
        })
      ],
      limit: 2
    });

    expect(result.strategy.targetDifficulty).toBe(1);
    expect(result.recommendations[0].problem.id).toBe("P1161");
    expect(result.recommendations[0].difficultySignal).toContain("目标难度 1");
    expect(result.recommendations.map((item) => item.recommendation.difficultyChange)).not.toContain("up");
  });

  test("does not immediately recommend archived or abandoned problems again", () => {
    const profile = studentProfile({
      output_order: { count: 3, score: 2.5 }
    });

    const result = recommendNextProblems({
      profile,
      attemptEvents: [
        {
          eventId: "archive-1",
          problemKey: "luogu:P1427",
          problemId: "P1427",
          platform: "luogu",
          kind: "archived",
          outcome: "abandoned",
          occurredAt: "2026-05-01T00:00:00.000Z",
          painPoints: ["output_order"]
        }
      ],
      candidates: [
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P1427",
          title: "小鱼的数字游戏",
          difficulty: 1,
          tags: ["array", "output-order"],
          targetPainPoints: ["output_order"]
        }),
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P5727",
          title: "冰雹猜想",
          difficulty: 1,
          tags: ["simulation", "output-order"],
          targetPainPoints: ["output_order"]
        })
      ],
      limit: 2
    });

    expect(result.strategy.excludedProblemIds).toContain("P1427");
    expect(result.recommendations.map((item) => item.problem.id)).toEqual(["P5727"]);
  });

  test("returns stable recommendation result fields for UI and eval consumers", () => {
    const profile = studentProfile({
      output_order: { count: 2, score: 2 }
    });

    const result = recommendNextProblems({
      profile,
      candidates: [
        buildRecommendationCandidate({
          platform: "manual",
          id: "MICRO-output-order-001",
          title: "三分钟输出顺序微练",
          source: "synthetic",
          difficulty: 1,
          tags: ["output-order"],
          targetPainPoints: ["output_order"],
          skillTargets: ["sentinel-input-output-order"]
        })
      ]
    });

    expect(result.results[0]).toMatchObject({
      problemId: "MICRO-output-order-001",
      title: "三分钟输出顺序微练",
      source: "synthetic",
      targetSkill: "sentinel-input-output-order",
      difficultyChange: "down",
      transferEvidenceStatus: "not_tested",
      whyNotHarder: "候选难度更低，用来修补基础痛点，而不是提前加压。",
      whyNotRepeat: "当前没有近期完成/放弃/删除记录；推荐会避开当前题。"
    });
    expect(result.recommendations[0].recommendation).toEqual(result.results[0]);
  });

  test("honors explicit deleted and completed exclusion lists", () => {
    const profile = studentProfile({
      output_order: { count: 3, score: 2.5 }
    });

    const result = recommendNextProblems({
      profile,
      completedProblemIds: ["P1427"],
      deletedProblemIds: ["P5727"],
      candidates: [
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P1427",
          title: "小鱼的数字游戏",
          difficulty: 1,
          tags: ["array", "output-order"],
          targetPainPoints: ["output_order"]
        }),
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P5727",
          title: "冰雹猜想",
          difficulty: 1,
          tags: ["simulation", "output-order"],
          targetPainPoints: ["output_order"]
        }),
        buildRecommendationCandidate({
          platform: "luogu",
          id: "P1161",
          title: "开灯",
          difficulty: 1,
          tags: ["array"],
          targetPainPoints: ["array_indexing"]
        })
      ],
      limit: 3
    });

    expect(result.strategy.excludedProblemIds).toEqual(expect.arrayContaining(["P1427", "P5727"]));
    expect(result.recommendations.map((item) => item.problem.id)).toEqual(["P1161"]);
  });

  test("uses repeated low-hint success as transfer evidence before moving up in difficulty", () => {
    const profile = studentProfile({
      traversal_order_confusion: { count: 3, score: 3 }
    });
    const baseCandidates = [
      buildRecommendationCandidate({
        platform: "luogu",
        id: "P1305",
        title: "新二叉树",
        difficulty: 1,
        tags: ["binary-tree", "traversal"],
        targetPainPoints: ["traversal_order_confusion"],
        skillTargets: ["binary-tree-traversal-reconstruction"]
      }),
      buildRecommendationCandidate({
        platform: "luogu",
        id: "P1030",
        title: "求先序排列",
        difficulty: 2,
        tags: ["binary-tree", "reconstruction"],
        targetPainPoints: ["traversal_order_confusion", "root_identification", "subtree_boundary"],
        skillTargets: ["binary-tree-traversal-reconstruction"]
      })
    ];

    const withoutEvidence = recommendNextProblems({
      profile,
      candidates: baseCandidates,
      limit: 2
    });
    const withEvidence = recommendNextProblems({
      profile,
      attemptEvents: [
        successEvent("s1", "P9001", ["traversal_order_confusion"]),
        successEvent("s2", "P9002", ["traversal_order_confusion"])
      ],
      candidates: baseCandidates,
      limit: 2
    });

    expect(withoutEvidence.recommendations[0].problem.id).toBe("P1305");
    expect(withEvidence.strategy.lowHintSuccessSkills).toContain("binary-tree-traversal-reconstruction");
    expect(withEvidence.recommendations[0].problem.id).toBe("P1030");
    expect(withEvidence.results[0].difficultyChange).toBe("same");
  });
});

function studentProfile(
  painPoints: Record<string, { count: number; score: number }>
): StudentProfile {
  return {
    studentId: "local-student",
    painPoints: Object.fromEntries(
      Object.entries(painPoints).map(([label, state]) => [
        label,
        {
          ...state,
          lastSeen: "2026-05-01T00:00:00.000Z"
        }
      ])
    ),
    skillCandidates: {}
  };
}

function successEvent(eventId: string, problemId: string, painPoints: string[]) {
  return {
    eventId,
    problemKey: `luogu:${problemId}`,
    problemId,
    platform: "luogu",
    kind: "solution_scored" as const,
    outcome: "ac" as const,
    occurredAt: "2026-05-01T00:00:00.000Z",
    ojStatus: "AC" as const,
    painPoints
  };
}

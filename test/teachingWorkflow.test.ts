import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { createEmptyStudentProfile } from "../src/teaching/studentProfile";
import {
  applyStudentSkillPatch,
  createEmptyStudentSkill
} from "../src/teaching/studentSkill";
import {
  runCoachDiagnosisWorkflow,
  runCoachFollowUpWorkflow,
  runLessonReportWorkflow,
  runOptimizationReviewWorkflow,
  runSolutionScoreWorkflow,
  runSubmissionJudgeWorkflow
} from "../src/teaching/workflow/actions";
import {
  describeCoachActionPurpose,
  enforcePedagogicalHintBoundary,
  mergeCoachRequestPurpose,
  resolveHintLadderStage,
  summarizeSessionCoachThread
} from "../src/teaching/workflow/pedagogyPolicy";

describe("teaching workflow & decoupled pedagogy policy", () => {
  test("keeps pure workflow, pedagogy, provider adapter, and autocomplete core modules free of vscode imports", async () => {
    const pureFiles = [
      "src/teaching/workflow/actions.ts",
      "src/teaching/workflow/pedagogyPolicy.ts",
      "src/teaching/workflow/schema.ts",
      "src/teaching/workflow/contextBundle.ts",
      "src/teaching/workflow/reducer.ts",
      "src/models/providerAdapter.ts",
      "src/models/modelHealthCheck.ts",
      "src/autocomplete/inlineCompletionCore.ts",
      "src/config/modelEnv.ts"
    ];

    for (const filePath of pureFiles) {
      const content = await readFile(filePath, "utf8");
      expect(content, `${filePath} must not import vscode`).not.toMatch(/from\s+["']vscode["']/);
    }
  });

  test("escalates hint ladder stages deterministically and redacts multi-line solution leaks before giveUp", () => {
    expect(resolveHintLadderStage({ action: "hint", hintCount: 0 })).toBe("level-1-nudge");
    expect(resolveHintLadderStage({ action: "hint", hintCount: 1 })).toBe("level-2-concrete");
    expect(resolveHintLadderStage({ action: "specific", hintCount: 1 })).toBe("level-2-concrete");
    expect(resolveHintLadderStage({ action: "specific", hintCount: 2 })).toBe("level-3-guided-repair");
    expect(resolveHintLadderStage({ action: "giveUp", hintCount: 0 })).toBe("level-4-lesson");

    const leaked = enforcePedagogicalHintBoundary(
      {
        painPoints: [{ label: "loop_boundary", confidence: 0.9, evidence: "off by one" }],
        hint: "检查循环终点：\n```python\ndef solve():\n    n = int(input())\n    ans = sum(range(1, n + 1))\n    print(ans)\n```",
        microSteps: ["step 1", "step 2", "step 3"]
      },
      "level-1-nudge",
      "zh"
    );

    expect(leaked.spoilerRedacted).toBe(true);
    expect(leaked.report.hint).not.toContain("def solve():");
    expect(leaked.report.microSteps).toHaveLength(2);
  });

  test("summarizes persistent AttemptSession coach thread into request purpose when explicit previous turn is absent", () => {
    const threadSummary = summarizeSessionCoachThread([
      {
        role: "student",
        kind: "hint_requested",
        text: "我不确定先序根怎么找",
        occurredAt: "2026-07-22T00:00:00.000Z"
      },
      {
        role: "assistant",
        kind: "hint_requested",
        text: "先看后序遍历最后一个字符。",
        occurredAt: "2026-07-22T00:00:02.000Z",
        model: "coach-model"
      }
    ]);
    const merged = mergeCoachRequestPurpose(
      describeCoachActionPurpose("specific", "zh", { hintCount: 2 }),
      "那左子树长度怎么算？",
      undefined,
      [
        {
          role: "student",
          kind: "hint_requested",
          text: "我不确定先序根怎么找",
          occurredAt: "2026-07-22T00:00:00.000Z"
        },
        {
          role: "assistant",
          kind: "hint_requested",
          text: "先看后序遍历最后一个字符。",
          occurredAt: "2026-07-22T00:00:02.000Z"
        }
      ]
    );

    expect(threadSummary).toContain("[学生] 我不确定先序根怎么找");
    expect(merged).toContain("第 3 级引导修复阶段");
    expect(merged).toContain("先看后序遍历最后一个字符");
    expect(merged).toContain("那左子树长度怎么算？");
  });

  test("runs a coach diagnosis workflow and returns an attempt event, thread turns, and audit", async () => {
    const result = await runCoachDiagnosisWorkflow({
      action: "specific",
      problemKey: "luogu:P1030",
      platform: "luogu",
      hintCount: 2,
      context: {
        problem: { id: "P1030", title: "求先序排列", summary: "inorder + postorder -> preorder" },
        language: "python",
        studentCode: "return left + right + root",
        ojVerdict: { status: "WA", passedTests: 1, totalTests: 3 },
        localEvidence: [],
        studentProfile: { painPointCounts: {}, activeSkills: [] }
      },
      profile: createEmptyStudentProfile("student-a"),
      studentSkill: createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z"),
      occurredAt: "2026-05-01T00:01:00.000Z",
      patchSource: "fixture-teacher",
      diagnose: async () => ({
        painPoints: [
          {
            label: "traversal_order_confusion",
            confidence: 0.9,
            evidence: "The code returns postorder instead of preorder."
          }
        ],
        hint: "先确认先序遍历的输出顺序。",
        specificHint: "当前表达式把 root 放在最后了。",
        skillUpdate: {
          candidate: "binary-tree-traversal-reconstruction",
          reason: "Traversal order confusion appeared again.",
          rules: ["Preorder emits root before children."]
        }
      })
    });

    expect(result.hintStage).toBe("level-3-guided-repair");
    expect(result.report.specificHint).toContain("root");
    expect(result.coachThreadTurns).toHaveLength(2);
    expect(result.attemptEventInput).toMatchObject({
      problemKey: "luogu:P1030",
      problemId: "P1030",
      platform: "luogu",
      kind: "specific_hint_requested",
      model: "fixture-teacher",
      painPoints: ["traversal_order_confusion"]
    });
    expect(result.updatedStudentSkill.errorModel.traversal_order_confusion.count).toBe(1);
    expect(result.audit.included).toContain("student_code");
    expect(result.audit.excluded).toContain("autocomplete_prompt");
  });

  test("runs follow-up workflow without mutating StudentSkill revision", async () => {
    const initialSkill = createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z");
    const result = await runCoachFollowUpWorkflow({
      problemKey: "luogu:P1030",
      platform: "luogu",
      studentSkill: initialSkill,
      occurredAt: "2026-05-01T00:02:00.000Z",
      model: "coach-model",
      hintCount: 1,
      context: {
        problem: { id: "P1030", title: "求先序排列", summary: "inorder + postorder -> preorder" },
        language: "python",
        studentCode: "return left + right + root",
        studentRequest: "为什么根要在最前面？",
        previousCoachTurn: "先看先序定义",
        studentProfile: { painPointCounts: {}, activeSkills: [] }
      },
      followUp: async () => ({
        answer: "因为先序遍历的定义就是「根 -> 左子树 -> 右子树」。",
        tinyExample: "只有根 A 和左孩子 B 时，先序输出 AB。",
        nextAction: "把 return 里的拼接顺序改成根在最前。"
      })
    });

    expect(result.studentSkill.revision).toBe(0);
    expect(result.audit.excluded).toContain("student_skill_mutation");
    expect(result.coachThreadTurns).toHaveLength(2);
    expect(result.attemptEventInput.kind).toBe("follow_up_requested");
  });

  test("updates StudentSkill on abandon lesson report and completion solution score (including transfer evidence)", async () => {
    const profile = createEmptyStudentProfile("student-a");
    const skill0 = createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z");

    const lesson = await runLessonReportWorkflow({
      problemKey: "luogu:P1030",
      platform: "luogu",
      profile,
      studentSkill: skill0,
      occurredAt: "2026-05-01T00:05:00.000Z",
      patchSource: "coach-model",
      hasTeacherPack: true,
      context: {
        problem: { id: "P1030", title: "求先序排列", summary: "tree traversal" },
        language: "python",
        studentCode: "return left + right + root",
        studentProfile: { painPointCounts: {}, activeSkills: [] },
        hintCount: 2
      },
      generateLesson: async () => ({
        standardApproach: "后序末尾找根，中序切分左右子树，递归输出根左右。",
        painPoints: [
          {
            label: "traversal_order_confusion",
            confidence: 0.88,
            evidence: "root placed last"
          }
        ],
        minimalFixPath: ["取 post[-1] 为根", "按根左子树右子树返回"],
        remedialExercise: {
          type: "problem",
          problemId: "P1305",
          title: "新二叉树",
          prompt: "练习前序遍历输出顺序",
          reason: "巩固根左右顺序"
        },
        archiveReason: "abandoned"
      })
    });

    expect(lesson.updatedStudentSkill.revision).toBe(1);
    expect(lesson.updatedStudentSkill.skills["binary-tree-traversal-reconstruction"]).toBeDefined();
    expect(lesson.audit.included).toContain("teacher_pack_reference");

    const promoted = applyStudentSkillPatch(lesson.updatedStudentSkill, {
      source: "seed",
      occurredAt: "2026-05-01T00:06:00.000Z",
      skills: [
        {
          name: "binary-tree-traversal-reconstruction",
          reason: "repeated",
          rules: ["root first"],
          sourcePainPoints: ["traversal_order_confusion"],
          confidence: 2.0
        }
      ]
    }).skill;

    const score = await runSolutionScoreWorkflow({
      problemKey: "luogu:P1305",
      platform: "luogu",
      problem: { id: "P1305", title: "新二叉树", summary: "preorder traversal" },
      language: "python",
      studentCode: "def dfs(u):\n    if u == '*': return ''\n    return u + dfs(left[u]) + dfs(right[u])\nprint(dfs(root))\n",
      ojVerdict: { status: "AC" },
      attemptStats: { hintCount: 0, gaveUp: false, revealedAnswer: false },
      isCompletionReview: true,
      profile: lesson.updatedProfile,
      studentSkill: promoted,
      occurredAt: "2026-05-01T00:10:00.000Z",
      patchSource: "coach-model",
      scoreSolution: async () => ({
        ojResult: "AC",
        learningScore: 94,
        rubric: {
          correctness: 95,
          complexityMatch: 95,
          ideaGrowth: 92,
          codeQuality: 90,
          independence: 98
        },
        complexityAssessment: {
          observed: "O(n)",
          expected: "O(n)",
          verdict: "matched",
          reason: "每个节点访问一次。"
        },
        painPoints: [],
        summary: "独立完成前序遍历迁移。",
        nextAction: "尝试带权二叉树深度题。"
      })
    });

    expect(score.shouldArchive).toBe(true);
    expect(score.updatedStudentSkill.revision).toBe(promoted.revision + 1);
    expect(
      score.updatedStudentSkill.transferEvidence["binary-tree-traversal-reconstruction"]
    ).toMatchObject({
      probes: 1,
      passed: 1,
      estimatedHintReduction: 1
    });
  });

  test("updates StudentSkill on optimization review when bruteforce upgrade is needed and keeps submission judge estimate-only", async () => {
    const profile = createEmptyStudentProfile("student-a");
    const skill0 = createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z");

    const opt = await runOptimizationReviewWorkflow({
      problemKey: "luogu:P1102",
      platform: "luogu",
      problem: { id: "P1102", title: "A-B 数对", summary: "count pairs with difference C" },
      language: "python",
      studentCode: "ans = 0\nfor i in range(n):\n    for j in range(n):\n        if a[i] - a[j] == c: ans += 1\nprint(ans)\n",
      archivedReason: "completed",
      profile,
      studentSkill: skill0,
      occurredAt: "2026-05-01T00:15:00.000Z",
      patchSource: "coach-model",
      reviewOptimization: async () => ({
        verdict: "optimize",
        optimizationNeeded: true,
        summary: "当前双重循环枚举在大数据下会 TLE，可升级为哈希计数或二分。",
        timeComplexity: {
          current: "O(n^2)",
          target: "O(n)",
          action: "用 Counter 统计每个值出现次数，把内层暴力枚举改成查表。"
        },
        memory: {
          current: "O(n)",
          target: "O(n)",
          action: "保持线性空间。"
        },
        codeQuality: {
          verdict: "ok",
          action: "变量清晰。"
        },
        nextStep: "把内层循环改为 Counter 查找。"
      })
    });

    expect(opt.studentSkillMerge).toBeDefined();
    expect(opt.updatedStudentSkill.skills["complexity-upgrade-from-bruteforce"]).toBeDefined();

    const judge = await runSubmissionJudgeWorkflow({
      problemKey: "luogu:P1102",
      platform: "luogu",
      reviewStage: "active",
      model: "coach-model",
      context: {
        problem: { id: "P1102", title: "A-B 数对", summary: "count pairs" },
        language: "python",
        studentCode: "print(0)",
        studentProfile: { painPointCounts: {}, activeSkills: [] }
      },
      judgeSubmission: async () => ({
        verdict: "likely_wa",
        confidence: 0.9,
        summary: "固定输出 0。",
        issues: [
          {
            label: "placeholder_output",
            severity: "high",
            evidence: "print(0)",
            fixHint: "先统计频次再累加。"
          }
        ],
        testSuggestions: [
          {
            input: "4 1\n1 1 2 3\n",
            expectedBehavior: "应输出 3",
            reason: "最小样例验证"
          }
        ],
        nextAction: "实现计数逻辑后再跑样例。"
      })
    });

    expect(judge.isEstimateOnly).toBe(true);
    expect(judge.audit.excluded).toContain("official_oj_verdict");
  });
});

import { describe, expect, test } from "vitest";
import { buildTeachingDiagnosisPrompt } from "../src/teaching/teachingPrompt";

describe("teaching diagnosis prompt", () => {
  test("asks MiMo to diagnose from evidence without revealing the full answer", () => {
    const prompt = buildTeachingDiagnosisPrompt({
      problem: {
        id: "P1030",
        title: "求先序排列",
        summary: "Given inorder and postorder traversal strings, output preorder."
      },
      language: "python",
      studentCode: "return left + right + root",
      ojVerdict: {
        status: "WA",
        passedTests: 1,
        totalTests: 3
      },
      localEvidence: [
        {
          note: "sample-like reconstruction",
          expectedOutput: "ABCD",
          actualOutput: "BDCA",
          stderr: "",
          passed: false
        }
      ],
      studentProfile: {
        painPointCounts: {
          subtree_boundary: 2
        },
        activeSkills: ["binary-tree-traversal-reconstruction"],
        recentCorrections: [
          {
            type: "diagnosis_wrong",
            target: "python-loop-boundary-check",
            note: "这次不是循环边界。"
          }
        ]
      }
    });

    expect(prompt).toContain("MiMo");
    expect(prompt).toContain("P1030");
    expect(prompt).toContain("student_code");
    expect(prompt).toContain("local_evidence");
    expect(prompt).toContain("pain_points");
    expect(prompt).toContain("specific_hint");
    expect(prompt).toContain("checkpoint");
    expect(prompt).toContain("micro_steps");
    expect(prompt).toContain("JSON only");
    expect(prompt).toContain("Do not provide a full solution");
    expect(prompt).toContain("Inspect the final output or return expression");
    expect(prompt).toContain("code anchor");
    expect(prompt).toContain("at most 2 tiny");
    expect(prompt).toContain("must be more concrete than hint");
    expect(prompt).toContain("hint must be short");
    expect(prompt).toContain("specific_hint should usually be 2 or 3 short sentences");
    expect(prompt).toContain("Do not dump every micro-step into the first hint");
    expect(prompt).toContain("beginner-friendly");
    expect(prompt).toContain("explain that term in plain words");
    expect(prompt).toContain("follow-up can be detailed");
    expect(prompt).toContain("prefer traversal_order_confusion");
    expect(prompt).toContain("Do not use child_indexing");
    expect(prompt).toContain("prefer duplicate_handling");
    expect(prompt).toContain("prefer high_precision_carry_order");
    expect(prompt).toContain("prefer greedy_choice_model");
    expect(prompt).toContain("prefer disjoint_set_union_semantics");
    expect(prompt).toContain("prefer graph_adjacency_model");
    expect(prompt).toContain("binary-tree-traversal-reconstruction");
    expect(prompt).toContain("ordered-multiset-semantics");
    expect(prompt).toContain("recentCorrections");
    expect(prompt).toContain("diagnosis_wrong");
    expect(prompt).toContain("high-priority human correction");
  });

  test("can explicitly request Simplified Chinese JSON string values", () => {
    const prompt = buildTeachingDiagnosisPrompt({
      problem: {
        id: "P1030",
        title: "求先序排列",
        summary: "Given inorder and postorder traversal strings, output preorder."
      },
      language: "python",
      studentCode: "return left + right + root",
      ojVerdict: {
        status: "WA"
      },
      localEvidence: [],
      studentProfile: {
        painPointCounts: {}
      },
      responseLanguage: "zh-CN"
    });

    expect(prompt).toContain("Output language: Simplified Chinese");
    expect(prompt).toContain("write hint, specific_hint, checkpoint, micro_steps");
  });

  test("can explicitly request English JSON string values", () => {
    const prompt = buildTeachingDiagnosisPrompt({
      problem: {
        id: "MANUAL-001",
        title: "Campus Nickname Normalizer",
        summary: "Normalize nicknames split by '-' or '_'."
      },
      language: "python",
      studentCode: "for i in range(n - 1): pass",
      ojVerdict: {
        status: "WA"
      },
      localEvidence: [],
      studentProfile: {
        painPointCounts: {}
      },
      responseLanguage: "en-US"
    });

    expect(prompt).toContain("Output language: English");
    expect(prompt).toContain("write hint, specific_hint, checkpoint, micro_steps");
  });

  test("includes a hidden teacher pack and asks for a student error model", () => {
    const prompt = buildTeachingDiagnosisPrompt({
      problem: {
        id: "P5730",
        title: "显示屏",
        summary: "用 5x3 字模显示数字。"
      },
      teacherPack: {
        summary: "固定字模模拟输出。",
        constraints: "数字个数较小。",
        standardApproach: "建立 0-9 的五行字模，逐行拼接。",
        expectedAlgorithm: "simulation_with_digit_font_table",
        expectedComplexity: { time: "O(n)", space: "O(1)" },
        keyInvariants: ["每个数字输出五行"],
        commonPitfalls: [{ label: "format_output", description: "数字间隔处理错误。" }],
        minimalCounterexamples: [{ input: "1\n1\n", expectedOutput: "..X\n", reason: "检查单数字间隔。" }],
        bruteForce: { suitable: true, reason: "模拟就是预期解法。" }
      },
      language: "python",
      studentCode: "print(ans + ' ')",
      ojVerdict: { status: "WA" },
      localEvidence: [],
      studentProfile: { painPointCounts: {}, activeSkills: [] },
      responseLanguage: "zh-CN"
    });

    expect(prompt).toContain("student_error_model");
    expect(prompt).toContain("teacher_pack_hidden_reference:");
    expect(prompt).toContain("固定字模模拟输出");
    expect(prompt).toContain("Do not reveal teacher_pack.standardApproach");
  });
});

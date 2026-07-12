import { describe, expect, test } from "vitest";
import { parseTeachingDiagnosisReport } from "../src/teaching/teachingReport";

describe("teaching diagnosis report parser", () => {
  test("parses MiMo JSON into a stable teaching report", () => {
    const report = parseTeachingDiagnosisReport(
      JSON.stringify({
        pain_points: [
          {
            label: "traversal_order_confusion",
            confidence: 0.86,
            evidence: "Student returns left + right + root."
          }
        ],
        hint: "先确认先序遍历的第一个字符应该是谁。",
        skill_update: {
          candidate: "binary-tree-traversal-reconstruction",
          reason: "Repeated traversal-order confusion.",
          rules: ["Preorder emits root before recursive children."]
        },
        recommendation: {
          problem_id: "P1305",
          reason: "Practice preorder traversal before reconstruction."
        }
      })
    );

    expect(report.painPoints[0].label).toBe("traversal_order_confusion");
    expect(report.painPoints[0].confidence).toBe(0.86);
    expect(report.skillUpdate?.candidate).toBe("binary-tree-traversal-reconstruction");
    expect(report.recommendation?.problemId).toBe("P1305");
  });

  test("rejects reports without pain points", () => {
    expect(() => parseTeachingDiagnosisReport('{"hint":"too vague"}')).toThrow(/pain_points/);
  });

  test("accepts numeric confidence strings from live model responses", () => {
    const report = parseTeachingDiagnosisReport(
      JSON.stringify({
        pain_points: [
          {
            label: "duplicate_handling",
            confidence: "0.9",
            evidence: "The model emitted confidence as a string."
          }
        ],
        hint: "先确认重复元素是否需要保留。"
      })
    );

    expect(report.painPoints[0].confidence).toBe(0.9);
  });

  test("ignores incomplete optional recommendations from loose live model responses", () => {
    const report = parseTeachingDiagnosisReport(
      JSON.stringify({
        pain_points: [
          {
            label: "output_format",
            confidence: 0.8,
            evidence: "The code prints prompt text before the answer."
          }
        ],
        hint: "先删掉所有题目没有要求的提示文字。",
        recommendation: {
          reason: "模型只给了推荐理由，没有给具体题号。"
        }
      })
    );

    expect(report.recommendation).toBeUndefined();
  });

  test("parses layered hints for basic and more-specific coaching actions", () => {
    const report = parseTeachingDiagnosisReport(
      JSON.stringify({
        pain_points: [
          {
            label: "loop_boundary",
            confidence: 0.78,
            evidence: "The loop skips the last nickname line."
          }
        ],
        hint: "先盯住读取昵称的循环范围：它现在没有覆盖全部 n 行。",
        specific_hint: "把循环变量和 n 对齐检查一次：从第 1 行昵称开始读，连续读 n 次；不要把第一行 n 当作昵称处理。",
        checkpoint: "用 n=1 且只有一个昵称的样例手算，看看循环是否真的进入一次。",
        micro_steps: ["标出读入 n 的语句", "标出处理昵称的循环", "确认循环次数等于 n"]
      })
    );

    expect(report.hint).toContain("循环范围");
    expect(report.specificHint).toContain("连续读 n 次");
    expect(report.checkpoint).toContain("n=1");
    expect(report.microSteps).toEqual(["标出读入 n 的语句", "标出处理昵称的循环", "确认循环次数等于 n"]);
  });

  test("accepts newline micro_steps strings from loose live model responses", () => {
    const report = parseTeachingDiagnosisReport(
      JSON.stringify({
        pain_points: [{ label: "output_format", confidence: 0.7, evidence: "Extra prompt text is printed." }],
        hint: "先删掉额外的提示文字。",
        micro_steps: "1. 找到所有 print 提示语\n2. 只保留题目要求的输出\n3. 用样例逐字符对比"
      })
    );

    expect(report.microSteps).toEqual(["找到所有 print 提示语", "只保留题目要求的输出", "用样例逐字符对比"]);
  });
});

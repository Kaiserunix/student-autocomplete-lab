import { TeachingDiagnosisReport } from "./teachingReport";
import { normalizeTeachingDiagnosisReport } from "./teachingTaxonomy";
import { TeachingDiagnosisContext } from "./types";

export async function stubTeachingDiagnosis(context: TeachingDiagnosisContext): Promise<TeachingDiagnosisReport> {
  if (context.problem.id === "P1030" && /left\s*\+\s*right\s*\+\s*root/.test(context.studentCode)) {
    return normalizeTeachingDiagnosisReport({
      painPoints: [
        {
          label: "traversal_order_confusion",
          confidence: 0.9,
          evidence: "Student code emits left + right + root, which matches postorder rather than preorder."
        }
      ],
      hint: "先确认先序遍历的第一个输出应该是当前根，还是某个子树的结果。",
      skillUpdate: {
        candidate: "binary-tree-traversal-reconstruction",
        reason: "The student confused traversal output order while reconstructing a tree.",
        rules: ["For preorder output, emit the current root before recursively outputting left and right subtrees."]
      },
      recommendation: {
        problemId: "P1305",
        reason: "Practice direct preorder traversal before returning to traversal reconstruction."
      }
    });
  }

  const firstFailed = context.localEvidence.find((item) => !item.passed);

  return normalizeTeachingDiagnosisReport({
    painPoints: [
      {
        label: "needs_teacher_review",
        confidence: 0.45,
        evidence: firstFailed
          ? `Local check failed on ${firstFailed.note}: expected ${firstFailed.expectedOutput}, got ${firstFailed.actualOutput}.`
          : `OJ verdict is ${context.ojVerdict.status}, but local evidence is inconclusive.`
      }
    ],
    hint: "先挑一个最小样例，手动写出期望输出，再和程序输出对齐。",
    skillUpdate: {
      candidate: "evidence-first-debugging",
      reason: "The system could not map the failure to a known stable pain point.",
      rules: ["Compare one minimal expected output against actual output before changing the algorithm."]
    },
    recommendation: {
      problemId: context.problem.id,
      reason: "Stay on the current problem until the observable failure has a concrete explanation."
    }
  });
}

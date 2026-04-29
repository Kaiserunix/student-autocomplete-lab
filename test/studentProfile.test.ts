import { describe, expect, test } from "vitest";
import { applyTeachingDiagnosis } from "../src/teaching/studentProfile";

describe("student profile updates", () => {
  test("turns a teaching diagnosis into weighted pain-point and skill-candidate updates", () => {
    const profile = applyTeachingDiagnosis(
      {
        studentId: "local-student",
        painPoints: {
          subtree_boundary: {
            count: 2,
            score: 1.4,
            lastSeen: "2026-04-29T00:00:00.000Z"
          }
        },
        skillCandidates: {}
      },
      {
        painPoints: [
          {
            label: "subtree_boundary",
            confidence: 0.8,
            evidence: "Wrong postorder slice starts at k + 1."
          }
        ],
        hint: "检查右子树在后序序列中从哪里开始。",
        skillUpdate: {
          candidate: "binary-tree-traversal-reconstruction",
          reason: "Repeated subtree-boundary mistakes.",
          rules: ["Compute left subtree size before slicing postorder."]
        },
        recommendation: {
          problemId: "P1305",
          reason: "Practice preorder traversal output."
        }
      },
      "2026-04-30T00:00:00.000Z"
    );

    expect(profile.painPoints.subtree_boundary).toEqual({
      count: 3,
      score: 2.2,
      lastSeen: "2026-04-30T00:00:00.000Z"
    });
    expect(profile.skillCandidates["binary-tree-traversal-reconstruction"]).toMatchObject({
      count: 1,
      sourcePainPoints: ["subtree_boundary"],
      status: "candidate"
    });
  });
});

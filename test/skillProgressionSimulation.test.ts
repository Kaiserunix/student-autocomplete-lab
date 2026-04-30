import { describe, expect, test } from "vitest";
import { applyTeachingDiagnosis, createEmptyStudentProfile, profileSummary } from "../src/teaching/studentProfile";

describe("skill progression simulation", () => {
  test("moves a repeated beginner pain point into a ready skill candidate", () => {
    let profile = createEmptyStudentProfile("simulated-student");

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      profile = applyTeachingDiagnosis(
        profile,
        {
          painPoints: [
            {
              label: "loop_boundary",
              confidence: 0.9,
              evidence: `attempt ${attempt}: off-by-one on the last item`
            }
          ],
          hint: "先手推最后一个下标。",
          skillUpdate: {
            candidate: "python-loop-boundary-check",
            reason: "Repeated loop boundary misses across beginner tasks.",
            rules: ["Before writing the loop, write the first and last valid index."]
          }
        },
        `2026-04-30T10:0${attempt}:00.000Z`
      );
    }

    expect(profile.painPoints.loop_boundary.count).toBe(3);
    expect(profile.skillCandidates["python-loop-boundary-check"]).toMatchObject({
      count: 3,
      status: "ready",
      sourcePainPoints: ["loop_boundary"]
    });
    expect(profileSummary(profile).activeSkills).toContain("python-loop-boundary-check");
  });

  test("simulates growth from syntax pain to algorithmic complexity pain", () => {
    let profile = createEmptyStudentProfile("simulated-student");
    const reports = [
      {
        label: "input_parsing",
        skill: "python-input-normalization",
        evidence: "cannot parse multiple integers"
      },
      {
        label: "loop_boundary",
        skill: "python-loop-boundary-check",
        evidence: "misses the final element"
      },
      {
        label: "traversal_order_confusion",
        skill: "binary-tree-traversal-reconstruction",
        evidence: "prints left/right before root"
      },
      {
        label: "bruteforce_no_growth",
        skill: "complexity-upgrade-from-bruteforce",
        evidence: "AC with brute force but misses transferable counting model"
      },
      {
        label: "bruteforce_no_growth",
        skill: "complexity-upgrade-from-bruteforce",
        evidence: "repeats brute force on a task meant for optimization"
      },
      {
        label: "bruteforce_no_growth",
        skill: "complexity-upgrade-from-bruteforce",
        evidence: "still cannot state expected complexity"
      }
    ];

    reports.forEach((report, index) => {
      profile = applyTeachingDiagnosis(
        profile,
        {
          painPoints: [{ label: report.label, confidence: 0.86, evidence: report.evidence }],
          hint: "只指出下一步。",
          skillUpdate: {
            candidate: report.skill,
            reason: report.evidence,
            rules: ["Write the expected model before coding."]
          }
        },
        `2026-04-30T11:0${index}:00.000Z`
      );
    });

    expect(profile.painPoints.input_parsing.count).toBe(1);
    expect(profile.painPoints.bruteforce_no_growth.count).toBe(3);
    expect(profile.skillCandidates["complexity-upgrade-from-bruteforce"].status).toBe("ready");
    expect(profileSummary(profile).activeSkills).toEqual(["complexity-upgrade-from-bruteforce"]);
  });
});

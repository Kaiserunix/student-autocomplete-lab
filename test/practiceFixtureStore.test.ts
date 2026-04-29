import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { loadPracticeFixture } from "../src/practice/fixtureStore";

describe("practice fixture store", () => {
  test("loads and parses a Codex-subagent practice fixture", async () => {
    const dir = await mkdtemp(join(tmpdir(), "practice-fixture-"));
    const fixturePath = join(dir, "P1427.codex.json");
    await writeFile(
      fixturePath,
      JSON.stringify({
        problem_id: "P1427",
        reference_solution: "nums = []",
        wrong_submissions: [
          {
            code: "print(nums)",
            expected_error: "prints list literal",
            pain_points: ["output_format"]
          }
        ],
        skill_update_candidate: {
          name: "python-output-format",
          rules: ["Print values in the required format."]
        }
      }),
      "utf8"
    );

    const report = await loadPracticeFixture(fixturePath);

    expect(report.problemId).toBe("P1427");
    expect(report.wrongSubmissions[0].painPoints).toEqual(["output_format"]);
  });
});

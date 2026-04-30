import { describe, expect, test } from "vitest";
import {
  buildSidebarTeachingContext,
  summarizeProblemForTeaching
} from "../src/sidebar/sidebarTeachingContext";
import type { ProblemRecord } from "../src/problemBank/types";

const problem: ProblemRecord = {
  platform: "luogu",
  id: "P5730",
  title: "显示屏",
  tags: ["模拟", "字符串"],
  statement: "液晶屏数字点阵题。",
  inputFormat: "第一行 n，第二行数字串。",
  outputFormat: "输出 5 行显示内容。",
  samples: [
    {
      input: "2\n01\n",
      output: "XXX...X\n"
    }
  ],
  hint: "注意间隔。"
};

describe("sidebar teaching context", () => {
  test("summarizes a selected problem without losing format and sample signals", () => {
    expect(summarizeProblemForTeaching(problem)).toContain("液晶屏数字点阵题");
    expect(summarizeProblemForTeaching(problem)).toContain("输入格式");
    expect(summarizeProblemForTeaching(problem)).toContain("样例输入");
    expect(summarizeProblemForTeaching(problem)).toContain("模拟");
  });

  test("builds a MiMo diagnosis context from the active editor and selected problem", () => {
    const context = buildSidebarTeachingContext({
      problem,
      language: "python",
      studentCode: "n=int(input())\ns=input()\nprint(s)",
      profileSummary: {
        painPointCounts: {
          output_format: 2
        },
        activeSkills: ["format-output-checklist"]
      },
      ojVerdict: {
        status: "WA",
        passedTests: 1,
        totalTests: 3
      }
    });

    expect(context.problem).toMatchObject({
      id: "P5730",
      title: "显示屏"
    });
    expect(context.problem.summary).toContain("输出格式");
    expect(context.language).toBe("python");
    expect(context.studentCode).toContain("print(s)");
    expect(context.studentProfile.activeSkills).toEqual(["format-output-checklist"]);
    expect(context.ojVerdict.status).toBe("WA");
  });
});

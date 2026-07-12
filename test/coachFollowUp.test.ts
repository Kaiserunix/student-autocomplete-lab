import { describe, expect, test } from "vitest";
import {
  buildCoachFollowUpPrompt,
  parseCoachFollowUpReport,
  requestMimoCoachFollowUp
} from "../src/teaching/coachFollowUp";

const context = {
  problem: {
    id: "MANUAL-NICKNAME-001",
    title: "校园昵称规范器",
    summary: "字符串解析题：昵称用 '-' 或 '_' 分隔，班级编号从第一个数字开始。"
  },
  language: "python",
  studentCode: "for i in range(n - 1):\n    name, rest = s.split('-')\n",
  studentRequest: "为什么这里要按 n 次读，而不是读到 EOF？",
  previousCoachTurn: "简单提示：循环少读了一行。",
  studentProfile: { painPointCounts: {}, activeSkills: [] },
  responseLanguage: "zh-CN" as const
};

describe("coach follow-up", () => {
  test("builds a prompt that prioritizes the latest student question", () => {
    const prompt = buildCoachFollowUpPrompt(context);

    expect(prompt).toContain("Do not restart the whole diagnosis");
    expect(prompt).toContain("student_request:");
    expect(prompt).toContain("为什么这里要按 n 次读，而不是读到 EOF？");
    expect(prompt).toContain("Start answer by responding to the latest student_request");
    expect(prompt).toContain('"answer"');
  });

  test("allows casual problem-scoped chat without turning it into skill diagnosis", () => {
    const prompt = buildCoachFollowUpPrompt({
      ...context,
      studentRequest: "我感觉这题好烦，我是不是太菜了？"
    });

    expect(prompt).toContain("casual");
    expect(prompt).toContain("encouragement");
    expect(prompt).toContain("Do not update Student Skill");
    expect(prompt).toContain("do not force a diagnosis");
  });

  test("can explicitly answer follow-ups in English", () => {
    const prompt = buildCoachFollowUpPrompt({
      ...context,
      studentRequest: "Can you explain it in simpler English?",
      responseLanguage: "en-US" as const
    });

    expect(prompt).toContain("Output language: English");
    expect(prompt).toContain("Can you explain it in simpler English?");
  });

  test("parses the small follow-up JSON shape", () => {
    const report = parseCoachFollowUpReport(
      JSON.stringify({
        answer: "因为题目第一行已经告诉你后面正好有 n 条记录，按 n 次读能避免多读或少读。",
        tiny_example: "如果 n=2，就只处理后面两行。",
        next_action: "先把 range(n - 1) 改成 range(n)。",
        boundary: "暂时不展开完整解析代码。"
      })
    );

    expect(report.answer).toContain("n 条记录");
    expect(report.tinyExample).toContain("n=2");
    expect(report.nextAction).toContain("range(n)");
    expect(report.boundary).toContain("完整解析代码");
  });

  test("calls MiMo with the follow-up prompt instead of the diagnosis schema", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "因为输入格式已经承诺第一行是 n，后面就有 n 个昵称；OJ 输入不是交互聊天，不能等用户再输入。",
                  tiny_example: "n=2 时，后面两行就是全部数据。",
                  next_action: "把循环次数改成 n，再跑两行输入的小样例。"
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const report = await requestMimoCoachFollowUp(
      {
        baseUrl: "https://mimo.example.test/v1",
        apiKey: "secret",
        model: "mimo-v2.5-pro"
      },
      context,
      fakeFetch as typeof fetch
    );

    expect(report.answer).toContain("输入格式");
    expect(calls[0].url).toBe("https://mimo.example.test/v1/chat/completions");
    expect(String(calls[0].init?.body)).toContain("student_request");
    expect(String(calls[0].init?.body)).not.toContain("student_error_model");
  });
});

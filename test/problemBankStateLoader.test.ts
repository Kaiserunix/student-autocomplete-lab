import { describe, expect, test } from "vitest";
import { loadProblemBankStateData } from "../src/sidebar/problemBankStateLoader";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("loadProblemBankStateData", () => {
  test("starts every loader before any result resolves and returns the results under the matching keys", async () => {
    const started: string[] = [];
    const problems = deferred<string[]>();
    const completed = deferred<number[]>();
    const studentSkill = deferred<{ revision: number }>();
    const attemptSessions = deferred<{ id: string }[]>();
    const aiStatus = deferred<{ ready: boolean }>();
    const aiConfig = deferred<{ model: string }>();
    const internalTesting = deferred<{ runs: number }>();

    const loading = loadProblemBankStateData({
      problems: () => {
        started.push("problems");
        return problems.promise;
      },
      completed: () => {
        started.push("completed");
        return completed.promise;
      },
      studentSkill: () => {
        started.push("studentSkill");
        return studentSkill.promise;
      },
      attemptSessions: () => {
        started.push("attemptSessions");
        return attemptSessions.promise;
      },
      aiStatus: () => {
        started.push("aiStatus");
        return aiStatus.promise;
      },
      aiConfig: () => {
        started.push("aiConfig");
        return aiConfig.promise;
      },
      internalTesting: () => {
        started.push("internalTesting");
        return internalTesting.promise;
      }
    });

    expect(started).toEqual([
      "problems",
      "completed",
      "studentSkill",
      "attemptSessions",
      "aiStatus",
      "aiConfig",
      "internalTesting"
    ]);

    problems.resolve(["P1000"]);
    completed.resolve([1001]);
    studentSkill.resolve({ revision: 3 });
    attemptSessions.resolve([{ id: "attempt-1" }]);
    aiStatus.resolve({ ready: true });
    aiConfig.resolve({ model: "teacher-model" });
    internalTesting.resolve({ runs: 7 });

    await expect(loading).resolves.toEqual({
      problems: ["P1000"],
      completed: [1001],
      studentSkill: { revision: 3 },
      attemptSessions: [{ id: "attempt-1" }],
      aiStatus: { ready: true },
      aiConfig: { model: "teacher-model" },
      internalTesting: { runs: 7 }
    });
  });

  test("propagates a loader rejection unchanged without starting a second round", async () => {
    const calls = {
      problems: 0,
      completed: 0,
      studentSkill: 0,
      attemptSessions: 0,
      aiStatus: 0,
      aiConfig: 0,
      internalTesting: 0
    };
    const failure = new Error("student skill unavailable");
    const once = <T>(key: keyof typeof calls, result: Promise<T>): (() => Promise<T>) =>
      () => {
        calls[key] += 1;
        return result;
      };

    const loading = loadProblemBankStateData({
      problems: once("problems", Promise.resolve(["P1000"])),
      completed: once("completed", Promise.resolve([])),
      studentSkill: once("studentSkill", Promise.reject(failure)),
      attemptSessions: once("attemptSessions", Promise.resolve([])),
      aiStatus: once("aiStatus", Promise.resolve({ ready: false })),
      aiConfig: once("aiConfig", Promise.resolve({ model: "" })),
      internalTesting: once("internalTesting", Promise.resolve({ runs: 0 }))
    });

    await expect(loading).rejects.toBe(failure);
    expect(calls).toEqual({
      problems: 1,
      completed: 1,
      studentSkill: 1,
      attemptSessions: 1,
      aiStatus: 1,
      aiConfig: 1,
      internalTesting: 1
    });
  });
});

import { describe, expect, test } from "vitest";
import { buildPythonCommand, normalizeProgramOutput } from "../src/practice/pythonRunner";

describe("python runner helpers", () => {
  test("uses the Windows py launcher when running on win32", () => {
    expect(buildPythonCommand("C:/tmp/main.py", "win32")).toEqual({
      command: "py",
      args: ["-3", "C:/tmp/main.py"]
    });
  });

  test("normalizes whitespace for contest-style output comparison", () => {
    expect(normalizeProgramOutput("1 2 3\r\n\n")).toBe("1 2 3");
  });
});

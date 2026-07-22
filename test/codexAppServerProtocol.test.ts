import { describe, expect, test } from "vitest";
import { parseAppServerMessage } from "../src/codex/appServerProtocol";

describe("Codex app-server protocol", () => {
  test("classifies responses and notifications without accepting arrays", () => {
    expect(parseAppServerMessage('{"id":1,"result":{"ok":true}}')).toEqual({
      kind: "response",
      id: 1,
      result: { ok: true }
    });
    expect(
      parseAppServerMessage('{"method":"account/updated","params":{"authMode":"chatgpt"}}')
    ).toEqual({
      kind: "notification",
      method: "account/updated",
      params: { authMode: "chatgpt" }
    });
    expect(parseAppServerMessage("[]")).toBeUndefined();
    expect(parseAppServerMessage("not-json")).toBeUndefined();
  });
});

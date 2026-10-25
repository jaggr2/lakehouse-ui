import { describe, expect, it } from "vitest";

import { parseQueryProductOutput } from "../../src/query/parse.js";

describe("parseQueryProductOutput", () => {
  it("parses the pipe table the MCP renders", () => {
    const parsed = parseQueryProductOutput(
      `message_id | subject\n--- | ---\nm-1 | Hello\nm-2 | Hel | lo\n\n2 row(s) · query_id=q-9`,
    );
    expect(parsed).toEqual({
      kind: "result",
      columns: ["message_id", "subject"],
      rows: [
        ["m-1", "Hello"],
        ["m-2", "Hel", "lo"],
      ],
      truncated: false,
      queryId: "q-9",
    });
  });

  it("reads the truncated flag", () => {
    const parsed = parseQueryProductOutput(`a | b\n--- | ---\n1 | 2\n\n1 row(s) (truncated) · query_id=q-1`);
    expect(parsed.kind).toBe("result");
    expect(parsed.kind === "result" && parsed.truncated).toBe(true);
    expect(parsed.kind === "result" && parsed.queryId).toBe("q-1");
  });

  it("understands empty results", () => {
    expect(parseQueryProductOutput("Query succeeded: no rows.")).toEqual({
      kind: "empty",
      queryId: null,
    });
  });

  it("understands guard rejections", () => {
    expect(parseQueryProductOutput("QUERY REJECTED: only SELECT / WITH statements are allowed")).toEqual({
      kind: "rejected",
      reason: "only SELECT / WITH statements are allowed",
    });
  });
});

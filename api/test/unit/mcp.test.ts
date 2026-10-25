import { describe, expect, it } from "vitest";

import { createMcpClient, McpError } from "../../src/query/mcp.js";

function jsonResponse(body: unknown, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

describe("createMcpClient", () => {
  it("calls tools/call and unwraps text content", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const client = createMcpClient({
      endpoint: "http://mcp.local/mcp",
      timeoutMs: 1000,
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return jsonResponse({
          result: { content: [{ type: "text", text: "a | b\n--- | ---\n1 | 2\n\n1 row(s) · query_id=q1" }] },
        });
      },
    });
    const text = await client.callTool("query_product", { sql: "select 1" });
    expect(text).toContain("1 row(s)");
    expect(calls[0]?.url).toBe("http://mcp.local/mcp");
    expect(calls[0]?.body).toMatchObject({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "query_product", arguments: { sql: "select 1" } },
    });
  });

  it("accepts SSE-framed JSON-RPC responses", async () => {
    const client = createMcpClient({
      endpoint: "http://mcp.local/mcp",
      timeoutMs: 1000,
      fetchImpl: async () =>
        new Response('event: message\ndata: {"result":{"content":[{"type":"text","text":"ok"}]}}\n\n', {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    });
    expect(await client.callTool("query_product", { sql: "select 1" })).toBe("ok");
  });

  it("surfaces JSON-RPC errors and HTTP failures as McpError", async () => {
    const rpcError = createMcpClient({
      endpoint: "http://mcp.local/mcp",
      timeoutMs: 1000,
      fetchImpl: async () => jsonResponse({ error: { code: -32601, message: "unknown tool" } }),
    });
    await expect(rpcError.callTool("nope", {})).rejects.toBeInstanceOf(McpError);

    const httpError = createMcpClient({
      endpoint: "http://mcp.local/mcp",
      timeoutMs: 1000,
      fetchImpl: async () => new Response("nope", { status: 503 }),
    });
    await expect(httpError.callTool("query_product", { sql: "select 1" })).rejects.toThrow("HTTP 503");

    const down = createMcpClient({
      endpoint: "http://mcp.local/mcp",
      timeoutMs: 1000,
      fetchImpl: async () => {
        throw new Error("connection refused");
      },
    });
    await expect(down.callTool("query_product", { sql: "select 1" })).rejects.toThrow("unreachable");
  });
});

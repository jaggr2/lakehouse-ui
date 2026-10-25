/**
 * Minimal MCP client for the guarded `lakehouse-mcp` (stateless streamable
 * HTTP + JSON responses — see lakehouse/mcp/lakehouse_mcp/server.py). One
 * tool is needed: `query_product` (gold-only SQL).
 */

export interface McpClientOptions {
  endpoint: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface McpClient {
  /** Call one tool and return its text content. */
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
}

export class McpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpError";
  }
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string };
}

export function createMcpClient(options: McpClientOptions): McpClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  let requestId = 0;

  return {
    async callTool(name: string, args: Record<string, unknown>): Promise<string> {
      requestId += 1;
      const payload = {
        jsonrpc: "2.0",
        id: requestId,
        method: "tools/call",
        params: { name, arguments: args },
      };
      const response = await fetchImpl(options.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(options.timeoutMs),
      }).catch((error: unknown) => {
        throw new McpError(`lakehouse-mcp unreachable at ${options.endpoint}: ${String(error)}`);
      });

      if (!response.ok) {
        throw new McpError(`lakehouse-mcp returned HTTP ${response.status}`);
      }
      const message = await readJsonRpc(response);
      if (message.error) {
        throw new McpError(`lakehouse-mcp error ${message.error.code ?? ""}: ${message.error.message ?? "unknown"}`);
      }
      return textContent(message.result);
    },
  };
}

async function readJsonRpc(response: Response): Promise<JsonRpcResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const dataLines = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());
    const last = dataLines.pop();
    return JSON.parse(last ?? "{}") as JsonRpcResponse;
  }
  return (await response.json()) as JsonRpcResponse;
}

function textContent(result: unknown): string {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return String(result);
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return JSON.stringify(result);
  return content
    .map((item) => {
      const record = item as { type?: string; text?: string };
      return record.type === "text" ? (record.text ?? "") : "";
    })
    .join("\n");
}

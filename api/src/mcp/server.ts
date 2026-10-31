/**
 * Catalog MCP server (U6) — stateless streamable HTTP with JSON responses,
 * the same minimal JSON-RPC shape our own lakehouse client speaks
 * (query/mcp.ts). One message per POST: `initialize`, `ping`, `tools/list`,
 * `tools/call`; notifications get 202 with no body.
 */
import { Hono } from "hono";

import {
  CATALOG_TOOLS,
  callCatalogTool,
  UnknownToolError,
  type ApiDispatch,
} from "./tools.js";

export const SERVER_INFO = { name: "lakehouse-catalog", version: "0.1.0" };

/** Newest first — echoed back only when the client asks for one we know. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const INSTRUCTIONS =
  "This is the governed lakehouse data catalog (gold layer). Use catalog_lookup " +
  "BEFORE choosing or recommending a data product: search with a query, then " +
  "inspect the product/table detail (purpose, limitations, trust score, " +
  "certification). Use lineage_of for where data comes from and impact_of " +
  "before renaming or dropping anything.";

interface JsonRpcError {
  code: number;
  message: string;
}

export type MessageResult =
  | { status: 200 | 400; body: Record<string, unknown> }
  | { status: 202; body: null };

function errorResponse(id: unknown, code: number, message: string): MessageResult {
  return {
    status: 200,
    body: { jsonrpc: "2.0", id: id ?? null, error: { code, message } satisfies JsonRpcError },
  };
}

function resultResponse(id: unknown, result: unknown): MessageResult {
  return { status: 200, body: { jsonrpc: "2.0", id: id ?? null, result } };
}

function invalidRequest(): MessageResult {
  return {
    status: 400,
    body: {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" } satisfies JsonRpcError,
    },
  };
}

/**
 * Process one JSON-RPC message. Returns `null` for notifications (HTTP 202).
 */
export async function handleMessage(
  dispatch: ApiDispatch,
  raw: unknown,
): Promise<MessageResult | null> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return invalidRequest();
  const message = raw as Record<string, unknown>;
  const method = message["method"];
  if (typeof method !== "string") return invalidRequest();
  const params = (message["params"] ?? {}) as Record<string, unknown>;

  // JSON-RPC notifications carry no id and expect no response.
  if (!("id" in message)) return null;
  const id = message["id"] ?? null;

  switch (method) {
    case "initialize": {
      const requested = params["protocolVersion"];
      const protocolVersion =
        typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0];
      return resultResponse(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return resultResponse(id, {});
    case "tools/list":
      return resultResponse(id, { tools: CATALOG_TOOLS });
    case "tools/call": {
      const name = params["name"];
      if (typeof name !== "string") {
        return errorResponse(id, -32602, "tools/call requires a tool name");
      }
      const args = (params["arguments"] ?? {}) as Record<string, unknown>;
      try {
        return resultResponse(id, await callCatalogTool(dispatch, name, args));
      } catch (error) {
        if (error instanceof UnknownToolError) return errorResponse(id, -32602, error.message);
        return errorResponse(id, -32603, `tool failed: ${String(error)}`);
      }
    }
    default:
      return errorResponse(id, -32601, `method not found: ${method}`);
  }
}

/** The `/api/mcp` endpoint. `dispatch` wraps the catalog REST API itself. */
export function createCatalogMcp(dispatch: ApiDispatch): Hono {
  const mcp = new Hono();

  mcp.post("/", async (c) => {
    const raw = (await c.req.json().catch(() => undefined)) as unknown;
    if (raw === undefined) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" } satisfies JsonRpcError,
        },
        400,
      );
    }
    const outcome = await handleMessage(dispatch, raw);
    if (outcome === null || outcome.body === null) return c.body(null, 202);
    return c.json(outcome.body, outcome.status);
  });

  return mcp;
}

/**
 * Parser for `lakehouse-mcp`'s `query_product` tool output (the guarded MCP
 * renders a pipe table — see lakehouse/mcp/lakehouse_mcp/server.py). When the
 * MCP grows a JSON result mode this file gets much smaller; tracked in
 * docs/DECISIONS.md (ADR-004).
 */

export type ParsedQueryOutput =
  | {
      kind: "result";
      columns: string[];
      rows: string[][];
      truncated: boolean;
      queryId: string | null;
    }
  | { kind: "empty"; queryId: string | null }
  | { kind: "rejected"; reason: string };

const FOOTER = /^(?<count>\d+) row\(s\)(?<truncated> \(truncated\))? · query_id=(?<queryId>\S+)$/;

export function parseQueryProductOutput(text: string): ParsedQueryOutput {
  const trimmed = text.trim();
  if (trimmed.startsWith("QUERY REJECTED:")) {
    return { kind: "rejected", reason: trimmed.slice("QUERY REJECTED:".length).trim() };
  }
  if (trimmed.startsWith("Query succeeded: no rows")) {
    return { kind: "empty", queryId: null };
  }

  const lines = trimmed.split("\n").map((line) => line.trimEnd());
  let footerMatch: RegExpMatchArray | null = null;
  let footerIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) continue;
    footerMatch = line.match(FOOTER);
    if (footerMatch) {
      footerIndex = index;
      break;
    }
    // tolerate trailing blank lines only
    if (line.trim() !== "") break;
  }
  const body = footerIndex >= 0 ? lines.slice(0, footerIndex) : lines;
  while (body.length > 0 && (body[body.length - 1] ?? "").trim() === "") body.pop();

  const header = body[0];
  if (header === undefined) return { kind: "empty", queryId: null };
  const columns = splitRow(header);
  const rows: string[][] = [];
  for (const line of body.slice(2)) {
    if (line.trim() === "") continue;
    rows.push(splitRow(line));
  }

  return {
    kind: "result",
    columns,
    rows,
    truncated: Boolean(footerMatch?.groups?.["truncated"]),
    queryId: footerMatch?.groups?.["queryId"] ?? null,
  };
}

function splitRow(line: string): string[] {
  return line.split(" | ").map((cell) => cell.trim());
}

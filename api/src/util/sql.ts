/**
 * Light-weight SQL text inspection. The same heuristic the MCP guard uses for
 * relation checks — good enough for usage attribution and impact text
 * matching. Precise column lineage is U2's job (sqlglot).
 */

const RELATION = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_`.]*)/gi;

export function tableRefsIn(sql: string): string[] {
  const refs = new Set<string>();
  for (const match of sql.matchAll(RELATION)) {
    const raw = match[1];
    if (!raw) continue;
    refs.add(raw.replace(/`/g, "").toLowerCase());
  }
  return [...refs];
}

export function mentionsColumn(sql: string, column: string): boolean {
  return new RegExp(`\\b${column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sql);
}

/** Map a raw relation ref onto a catalog table id, if it names a known table. */
export function resolveTableRef(
  ref: string,
  database: string,
  known: Map<string, unknown>,
): string | null {
  const candidates = ref.includes(".") ? [ref] : [`${database}.${ref}`, ref];
  for (const candidate of candidates) {
    const id = candidate.toLowerCase();
    if (known.has(id)) return id;
  }
  return null;
}

import type { Catalog } from "./artifacts/types.js";

export interface SearchHit {
  kind: "product" | "table" | "column" | "concept";
  id: string;
  label: string;
  context: string;
}

interface Candidate extends SearchHit {
  haystacks: { text: string; weight: number }[];
}

/**
 * Full-text search over products, tables, columns and concepts (U1 surface,
 * served from the same index the rest of the API uses).
 */
export function searchCatalog(catalog: Catalog, query: string, limit: number): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];

  const candidates: Candidate[] = [];
  for (const product of catalog.products) {
    candidates.push({
      kind: "product",
      id: product.id,
      label: product.name,
      context: product.description.purpose ?? product.description.usage ?? "",
      haystacks: [
        { text: product.id, weight: 3 },
        { text: product.name, weight: 3 },
        { text: product.description.purpose ?? "", weight: 1 },
        { text: product.tags.join(" "), weight: 1 },
      ],
    });
  }
  for (const table of catalog.tables.values()) {
    candidates.push({
      kind: "table",
      id: table.id,
      label: table.name,
      context: table.description ?? table.product?.name ?? "",
      haystacks: [
        { text: table.id, weight: 3 },
        { text: table.name, weight: 3 },
        { text: table.description ?? "", weight: 1 },
      ],
    });
    for (const column of table.columns) {
      candidates.push({
        kind: "column",
        id: `${table.id}.${column.name}`,
        label: column.name,
        context: `${table.name} · ${column.description ?? column.concept ?? column.type ?? ""}`,
        haystacks: [
          { text: `${table.name}.${column.name}`, weight: 3 },
          { text: column.name, weight: 2 },
          { text: column.description ?? "", weight: 1 },
          { text: column.concept ?? "", weight: 1 },
        ],
      });
    }
  }
  for (const concept of catalog.concepts) {
    candidates.push({
      kind: "concept",
      id: concept.id,
      label: concept.label,
      context: concept.grain ?? concept.notes ?? "",
      haystacks: [
        { text: concept.id, weight: 3 },
        { text: concept.label, weight: 3 },
        { text: concept.synonyms.join(" "), weight: 2 },
        { text: concept.notes ?? "", weight: 1 },
      ],
    });
  }

  const scored = candidates
    .map((candidate) => ({ candidate, score: score(candidate, needle) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.label.localeCompare(b.candidate.label));

  return scored.slice(0, limit).map(({ candidate }) => ({
    kind: candidate.kind,
    id: candidate.id,
    label: candidate.label,
    context: candidate.context,
  }));
}

function score(candidate: Candidate, needle: string): number {
  let best = 0;
  for (const { text, weight } of candidate.haystacks) {
    const value = text.toLowerCase();
    if (value === "") continue;
    if (value === needle) best = Math.max(best, 100 * weight);
    else if (value.startsWith(needle)) best = Math.max(best, 60 * weight);
    else if (value.includes(needle)) best = Math.max(best, 30 * weight);
  }
  return best;
}

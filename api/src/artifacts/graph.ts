import {
  optionalString,
  optionalStringArray,
  requireRecord,
  requireString,
} from "../util/validate.js";
import type {
  ConceptDoc,
  ContractDoc,
  EdgeKind,
  GraphData,
  GraphEdge,
  GraphNode,
  MappingDoc,
  NodeKind,
  ProductDoc,
} from "./types.js";

const NODE_KINDS = new Set<NodeKind>([
  "concept",
  "column",
  "table",
  "model",
  "source",
  "product",
  "metric",
  "domain",
  "business_term",
]);
const EDGE_KINDS = new Set<EdgeKind>([
  "contains",
  "derives_from",
  "joins_on",
  "implements",
  "measures",
  "maps_to",
  "part_of",
  "relates",
  "synonym_of",
]);

/**
 * `semantics/graph.json` — the compiled property graph. Edge direction is
 * subject-verb-object: `{"from": A, "to": B, "kind": derives_from}` reads
 * "A derives_from B" (B is upstream).
 */
export function parseGraph(doc: unknown, source: string): GraphData {
  const record = requireRecord(doc, source);
  const nodes: GraphNode[] = [];
  const nodesRaw = record["nodes"];
  if (Array.isArray(nodesRaw)) {
    nodesRaw.forEach((item, index) => {
      const where = `${source}.nodes[${index}]`;
      const node = requireRecord(item, where);
      const kind = requireString(node["kind"], `${where}.kind`);
      if (!NODE_KINDS.has(kind as NodeKind)) {
        throw new Error(`${where}.kind: unknown node kind ${kind}`);
      }
      nodes.push({
        id: requireString(node["id"], `${where}.id`),
        kind: kind as NodeKind,
        label: optionalString(node["label"], `${where}.label`) ?? requireString(node["id"], `${where}.id`),
        unit: optionalString(node["unit"], `${where}.unit`),
        grain: optionalString(node["grain"], `${where}.grain`),
        timezone: optionalString(node["timezone"], `${where}.timezone`),
        term: optionalString(node["term"], `${where}.term`),
        domain: optionalString(node["domain"], `${where}.domain`),
        type: optionalString(node["type"], `${where}.type`),
        definition: optionalString(node["definition"], `${where}.definition`),
        synonyms: optionalStringArray(node["synonyms"], `${where}.synonyms`),
        description: optionalString(node["description"], `${where}.description`),
        products: optionalStringArray(node["products"], `${where}.products`),
      });
    });
  }
  const edges: GraphEdge[] = [];
  const edgesRaw = record["edges"];
  if (Array.isArray(edgesRaw)) {
    edgesRaw.forEach((item, index) => {
      const where = `${source}.edges[${index}]`;
      const edge = requireRecord(item, where);
      const kind = requireString(edge["kind"], `${where}.kind`);
      if (!EDGE_KINDS.has(kind as EdgeKind)) {
        throw new Error(`${where}.kind: unknown edge kind ${kind}`);
      }
      edges.push({
        from: requireString(edge["from"], `${where}.from`),
        to: requireString(edge["to"], `${where}.to`),
        kind: kind as EdgeKind,
        role: optionalString(edge["role"], `${where}.role`),
        on: optionalStringArray(edge["on"], `${where}.on`),
      });
    });
  }
  return { nodes, edges, origin: "graph.json" };
}

export interface CompileInput {
  database: string;
  contracts: ContractDoc[];
  products: ProductDoc[];
  concepts: ConceptDoc[];
  mappings: MappingDoc[];
  /** unique_id → node, from the dbt manifest (may be empty). */
  dbtNodes: Map<string, { resourceType: string; name: string; alias?: string; dependsOn: string[] }>;
  /** Catalog table ids — only these dbt models collapse into a table node. */
  knownTables: Set<string>;
}

/**
 * Fallback used when `graph.json` has not been compiled yet (build_graph.py
 * lives in the data repo). Derives the same shape from contracts + products +
 * concepts + mappings + dbt refs. It deliberately emits no `joins_on` edges:
 * invented joins are exactly the failure mode the graph exists to prevent —
 * those come from the registry via graph.json.
 */
export function compileGraph(input: CompileInput): GraphData {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const addNode = (node: GraphNode): void => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (edge: GraphEdge): void => {
    edges.push(edge);
  };

  for (const product of input.products) {
    addNode({ id: `product:${product.id}`, kind: "product", label: product.name });
    for (const port of outputTables(product, input.database)) {
      addNode({ id: port, kind: "table", label: port.split(".").pop() ?? port });
      addEdge({ from: `product:${product.id}`, to: port, kind: "contains" });
    }
  }

  for (const contract of input.contracts) {
    for (const schema of contract.schemas) {
      const tableId = `${input.database}.${schema.name}`;
      addNode({ id: tableId, kind: "table", label: schema.name });
      for (const property of schema.properties) {
        const columnId = `${tableId}.${property.name}`;
        addNode({ id: columnId, kind: "column", label: property.name });
        addEdge({ from: tableId, to: columnId, kind: "contains" });
      }
    }
  }

  for (const concept of input.concepts) {
    addNode({
      id: concept.id,
      kind: "concept",
      label: concept.label,
      unit: typeof concept.unit?.["code"] === "string" ? concept.unit["code"] : undefined,
      grain: concept.grain,
      timezone: concept.timeSemantics?.timezone,
    });
    if (concept.preferredTable) {
      addNode({
        id: concept.preferredTable,
        kind: "table",
        label: concept.preferredTable.split(".").pop() ?? concept.preferredTable,
      });
    }
  }

  for (const mapping of input.mappings) {
    addNode({
      id: mapping.table,
      kind: "table",
      label: mapping.table.split(".").pop() ?? mapping.table,
    });
    for (const [column, specs] of mapping.columns) {
      const columnId = `${mapping.table}.${column}`;
      addNode({ id: columnId, kind: "column", label: column });
      addEdge({ from: mapping.table, to: columnId, kind: "contains" });
      for (const spec of specs) {
        addEdge({ from: columnId, to: spec.concept, kind: "implements", role: spec.role });
      }
    }
  }

  // dbt refs → derives_from between tables/models/sources. A dbt model that
  // materializes a known catalog table IS that table node; anything else keeps
  // its unique_id and a `model`/`source` kind.
  const modelNodeId = (uniqueId: string): string => {
    const node = input.dbtNodes.get(uniqueId);
    if (!node) return uniqueId;
    const name = node.alias ?? node.name;
    const asTable = `${input.database}.${name}`;
    return node.resourceType === "model" && input.knownTables.has(asTable) ? asTable : uniqueId;
  };
  for (const [uniqueId, node] of input.dbtNodes) {
    if (node.resourceType === "test" || node.resourceType === "unit_test") continue;
    const from = modelNodeId(uniqueId);
    if (node.resourceType !== "model" || !input.knownTables.has(from)) {
      addNode({
        id: from,
        kind: node.resourceType === "source" ? "source" : node.resourceType === "model" ? "model" : "metric",
        label: node.name,
      });
    }
    for (const parent of node.dependsOn) {
      if (input.dbtNodes.get(parent)?.resourceType === "test") continue;
      addEdge({ from, to: modelNodeId(parent), kind: "derives_from" });
    }
  }

  return { nodes: [...nodes.values()], edges, origin: "compiled" };
}

function outputTables(product: ProductDoc, database: string): string[] {
  return product.outputPorts
    .filter((port) => (port.type ?? "tables") === "tables")
    .map((port) => `${database}.${port.name}`);
}

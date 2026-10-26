/**
 * Domain model for the loaded artifacts. Parsers in `artifacts/` turn the
 * raw YAML/JSON files into these; `loadCatalog` merges them into one index.
 */

// ---------------------------------------------------------------------------
// ODCS data contracts (contracts/*.odcs.yaml)
// ---------------------------------------------------------------------------

export interface ContractProperty {
  name: string;
  logicalType?: string;
  description?: string;
  required?: boolean;
  unique?: boolean;
  /** Concept registry refs (ODCS authoritativeDefinitions[type=semanticDefinition]). */
  semanticConcepts?: string[];
  /** Per-concept extras from ODCS customProperties ("<concept>.role|conditional_on|note"). */
  conceptExtras?: Record<string, { role?: string; conditionalOn?: Record<string, unknown>; note?: string }>;
}

export interface QualityRuleSpec {
  /** e.g. rowCount, freshness, uniqueness — ODCS `metric`. */
  metric: string;
  /** e.g. "mustBeGreaterThan: 0" → { op: "mustBeGreaterThan", value: 0 }. */
  constraint?: { op: string; value: number | string };
  description?: string;
  dimension?: string;
  severity?: string;
  /** Set when the rule targets one column (ODCS `column`/`columnName`). */
  column?: string;
}

export interface ContractSchema {
  name: string;
  physicalType?: string;
  description?: string;
  granularity?: string;
  properties: ContractProperty[];
  quality: QualityRuleSpec[];
}

export interface SlaProperty {
  property: string;
  value: number | string;
  unit?: string;
  driver?: string;
}

export interface ContractDescription {
  purpose?: string;
  limitations?: string;
  usage?: string;
}

export interface ContractDoc {
  id: string;
  name: string;
  version?: string;
  status?: string;
  domain?: string;
  dataProduct?: string;
  tags: string[];
  description: ContractDescription;
  schemas: ContractSchema[];
  sla: SlaProperty[];
  /** Verbatim document — served as `ProductDetail.contract` / `TableDetail.contract`. */
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ODPS data products (products/*.odps.yaml)
// ---------------------------------------------------------------------------

export interface ProductPort {
  name: string;
  description?: string;
  type?: string;
  version?: string;
  contractId?: string;
}

export interface ProductDoc {
  id: string;
  name: string;
  domain?: string;
  status?: string;
  version?: string;
  tags: string[];
  description: ContractDescription;
  outputPorts: ProductPort[];
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Semantic layer (semantics/concepts/*.yaml, semantics/mappings/*.yaml)
// ---------------------------------------------------------------------------

export interface ConceptExample {
  q: string;
  sql?: string;
}

export interface ConceptDoc {
  id: string;
  label: string;
  synonyms: string[];
  unit?: Record<string, unknown>;
  grain?: string;
  timeSemantics?: { timezone?: string; eventColumn?: string };
  entity?: string;
  preferredTable?: string;
  notes?: string;
  examples: ConceptExample[];
}

export interface ColumnMapping {
  concept: string;
  role?: string;
  note?: string;
  conditionalOn?: Record<string, unknown>;
}

export interface MappingDoc {
  table: string;
  /** Column -> one or more concept mappings (lists express polymorphic columns). */
  columns: Map<string, ColumnMapping[]>;
}

// ---------------------------------------------------------------------------
// Knowledge graph (semantics/graph.json, or compiled from the parts above)
// ---------------------------------------------------------------------------

export type NodeKind =
  | "concept"
  | "column"
  | "table"
  | "model"
  | "source"
  | "product"
  | "metric"
  | "domain"
  | "business_term";
export type EdgeKind =
  | "contains"
  | "derives_from"
  | "joins_on"
  | "implements"
  | "measures"
  | "maps_to"
  | "part_of"
  | "relates"
  | "synonym_of";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  unit?: string;
  grain?: string;
  timezone?: string;
  /** business layer (domain / business_term nodes) */
  term?: string;
  domain?: string;
  type?: string;
  definition?: string;
  synonyms?: string[];
  description?: string;
  products?: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  role?: string;
  on?: string[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** graph.json when present, otherwise compiled at load time (see graph.ts). */
  origin: "graph.json" | "compiled";
}

// ---------------------------------------------------------------------------
// dbt artifacts (target/manifest.json, target/run_results.json, sources.json)
// ---------------------------------------------------------------------------

export type DbtResourceType = "model" | "test" | "source" | "seed" | "snapshot" | "metric" | string;

export interface DbtNode {
  uniqueId: string;
  resourceType: DbtResourceType;
  name: string;
  alias?: string;
  packageName?: string;
  database?: string;
  schema?: string;
  relationName?: string;
  description?: string;
  dependsOn: string[];
  /** dbt ≥1.8: the model a test is attached to. */
  attachedNode?: string;
  columnName?: string;
  rawCode?: string;
  compiledSql?: string;
  columns: string[];
  loadedAtField?: string;
  freshness?: Record<string, unknown>;
}

export interface DbtRunResult {
  uniqueId: string;
  status: string;
  failures?: number;
  message?: string;
  runAt?: string;
  /** source-freshness results */
  maxLoadedAt?: string;
  ageHours?: number;
}

export interface DbtArtifacts {
  projectName?: string;
  manifestGeneratedAt?: string;
  runGeneratedAt?: string;
  nodes: Map<string, DbtNode>;
  runResults: DbtRunResult[];
  /** set when manifest/run_results could not be loaded at all */
  missing: boolean;
}

// ---------------------------------------------------------------------------
// Merged catalog
// ---------------------------------------------------------------------------

export interface ColumnEntry {
  name: string;
  type?: string;
  description?: string;
  required?: boolean;
  unique?: boolean;
  concept?: string;
  conceptRole?: string;
  conceptConditionalOn?: Record<string, unknown>;
}

export interface TableEntry {
  id: string; // lake_gold.mail_activity
  database: string;
  name: string; // mail_activity
  description?: string;
  contract?: ContractDoc;
  contractSchema?: ContractSchema;
  product?: ProductDoc;
  columns: ColumnEntry[];
  /** dbt model (or source node) that materializes the table. */
  model?: DbtNode;
  sla: SlaProperty[];
}

export interface ArtifactHealth {
  [artifact: string]: string;
}

export interface Catalog {
  database: string;
  health: ArtifactHealth;
  contracts: ContractDoc[];
  products: ProductDoc[];
  concepts: ConceptDoc[];
  mappings: MappingDoc[];
  graph: GraphData;
  dbt: DbtArtifacts;
  tables: Map<string, TableEntry>;
  conceptsById: Map<string, ConceptDoc>;
}

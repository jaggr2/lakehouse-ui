// Typed client models — mirror openapi.yaml component schemas (the law).

export interface SearchHit {
  kind: 'product' | 'table' | 'column' | 'concept';
  id: string;
  label: string;
  context: string;
}

export interface Product {
  id: string;
  name: string;
  purpose: string;
  status: string;
  tables: string[];
  trustScore: number;
  usageCount: number;
}

export interface ProductDetail extends Product {
  contract: Record<string, unknown>;
  limitations: string;
  concepts: string[];
}

export interface TableColumn {
  name: string;
  type: string;
  description: string;
  concept: string | null;
  quality: string[];
}

export interface TableDetail {
  id: string;
  database: string;
  columns: TableColumn[];
  contract: Record<string, unknown>;
  trustScore: number;
}

export type NodeKind = 'product' | 'table' | 'column' | 'model' | 'source' | 'concept';
export type EdgeKind = 'contains' | 'derives_from' | 'joins_on' | 'implements' | 'measures' | 'synonym_of';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  on?: string[];
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ImpactReport {
  asset: string;
  downstream: {
    models: string[];
    contracts: string[];
    products: string[];
    queries: string[];
  };
  notes: string[];
}

export interface TrustComponent {
  name: 'contract' | 'tests' | 'freshness' | 'usage';
  score: number;
  weight: number;
  known: boolean;
  evidence: string;
}

export interface TrustBreakdown {
  score: number;
  status: 'trusted' | 'mixed' | 'weak' | 'unknown';
  components: TrustComponent[];
}

export interface QualityRule {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'unknown';
  source: 'odcs' | 'dbt' | 'freshness';
  column: string | null;
  description: string;
  severity: string | null;
  dimension: string | null;
}

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'unknown';
  rawStatus: string;
  runAt: string | null;
  failures: number | null;
  message: string | null;
  column: string | null;
}

export interface QualityReport {
  tableId: string;
  trustScore: number;
  trust: TrustBreakdown;
  freshness: Record<string, unknown>;
  rules: QualityRule[];
  testHistory: TestResult[];
}

export interface UsageConsumer {
  actor: string;
  queries: number;
}

export interface UsageReport {
  tableId: string;
  windowDays: number;
  totalQueries: number;
  daily: { date: string; count: number }[];
  topConsumers: UsageConsumer[];
}

export interface Concept {
  id: string;
  label: string;
  synonyms: string[];
  unit: Record<string, unknown>;
  grain: string;
  columns: { table: string; column: string; role: string }[];
}

export interface QueryResponse {
  sql: string;
  columns: string[];
  rows: string[][];
  grounding: { concepts: string[]; joins: string[]; timezone: string };
  truncated: boolean;
}

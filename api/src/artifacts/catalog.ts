import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import { parseContract } from "./contracts.js";
import { compileGraph, parseGraph, type CompileInput } from "./graph.js";
import {
  emptyDbt,
  parseManifest,
  parseRunGeneratedAt,
  parseRunResults,
} from "./dbt.js";
import { parseProduct } from "./products.js";
import { parseConcept, parseMapping } from "./semantics.js";
import type {
  Catalog,
  ColumnEntry,
  ColumnMapping,
  ContractDoc,
  DbtArtifacts,
  DbtNode,
  DbtRunResult,
  MappingDoc,
  ProductDoc,
  TableEntry,
} from "./types.js";

export interface LoadCatalogOptions {
  /** Checkout of the data repo's `lakehouse/` directory. */
  artifactsDir: string;
  /** dbt `target/` directory (manifest.json / run_results.json / sources.json). */
  dbtTargetDir: string;
  /** Gold database name; table ids are `<database>.<table>`. */
  database: string;
}

interface Loaded<T> {
  items: T[];
  errors: string[];
}

function readYamlDir(dir: string, suffix: string): Loaded<{ file: string; doc: unknown }> {
  const items: Loaded<{ file: string; doc: unknown }>["items"] = [];
  const errors: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return { items, errors: [`missing directory ${dir} (${String(error)})`] };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(suffix)) continue;
    const file = path.join(dir, entry.name);
    try {
      items.push({ file, doc: parseYaml(fs.readFileSync(file, "utf8")) });
    } catch (error) {
      errors.push(`${file}: ${String(error)}`);
    }
  }
  return { items, errors };
}

function readJson(file: string): { doc: unknown; error: string | null } {
  try {
    return { doc: JSON.parse(fs.readFileSync(file, "utf8")), error: null };
  } catch (error) {
    return { doc: null, error: `${file}: ${String(error)}` };
  }
}

function parseAll<T>(
  loaded: Loaded<{ file: string; doc: unknown }>,
  parse: (doc: unknown, source: string) => T,
): Loaded<T> {
  const items: T[] = [];
  const errors = [...loaded.errors];
  for (const { file, doc } of loaded.items) {
    try {
      items.push(parse(doc, file));
    } catch (error) {
      errors.push(String(error));
    }
  }
  return { items, errors };
}

function healthLine(loaded: Loaded<unknown>, label: string): string {
  if (loaded.errors.length > 0) {
    const detail = loaded.errors.slice(0, 2).join("; ");
    return `degraded - ${loaded.items.length} ${label} loaded, ${loaded.errors.length} error(s): ${detail}`;
  }
  return `ok - ${loaded.items.length} ${label}`;
}

export function tableIdOf(database: string, name: string): string {
  const trimmed = name.trim().replace(/^`|`$/g, "");
  return trimmed.includes(".") ? trimmed.toLowerCase() : `${database}.${trimmed.toLowerCase()}`;
}

function tableEntry(tables: Map<string, TableEntry>, database: string, name: string): TableEntry {
  const id = tableIdOf(database, name);
  const existing = tables.get(id);
  if (existing) return existing;
  const entry: TableEntry = {
    id,
    database: id.split(".")[0] ?? database,
    name: id.split(".").slice(1).join("."),
    columns: [],
    sla: [],
  };
  tables.set(id, entry);
  return entry;
}

function upsertColumn(entry: TableEntry, column: ColumnEntry): void {
  const existing = entry.columns.find((item) => item.name === column.name);
  if (!existing) {
    entry.columns.push(column);
    return;
  }
  for (const [key, value] of Object.entries(column) as [keyof ColumnEntry, unknown][]) {
    if (value !== undefined) Object.assign(existing, { [key]: value });
  }
}

/**
 * Load every artifact under the lakehouse checkout and merge them into one
 * catalog. Individual files are fault-isolated: a malformed artifact shows up
 * in `health` instead of taking the service down.
 */
export function loadCatalog(options: LoadCatalogOptions): Catalog {
  const { artifactsDir, dbtTargetDir, database } = options;
  const health: Catalog["health"] = {};

  const contracts = parseAll(
    readYamlDir(path.join(artifactsDir, "contracts"), ".odcs.yaml"),
    parseContract,
  );
  health["contracts"] = healthLine(contracts, "contract(s)");

  const products = parseAll(
    readYamlDir(path.join(artifactsDir, "products"), ".odps.yaml"),
    parseProduct,
  );
  health["products"] = healthLine(products, "product(s)");

  const concepts = parseAll(
    readYamlDir(path.join(artifactsDir, "semantics", "concepts"), ".yaml"),
    parseConcept,
  );
  health["concepts"] = healthLine(concepts, "concept(s)");

  const mappings = parseAll(
    readYamlDir(path.join(artifactsDir, "semantics", "mappings"), ".yaml"),
    parseMapping,
  );
  // The column->concept mapping is authored in dbt meta and compiled into the
  // contracts (authoritativeDefinitions + customProperties); the legacy
  // semantics/mappings/ dir is only a fallback for older artifacts.
  const contractMappings = contracts.items.flatMap((doc) => mappingFromContract(doc, database));
  const mappingDocs = contractMappings.length > 0 ? contractMappings : mappings.items;
  health["mappings"] =
    contractMappings.length > 0
      ? `ok - ${contractMappings.length} contract-derived mapping(s)`
      : healthLine(mappings, "mapping file(s)");

  const tables = new Map<string, TableEntry>();

  for (const contract of contracts.items) {
    for (const schema of contract.schemas) {
      const entry = tableEntry(tables, database, schema.name);
      entry.contract = contract;
      entry.contractSchema = schema;
      entry.sla = contract.sla;
      entry.description ??= schema.description;
      for (const property of schema.properties) {
        upsertColumn(entry, {
          name: property.name,
          type: property.logicalType,
          description: property.description,
          required: property.required,
          unique: property.unique,
        });
      }
    }
  }

  for (const product of products.items) {
    for (const port of product.outputPorts) {
      const entry = tableEntry(tables, database, port.name);
      entry.product = product;
      entry.description ??= port.description;
    }
    linkProductToContracts(product, contracts.items, tables, database);
  }

  for (const mapping of mappingDocs) {
    const entry = tableEntry(tables, database, mapping.table);
    for (const [column, specs] of mapping.columns) {
      const primary = specs[0];
      upsertColumn(entry, {
        name: column,
        concept: primary?.concept,
        conceptRole: primary?.role,
        conceptConditionalOn: primary?.conditionalOn,
      });
    }
  }

  // dbt artifacts — lineage + test/freshness evidence.
  const dbt = loadDbt(dbtTargetDir, health);
  for (const node of dbt.nodes.values()) {
    if (node.resourceType !== "model") continue;
    const name = node.alias ?? node.name;
    const target = `${node.schema ? `${node.schema}.` : ""}${name}`;
    const entry = tables.get(tableIdOf(database, target));
    if (entry) {
      entry.model = node;
      entry.description ??= node.description;
    }
  }

  const graph = loadGraph(artifactsDir, health, {
    database,
    contracts: contracts.items,
    products: products.items,
    concepts: concepts.items,
    mappings: mappingDocs,
    dbtNodes: dbt.nodes,
    knownTables: new Set(tables.keys()),
  });

  return {
    database,
    health,
    contracts: contracts.items,
    products: products.items,
    concepts: concepts.items,
    mappings: mappingDocs,
    graph,
    dbt,
    tables,
    conceptsById: new Map(concepts.items.map((concept) => [concept.id, concept])),
  };
}

function linkProductToContracts(
  product: ProductDoc,
  contracts: ContractDoc[],
  tables: Map<string, TableEntry>,
  database: string,
): void {
  for (const contract of contracts) {
    const byPort = product.outputPorts.some((port) => port.contractId === contract.id);
    const byDataProduct =
      contract.dataProduct !== undefined &&
      (contract.dataProduct === product.id || product.outputPorts.some((p) => p.name === contract.dataProduct));
    if (!byPort && !byDataProduct) continue;
    for (const schema of contract.schemas) {
      const entry = tables.get(tableIdOf(database, schema.name));
      if (entry) entry.product ??= product;
    }
  }
}

function loadDbt(dbtTargetDir: string, health: Catalog["health"]): DbtArtifacts {
  const manifestPath = path.join(dbtTargetDir, "manifest.json");
  const runResultsPath = path.join(dbtTargetDir, "run_results.json");
  const sourcesPath = path.join(dbtTargetDir, "sources.json");

  const manifestRead = readJson(manifestPath);
  const runRead = readJson(runResultsPath);
  const freshnessRead = fs.existsSync(sourcesPath) ? readJson(sourcesPath) : { doc: null, error: null };

  if (manifestRead.error && runRead.error) {
    health["dbt"] =
      `degraded - no dbt artifacts at ${dbtTargetDir} (lineage, test results and ` +
      `freshness need target/manifest.json + target/run_results.json)`;
    return emptyDbt();
  }

  const nodes = new Map<string, DbtNode>();
  let projectName: string | undefined;
  let manifestGeneratedAt: string | undefined;
  if (manifestRead.doc !== null) {
    try {
      const parsed = parseManifest(manifestRead.doc, manifestPath);
      projectName = parsed.projectName;
      manifestGeneratedAt = parsed.manifestGeneratedAt;
      for (const [id, node] of parsed.nodes) nodes.set(id, node);
      health["dbt_manifest"] = `ok - ${nodes.size} node(s), generated ${manifestGeneratedAt ?? "unknown"}`;
    } catch (error) {
      health["dbt_manifest"] = `degraded - ${String(error)}`;
    }
  } else {
    health["dbt_manifest"] = `degraded - ${manifestRead.error}`;
  }

  const runResults: DbtRunResult[] = [];
  let runGeneratedAt: string | undefined;
  if (runRead.doc !== null) {
    try {
      runResults.push(...parseRunResults(runRead.doc, runResultsPath));
      runGeneratedAt = parseRunGeneratedAt(runRead.doc, runResultsPath);
      health["dbt_run_results"] = `ok - ${runResults.length} result(s), generated ${runGeneratedAt ?? "unknown"}`;
    } catch (error) {
      health["dbt_run_results"] = `degraded - ${String(error)}`;
    }
  } else {
    health["dbt_run_results"] = `degraded - ${runRead.error}`;
  }
  if (freshnessRead.doc !== null) {
    try {
      runResults.push(...parseRunResults(freshnessRead.doc, sourcesPath));
    } catch (error) {
      health["dbt_source_freshness"] = `degraded - ${String(error)}`;
    }
  }

  return {
    projectName,
    manifestGeneratedAt,
    runGeneratedAt,
    nodes,
    runResults,
    missing: false,
  };
}

function loadGraph(
  artifactsDir: string,
  health: Catalog["health"],
  compileInput: CompileInput,
): Catalog["graph"] {
  const graphPath = path.join(artifactsDir, "semantics", "graph.json");
  if (fs.existsSync(graphPath)) {
    const read = readJson(graphPath);
    if (read.doc !== null) {
      try {
        const graph = parseGraph(read.doc, graphPath);
        health["graph"] = `ok - graph.json, ${graph.nodes.length} node(s)/${graph.edges.length} edge(s)`;
        return graph;
      } catch (error) {
        health["graph"] = `degraded - ${String(error)}; falling back to compiled graph`;
      }
    } else {
      health["graph"] = `degraded - ${read.error}; falling back to compiled graph`;
    }
  }
  const graph = compileGraph(compileInput);
  health["graph"] =
    `ok - compiled from concepts+mappings+dbt (no semantics/graph.json), ` +
    `${graph.nodes.length} node(s)/${graph.edges.length} edge(s)`;
  return graph;
}

/** `lake_gold.mail_activity` or bare `mail_activity` → canonical table id. */
export function normalizeTableId(
  raw: string,
  catalog: Pick<Catalog, "database" | "tables">,
): string | null {
  const id = tableIdOf(catalog.database, raw);
  if (catalog.tables.has(id)) return id;
  const bare = raw.trim().replace(/^`|`$/g, "").toLowerCase();
  for (const candidate of catalog.tables.values()) {
    if (candidate.name === bare) return candidate.id;
  }
  return null;
}

/** Column->concept mappings from a contract's standard ODCS fields
 * (authoritativeDefinitions[type=semanticDefinition] + customProperties,
 * generated from dbt meta by lakehouse-derog's tools/gen_odcs.py). */
function mappingFromContract(doc: ContractDoc, database: string): MappingDoc[] {
  return doc.schemas.map((schema) => {
    const columns = new Map<string, ColumnMapping[]>();
    for (const prop of schema.properties) {
      const specs: ColumnMapping[] = [];
      for (const concept of prop.semanticConcepts ?? []) {
        const extra = prop.conceptExtras?.[concept] ?? {};
        specs.push({ concept, role: extra.role, conditionalOn: extra.conditionalOn, note: extra.note });
      }
      if (specs.length > 0) columns.set(prop.name, specs);
    }
    return { table: `${database}.${schema.name}`, columns };
  });
}

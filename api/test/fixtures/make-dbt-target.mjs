/**
 * Regenerates the dbt `target/` fixture (manifest.json, run_results.json,
 * sources.json) used by the api tests. The dbt artifacts are produced by the
 * data repo's CI and are not committed there, so the api tests ship a fixture
 * in dbt's real format — lineage mirrors lakehouse/dbt/models (checked
 * 2026-10-25).
 *
 *   node test/fixtures/make-dbt-target.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "artifacts", "dbt", "target");
fs.mkdirSync(outDir, { recursive: true });

const GENERATED_AT = "2026-10-25T02:20:00.000Z";
const PROJECT = "lakehouse";

const model = (name, { dependsOn, columns = {}, description = "", rawCode = "", schema = "lake_gold" }) => [
  `model.${PROJECT}.${name}`,
  {
    resource_type: "model",
    name,
    alias: name,
    package_name: PROJECT,
    database: "lakehouse",
    schema,
    relation_name: `"lakehouse"."${schema}"."${name}"`,
    description,
    columns,
    depends_on: { nodes: dependsOn },
    raw_code: rawCode,
    compiled_sql: rawCode,
    config: { materialized: "table" },
    path: `${name}.sql`,
  },
];

const source = (sourceName, table, { loadedAtField = "ingest_ts", freshness = {} } = {}) => [
  `source.${PROJECT}.${sourceName}.${table}`,
  {
    resource_type: "source",
    name: table,
    package_name: PROJECT,
    database: "lakehouse",
    schema: `lake_${sourceName}`,
    source_name: sourceName,
    loaded_at_field: loadedAtField,
    freshness,
    depends_on: { nodes: [] },
    columns: {},
    description: `bronze.${table}`,
  },
];

const test = (name, { attachedNode, columnName, dependsOn, description = "" }) => [
  `test.${PROJECT}.${name}.f1x9`,
  {
    resource_type: "test",
    name,
    package_name: PROJECT,
    attached_node: attachedNode,
    column_name: columnName,
    depends_on: { nodes: dependsOn ?? [attachedNode] },
    description,
    columns: {},
  },
];

const models = [
  model("stg_arr_history", { dependsOn: [`source.${PROJECT}.bronze.arr_history`], schema: "lake_silver", rawCode: "select * from {{ source('bronze', 'arr_history') }}" }),
  model("stg_github_workflow_runs", { dependsOn: [`source.${PROJECT}.bronze.github_workflow_runs`], schema: "lake_silver", rawCode: "select * from {{ source('bronze', 'github_workflow_runs') }}" }),
  model("stg_gmail_messages", { dependsOn: [`source.${PROJECT}.bronze.gmail_messages_raw`], schema: "lake_silver", rawCode: "select * from {{ source('bronze', 'gmail_messages_raw') }}" }),
  model("stg_ha_state_changes", { dependsOn: [`source.${PROJECT}.bronze.ha_state_changes`], schema: "lake_silver", rawCode: "select * from {{ source('bronze', 'ha_state_changes') }}" }),
  model("int_ha_entity_dimension", {
    dependsOn: [
      `source.${PROJECT}.bronze.ha_registry_entities`,
      `source.${PROJECT}.bronze.ha_registry_devices`,
      `source.${PROJECT}.bronze.ha_registry_areas`,
    ],
    schema: "lake_silver",
    rawCode: "select * from {{ source('bronze', 'ha_registry_entities') }}",
  }),
  model("mail_activity", {
    dependsOn: [`model.${PROJECT}.stg_gmail_messages`],
    description: "One row per Gmail message (deduped by message_id).",
    rawCode: "select message_id, thread_id, internal_date from {{ ref('stg_gmail_messages') }}",
    columns: {
      message_id: { description: "Gmail message id" },
      thread_id: { description: "Gmail thread id" },
      internal_date: { description: "Internal date header" },
    },
  }),
  model("parcel_events", {
    dependsOn: [`model.${PROJECT}.stg_gmail_messages`],
    description: "Parcel lifecycle events parsed from delivery/shop mail.",
    rawCode: "select event_id, event_at, carrier, message_id from {{ ref('stg_gmail_messages') }}",
    columns: {
      event_id: { description: "Event id" },
      event_at: { description: "Event timestamp" },
      carrier: { description: "Carrier name" },
    },
  }),
  model("home_environment", {
    dependsOn: [`model.${PROJECT}.stg_ha_state_changes`, `model.${PROJECT}.int_ha_entity_dimension`],
    description: "Numeric sensor readings enriched with area/device context.",
    rawCode: "select entity_id, value, read_at from {{ ref('stg_ha_state_changes') }}",
    columns: {
      entity_id: { description: "HA entity id" },
      value: { description: "Numeric reading" },
      read_at: { description: "Reading timestamp" },
    },
  }),
  model("home_automation_activity", {
    dependsOn: [`model.${PROJECT}.stg_ha_state_changes`, `model.${PROJECT}.int_ha_entity_dimension`],
    description: "Discrete state transitions of non-sensor entities.",
    rawCode: "select entity_id, changed_at from {{ ref('stg_ha_state_changes') }}",
  }),
  model("media_activity", {
    dependsOn: [`model.${PROJECT}.stg_arr_history`],
    description: "Media acquisition activity across the *arr stack.",
    rawCode: "select service, event_id, occurred_at from {{ ref('stg_arr_history') }}",
  }),
  model("homelab_ops", {
    dependsOn: [`model.${PROJECT}.stg_github_workflow_runs`],
    description: "Pipeline self-observability.",
    rawCode: "select run_id, workflow_name from {{ ref('stg_github_workflow_runs') }}",
  }),
];

const sources = [
  source("bronze", "arr_history", { freshness: { warn_after: { count: 26, period: "hour" }, error_after: { count: 48, period: "hour" } } }),
  source("bronze", "github_workflow_runs", { freshness: { warn_after: { count: 26, period: "hour" }, error_after: { count: 48, period: "hour" } } }),
  source("bronze", "gmail_messages_raw", { freshness: { warn_after: { count: 26, period: "hour" }, error_after: { count: 48, period: "hour" } } }),
  source("bronze", "ha_state_changes", { loadedAtField: "last_updated", freshness: { warn_after: { count: 26, period: "hour" }, error_after: { count: 48, period: "hour" } } }),
  source("bronze", "ha_registry_entities", { loadedAtField: "snapshot_at" }),
  source("bronze", "ha_registry_devices", { loadedAtField: "snapshot_at" }),
  source("bronze", "ha_registry_areas", { loadedAtField: "snapshot_at" }),
];

const tests = [
  test("unique_combination_of_columns_media_activity__service__event_id", { attachedNode: `model.${PROJECT}.media_activity` }),
  test("not_null_media_activity_service", { attachedNode: `model.${PROJECT}.media_activity`, columnName: "service" }),
  test("not_null_media_activity_event_id", { attachedNode: `model.${PROJECT}.media_activity`, columnName: "event_id" }),
  test("not_null_media_activity_occurred_at", { attachedNode: `model.${PROJECT}.media_activity`, columnName: "occurred_at" }),
  test("not_null_home_environment_entity_id", { attachedNode: `model.${PROJECT}.home_environment`, columnName: "entity_id" }),
  test("not_null_home_environment_read_at", { attachedNode: `model.${PROJECT}.home_environment`, columnName: "read_at" }),
  test("not_null_home_environment_value", { attachedNode: `model.${PROJECT}.home_environment`, columnName: "value" }),
  test("not_null_home_automation_activity_entity_id", { attachedNode: `model.${PROJECT}.home_automation_activity`, columnName: "entity_id" }),
  test("not_null_home_automation_activity_changed_at", { attachedNode: `model.${PROJECT}.home_automation_activity`, columnName: "changed_at" }),
  test("unique_combination_of_columns_parcel_events__event_id", { attachedNode: `model.${PROJECT}.parcel_events` }),
  test("not_null_parcel_events_event_at", { attachedNode: `model.${PROJECT}.parcel_events`, columnName: "event_at" }),
  test("accepted_values_parcel_events__event_type", { attachedNode: `model.${PROJECT}.parcel_events`, columnName: "event_type" }),
  test("unique_combination_of_columns_homelab_ops__run_id", { attachedNode: `model.${PROJECT}.homelab_ops` }),
  test("not_null_homelab_ops_run_id", { attachedNode: `model.${PROJECT}.homelab_ops`, columnName: "run_id" }),
  test("not_null_homelab_ops_workflow_name", { attachedNode: `model.${PROJECT}.homelab_ops`, columnName: "workflow_name" }),
  test("unique_combination_of_columns_mail_activity__message_id", { attachedNode: `model.${PROJECT}.mail_activity` }),
  test("not_null_mail_activity_message_id", { attachedNode: `model.${PROJECT}.mail_activity`, columnName: "message_id" }),
  test("not_null_mail_activity_internal_date", { attachedNode: `model.${PROJECT}.mail_activity`, columnName: "internal_date" }),
  test("not_null_mail_activity_ingest_ts", { attachedNode: `model.${PROJECT}.mail_activity`, columnName: "ingest_ts" }),
];

const manifest = {
  metadata: {
    dbt_schema_version: "https://schemas.getdbt.com/dbt/manifest/v12.json",
    project_name: PROJECT,
    generated_at: GENERATED_AT,
  },
  nodes: Object.fromEntries([...models, ...tests]),
  sources: Object.fromEntries(sources),
};

const modelResult = ([uniqueId, node], index) => ({
  unique_id: uniqueId,
  status: "success",
  execution_time: 2 + index,
  timing: [
    { name: "compile", started_at: "2026-10-25T02:15:00.000Z", completed_at: "2026-10-25T02:15:02.000Z" },
    { name: "execute", started_at: "2026-10-25T02:15:02.000Z", completed_at: "2026-10-25T02:15:05.000Z" },
  ],
  message: null,
});

// One deliberate failure so the trust score has something to say.
const testResult = ([uniqueId, node]) => {
  const failing = node.name === "accepted_values_parcel_events__event_type";
  return {
    unique_id: uniqueId,
    status: failing ? "fail" : "pass",
    failures: failing ? 3 : 0,
    message: failing ? "3 values not in accepted list" : null,
    execution_time: 0.4,
    timing: [{ name: "execute", started_at: "2026-10-25T02:18:00.000Z", completed_at: "2026-10-25T02:18:01.000Z" }],
  };
};

const runResults = {
  generated_at: GENERATED_AT,
  metadata: { project_name: PROJECT, generated_at: GENERATED_AT },
  results: [
    ...models.map(modelResult),
    ...tests.map(testResult),
  ],
};

const sourcesJson = {
  generated_at: GENERATED_AT,
  metadata: { project_name: PROJECT, generated_at: GENERATED_AT },
  results: sources.map(([uniqueId, node]) => ({
    unique_id: uniqueId,
    max_loaded_at: "2026-10-25T01:45:00.000Z",
    snapshotted_at: GENERATED_AT,
    age: 0.58,
    status: "pass",
    criteria: [
      { field: "loaded_at_field", expression: node.loaded_at_field },
    ],
  })),
};

fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "run_results.json"), `${JSON.stringify(runResults, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "sources.json"), `${JSON.stringify(sourcesJson, null, 2)}\n`);
console.log(`wrote dbt target fixture to ${outDir}`);

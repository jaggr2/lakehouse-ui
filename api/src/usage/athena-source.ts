import {
  GetQueryExecutionCommand,
  ListQueryExecutionsCommand,
} from "@aws-sdk/client-athena";

import { optionalString, requireRecord, requireString } from "../util/validate.js";
import type { AthenaHistorySource, AthenaQueryExecution } from "./athena-history.js";

/**
 * AWS SDK adapter for Athena query history (least-privilege `lakehouse-read`
 * identity). Kept behind a structural client type so tests can fake it.
 */
export interface AthenaSdkClient {
  send(command: unknown): Promise<unknown>;
}

export interface AthenaSourceOptions {
  client: AthenaSdkClient;
  workgroup: string;
  /** Keep only executions against this database (usually lake_gold). */
  database?: string;
  /** Safety valve for big histories. */
  maxExecutions?: number;
}

export function createAthenaHistorySource(options: AthenaSourceOptions): AthenaHistorySource {
  return {
    async listExecutions(since: Date): Promise<AthenaQueryExecution[]> {
      const ids: string[] = [];
      let nextToken: string | undefined;
      const max = options.maxExecutions ?? 5000;
      do {
        const raw = await options.client.send(
          new ListQueryExecutionsCommand({
            WorkGroup: options.workgroup,
            NextToken: nextToken,
            MaxResults: Math.min(50, max - ids.length),
          }),
        );
        const page = requireRecord(raw, "ListQueryExecutions");
        const idsRaw = page["QueryExecutionIds"];
        if (Array.isArray(idsRaw)) {
          for (const id of idsRaw) ids.push(requireString(id, "QueryExecutionIds[]"));
        }
        nextToken = optionalString(page["NextToken"], "ListQueryExecutions.NextToken");
      } while (nextToken && ids.length < max);

      const executions: AthenaQueryExecution[] = [];
      for (const id of ids.slice(0, max)) {
        const raw = await options.client.send(new GetQueryExecutionCommand({ QueryExecutionId: id }));
        const execution = requireRecord(raw, "GetQueryExecution")["QueryExecution"];
        if (execution === undefined || execution === null) continue;
        const record = requireRecord(execution, "QueryExecution");
        const status = requireRecord(record["Status"] ?? {}, "QueryExecution.Status");
        const context = requireRecord(record["QueryExecutionContext"] ?? {}, "QueryExecutionContext");
        const database = optionalString(context["Database"], "QueryExecutionContext.Database") ?? null;
        if (options.database && database && database !== options.database) continue;
        const sql = requireString(record["QueryString"], "QueryExecution.QueryString");
        if (options.database && !database && !referencesDatabase(sql, options.database)) continue;
        executions.push({
          queryId: id,
          sql,
          database,
          submittedAt: toTime(status["SubmissionDateTime"]),
          workgroup: optionalString(record["WorkGroup"], "QueryExecution.WorkGroup") ?? null,
          // Athena's GetQueryExecution reports bytes scanned, not rows.
          rowsReturned: null,
          succeeded: optionalString(status["State"], "Status.State") === "SUCCEEDED",
        });
      }
      return executions;
    },
  };
}

function toTime(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function referencesDatabase(sql: string, database: string): boolean {
  return new RegExp(`\\b${database}\\b`, "i").test(sql);
}

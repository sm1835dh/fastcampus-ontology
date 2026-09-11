import type { Database } from "../db.ts";
import { ApiError } from "./errors.ts";

// The schema holding the ontology's own metadata tables.
export const METADATA_SCHEMA = "manufacturing";

// Schemas whose instance tables this API is allowed to read. An object_type row
// pointing anywhere else is rejected rather than queried.
export const INSTANCE_SCHEMAS = ["manufacturing"] as const;
export type InstanceSchema = (typeof INSTANCE_SCHEMAS)[number];

// Every instance table the Database interface knows about, as the union of its
// qualified keys.
export type InstanceTable = Extract<keyof Database, `${InstanceSchema}.${string}`>;

const INSTANCE_TABLES = [
  "manufacturing.tank",
  "manufacturing.line",
  "manufacturing.recipe",
  "manufacturing.operator",
  "manufacturing.batch",
  "manufacturing.bottling_run",
  "manufacturing.quality_test",
  "manufacturing.maintenance_log",
] as const satisfies readonly InstanceTable[];

const INSTANCE_TABLE_SET: ReadonlySet<string> = new Set(INSTANCE_TABLES);

// Identifiers only ever come from metadata rows, never from the request, but
// they are still checked before they are used as identifiers.
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function isInstanceSchema(schema: string): schema is InstanceSchema {
  return (INSTANCE_SCHEMAS as readonly string[]).includes(schema);
}

/**
 * Resolves an object type's datasource into a table reference Kysely knows.
 * The membership check is what makes the cast sound: only a name present in the
 * Database interface gets through.
 */
export function instanceTableRef(schema: string, table: string): InstanceTable {
  if (!isInstanceSchema(schema)) {
    throw new ApiError(500, `Object type points at schema '${schema}', which is not an instance schema`);
  }
  if (!IDENTIFIER.test(table)) {
    throw new ApiError(500, `Object type points at an unusable table name '${table}'`);
  }
  const ref = `${schema}.${table}`;
  if (!INSTANCE_TABLE_SET.has(ref)) {
    throw new ApiError(500, `Table '${ref}' is not part of the ontology's instance tables`);
  }
  return ref as InstanceTable;
}

// Column names reach the query builder as dynamic references, which quotes
// them; this keeps anything that is not a plain identifier from getting there.
export function assertColumn(column: string): string {
  if (!IDENTIFIER.test(column)) {
    throw new ApiError(500, `Property points at an unusable column name '${column}'`);
  }
  return column;
}

// Kysely is the runtime query builder only. Schema changes go through
// SQL files applied with `pnpm run-sql`, never from here.
import { Kysely, PostgresDialect, type Generated, type JSONColumnType } from "kysely";
import pg from "pg";
import { loadConfig } from "./config.ts";

// ---------------------------------------------------------------------------
// Metadata tables
//
// Deliberately unqualified. Every ontology schema carries this exact set of
// tables with this exact shape, so the meta routes reach them through
// `db.withSchema(...)` and still get full compile-time typing.
// ---------------------------------------------------------------------------

export interface ObjectTypeTable {
  id: Generated<string>;
  api_name: string;
  name: string;
  description: string | null;
  status: Generated<string>;
  visibility: Generated<string>;
  point_of_contact: string | null;
  edits_enabled: Generated<boolean>;
  schema: string;
  datasource_table: string;
}

export interface PropertyTable {
  id: Generated<string>;
  object_type_id: string;
  api_name: string;
  name: string;
  data_type: string;
  required: Generated<boolean>;
  is_title: Generated<boolean>;
  is_primary_key: Generated<boolean>;
  datasource_column: string;
}

/** The four values manufacturing.link's check constraint allows. */
export type Cardinality = "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";

export interface LinkTable {
  id: Generated<string>;
  api_name: string;
  name: string;
  inverse_api_name: string;
  inverse_name: string;
  source_type_id: string;
  target_type_id: string;
  via_property_id: string;
  cardinality: Cardinality;
}

export interface ActionTypeTable {
  id: Generated<string>;
  object_type_id: string;
  api_name: string;
  name: string;
  description: string | null;
  parameter_schema: JSONColumnType<Record<string, unknown>>;
}

// The one metadata table this app writes to, so its database-side defaults are
// spelled out: an insert supplies neither the id nor the timestamp.
export interface AuditLogTable {
  id: Generated<string>;
  action_type_id: string | null;
  action_api_name: string;
  target_type_id: string | null;
  target_type_api_name: string;
  target_id: string;
  actor: string | null;
  params: JSONColumnType<Record<string, unknown>> | null;
  result: JSONColumnType<Record<string, unknown>> | null;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------------------
// Instance tables
//
// Schema-qualified, because their shape is specific to the schema they live in.
// node-postgres hands back `numeric` as a string so that 1.022 does not lose a
// digit on the way through a float, which is why those columns are typed text.
// ---------------------------------------------------------------------------

export interface ManufacturingTankTable {
  id: string;
  name: string;
  capacity: number | null;
  status: string;
  current_temperature: string | null;
  commissioned_at: Date | null;
}

export interface ManufacturingLineTable {
  id: string;
  name: string;
  status: string;
  commissioned_at: Date | null;
}

export interface ManufacturingRecipeTable {
  id: string;
  name: string;
  target_sugar_curve: JSONColumnType<Record<string, number>> | null;
  fermentation_days: number | null;
  required_ingredients: Generated<string[]>;
  notes: string | null;
}

export interface ManufacturingOperatorTable {
  id: string;
  name: string;
  certifications: Generated<string[]>;
  shift: string | null;
}

export interface ManufacturingBatchTable {
  id: string;
  recipe_id: string;
  target_volume: number | null;
  status: string;
  planned_start: Date | null;
  current_sugar_level: string | null;
  current_temperature: string | null;
  days_fermenting: number | null;
  assigned_tank_id: string | null;
  assigned_operator_id: string | null;
  last_operator_note: string | null;
}

export interface ManufacturingBottlingRunTable {
  id: string;
  batch_id: string;
  line_id: string;
  planned_start: Date | null;
  status: string;
  assigned_operator_id: string | null;
}

export interface ManufacturingQualityTestTable {
  id: string;
  batch_id: string;
  test_date: Date;
  ph: string | null;
  sugar_level: string | null;
  notes: string | null;
  tested_by: string | null;
}

export interface ManufacturingMaintenanceLogTable {
  id: string;
  target_type: string;
  target_id: string;
  type: string;
  status: string;
  started_at: Date | null;
  completed_at: Date | null;
  notes: string | null;
}

export interface Database {
  // Metadata: reached with withSchema().
  object_type: ObjectTypeTable;
  property: PropertyTable;
  link: LinkTable;
  action_type: ActionTypeTable;
  audit_log: AuditLogTable;

  // Instances: reached by their qualified name.
  "manufacturing.tank": ManufacturingTankTable;
  "manufacturing.line": ManufacturingLineTable;
  "manufacturing.recipe": ManufacturingRecipeTable;
  "manufacturing.operator": ManufacturingOperatorTable;
  "manufacturing.batch": ManufacturingBatchTable;
  "manufacturing.bottling_run": ManufacturingBottlingRunTable;
  "manufacturing.quality_test": ManufacturingQualityTestTable;
  "manufacturing.maintenance_log": ManufacturingMaintenanceLogTable;
}

const config = loadConfig();

// The Neon connection string carries sslmode=require, which pg honours on its own.
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

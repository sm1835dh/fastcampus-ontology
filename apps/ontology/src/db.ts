// Kysely is the runtime query builder only. Schema changes go through
// SQL files applied with `pnpm run-sql`, never from here.
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { loadConfig } from "./config.ts";

// Table interfaces get added here as the schema lands. Instance tables key on
// domain IDs (T-12, REC-LAGER-V3), so their id columns are text, not numbers.
export interface Database {}

const config = loadConfig();

// The Neon connection string carries sslmode=require, which pg honours on its own.
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

// Runs a .sql file against DATABASE_URL and reports what each statement did.
//   node --env-file=.env run-sql.ts <path/to/file.sql>
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const MAX_PRINTED_ROWS = 50;

type Result = pg.QueryResult<Record<string, unknown>>;

function usage(message: string): never {
  console.error(`error: ${message}`);
  console.error("usage: node --env-file=.env run-sql.ts <path/to/file.sql>");
  process.exit(1);
}

function report(result: Result, index: number, total: number): void {
  const label = total > 1 ? `[${index + 1}/${total}] ` : "";
  const command = result.command || "STATEMENT";
  const rows = result.rows;

  if (rows.length > 0) {
    console.log(`${label}${command} — ${rows.length} row(s)`);
    console.table(rows.slice(0, MAX_PRINTED_ROWS));
    if (rows.length > MAX_PRINTED_ROWS) {
      console.log(`… ${rows.length - MAX_PRINTED_ROWS} more row(s) not shown`);
    }
    return;
  }

  // INSERT/UPDATE/DELETE report an affected-row count; DDL reports null.
  const affected = result.rowCount === null ? "" : ` — ${result.rowCount} row(s) affected`;
  console.log(`${label}${command}${affected}`);
}

const [, , fileArg] = process.argv;
if (!fileArg) usage("no .sql file given");

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) usage("DATABASE_URL is not set (expected in .env at the repo root)");

const path = resolve(fileArg);
let sql: string;
try {
  sql = await readFile(path, "utf8");
} catch (cause) {
  usage(`cannot read ${path}: ${cause instanceof Error ? cause.message : String(cause)}`);
}

if (sql.trim() === "") usage(`${path} is empty`);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

console.log(`running ${path} on ${new URL(databaseUrl).host}`);
const startedAt = performance.now();

try {
  // A file with several statements comes back as one result per statement.
  const results = await client.query<Record<string, unknown>>(sql);
  const list = Array.isArray(results) ? results : [results];
  list.forEach((result, index) => report(result, index, list.length));
  console.log(`ok — ${list.length} statement(s) in ${Math.round(performance.now() - startedAt)}ms`);
} catch (cause) {
  const error = cause as pg.DatabaseError;
  console.error(`failed: ${error.message}`);
  for (const key of ["detail", "hint", "position", "where"] as const) {
    const value = error[key];
    if (value) console.error(`  ${key}: ${value}`);
  }
  process.exitCode = 1;
} finally {
  await client.end();
}

// Relative imports carry the .ts extension — that is what Node 24 resolves at runtime.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { sql } from "kysely";
import { db } from "./db.ts";

const app = new Hono();

app.get("/health", async (c) => {
  try {
    await sql`select 1`.execute(db);
    return c.json({ status: "ok", database: "up" });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return c.json({ status: "degraded", database: "down", error: message }, 503);
  }
});

const port = Number(process.env["PORT"] ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ontology listening on http://localhost:${info.port}`);
});

export default app;

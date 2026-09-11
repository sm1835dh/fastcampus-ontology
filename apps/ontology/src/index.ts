// Relative imports carry the .ts extension — that is what Node 24 resolves at runtime.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { sql } from "kysely";
import { db } from "./db.ts";
import { ApiError } from "./ontology/errors.ts";
import metaRoutes from "./routes/meta.ts";
import actions from "./routes/actions.ts";
import objects from "./routes/objects.ts";

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

// Order matters: /meta/types would otherwise be read as /:type/:id.
app.route("/api/objects", metaRoutes);
app.route("/api/objects", actions);
app.route("/api/objects", objects);

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ error: `No route for ${c.req.method} ${c.req.path}` }, 404));

const port = Number(process.env["PORT"] ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ontology listening on http://localhost:${info.port}`);
});

export default app;

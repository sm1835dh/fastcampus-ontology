// Instance routes. Every query is built from metadata: which table to read comes
// from object_type.datasource_table, which columns from property.datasource_column.
import { Hono } from "hono";
import { ApiError } from "../ontology/errors.ts";
import {
  FILTER_OPERATORS,
  coerceFilterValue,
  coerceJsonValue,
  findInstance,
  findInstancesBy,
  hintsForEmptyResult,
  isFilterOperator,
  listInstances,
  queryInstances,
  type Filter,
  type QueryFilter,
} from "../ontology/instances.ts";
import {
  auditFor,
  isToMany,
  linksOf,
  toApiObject,
  typeViewCache,
  type InstanceRow,
  type LinkView,
  type TypeView,
} from "../ontology/metadata.ts";

const objects = new Hono();

/** Rows on the far side of one link, before they are shaped for the response. */
async function resolveLink(
  view: TypeView,
  other: TypeView,
  row: InstanceRow,
  link: LinkView,
): Promise<InstanceRow[]> {
  if (link.direction === "outbound") {
    // The foreign key sits on this row; read it and look the target up by its PK.
    const foreignKey = row[link.viaColumn];
    if (foreignKey === null || foreignKey === undefined) return [];
    return findInstancesBy(other, other.primaryKeyColumn, foreignKey);
  }

  // Inbound: the foreign key sits on the other type and points back at this row.
  const id = row[view.primaryKeyColumn];
  if (id === null || id === undefined) return [];
  return findInstancesBy(other, link.viaColumn, id);
}

objects.get("/:type", async (c) => {
  const loadType = typeViewCache();
  // 404s before any instance query is built.
  const view = await loadType(c.req.param("type"));

  const filters: Filter[] = [];
  for (const [key, raw] of Object.entries(c.req.query())) {
    const property = view.properties.find((candidate) => candidate.api_name === key);
    if (!property) {
      const known = view.properties.map((candidate) => candidate.api_name).join(", ");
      throw new ApiError(400, `Unknown filter '${key}' on '${view.objectType.api_name}'. Known properties: ${known}`);
    }
    filters.push({
      column: property.datasource_column,
      value: coerceFilterValue(property, raw),
    });
  }

  const rows = await listInstances(view, filters);

  return c.json({
    type: view.objectType.api_name,
    count: rows.length,
    data: rows.map((row) => toApiObject(row, view.properties)),
  });
});

objects.get("/:type/:id", async (c) => {
  const loadType = typeViewCache();
  const view = await loadType(c.req.param("type"));
  const id = c.req.param("id");

  const row = await findInstance(view, id);
  if (!row) throw new ApiError(404, `No ${view.objectType.api_name} with id '${id}'`);

  // One hop in both directions: links out of this type, and links into it.
  const links = await linksOf(view.objectType.id);
  const resolved = await Promise.all(
    links.map(async (link) => {
      const other = await loadType(link.otherTypeApiName);
      const related = await resolveLink(view, other, row, link);
      const shaped = related.map((entry) => toApiObject(entry, other.properties));

      return [
        link.apiName,
        {
          name: link.name,
          direction: link.direction,
          objectType: other.objectType.api_name,
          cardinality: link.cardinality,
          // Cardinality, not the row count, decides the shape.
          data: isToMany(link.cardinality) ? shaped : (shaped[0] ?? null),
        },
      ] as const;
    }),
  );

  return c.json({
    type: view.objectType.api_name,
    id,
    data: toApiObject(row, view.properties),
    links: Object.fromEntries(resolved),
  });
});

/**
 * Filtered read: `{ filters?: [{property, op, value}], limit?: number }`.
 * Property names are resolved against metadata before anything reaches SQL.
 */
objects.post("/:type/query", async (c) => {
  const loadType = typeViewCache();
  const view = await loadType(c.req.param("type"));

  const raw = await c.req.text();
  let body: unknown = {};
  if (raw.trim() !== "") {
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "Request body must be JSON.");
    }
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }

  const payload = body as { filters?: unknown; limit?: unknown };

  let limit: number | null = null;
  if (payload.limit !== undefined && payload.limit !== null) {
    const parsed = Number(payload.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
      throw new ApiError(400, "'limit' must be an integer between 1 and 1000.");
    }
    limit = parsed;
  }

  const submitted = payload.filters ?? [];
  if (!Array.isArray(submitted)) throw new ApiError(400, "'filters' must be an array.");

  const filters: QueryFilter[] = submitted.map((entry, index): QueryFilter => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ApiError(400, `filters[${index}] must be an object.`);
    }

    const { property: name, op, value } = entry as { property?: unknown; op?: unknown; value?: unknown };

    const property = view.properties.find((candidate) => candidate.api_name === name);
    if (!property) {
      const known = view.properties.map((candidate) => candidate.api_name).join(", ");
      throw new ApiError(
        400,
        `filters[${index}] names unknown property '${String(name)}'. Known properties: ${known}`,
      );
    }
    if (!isFilterOperator(op)) {
      throw new ApiError(
        400,
        `filters[${index}] has unknown op '${String(op)}'. Known operators: ${FILTER_OPERATORS.join(", ")}`,
      );
    }

    if (op === "isNull" || op === "isNotNull") return { property, op, value: null };

    if (op === "in") {
      if (!Array.isArray(value) || value.length === 0) {
        throw new ApiError(400, `filters[${index}] with op 'in' needs a non-empty array value.`);
      }
      return { property, op, value: value.map((item) => coerceJsonValue(property, item)) };
    }

    if (op === "contains") {
      // Substring matching only means something against text.
      if (property.data_type !== "string") {
        throw new ApiError(
          400,
          `filters[${index}]: 'contains' applies to text, and '${property.api_name}' is ${property.data_type}.`,
        );
      }
      if (typeof value !== "string" || value === "") {
        throw new ApiError(400, `filters[${index}] with op 'contains' needs a non-empty string.`);
      }
      return { property, op, value };
    }

    if (value === null || value === undefined) {
      throw new ApiError(400, `filters[${index}] with op '${op}' needs a value.`);
    }
    return { property, op, value: coerceJsonValue(property, value) };
  });

  const rows = await queryInstances(view, filters, limit);

  // Nothing matched is a valid answer, but it reads the same whether the filter
  // was right or the value was misspelled. Hints separate the two.
  const hints = rows.length === 0 && filters.length > 0 ? await hintsForEmptyResult(view, filters) : [];

  return c.json({
    type: view.objectType.api_name,
    count: rows.length,
    data: rows.map((row) => toApiObject(row, view.properties)),
    ...(hints.length > 0 ? { hints } : {}),
  });
});

/** The action history for one object, newest first. */
objects.get("/:type/:id/audit", async (c) => {
  const loadType = typeViewCache();
  const view = await loadType(c.req.param("type"));
  const id = c.req.param("id");

  // An unknown object gets a 404 rather than an empty trail, which would read
  // as "nothing has happened to it".
  const instance = await findInstance(view, id);
  if (!instance) throw new ApiError(404, `No ${view.objectType.api_name} with id '${id}'`);

  const entries = await auditFor(view.objectType.api_name, id);

  return c.json({
    type: view.objectType.api_name,
    id,
    count: entries.length,
    data: entries,
  });
});

export default objects;

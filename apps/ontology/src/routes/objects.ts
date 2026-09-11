// Instance routes. Every query is built from metadata: which table to read comes
// from object_type.datasource_table, which columns from property.datasource_column.
import { Hono } from "hono";
import { ApiError } from "../ontology/errors.ts";
import {
  coerceFilterValue,
  findInstance,
  findInstancesBy,
  listInstances,
  type Filter,
} from "../ontology/instances.ts";
import {
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

export default objects;

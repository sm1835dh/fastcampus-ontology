// Metadata routes. These read the ontology's own tables through withSchema(),
// so they stay fully typed and work unchanged against any ontology schema.
import { Hono } from "hono";
import { ApiError } from "../ontology/errors.ts";
import { countInstances } from "../ontology/instances.ts";
import {
  actionsOf,
  linksOf,
  listObjectTypes,
  loadTypeView,
  propertiesOf,
  requireObjectType,
  updateObjectType,
  type ObjectTypeEdit,
} from "../ontology/metadata.ts";
import { instanceTableRef } from "../ontology/schemas.ts";

const metaRoutes = new Hono();

metaRoutes.get("/meta/types", async (c) => {
  const types = await listObjectTypes();

  // instanceCount is camelCase because it is not a column: it is counted from
  // the datasource the row points at.
  const withCounts = await Promise.all(
    types.map(async (type) => ({
      ...type,
      instanceCount: await countInstances(instanceTableRef(type.schema, type.datasource_table)),
    })),
  );

  return c.json({ count: withCounts.length, data: withCounts });
});

metaRoutes.get("/meta/types/:type", async (c) => {
  // Lookup is by api_name; the display name is never an identifier.
  const view = await loadTypeView(c.req.param("type"));
  const objectType = view.objectType;

  const [properties, links, actions, instanceCount] = await Promise.all([
    propertiesOf(objectType.id),
    linksOf(objectType.id),
    actionsOf(objectType.id),
    countInstances(view.table),
  ]);

  return c.json({
    objectType,
    instanceCount,
    properties,
    links: {
      outbound: links.filter((link) => link.direction === "outbound"),
      inbound: links.filter((link) => link.direction === "inbound"),
    },
    actions,
  });
});

/** Edits the two display fields; api_name stays fixed because code depends on it. */
metaRoutes.patch("/meta/types/:type", async (c) => {
  const apiName = c.req.param("type");
  await requireObjectType(apiName);

  const raw = await c.req.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Request body must be JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }

  const patch = body as Record<string, unknown>;
  const edit: ObjectTypeEdit = {};

  if ("name" in patch) {
    if (typeof patch["name"] !== "string" || patch["name"].trim() === "") {
      throw new ApiError(400, "'name' must be a non-empty string.");
    }
    edit.name = patch["name"].trim();
  }

  if ("description" in patch) {
    const description = patch["description"];
    if (description !== null && typeof description !== "string") {
      throw new ApiError(400, "'description' must be a string or null.");
    }
    // An emptied field reads better as absent than as an empty string.
    edit.description = typeof description === "string" && description.trim() === "" ? null : description;
  }

  const unknown = Object.keys(patch).filter((key) => key !== "name" && key !== "description");
  if (unknown.length > 0) {
    throw new ApiError(400, `Only 'name' and 'description' are editable; got ${unknown.join(", ")}.`);
  }
  if (Object.keys(edit).length === 0) {
    throw new ApiError(400, "Nothing to update: send 'name', 'description', or both.");
  }

  return c.json({ objectType: await updateObjectType(apiName, edit) });
});

export default metaRoutes;

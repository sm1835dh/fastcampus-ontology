// Metadata routes. These read the ontology's own tables through withSchema(),
// so they stay fully typed and work unchanged against any ontology schema.
import { Hono } from "hono";
import {
  actionsOf,
  linksOf,
  listObjectTypes,
  propertiesOf,
  requireObjectType,
} from "../ontology/metadata.ts";

const metaRoutes = new Hono();

metaRoutes.get("/meta/types", async (c) => {
  const types = await listObjectTypes();
  return c.json({ count: types.length, data: types });
});

metaRoutes.get("/meta/types/:type", async (c) => {
  // Lookup is by api_name; the display name is never an identifier.
  const objectType = await requireObjectType(c.req.param("type"));

  const [properties, links, actions] = await Promise.all([
    propertiesOf(objectType.id),
    linksOf(objectType.id),
    actionsOf(objectType.id),
  ]);

  return c.json({
    objectType,
    properties,
    links: {
      outbound: links.filter((link) => link.direction === "outbound"),
      inbound: links.filter((link) => link.direction === "inbound"),
    },
    actions,
  });
});

export default metaRoutes;

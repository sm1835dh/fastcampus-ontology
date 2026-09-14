// Builds the ontology schema summary that every agent is given up front.
//
// An agent that does not know the object types, their property names or their
// links has to discover them by trial and error, which costs turns and invites
// wrong guesses about casing. Handing it the schema removes that whole class of
// mistake before the first tool call.
import { ontologyApiBase } from "../tools/shared/ontologyApi.ts";

type ObjectTypeRow = {
  api_name: string;
  name: string;
  description: string | null;
  schema: string;
  datasource_table: string;
};

/** GET /meta/types: the count rides on each row. */
type ObjectTypeListing = ObjectTypeRow & { instanceCount: number };

type Property = {
  api_name: string;
  name: string;
  data_type: string;
  required: boolean;
  is_title: boolean;
  is_primary_key: boolean;
};

type LinkView = {
  direction: "outbound" | "inbound";
  apiName: string;
  otherTypeApiName: string;
  cardinality: string;
};

type ActionType = { api_name: string; name: string; description: string | null };

/** GET /meta/types/:type: the count sits beside the object type, not inside it. */
type TypeBundle = {
  objectType: ObjectTypeRow;
  instanceCount: number;
  properties: Property[];
  links: { outbound: LinkView[]; inbound: LinkView[] };
  actions: ActionType[];
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ontologyApiBase()}${path}`);
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

function describeProperty(property: Property): string {
  const marks = [
    property.is_primary_key ? "pk" : null,
    property.is_title ? "title" : null,
    property.required ? "required" : null,
  ].filter((mark): mark is string => mark !== null);

  return `${property.api_name} (${property.data_type}${marks.length > 0 ? `, ${marks.join(", ")}` : ""})`;
}

function describeType(bundle: TypeBundle): string {
  const { objectType, instanceCount, properties, links, actions } = bundle;
  const lines: string[] = [];

  lines.push(`### ${objectType.api_name} — "${objectType.name}" (${instanceCount} objects)`);
  if (objectType.description) lines.push(objectType.description);
  lines.push(`Properties: ${properties.map(describeProperty).join(", ")}`);

  if (links.outbound.length > 0) {
    lines.push(
      `Links out: ${links.outbound.map((link) => `${link.apiName} → ${link.otherTypeApiName} (${link.cardinality})`).join(", ")}`,
    );
  }
  if (links.inbound.length > 0) {
    lines.push(
      `Links in: ${links.inbound.map((link) => `${link.apiName} ← ${link.otherTypeApiName} (${link.cardinality})`).join(", ")}`,
    );
  }
  if (actions.length > 0) {
    lines.push(
      `Actions: ${actions.map((action) => `${action.api_name}${action.description ? ` — ${action.description}` : ""}`).join("; ")}`,
    );
  }

  return lines.join("\n");
}

/**
 * Reads the live metadata and renders it as text for a system prompt. Built at
 * startup rather than hard-coded, so an edit to the ontology reaches the agents
 * without anyone remembering to update a constant.
 */
export async function buildSchemaBlock(): Promise<string> {
  const listing = await getJson<{ data: ObjectTypeListing[] }>("/api/objects/meta/types");

  const bundles = await Promise.all(
    listing.data.map((type) => getJson<TypeBundle>(`/api/objects/meta/types/${encodeURIComponent(type.api_name)}`)),
  );

  return [
    "## Ontology schema",
    "",
    "These are the object types you can read. Names are case-sensitive: use the",
    "api_name exactly as written here (`batch`, not `Batch`).",
    "",
    ...bundles.map(describeType),
  ].join("\n");
}

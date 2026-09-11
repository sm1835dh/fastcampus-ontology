import type { Selectable } from "kysely";
import {
  db,
  type ActionTypeTable,
  type Cardinality,
  type LinkTable,
  type ObjectTypeTable,
  type PropertyTable,
} from "../db.ts";
import { ApiError } from "./errors.ts";
import { assertColumn, instanceTableRef, METADATA_SCHEMA, type InstanceTable } from "./schemas.ts";

export type ObjectTypeRow = Selectable<ObjectTypeTable>;
export type PropertyRow = Selectable<PropertyTable>;
export type LinkRow = Selectable<LinkTable>;
export type ActionTypeRow = Selectable<ActionTypeTable>;

/** Metadata lives in one schema and has the same shape in every schema. */
export function meta() {
  return db.withSchema(METADATA_SCHEMA);
}

export async function listObjectTypes(): Promise<ObjectTypeRow[]> {
  return meta().selectFrom("object_type").selectAll().orderBy("api_name").execute();
}

/** Lookups go through api_name; the display name is never an identifier. */
export async function requireObjectType(apiName: string): Promise<ObjectTypeRow> {
  const row = await meta()
    .selectFrom("object_type")
    .selectAll()
    .where("api_name", "=", apiName)
    .executeTakeFirst();

  if (!row) throw new ApiError(404, `Unknown object type '${apiName}'`);
  return row;
}

export async function propertiesOf(objectTypeId: string): Promise<PropertyRow[]> {
  return meta()
    .selectFrom("property")
    .selectAll()
    .where("object_type_id", "=", objectTypeId)
    .orderBy("is_primary_key", "desc")
    .orderBy("api_name")
    .execute();
}

export async function actionsOf(objectTypeId: string): Promise<ActionTypeRow[]> {
  return meta()
    .selectFrom("action_type")
    .selectAll()
    .where("object_type_id", "=", objectTypeId)
    .orderBy("api_name")
    .execute();
}

/** One link as seen from one side, with the other side already resolved. */
export type LinkView = {
  direction: "outbound" | "inbound";
  /** api_name outbound, inverse_api_name inbound. */
  apiName: string;
  /** name outbound, inverse_name inbound. */
  name: string;
  /** The type on the far side of the link. */
  otherTypeApiName: string;
  /** Cardinality as it reads from this side. */
  cardinality: Cardinality;
  /** Property carrying the foreign key, always on the source side. */
  viaPropertyApiName: string;
  viaColumn: string;
};

/**
 * many_to_one read backwards is one_to_many, which is what decides whether the
 * inbound side answers with an array.
 */
export function invertCardinality(cardinality: Cardinality): Cardinality {
  if (cardinality === "many_to_one") return "one_to_many";
  if (cardinality === "one_to_many") return "many_to_one";
  return cardinality;
}

export function isToMany(cardinality: Cardinality): boolean {
  return cardinality.endsWith("_to_many");
}

export async function linksOf(objectTypeId: string): Promise<LinkView[]> {
  const outbound = await meta()
    .selectFrom("link")
    .innerJoin("object_type as other", "other.id", "link.target_type_id")
    .innerJoin("property as via", "via.id", "link.via_property_id")
    .select([
      "link.api_name as api_name",
      "link.name as name",
      "link.cardinality as cardinality",
      "other.api_name as other_api_name",
      "via.api_name as via_api_name",
      "via.datasource_column as via_column",
    ])
    .where("link.source_type_id", "=", objectTypeId)
    .orderBy("link.api_name")
    .execute();

  const inbound = await meta()
    .selectFrom("link")
    .innerJoin("object_type as other", "other.id", "link.source_type_id")
    .innerJoin("property as via", "via.id", "link.via_property_id")
    .select([
      "link.inverse_api_name as api_name",
      "link.inverse_name as name",
      "link.cardinality as cardinality",
      "other.api_name as other_api_name",
      "via.api_name as via_api_name",
      "via.datasource_column as via_column",
    ])
    .where("link.target_type_id", "=", objectTypeId)
    .orderBy("link.inverse_api_name")
    .execute();

  return [
    ...outbound.map((row): LinkView => ({
      direction: "outbound",
      apiName: row.api_name,
      name: row.name,
      otherTypeApiName: row.other_api_name,
      cardinality: row.cardinality,
      viaPropertyApiName: row.via_api_name,
      viaColumn: row.via_column,
    })),
    ...inbound.map((row): LinkView => ({
      direction: "inbound",
      apiName: row.api_name,
      name: row.name,
      otherTypeApiName: row.other_api_name,
      cardinality: invertCardinality(row.cardinality),
      viaPropertyApiName: row.via_api_name,
      viaColumn: row.via_column,
    })),
  ];
}

/** An object type with everything the instance routes need to query it. */
export type TypeView = {
  objectType: ObjectTypeRow;
  properties: PropertyRow[];
  table: InstanceTable;
  primaryKeyColumn: string;
};

export async function loadTypeView(apiName: string): Promise<TypeView> {
  const objectType = await requireObjectType(apiName);
  const properties = await propertiesOf(objectType.id);

  const primaryKey = properties.find((property) => property.is_primary_key);
  if (!primaryKey) {
    throw new ApiError(500, `Object type '${apiName}' has no primary-key property`);
  }

  return {
    objectType,
    properties,
    table: instanceTableRef(objectType.schema, objectType.datasource_table),
    primaryKeyColumn: assertColumn(primaryKey.datasource_column),
  };
}

/**
 * Resolving a linked type repeatedly within one request would re-read the same
 * metadata, so each request keeps its own cache.
 */
export function typeViewCache(): (apiName: string) => Promise<TypeView> {
  const cache = new Map<string, Promise<TypeView>>();
  return (apiName) => {
    const hit = cache.get(apiName);
    if (hit) return hit;
    const pending = loadTypeView(apiName);
    cache.set(apiName, pending);
    return pending;
  };
}

export type InstanceRow = Record<string, unknown>;

/** Turns a datasource row into the api_name-keyed object the API speaks. */
export function toApiObject(row: InstanceRow, properties: PropertyRow[]): InstanceRow {
  const out: InstanceRow = {};
  for (const property of properties) {
    out[property.api_name] = row[property.datasource_column] ?? null;
  }
  return out;
}

/** Actions are addressed by api_name within their object type, like properties. */
export async function requireActionType(objectTypeId: string, apiName: string): Promise<ActionTypeRow> {
  const row = await meta()
    .selectFrom("action_type")
    .selectAll()
    .where("object_type_id", "=", objectTypeId)
    .where("api_name", "=", apiName)
    .executeTakeFirst();

  if (!row) throw new ApiError(404, `Unknown action '${apiName}'`);
  return row;
}

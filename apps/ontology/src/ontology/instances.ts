import { db } from "../db.ts";
import { ApiError } from "./errors.ts";
import { assertColumn } from "./schemas.ts";
import type { InstanceRow, PropertyRow, TypeView } from "./metadata.ts";

/**
 * Selects exactly the columns the metadata declares, as dynamic references.
 * Kysely quotes every identifier and binds every value, so nothing here is
 * assembled by string concatenation.
 */
function selectProperties(view: TypeView) {
  const columns = view.properties.map((property) => db.dynamic.ref(assertColumn(property.datasource_column)));
  return db.selectFrom(view.table).select(columns).$castTo<InstanceRow>();
}

export type Filter = { column: string; value: unknown };

export async function listInstances(view: TypeView, filters: Filter[]): Promise<InstanceRow[]> {
  let query = selectProperties(view);
  for (const filter of filters) {
    query = query.where(db.dynamic.ref(assertColumn(filter.column)), "=", filter.value);
  }
  return query.orderBy(db.dynamic.ref(view.primaryKeyColumn)).execute();
}

export async function findInstance(view: TypeView, id: string): Promise<InstanceRow | undefined> {
  return selectProperties(view)
    .where(db.dynamic.ref(view.primaryKeyColumn), "=", id)
    .executeTakeFirst();
}

/** Rows of `view` whose `column` points at `value`. Used for inbound links. */
export async function findInstancesBy(view: TypeView, column: string, value: unknown): Promise<InstanceRow[]> {
  return selectProperties(view)
    .where(db.dynamic.ref(assertColumn(column)), "=", value)
    .orderBy(db.dynamic.ref(view.primaryKeyColumn))
    .execute();
}

/**
 * Query strings arrive as text; Postgres would reject `integer = text`, so the
 * declared data_type decides how each one is read.
 */
export function coerceFilterValue(property: PropertyRow, raw: string): unknown {
  switch (property.data_type) {
    case "integer": {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed)) {
        throw new ApiError(400, `Filter '${property.api_name}' expects an integer, got '${raw}'`);
      }
      return parsed;
    }
    case "double": {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new ApiError(400, `Filter '${property.api_name}' expects a number, got '${raw}'`);
      }
      return parsed;
    }
    case "boolean": {
      if (raw === "true") return true;
      if (raw === "false") return false;
      throw new ApiError(400, `Filter '${property.api_name}' expects true or false, got '${raw}'`);
    }
    case "string_array":
    case "json": {
      throw new ApiError(400, `Property '${property.api_name}' is not filterable`);
    }
    default: {
      // string and timestamp: Postgres infers the parameter type from the column.
      return raw;
    }
  }
}

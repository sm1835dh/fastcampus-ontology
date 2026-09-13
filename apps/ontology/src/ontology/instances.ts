import { db } from "../db.ts";
import { ApiError } from "./errors.ts";
import { assertColumn, type InstanceTable } from "./schemas.ts";
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

/** Row count for one instance table, for the type listing. */
export async function countInstances(table: InstanceTable): Promise<number> {
  const row = await db
    .selectFrom(table)
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

/** The comparison operators the query route accepts. */
export const FILTER_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "isNull",
  "isNotNull",
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export function isFilterOperator(value: unknown): value is FilterOperator {
  return typeof value === "string" && (FILTER_OPERATORS as readonly string[]).includes(value);
}

/** A filter already resolved against metadata: a real column and a bound value. */
export type QueryFilter = {
  property: PropertyRow;
  op: FilterOperator;
  value: unknown;
};

/**
 * Coerces a JSON body value for its property. Query strings arrive as text and
 * go through coerceFilterValue; a JSON body may already carry the right type,
 * so only the mismatches are converted.
 */
export function coerceJsonValue(property: PropertyRow, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return coerceFilterValue(property, value);

  switch (property.data_type) {
    case "integer":
    case "double": {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new ApiError(400, `Filter '${property.api_name}' expects a number, got ${JSON.stringify(value)}`);
      }
      return parsed;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        throw new ApiError(400, `Filter '${property.api_name}' expects true or false.`);
      }
      return value;
    }
    default:
      return value;
  }
}

/**
 * Filtered read. Property names reach this already resolved to metadata rows,
 * so the only identifiers used are datasource columns, quoted by Kysely; every
 * value is bound.
 */
export async function queryInstances(
  view: TypeView,
  filters: QueryFilter[],
  limit: number | null,
): Promise<InstanceRow[]> {
  let query = selectProperties(view);

  for (const filter of filters) {
    const column = db.dynamic.ref(assertColumn(filter.property.datasource_column));

    switch (filter.op) {
      case "isNull":
        query = query.where(column, "is", null);
        break;
      case "isNotNull":
        query = query.where(column, "is not", null);
        break;
      case "in":
        query = query.where(column, "in", filter.value);
        break;
      case "contains":
        // Case-insensitive substring match; the route restricts this to text.
        query = query.where(column, "ilike", `%${String(filter.value)}%`);
        break;
      case "neq":
        query = query.where(column, "!=", filter.value);
        break;
      case "gt":
        query = query.where(column, ">", filter.value);
        break;
      case "gte":
        query = query.where(column, ">=", filter.value);
        break;
      case "lt":
        query = query.where(column, "<", filter.value);
        break;
      case "lte":
        query = query.where(column, "<=", filter.value);
        break;
      default:
        query = query.where(column, "=", filter.value);
    }
  }

  query = query.orderBy(db.dynamic.ref(view.primaryKeyColumn));
  return limit === null ? query.execute() : query.limit(limit).execute();
}

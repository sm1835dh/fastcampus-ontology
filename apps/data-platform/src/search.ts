// Client-side instance search. The list route returns every row of a type, so
// filtering here keeps up with each keystroke without another round trip.
// No JSX here, so Node can run it directly.
import type { InstanceRow, Property } from "./api.ts";
import { formatNumber, formatTimestamp } from "./format.ts";

export type Match = {
  row: InstanceRow;
  /** The properties whose value contained the query; empty when not searching. */
  matched: Property[];
};

export function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

/**
 * Which properties a search looks inside, read from metadata. Booleans are
 * skipped: their only text is "true"/"false", which would match on the flag
 * rather than on anything the user meant.
 */
export function searchableProperties(properties: Property[]): Property[] {
  return properties.filter((property) => property.data_type !== "boolean");
}

/** Every text a value can be recognised by: as stored, and as the page shows it. */
export function searchableTexts(value: unknown, dataType: string): string[] {
  if (value === null || value === undefined) return [];

  switch (dataType) {
    case "boolean":
      return [];
    case "integer":
    case "double":
      return [String(value), formatNumber(value)];
    case "timestamp":
      return [String(value), formatTimestamp(value)];
    case "string_array":
      return (Array.isArray(value) ? value : [value]).map(String);
    case "json":
      return [JSON.stringify(value)];
    default:
      return [String(value)];
  }
}

/**
 * Rows with at least one searchable property containing the query, case-insensitively.
 * An empty query keeps every row, so the caller renders one list either way.
 */
export function searchRows(rows: InstanceRow[], properties: Property[], query: string): Match[] {
  const needle = normalizeQuery(query);
  if (needle === "") return rows.map((row) => ({ row, matched: [] }));

  const fields = searchableProperties(properties);
  const matches: Match[] = [];

  for (const row of rows) {
    const matched = fields.filter((property) =>
      searchableTexts(row[property.api_name], property.data_type).some((text) =>
        text.toLocaleLowerCase().includes(needle),
      ),
    );
    if (matched.length > 0) matches.push({ row, matched });
  }

  return matches;
}

import { Tag } from "@blueprintjs/core";
import type { ReactNode } from "react";
import type { InstanceRow, Property, TypeBundle } from "../api.ts";
import { formatNumber, formatTimestamp } from "../format.ts";

/** Renders one value the way its declared data_type asks to be read. */
export function formatValue(value: unknown, dataType: string): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="om-muted">—</span>;
  }

  switch (dataType) {
    case "integer":
    case "double":
      return formatNumber(value);
    case "timestamp":
      return formatTimestamp(value);
    case "boolean":
      return <Tag minimal>{value ? "Yes" : "No"}</Tag>;
    case "string_array": {
      const items = Array.isArray(value) ? value : [value];
      if (items.length === 0) return <span className="om-muted">—</span>;
      return (
        <span className="om-chips">
          {items.map((item, index) => (
            <Tag key={`${String(item)}-${index}`} minimal>
              {String(item)}
            </Tag>
          ))}
        </span>
      );
    }
    case "json":
      return <code className="om-mono om-json">{JSON.stringify(value)}</code>;
    default:
      return String(value);
  }
}

/** The property a type reads by, falling back to its primary key. */
export function titleOf(row: InstanceRow, bundle: TypeBundle | undefined): string {
  const title = bundle?.properties.find((property) => property.is_title);
  const value = title ? row[title.api_name] : undefined;
  if (value !== null && value !== undefined && value !== "") return String(value);
  return idOf(row, bundle) ?? "(untitled)";
}

export function idOf(row: InstanceRow, bundle: TypeBundle | undefined): string | null {
  const key = bundle?.properties.find((property) => property.is_primary_key);
  const value = key ? row[key.api_name] : undefined;
  return value === null || value === undefined ? null : String(value);
}

export function propertyByApiName(bundle: TypeBundle | undefined, apiName: string): Property | undefined {
  return bundle?.properties.find((property) => property.api_name === apiName);
}

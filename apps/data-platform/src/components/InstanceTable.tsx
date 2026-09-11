import { HTMLTable, NonIdealState, Tag } from "@blueprintjs/core";
import type { InstanceRow, TypeBundle } from "../api.ts";
import { formatValue, idOf, propertyByApiName, titleOf } from "./valueFormat.tsx";

type Props = {
  bundle: TypeBundle;
  rows: InstanceRow[];
  onOpen: (id: string) => void;
  /**
   * While searching: the properties that put each row in the results. The table
   * shows only title and status, so without this a match on a hidden property
   * would look arbitrary.
   */
  matchedIn?: (row: InstanceRow) => string[];
};

export default function InstanceTable({ bundle, rows, onOpen, matchedIn }: Props) {
  const titleProperty = bundle.properties.find((property) => property.is_title);
  // Not every type carries a status, so the column only appears when it does.
  const statusProperty = propertyByApiName(bundle, "status");

  if (rows.length === 0) {
    return (
      <NonIdealState
        className="om-empty"
        icon="search"
        title="No objects"
        description={`There are no ${bundle.objectType.name} rows yet.`}
      />
    );
  }

  return (
    <HTMLTable className="om-table" interactive striped>
      <thead>
        <tr>
          <th>{titleProperty?.name ?? "Object"}</th>
          {statusProperty && <th>{statusProperty.name}</th>}
          {matchedIn && <th>Matched in</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const id = idOf(row, bundle);
          return (
            <tr
              key={id ?? index}
              onClick={() => id && onOpen(id)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (id && (event.key === "Enter" || event.key === " ")) onOpen(id);
              }}
            >
              <td className="om-table__title">{titleOf(row, bundle)}</td>
              {statusProperty && (
                <td>
                  {row[statusProperty.api_name] ? (
                    <Tag minimal>{String(row[statusProperty.api_name])}</Tag>
                  ) : (
                    formatValue(null, statusProperty.data_type)
                  )}
                </td>
              )}
              {matchedIn && <td className="om-table__matched">{matchedIn(row).join(", ")}</td>}
            </tr>
          );
        })}
      </tbody>
    </HTMLTable>
  );
}

import { HTMLTable, NonIdealState, Tag } from "@blueprintjs/core";
import type { Intent } from "@blueprintjs/core";
import type { Band, BatchProgress } from "../batchProgress.ts";

type Props = {
  rows: BatchProgress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/** Green on the curve, amber drifting, red past the limit in either direction. */
function intentFor(band: Band): Intent {
  switch (band) {
    case "on-track":
      return "success";
    case "watch":
      return "warning";
    case "behind":
      return "danger";
    default:
      return "none";
  }
}

const sugar = (value: number) => value.toFixed(3);
const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(3)}`;

function SugarCell({ row }: { row: BatchProgress }) {
  if (row.sugarLevel === null || row.target === null || row.delta === null) {
    return <span className="om-muted">—</span>;
  }

  return (
    <span className="om-sugar">
      <span>{sugar(row.sugarLevel)}</span>
      <span className="om-muted">/ {sugar(row.target)}</span>
      <Tag minimal intent={intentFor(row.band)}>
        {signed(row.delta)}
      </Tag>
    </span>
  );
}

export default function BatchTable({ rows, selectedId, onSelect }: Props) {
  if (rows.length === 0) {
    return (
      <NonIdealState
        className="om-empty"
        icon="filter"
        title="No batches match"
        description="Loosen the filters to see more."
      />
    );
  }

  return (
    <HTMLTable className="om-table" interactive striped>
      <thead>
        <tr>
          <th>Batch</th>
          <th>Recipe</th>
          <th>Sugar vs target</th>
          <th>Days</th>
          <th>Tank</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={row.id === selectedId ? "om-row--selected" : undefined}
            onClick={() => onSelect(row.id)}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelect(row.id);
            }}
          >
            <td className="om-table__title">{row.id}</td>
            <td>{row.recipeName}</td>
            <td>
              <SugarCell row={row} />
            </td>
            <td>{row.daysFermenting ?? <span className="om-muted">—</span>}</td>
            <td>{row.tankId ?? <span className="om-muted">—</span>}</td>
            <td>
              <Tag minimal>{row.status}</Tag>
            </td>
          </tr>
        ))}
      </tbody>
    </HTMLTable>
  );
}

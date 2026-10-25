import { Callout, H2, HTMLSelect, NonIdealState, Section, SectionCard, Spinner, Switch } from "@blueprintjs/core";
import { useEffect, useMemo, useState } from "react";
import { listInstances, type InstanceRow } from "../api.ts";
import {
  BEHIND_LIMIT,
  MAINTENANCE_WINDOW_DAYS,
  buildProgress,
  isBehindTarget,
  metricsFor,
  tanksServicedSince,
} from "../batchProgress.ts";
import BatchDetailPanel from "../components/BatchDetailPanel.tsx";
import BatchTable from "../components/BatchTable.tsx";
import MetricCard from "../components/MetricCard.tsx";
import { courseAnchor, courseNow } from "../courseNow.ts";

const UNASSIGNED = "__unassigned__";
const ALL = "__all__";

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export default function BatchWorkspace() {
  const [batches, setBatches] = useState<InstanceRow[] | null>(null);
  const [recipes, setRecipes] = useState<InstanceRow[]>([]);
  const [logs, setLogs] = useState<InstanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<string>(ALL);
  const [tank, setTank] = useState<string>(ALL);
  const [behindOnly, setBehindOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // The batch rows carry a recipeId, not the curve, so the recipes come too;
    // the maintenance log answers the third metric.
    Promise.all([listInstances("batch"), listInstances("recipe"), listInstances("maintenanceLog")])
      .then(([batchList, recipeList, logList]) => {
        if (cancelled) return;
        setBatches(batchList.data);
        setRecipes(recipeList.data);
        setLogs(logList.data);
      })
      .catch((cause: unknown) => !cancelled && setError(message(cause)));

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => buildProgress(batches ?? [], recipes), [batches, recipes]);
  const servicedTanks = useMemo(() => tanksServicedSince(logs, courseNow()), [logs]);

  // The cards describe the whole floor, so they are counted before filtering.
  const metrics = useMemo(() => metricsFor(rows, servicedTanks), [rows, servicedTanks]);

  const statuses = useMemo(() => [...new Set(rows.map((row) => row.status))].sort(), [rows]);
  const tanks = useMemo(
    () => [...new Set(rows.map((row) => row.tankId).filter((id): id is string => id !== null))].sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (status !== ALL && row.status !== status) return false;
        if (tank === UNASSIGNED && row.tankId !== null) return false;
        if (tank !== ALL && tank !== UNASSIGNED && row.tankId !== tank) return false;
        if (behindOnly && !isBehindTarget(row.delta)) return false;
        return true;
      }),
    [rows, status, tank, behindOnly],
  );

  if (error) {
    return (
      <main className="om-main">
        <Callout intent="danger" title="Could not load the workspace" className="om-alert">
          {error}
        </Callout>
      </main>
    );
  }

  if (!batches) {
    return (
      <main className="om-main">
        <Spinner className="om-spinner" />
      </main>
    );
  }

  return (
    <main className="om-main">
      <div className="om-detail">
        <header className="om-header">
          <div className="om-header__text">
            <H2 className="om-header__title">Batch Investigation</H2>
            <div className="om-muted">
              {plural(rows.length, "batch", "batches")}
              {courseAnchor &&
                ` · windows measured from ${courseAnchor.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
            </div>
          </div>
        </header>

        <div className="om-metrics">
          <MetricCard
            icon="pulse"
            value={metrics.fermenting}
            label="Fermenting Batches"
            note={`of ${rows.length} in total`}
          />
          <MetricCard
            icon="warning-sign"
            value={metrics.behindTarget}
            label="Behind Target"
            note={`${BEHIND_LIMIT.toFixed(3)} or more above the curve`}
          />
          <MetricCard
            icon="wrench"
            value={metrics.recentTankMaintenance}
            label="Recent Tank Maintenance"
            note={`tank serviced in the last ${MAINTENANCE_WINDOW_DAYS} days`}
          />
        </div>

        <div className="om-workspace">
          <Section
            title="Batches"
            rightElement={
              <span className="om-muted">
                {filtered.length === rows.length
                  ? plural(rows.length, "batch", "batches")
                  : `${filtered.length} of ${rows.length}`}
              </span>
            }
          >
            <SectionCard>
              <div className="om-filters">
                <span className="om-filters__label">Status</span>
                <HTMLSelect
                  value={status}
                  onChange={(event) => setStatus(event.currentTarget.value)}
                  options={[{ value: ALL, label: "All" }, ...statuses.map((value) => ({ value, label: value }))]}
                />
                <span className="om-filters__label">Tank</span>
                <HTMLSelect
                  value={tank}
                  onChange={(event) => setTank(event.currentTarget.value)}
                  options={[
                    { value: ALL, label: "All" },
                    ...tanks.map((value) => ({ value, label: value })),
                    { value: UNASSIGNED, label: "Unassigned" },
                  ]}
                />
                <Switch
                  className="om-search__toggle"
                  label="Behind target only"
                  checked={behindOnly}
                  onChange={(event) => setBehindOnly(event.currentTarget.checked)}
                />
              </div>
            </SectionCard>
            <SectionCard padded={false}>
              <BatchTable rows={filtered} selectedId={selectedId} onSelect={setSelectedId} />
            </SectionCard>
          </Section>

          {selectedId ? (
            // The tank comes from the row already in hand, so the panel can read
            // the batch, its tank's maintenance and its audit trail in parallel.
            <BatchDetailPanel
              batchId={selectedId}
              tankId={rows.find((row) => row.id === selectedId)?.tankId ?? null}
            />
          ) : (
            <Section title="Investigation">
              <SectionCard>
                <NonIdealState
                  className="om-placeholder"
                  icon="lab-test"
                  title="No batch selected"
                  description="Pick a batch on the left to investigate it."
                />
              </SectionCard>
            </Section>
          )}
        </div>
      </div>
    </main>
  );
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

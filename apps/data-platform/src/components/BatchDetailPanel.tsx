import { Button, Callout, Collapse, Icon, Section, SectionCard, Spinner, Tag } from "@blueprintjs/core";
import { useEffect, useMemo, useState } from "react";
import {
  getAudit,
  getInstance,
  listInstances,
  type AuditEntry,
  type InstanceDetail,
  type InstanceRow,
} from "../api.ts";
import { fallsWithin, fermentationWindow, targetAtDay } from "../batchProgress.ts";
import { courseNow } from "../courseNow.ts";
import { formatTimestamp } from "../format.ts";

type Props = {
  batchId: string;
  /** Passed in so the tank's maintenance can be fetched alongside the batch, not after it. */
  tankId: string | null;
};

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? <span className="om-muted">—</span> : String(value);

const sugar = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3) : null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="om-field">
      <div className="om-field__label">{label}</div>
      <div className="om-field__value">{children}</div>
    </div>
  );
}

/** One row of the batch's links, whichever shape the cardinality gave it. */
function linkRow(detail: InstanceDetail, apiName: string): InstanceRow | null {
  const data = detail.links[apiName]?.data;
  if (!data) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function linkRows(detail: InstanceDetail, apiName: string): InstanceRow[] {
  const data = detail.links[apiName]?.data;
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="om-audit">
      <Button
        className="om-audit__head"
        minimal
        alignText="left"
        fill
        icon={open ? "chevron-down" : "chevron-right"}
        onClick={() => setOpen(!open)}
      >
        <span className="om-audit__action">{entry.name ?? entry.action}</span>
        <span className="om-muted">{entry.actor ?? "unknown actor"}</span>
        <span className="om-muted om-audit__when">{formatTimestamp(entry.createdAt)}</span>
      </Button>
      <Collapse isOpen={open}>
        <div className="om-audit__body">
          <div className="om-muted">Parameters</div>
          <pre className="om-json-block">{JSON.stringify(entry.params ?? {}, null, 2)}</pre>
          {entry.result && (
            <>
              <div className="om-muted">Result</div>
              <pre className="om-json-block">{JSON.stringify(entry.result, null, 2)}</pre>
            </>
          )}
        </div>
      </Collapse>
    </li>
  );
}

export default function BatchDetailPanel({ batchId, tankId }: Props) {
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [maintenance, setMaintenance] = useState<InstanceRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);

    // Three independent reads, so they go out together.
    Promise.all([
      getInstance("batch", batchId),
      tankId ? listInstances("maintenanceLog", { targetType: "tank", targetId: tankId }) : Promise.resolve(null),
      getAudit("batch", batchId),
    ])
      .then(([batch, logs, trail]) => {
        if (cancelled) return;
        setDetail(batch);
        setMaintenance(logs?.data ?? []);
        setAudit(trail.data);
      })
      .catch((cause: unknown) => !cancelled && setError(message(cause)));

    return () => {
      cancelled = true;
    };
  }, [batchId, tankId]);

  const window = useMemo(
    () =>
      detail
        ? fermentationWindow(
            detail.data["plannedStart"],
            detail.data["daysFermenting"] === null || detail.data["daysFermenting"] === undefined
              ? null
              : Number(detail.data["daysFermenting"]),
            courseNow(),
          )
        : null,
    [detail],
  );

  if (error) {
    return (
      <Callout intent="danger" title="Could not load the batch" className="om-alert">
        {error}
      </Callout>
    );
  }

  if (!detail) return <Spinner className="om-spinner" />;

  const batch = detail.data;
  const recipe = linkRow(detail, "recipe");
  const tank = linkRow(detail, "assignedTank");
  const tests = linkRows(detail, "qualityTests");

  const day = batch["daysFermenting"] === null || batch["daysFermenting"] === undefined ? null : Number(batch["daysFermenting"]);
  const curve = recipe?.["targetSugarCurve"];
  const targetToday = day === null ? null : targetAtDay(curve, day);
  const checkpoints = typeof curve === "object" && curve !== null && !Array.isArray(curve)
    ? Object.entries(curve as Record<string, unknown>)
        .map(([key, value]) => ({ day: Number(key.replace(/^day_/, "")), value: Number(value) }))
        .filter((point) => Number.isFinite(point.day) && Number.isFinite(point.value))
        .sort((a, b) => a.day - b.day)
    : [];
  const onCheckpoint = checkpoints.some((point) => point.day === day);

  return (
    <div className="om-panel">
      <Section title={batchId} icon="lab-test" collapsible compact>
        <SectionCard>
          <Field label="Sugar level">{sugar(batch["currentSugarLevel"]) ?? text(null)}</Field>
          <Field label="Temperature">
            {batch["currentTemperature"] === null || batch["currentTemperature"] === undefined
              ? text(null)
              : `${Number(batch["currentTemperature"]).toFixed(1)} °C`}
          </Field>
          <Field label="Days fermenting">{text(batch["daysFermenting"])}</Field>
          <Field label="Planned start">
            {batch["plannedStart"] ? formatTimestamp(batch["plannedStart"]) : text(null)}
          </Field>
          <Field label="Last operator note">{text(batch["lastOperatorNote"])}</Field>
        </SectionCard>
      </Section>

      <Section title="Recipe" icon="clipboard" collapsible compact>
        <SectionCard>
          <Field label="Name">{text(recipe?.["name"])}</Field>
          <Field label="Fermentation days">{text(recipe?.["fermentationDays"])}</Field>
          <Field label="Notes">{text(recipe?.["notes"])}</Field>
          <Field label={day === null ? "Target curve" : `Target at day ${day}`}>
            {targetToday === null ? (
              text(null)
            ) : (
              <span className="om-sugar">
                <strong>{targetToday.toFixed(3)}</strong>
                {!onCheckpoint && <span className="om-muted">interpolated</span>}
              </span>
            )}
          </Field>
          {checkpoints.length > 0 && (
            <div className="om-curve">
              {checkpoints.map((point) => (
                <Tag key={point.day} minimal={point.day !== day} intent={point.day === day ? "primary" : "none"}>
                  day {point.day} · {point.value.toFixed(3)}
                </Tag>
              ))}
            </div>
          )}
        </SectionCard>
      </Section>

      <Section title="Tank &amp; maintenance" icon="wrench" collapsible compact>
        <SectionCard>
          {tank ? (
            <>
              <Field label="Tank">{text(tank["name"])}</Field>
              <Field label="Status">
                <Tag minimal>{String(tank["status"] ?? "unknown")}</Tag>
              </Field>
            </>
          ) : (
            <Field label="Tank">
              <span className="om-muted">No tank assigned</span>
            </Field>
          )}

          {maintenance.length === 0 ? (
            <div className="om-muted">No maintenance recorded for this tank.</div>
          ) : (
            <ul className="om-list om-list--plain">
              {maintenance.map((log) => {
                const during = fallsWithin(window, log["startedAt"]) || fallsWithin(window, log["completedAt"]);
                return (
                  <li key={String(log["id"])} className="om-maintenance">
                    <div className="om-maintenance__head">
                      <span className="om-audit__action">{String(log["type"] ?? "maintenance")}</span>
                      <Tag minimal>{String(log["status"] ?? "")}</Tag>
                      {during && (
                        <Tag intent="warning" icon="warning-sign">
                          During fermentation
                        </Tag>
                      )}
                    </div>
                    <div className="om-muted">
                      {log["startedAt"] ? formatTimestamp(log["startedAt"]) : "—"}
                      {log["completedAt"] ? ` → ${formatTimestamp(log["completedAt"])}` : ""}
                    </div>
                    {log["notes"] ? <div>{String(log["notes"])}</div> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </Section>

      <Section
        title="Quality tests"
        icon="diagnosis"
        collapsible
        compact
        rightElement={<Tag minimal round>{tests.length}</Tag>}
      >
        <SectionCard>
          {tests.length === 0 ? (
            <div className="om-muted">No quality tests recorded.</div>
          ) : (
            <ul className="om-list om-list--plain">
              {tests.map((test) => (
                <li key={String(test["id"])} className="om-test">
                  <div className="om-maintenance__head">
                    <span className="om-audit__action">{String(test["id"])}</span>
                    <Tag minimal>pH {text(test["ph"])}</Tag>
                    <Tag minimal>SG {sugar(test["sugarLevel"]) ?? "—"}</Tag>
                  </div>
                  <div className="om-muted">
                    {test["testDate"] ? formatTimestamp(test["testDate"]) : "—"} · {String(test["testedBy"] ?? "unknown")}
                  </div>
                  {test["notes"] ? <div>{String(test["notes"])}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </Section>

      <Section
        title="Audit"
        icon="history"
        collapsible
        compact
        collapseProps={{ defaultIsOpen: false }}
        rightElement={<Tag minimal round>{audit.length}</Tag>}
      >
        <SectionCard padded={false}>
          {audit.length === 0 ? (
            <div className="om-audit__empty om-muted">No actions have been run against this batch.</div>
          ) : (
            <ul className="om-list om-list--plain">
              {audit.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </SectionCard>
      </Section>
    </div>
  );
}

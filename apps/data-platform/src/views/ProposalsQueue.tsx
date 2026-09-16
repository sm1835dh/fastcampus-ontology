// The human half of the agent loop: actions an agent wants taken, held here
// until somebody decides.
//
// Approving is not a status change with a side effect -- it invokes the
// underlying action through the same route any other caller would use, and the
// proposal only moves to `approved` if that action succeeded. So a failure here
// leaves the row exactly where it was, and says why next to it.
import { Button, ButtonGroup, Callout, HTMLTable, NonIdealState, Spinner, Tag } from "@blueprintjs/core";
import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, invokeAction, listInstances, type InstanceRow } from "../api.ts";
import { formatTimestamp } from "../format.ts";

/**
 * Who the page acts as. There is no sign-in yet, so the reviewer is named here
 * rather than discovered; the server records it as the audit actor and threads
 * it into the action an approval triggers.
 */
export const REVIEWER = "brewmaster-lee";

/**
 * Renders an action's stored parameters for a reader rather than a parser.
 *
 * Exported and pure so the rendering can be checked on its own: these values
 * come back as whatever jsonb held, which is not always an object.
 */
export function formatParams(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "object" || Array.isArray(value)) return String(value);

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "—";

  return entries
    .map(([key, entry]) => `${key}: ${typeof entry === "object" && entry !== null ? JSON.stringify(entry) : String(entry)}`)
    .join("\n");
}

/** A decision that did not go through: what the server said, and what to do now. */
export type DecisionFailure = { message: string; guidance: string | null };

/**
 * What the reviewer should do next, given how the decision failed.
 *
 * The server says why it refused, which is a fact about the domain and reads
 * the same however the action was invoked. It cannot say what to do about it,
 * because it does not know the caller is a reviewer looking at a queue -- the
 * same refusal reaches curl and the object explorer, where "reject the
 * proposal" would be nonsense. So the advice is added here, by the screen that
 * knows what the click meant.
 *
 * Split by status because the right move genuinely differs: a refusal means the
 * proposal can no longer be carried out, while a server fault means nothing
 * happened and trying again is reasonable.
 *
 * Exported and pure so the wording can be checked without driving the UI.
 */
export function decisionGuidance(decision: "approve" | "reject", status: number | null): string | null {
  if (decision === "reject") {
    // Rejecting reads and updates the proposal alone -- it never dispatches the
    // underlying action -- so a failure here is not the world having moved on.
    return status !== null && status < 500
      ? null
      : "Rejecting only touches the proposal itself, so this is very likely temporary. Try again.";
  }

  switch (status) {
    case 409:
      return "What this targets has moved on since it was proposed, so the action can no longer run. Reject the proposal to close it out — its reasoning stays on record either way.";
    case 400:
      return "The parameters stored on this proposal no longer satisfy the action's rules. Reject this one; acting now would need a fresh proposal.";
    case 404:
      return "Either the proposal or the object it targets is gone. Reload the queue to see where things stand.";
    case 422:
      return "No handler is registered for this action, so nothing can carry it out. That is a server configuration problem rather than a decision for you to make.";
    default:
      return status !== null && status >= 500
        ? "The server failed rather than refused, so nothing was changed. Try again."
        : null;
  }
}

/** The id as the invoke route needs it: proposal keys are generated integers. */
function proposalId(row: InstanceRow): string {
  return String(row["id"]);
}

export default function ProposalsQueue() {
  const [rows, setRows] = useState<InstanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Keyed by proposal id: a decision that failed explains itself on its own row
  // instead of replacing the page.
  const [rowErrors, setRowErrors] = useState<Record<string, DecisionFailure>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const listing = await listInstances("proposal", { status: "pending" });
      setRows(listing.data);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (row: InstanceRow, action: "approve" | "reject") => {
      const id = proposalId(row);
      setBusy(id);

      try {
        // No decision note from this screen yet; the schema makes it optional.
        await invokeAction("proposal", id, action, {}, REVIEWER);

        setRowErrors((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        // The row leaves the queue on success, so the list is re-read rather
        // than patched in place.
        await load();
      } catch (cause: unknown) {
        // Deliberately no optimistic update to undo: the row was never moved,
        // so it stays pending and simply gains an explanation -- and, where the
        // failure implies one, a next step.
        const status = cause instanceof ApiRequestError ? cause.status : null;
        setRowErrors((current) => ({
          ...current,
          [id]: {
            message: cause instanceof Error ? cause.message : String(cause),
            guidance: decisionGuidance(action, status),
          },
        }));
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  if (error) {
    return (
      <Callout intent="danger" title="Could not load proposals" className="om-alert om-alert--page">
        {error}
        <div className="om-muted">Is the ontology app running on port 3000?</div>
      </Callout>
    );
  }

  if (!rows) return <Spinner className="om-spinner" />;

  return (
    <div className="om-proposals">
      <div className="om-proposals__header">
        <h2 className="om-proposals__title">Proposals Queue</h2>
        <div className="om-muted">
          {rows.length === 0
            ? "Nothing awaiting review"
            : `${rows.length} pending · reviewing as ${REVIEWER}`}
        </div>
      </div>

      {rows.length === 0 ? (
        <NonIdealState
          icon="inbox"
          title="No pending proposals"
          description="Actions an agent proposes will appear here for approval."
        />
      ) : (
        <HTMLTable className="om-proposals__table" interactive={false} striped>
          <thead>
            <tr>
              <th>Type</th>
              <th>Target</th>
              <th>Proposed By</th>
              <th>Proposed At</th>
              <th>Rationale</th>
              <th>Parameters</th>
              <th>Status</th>
              <th aria-label="Decision" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = proposalId(row);
              const failure = rowErrors[id];

              return (
                <tr key={id}>
                  <td>
                    <code>{String(row["type"])}</code>
                  </td>
                  <td>{String(row["targetId"])}</td>
                  <td>{String(row["proposedBy"])}</td>
                  <td>{formatTimestamp(row["proposedAt"])}</td>
                  <td className="om-proposals__rationale">{String(row["rationale"] ?? "")}</td>
                  <td>
                    <pre className="om-proposals__params">{formatParams(row["params"])}</pre>
                  </td>
                  <td>
                    <Tag minimal intent={failure ? "warning" : "none"}>
                      {String(row["status"])}
                    </Tag>
                    {failure ? (
                      <Callout intent="danger" compact className="om-alert om-proposals__error">
                        {failure.message}
                        {failure.guidance ? (
                          <div className="om-proposals__guidance">{failure.guidance}</div>
                        ) : null}
                      </Callout>
                    ) : null}
                  </td>
                  <td>
                    <ButtonGroup>
                      <Button
                        intent="success"
                        icon="tick"
                        text="Approve"
                        loading={busy === id}
                        disabled={busy !== null}
                        onClick={() => void decide(row, "approve")}
                      />
                      <Button
                        intent="danger"
                        icon="cross"
                        text="Reject"
                        loading={busy === id}
                        disabled={busy !== null}
                        onClick={() => void decide(row, "reject")}
                      />
                    </ButtonGroup>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </HTMLTable>
      )}
    </div>
  );
}

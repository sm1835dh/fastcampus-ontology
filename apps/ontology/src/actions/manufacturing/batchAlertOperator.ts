// batch.alertOperator — tell the batch's assigned operator something, by way of
// a system outside the ontology.
//
// This is the first action whose main effect leaves the database, and that
// changes the shape of the handler. The other two do their work inside a
// transaction, where a failure anywhere undoes everything. Here the outbound
// send sits *outside* the transaction on purpose: a transaction can roll back a
// row, but nothing can un-send a message. So the order is send, then record,
// and the audit row is the only durable trace that the alert ever went out.
import type { Selectable } from "kysely";
import { loadConfig } from "../../config.ts";
import type { ManufacturingBatchTable, ManufacturingOperatorTable } from "../../db.ts";
import { ApiError } from "../../ontology/errors.ts";
import { METADATA_SCHEMA } from "../../ontology/schemas.ts";
import { defineAction, type ActionContext } from "../types.ts";

type BatchRow = Selectable<ManufacturingBatchTable>;
type OperatorRow = Selectable<ManufacturingOperatorTable>;

/** Keep in step with the enum in the action's parameter_schema. */
export type AlertSeverity = "info" | "warning" | "critical";

type AlertOperatorParams = {
  message: string;
  severity: AlertSeverity;
};

/**
 * How long the outbound call may take before the action gives up. An external
 * system that hangs must not hold an API request open indefinitely.
 */
const SEND_TIMEOUT_MS = 5_000;

export type AlertPayload = {
  kind: "ontology.alert";
  severity: AlertSeverity;
  message: string;
  sentAt: string;
  raisedBy: string;
  operator: { id: string; name: string; shift: string | null };
  batch: {
    id: string;
    status: string;
    recipeId: string;
    assignedTankId: string | null;
    daysFermenting: number | null;
    currentSugarLevel: string | null;
    currentTemperature: string | null;
  };
};

/**
 * Builds the body that goes out. Named, exported and free of I/O so the payload
 * can be checked directly, without sending anything to anybody.
 *
 * The batch context travels with the message rather than just the id: whoever
 * receives this is away from the console, and an alert that forces them to go
 * look the readings up is most of a wasted alert.
 */
export function buildAlertPayload(
  batch: BatchRow,
  operator: OperatorRow,
  params: AlertOperatorParams,
  actor: string,
): AlertPayload {
  return {
    kind: "ontology.alert",
    severity: params.severity,
    message: params.message,
    sentAt: new Date().toISOString(),
    raisedBy: actor,
    operator: { id: operator.id, name: operator.name, shift: operator.shift },
    batch: {
      id: batch.id,
      status: batch.status,
      recipeId: batch.recipe_id,
      assignedTankId: batch.assigned_tank_id,
      daysFermenting: batch.days_fermenting,
      currentSugarLevel: batch.current_sugar_level,
      currentTemperature: batch.current_temperature,
    },
  };
}

/** What became of the outbound call. */
export type Delivery = {
  delivered: boolean;
  /** The HTTP status, or null if the request never produced a response. */
  status: number | null;
  detail: string;
};

/**
 * Performs the send. Deliberately never throws: whether the alert got out is a
 * fact this action has to record either way, so it comes back as a value rather
 * than as an exception that would skip the audit write.
 */
export async function deliverAlert(url: string, payload: AlertPayload): Promise<Delivery> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    return {
      delivered: response.ok,
      status: response.status,
      detail: response.ok ? "accepted" : `endpoint returned HTTP ${response.status}`,
    };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { delivered: false, status: null, detail: `no response: ${reason}` };
  }
}

async function alertOperator(
  batch: BatchRow,
  params: AlertOperatorParams,
  context: ActionContext,
): Promise<BatchRow> {
  const { webhookUrl } = loadConfig();
  if (!webhookUrl) {
    // 503 rather than 500: nothing is wrong with the request, the server is
    // just not configured to reach the outside world.
    throw new ApiError(503, "WEBHOOK_URL is not set, so alerts cannot be sent from this server.");
  }

  if (!batch.assigned_operator_id) {
    throw new ApiError(409, `Batch ${batch.id} has no assigned operator, so there is nobody to alert.`);
  }

  const operator = await context.db
    .selectFrom("manufacturing.operator")
    .selectAll()
    .where("id", "=", batch.assigned_operator_id)
    .executeTakeFirst();

  if (!operator) {
    throw new ApiError(
      409,
      `Batch ${batch.id} names operator '${batch.assigned_operator_id}', which does not exist.`,
    );
  }

  const payload = buildAlertPayload(batch, operator, params, context.actor);

  // The irreversible step, on its own, before any transaction is open. Holding
  // a database transaction across a network call would pin a connection for as
  // long as the far end feels like taking.
  const delivery = await deliverAlert(webhookUrl, payload);

  try {
    await context.db
      .withSchema(METADATA_SCHEMA)
      .insertInto("audit_log")
      .values({
        action_type_id: context.actionType.id,
        action_api_name: context.actionType.api_name,
        target_type_id: context.objectType.id,
        target_type_api_name: context.objectType.api_name,
        target_id: batch.id,
        actor: context.actor,
        params: JSON.stringify(params),
        // A failed send is recorded too. An attempt to alert somebody is itself
        // worth knowing about, and a trail that only holds successes is not a
        // trail of what happened.
        result: JSON.stringify({
          ...delivery,
          notifiedOperatorId: operator.id,
          endpointHost: new URL(webhookUrl).host,
        }),
      })
      .execute();
  } catch (cause) {
    // The alert is already out and now there is no record of it. Say so loudly:
    // this is the one failure in this file that leaves the world inconsistent.
    console.error(
      `[alertOperator] ALERT SENT BUT NOT RECORDED for ${batch.id} (delivered=${delivery.delivered}):`,
      cause,
    );
    throw new ApiError(500, `Alert for ${batch.id} was sent but could not be written to the audit log.`);
  }

  if (!delivery.delivered) {
    throw new ApiError(502, `Alert for ${batch.id} could not be delivered: ${delivery.detail}.`);
  }

  // Nothing about the batch itself changed. The route still answers with the
  // object, so the caller sees the state the alert was raised against.
  return batch;
}

export default defineAction(alertOperator);

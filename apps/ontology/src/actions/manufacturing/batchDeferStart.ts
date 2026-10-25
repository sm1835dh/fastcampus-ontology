// batch.deferStart — move a queued batch's planned start later.
//
// The route has already checked the body against the action's parameter_schema,
// so what is left here is the business rules and the write.
import type { Selectable } from "kysely";
import type { ManufacturingBatchTable } from "../../db.ts";
import { ApiError } from "../../ontology/errors.ts";
import { METADATA_SCHEMA } from "../../ontology/schemas.ts";
import { auditResult } from "../audit.ts";
import { withTransaction } from "../transaction.ts";
import { defineAction, type ActionContext } from "../types.ts";

type BatchRow = Selectable<ManufacturingBatchTable>;

type DeferStartParams = {
  /** ISO 8601 datetime, per the action's parameter_schema. */
  newPlannedStart: string;
};

async function deferStart(
  batch: BatchRow,
  params: DeferStartParams,
  context: ActionContext,
): Promise<BatchRow> {
  if (batch.status !== "queued") {
    throw new ApiError(
      409,
      `Batch ${batch.id} is '${batch.status}', not 'queued'. Only a queued batch can have its start deferred.`,
    );
  }

  // The schema guarantees a string in date-time shape; it does not guarantee
  // that the string names a real instant.
  const newPlannedStart = new Date(params.newPlannedStart);
  if (Number.isNaN(newPlannedStart.getTime())) {
    throw new ApiError(400, `newPlannedStart '${params.newPlannedStart}' is not a valid datetime.`);
  }

  const now = new Date();
  if (newPlannedStart.getTime() <= now.getTime()) {
    throw new ApiError(
      400,
      `newPlannedStart ${newPlannedStart.toISOString()} is not in the future (now is ${now.toISOString()}).`,
    );
  }

  // The write and its audit row land together or not at all -- and when this
  // runs inside an approval, together with that approval too.
  return withTransaction(context.db, async (trx) => {
    const updated = await trx
      .updateTable("manufacturing.batch")
      .set({ planned_start: newPlannedStart })
      .where("id", "=", batch.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .withSchema(METADATA_SCHEMA)
      .insertInto("audit_log")
      .values({
        // Dual snapshot: the UUID for joining back to live metadata, the
        // api_name so the entry still reads if that metadata is deleted.
        action_type_id: context.actionType.id,
        action_api_name: context.actionType.api_name,
        target_type_id: context.objectType.id,
        target_type_api_name: context.objectType.api_name,
        target_id: batch.id,
        actor: context.callerIdentity ?? "system",
        params: JSON.stringify(params),
        result: JSON.stringify(
          auditResult(context, {
            previousPlannedStart: batch.planned_start,
            plannedStart: updated.planned_start,
          }),
        ),
      })
      .execute();

    return updated;
  });
}

export default defineAction(deferStart);

// batch.cancel — stop a batch that is not going to happen, and say why.
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

type CancelParams = {
  reason: string;
};

/** The only states a batch can be cancelled from. */
const CANCELLABLE = ["queued", "fermenting"] as const;

function isCancellable(status: string): boolean {
  return (CANCELLABLE as readonly string[]).includes(status);
}

async function cancel(batch: BatchRow, params: CancelParams, context: ActionContext): Promise<BatchRow> {
  if (!isCancellable(batch.status)) {
    throw new ApiError(
      409,
      `Batch ${batch.id} is '${batch.status}'. Only a batch that is ${CANCELLABLE.join(" or ")} can be cancelled.`,
    );
  }

  return withTransaction(context.db, async (trx) => {
    // Re-checked inside the transaction: a batch that finishes between the
    // check above and this write would otherwise be cancelled after the fact.
    const current = await trx
      .selectFrom("manufacturing.batch")
      .select("status")
      .where("id", "=", batch.id)
      .executeTakeFirstOrThrow();

    if (!isCancellable(current.status)) {
      throw new ApiError(409, `Batch ${batch.id} became '${current.status}' before it could be cancelled.`);
    }

    const updated = await trx
      .updateTable("manufacturing.batch")
      .set({ status: "cancelled" })
      .where("id", "=", batch.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .withSchema(METADATA_SCHEMA)
      .insertInto("audit_log")
      .values({
        action_type_id: context.actionType.id,
        action_api_name: context.actionType.api_name,
        target_type_id: context.objectType.id,
        target_type_api_name: context.objectType.api_name,
        target_id: batch.id,
        actor: context.callerIdentity ?? "system",
        params: JSON.stringify(params),
        // The reason is in `params` already; it is repeated here so that the
        // trail reads on its own, without joining a cancellation back to the
        // arguments it was called with.
        result: JSON.stringify(
          auditResult(context, {
            previousStatus: current.status,
            status: updated.status,
            reason: params.reason,
          }),
        ),
      })
      .execute();

    return updated;
  });
}

export default defineAction(cancel);

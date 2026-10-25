// proposal.reject — decline, and do not run the underlying action.
//
// The mirror of approve, and deliberately the duller of the two: it records a
// decision and stops. Nothing is dispatched, so nothing can fail halfway.
import type { Selectable } from "kysely";
import type { ManufacturingProposalTable } from "../../db.ts";
import type { InstanceRow } from "../../ontology/metadata.ts";
import { METADATA_SCHEMA } from "../../ontology/schemas.ts";
import { assertPending, reviewerOf, type DecisionParams } from "./proposalApprove.ts";
import { withTransaction } from "../transaction.ts";
import { defineAction, type ActionContext } from "../types.ts";

type ProposalRow = Selectable<ManufacturingProposalTable>;

async function reject(
  proposal: ProposalRow,
  params: DecisionParams,
  context: ActionContext,
): Promise<InstanceRow> {
  assertPending(proposal);

  const reviewer = reviewerOf(context);
  const reviewedAt = new Date();

  return withTransaction(context.db, async (trx) => {
    const updated = await trx
      .updateTable("manufacturing.proposal")
      .set({
        status: "rejected",
        reviewed_by: reviewer,
        reviewed_at: reviewedAt,
        ...(params.decisionNote === undefined ? {} : { decision_note: params.decisionNote }),
      })
      .where("id", "=", proposal.id)
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
        target_id: String(proposal.id),
        actor: reviewer,
        params: JSON.stringify(params),
        // `declinedAction` rather than `triggeredAction`: the key is recorded
        // so the trail says what was turned down, not what ran.
        result: JSON.stringify({
          status: updated.status,
          declinedAction: proposal.type,
          targetId: proposal.target_id,
          reviewedBy: reviewer,
          reviewedAt: reviewedAt.toISOString(),
        }),
      })
      .execute();

    return updated as unknown as InstanceRow;
  });
}

export default defineAction(reject);

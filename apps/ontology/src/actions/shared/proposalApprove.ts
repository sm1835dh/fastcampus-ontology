// proposal.approve — take the decision, then carry it out.
//
// Schema-generic: nothing here knows about batches. The proposal names a
// handler key, this looks that key up in the same registry the invoke route
// uses, and runs it. Adding a proposable action needs no change to this file.
//
// The import of `registry.ts` is circular -- registry imports this module to
// register it. That is safe because `actionHandlers` is only read inside the
// handler body, which runs long after both modules have finished evaluating.
import type { Selectable } from "kysely";
import type { ManufacturingProposalTable } from "../../db.ts";
import { ApiError } from "../../ontology/errors.ts";
import { findInstance } from "../../ontology/instances.ts";
import { loadTypeView, requireActionType, type InstanceRow } from "../../ontology/metadata.ts";
import { METADATA_SCHEMA } from "../../ontology/schemas.ts";
import { actionHandlers, parseHandlerKey } from "../registry.ts";
import { withTransaction } from "../transaction.ts";
import { defineAction, type ActionContext } from "../types.ts";

type ProposalRow = Selectable<ManufacturingProposalTable>;

export type DecisionParams = {
  decisionNote?: string;
};

/**
 * Who a decision is recorded as, and who the action it triggers is attributed
 * to. Shared with reject so the two can never drift apart.
 */
export function reviewerOf(context: ActionContext): string {
  return context.callerIdentity ?? "system";
}

/**
 * A proposal can only be decided once. Exported so the rule can be checked on
 * its own, and because reject needs exactly the same one.
 */
export function assertPending(proposal: ProposalRow): void {
  if (proposal.status !== "pending") {
    throw new ApiError(
      409,
      `Proposal ${proposal.id} is already '${proposal.status}' and cannot be decided again.`,
    );
  }
}

async function approve(
  proposal: ProposalRow,
  params: DecisionParams,
  context: ActionContext,
): Promise<InstanceRow> {
  assertPending(proposal);

  // `type` is a registry key, compared exactly as stored: `batch.cancel` is a
  // handler and `Batch.Cancel` is not.
  const handler = actionHandlers[proposal.type];
  if (!handler) {
    const known = Object.keys(actionHandlers).sort().join(", ");
    throw new ApiError(
      422,
      `Proposal ${proposal.id} names action '${proposal.type}', which has no handler. Known actions: ${known}`,
    );
  }

  const { objectTypeApiName, actionApiName } = parseHandlerKey(proposal.type);

  // The target's metadata, so the triggered action records the same dual
  // snapshot it would have recorded had it been invoked directly.
  const view = await loadTypeView(objectTypeApiName);
  const actionType = await requireActionType(view.objectType.id, actionApiName);

  const target = await findInstance(view, proposal.target_id);
  if (!target) {
    throw new ApiError(
      409,
      `Proposal ${proposal.id} targets ${objectTypeApiName} '${proposal.target_id}', which no longer exists.`,
    );
  }

  const reviewer = reviewerOf(context);
  // The server's Date is anchored to the course clock, so this is the course's
  // now rather than the machine's.
  const reviewedAt = new Date();

  return withTransaction(context.db, async (trx) => {
    // The underlying action runs first, and inside this transaction. If it
    // refuses -- a batch already fermenting, a date now in the past -- it
    // throws, nothing below has happened yet, and everything above unwinds:
    // the proposal is still pending and no approval was ever recorded.
    await handler(target, proposal.params as Record<string, unknown>, {
      db: trx,
      objectType: view.objectType,
      actionType,
      actor: reviewer,
      callerIdentity: reviewer,
      authorizedByProposal: proposal.id,
    });

    const updated = await trx
      .updateTable("manufacturing.proposal")
      .set({
        status: "approved",
        reviewed_by: reviewer,
        reviewed_at: reviewedAt,
        ...(params.decisionNote === undefined ? {} : { decision_note: params.decisionNote }),
      })
      .where("id", "=", proposal.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    // The decision itself is an action on the proposal, and gets its own entry.
    // The action it triggered has written its own against the batch.
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
        result: JSON.stringify({
          status: updated.status,
          triggeredAction: proposal.type,
          targetId: proposal.target_id,
          reviewedBy: reviewer,
          reviewedAt: reviewedAt.toISOString(),
        }),
      })
      .execute();

    return updated as unknown as InstanceRow;
  });
}

export default defineAction(approve);

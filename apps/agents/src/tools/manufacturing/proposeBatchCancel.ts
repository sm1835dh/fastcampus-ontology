// Agent SDK wrapper that proposes batch.cancel rather than performing it.
//
// The difference from batch_alert_operator and batch_defer_start is the whole
// point: those act, this one asks. It writes a Proposal row through the generic
// create route and stops there, so a human decides whether the cancellation
// actually happens.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { courseNowIso } from "../../helpers/courseClock.ts";
import { callOntology, ontologyApiBase } from "../shared/ontologyApi.ts";

/** Who proposals from this agent are filed under. */
export const PROPOSED_BY = "ingredient-delivery-disruption-agent";

/**
 * The registry key the ontology dispatches on, spelled exactly as the handler
 * is registered. It is compared case-sensitively, so `Batch.Cancel` would be
 * accepted into the queue and then fail at approval time, which is the worst
 * place to find out.
 */
export const CANCEL_HANDLER_KEY = "batch.cancel";

export const proposeBatchCancel = tool(
  "propose_batch_cancel",
  "Propose cancelling a batch, for a human to approve or reject. This does not cancel anything by " +
    "itself: it adds a pending Proposal to the review queue. Use it when a batch looks unrunnable " +
    "and the call is not yours to make. Give the rationale in full — it is the only thing the " +
    "reviewer sees explaining why.",
  {
    batch_id: z.string().describe("The batch's id, for example 'B-2117'."),
    reason: z
      .string()
      .describe("The cancellation reason, recorded on the batch itself if the proposal is approved."),
    rationale: z
      .string()
      .describe("Your case for the proposal: what you found, and why it points at cancelling."),
  },
  async (args) => {
    return callOntology("propose_batch_cancel", `${ontologyApiBase()}/api/objects/proposal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: CANCEL_HANDLER_KEY,
        targetId: args.batch_id,
        // Only the action's own parameters. These are handed to batch.cancel
        // unchanged at approval, and its schema refuses anything else.
        params: { reason: args.reason },
        rationale: args.rationale,
        status: "pending",
        proposedBy: PROPOSED_BY,
        proposedAt: courseNowIso(),
      }),
    });
  },
);

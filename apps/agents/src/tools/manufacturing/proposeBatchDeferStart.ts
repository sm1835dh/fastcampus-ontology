// Agent SDK wrapper that proposes batch.deferStart rather than performing it.
//
// batch_defer_start exists too and acts immediately. Which one an agent should
// hold depends on how much authority it has been given: this is the same action
// behind a human decision.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { courseNowIso } from "../../helpers/courseClock.ts";
import { callOntology, ontologyApiBase } from "../shared/ontologyApi.ts";
import { PROPOSED_BY } from "./proposeBatchCancel.ts";

/**
 * The registry key the ontology dispatches on, spelled exactly as the handler
 * is registered — camelCase, compared case-sensitively.
 */
export const DEFER_START_HANDLER_KEY = "batch.deferStart";

export const proposeBatchDeferStart = tool(
  "propose_batch_defer_start",
  "Propose postponing a batch's planned start, for a human to approve or reject. This does not move " +
    "anything by itself: it adds a pending Proposal to the review queue. The batch must still be " +
    "queued and the new date in the future when the proposal is approved, not merely when it is made.",
  {
    batch_id: z.string().describe("The batch's id, for example 'B-2126'."),
    new_planned_start: z
      .string()
      .describe("The proposed new start, as an ISO 8601 datetime, for example '2026-05-20T08:00:00Z'."),
    rationale: z
      .string()
      .describe("Your case for the proposal: what you found, and why it points at this date."),
  },
  async (args) => {
    return callOntology("propose_batch_defer_start", `${ontologyApiBase()}/api/objects/proposal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: DEFER_START_HANDLER_KEY,
        targetId: args.batch_id,
        // Only the action's own parameters, keyed as batch.deferStart declares
        // them — not as this tool names its arguments.
        params: { newPlannedStart: args.new_planned_start },
        rationale: args.rationale,
        status: "pending",
        proposedBy: PROPOSED_BY,
        proposedAt: courseNowIso(),
      }),
    });
  },
);

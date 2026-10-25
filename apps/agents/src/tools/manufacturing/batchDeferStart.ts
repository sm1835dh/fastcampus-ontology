// Agent SDK wrapper around the batch.deferStart action.
//
// The object id travels in the URL; the body carries only the action's own
// parameters, because its parameter_schema sets additionalProperties: false.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { callOntology, ontologyApiBase } from "../shared/ontologyApi.ts";

export const batchDeferStart = tool(
  "batch_defer_start",
  "Postpone a batch's planned start date. Only a batch whose status is 'queued' can be deferred, " +
    "and the new start must be in the future; anything else is refused with an explanation.",
  {
    batchId: z.string().describe("The batch's id, for example 'B-2130'."),
    newPlannedStart: z
      .string()
      .describe("The new planned start, as an ISO 8601 datetime, for example '2026-05-20T08:00:00Z'."),
  },
  async (args) => {
    const path = ["batch", args.batchId, "actions", "deferStart"].map(encodeURIComponent).join("/");
    return callOntology("batch_defer_start", `${ontologyApiBase()}/api/objects/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newPlannedStart: args.newPlannedStart }),
    });
  },
);

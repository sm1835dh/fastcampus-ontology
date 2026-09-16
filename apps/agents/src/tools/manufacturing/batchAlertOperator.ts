// Agent SDK wrapper around the batch.alertOperator action.
//
// The object id travels in the URL; the body carries only the action's own
// parameters, because its parameter_schema sets additionalProperties: false.
//
// The description says plainly that this one leaves the building. Every other
// tool an agent has here writes to a database that can be corrected later; this
// one reaches a person, and the model should weigh it differently.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { callOntology, ontologyApiBase } from "../shared/ontologyApi.ts";

export const batchAlertOperator = tool(
  "batch_alert_operator",
  "Send the operator assigned to a batch a message through an external notification system. " +
    "This leaves the ontology and reaches a real person, and it cannot be recalled once sent, so " +
    "send one alert per situation and only when someone genuinely needs to act. Look up the batch " +
    "first: a message that carries the actual readings is far more use than one that does not. " +
    "Refused if the batch has no assigned operator.",
  {
    batchId: z.string().describe("The batch's id, for example 'B-2105'."),
    message: z
      .string()
      .describe(
        "What the operator needs to know, in plain language. Include the readings that prompted it.",
      ),
    severity: z
      .enum(["info", "warning", "critical"])
      .describe(
        "How urgently the operator should act. 'critical' means the batch is at risk right now.",
      ),
  },
  async (args) => {
    const path = ["batch", args.batchId, "actions", "alertOperator"].map(encodeURIComponent).join("/");
    return callOntology("batch_alert_operator", `${ontologyApiBase()}/api/objects/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: args.message, severity: args.severity }),
    });
  },
);

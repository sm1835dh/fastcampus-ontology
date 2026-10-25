// Agent SDK wrapper around the tank.scheduleMaintenance action.
//
// The object id travels in the URL; the body carries only the action's own
// parameters, because its parameter_schema sets additionalProperties: false.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { callOntology, ontologyApiBase } from "../shared/ontologyApi.ts";

const MAINTENANCE_TYPES = ["inspection", "preventive", "corrective", "cleaning"] as const;

export const tankScheduleMaintenance = tool(
  "tank_schedule_maintenance",
  "Schedule maintenance on a tank. This takes the tank offline: its status becomes 'maintenance' and " +
    "a maintenance log is created with status 'scheduled'. It is refused if any batch is still " +
    "fermenting in that tank.",
  {
    tankId: z.string().describe("The tank's id, for example 'T-8'."),
    type: z.enum(MAINTENANCE_TYPES).describe("What kind of maintenance is being scheduled."),
    plannedAt: z
      .string()
      .describe("When the work is planned, as an ISO 8601 datetime, for example '2026-05-20T09:00:00Z'."),
    notes: z
      .string()
      .describe("Why the visit is being scheduled, and anything the technician should know."),
  },
  async (args) => {
    const path = ["tank", args.tankId, "actions", "scheduleMaintenance"].map(encodeURIComponent).join("/");
    return callOntology("tank_schedule_maintenance", `${ontologyApiBase()}/api/objects/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: args.type, plannedAt: args.plannedAt, notes: args.notes }),
    });
  },
);

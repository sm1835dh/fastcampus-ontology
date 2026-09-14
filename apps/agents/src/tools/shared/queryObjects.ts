// An Agent SDK tool that reads ontology objects through the Hono API.
//
// Exported as a tool definition rather than a server, so each agent script can
// compose the tools it wants into its own createSdkMcpServer(...).
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { callOntology, ontologyApiBase } from "./ontologyApi.ts";

/** Mirrors the operators the /query route accepts. */
const OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "isNull",
  "isNotNull",
] as const;

const filter = z.object({
  property: z.string().describe("Property API name, for example 'status' or 'daysFermenting'."),
  op: z.enum(OPERATORS).describe("Comparison. 'in' takes an array value; isNull/isNotNull take none."),
  value: z
    .unknown()
    .optional()
    .describe("The value to compare against. Omit for isNull and isNotNull; use an array for 'in'."),
});

export const queryObjects = tool(
  "query_objects",
  "Query instances of an ontology object type, optionally filtered. Returns the matching objects, " +
    "keyed by property API name. Use the object type's API name (for example 'batch', not 'Batch').",
  {
    type: z.string().describe("The object type's API name, for example 'batch' or 'qualityTest'."),
    filters: z.array(filter).optional().describe("Filters, combined with AND. Omit to return everything."),
    limit: z.number().int().positive().optional().describe("Maximum number of objects to return (1-1000)."),
  },
  async (args) => {
    const url = `${ontologyApiBase()}/api/objects/${encodeURIComponent(args.type)}/query`;

    const body: Record<string, unknown> = {};
    if (args.filters !== undefined) body["filters"] = args.filters;
    if (args.limit !== undefined) body["limit"] = args.limit;

    return callOntology("query_objects", url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  },
);

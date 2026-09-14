// An Agent SDK tool that reads one ontology object through the Hono API.
//
// Exported as a tool definition rather than a server, so each agent script can
// compose the tools it wants into its own createSdkMcpServer(...).
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { callOntology, ontologyApiBase } from "./ontologyApi.ts";

export const getObject = tool(
  "get_object",
  "Fetch one ontology object by its id. Returns its properties, keyed by property API name, along " +
    "with its linked objects resolved one hop in both directions. Use the object type's API name " +
    "(for example 'batch', not 'Batch').",
  {
    type: z.string().describe("The object type's API name, for example 'batch' or 'tank'."),
    id: z.string().describe("The object's id, for example 'B-2105' or 'T-12'."),
  },
  async (args) => {
    const path = [args.type, args.id].map(encodeURIComponent).join("/");
    return callOntology("get_object", `${ontologyApiBase()}/api/objects/${path}`);
  },
);

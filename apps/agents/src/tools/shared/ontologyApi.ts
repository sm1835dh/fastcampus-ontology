// Shared plumbing for the ontology tools: where the API lives, and how a tool
// turns a response into a result the model can act on.
// The result type comes from the Agent SDK rather than from
// @modelcontextprotocol/sdk directly: that is the package these tools are
// written against, and taking the type from the same place as tool() keeps
// the two from drifting.
import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";

/** Exactly what a tool handler must resolve to. */
export type ToolResult = Awaited<ReturnType<SdkMcpToolDefinition["handler"]>>;

/**
 * ONTOLOGY_URL is the name to set. HONO_URL is still honoured because the first
 * tool shipped reading it, and two names that silently disagree would be worse
 * than one that is merely old.
 */
export function ontologyApiBase(): string {
  return process.env["ONTOLOGY_URL"] ?? process.env["HONO_URL"] ?? "http://localhost:3000";
}

/** Calls the API and shapes the outcome for a tool handler. */
export async function callOntology(
  toolName: string,
  url: string,
  init?: RequestInit,
): Promise<ToolResult> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      content: [{ type: "text", text: `${toolName} could not reach ${url}: ${reason}` }],
      isError: true,
    };
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // The API explains itself -- an unknown type, property or id comes back
    // naming what was refused and what would be valid, which is exactly what
    // the model needs in order to retry.
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${response.status}`;
    return { content: [{ type: "text", text: `${toolName} failed: ${message}` }], isError: true };
  }

  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

// The entry point every agent script goes through.
//
// Wrapping query() here means each agent file is just an identity and a prompt:
// telemetry, the live viewer, the ontology schema, the clock override and the
// tool permissions are decided once, in one place, rather than copied per agent.
import { ClaudeAgentSDKInstrumentation } from "@arizeai/openinference-instrumentation-claude-agent-sdk";
import { LangfuseSpanProcessor, isDefaultExportSpan, type ShouldExportSpan } from "@langfuse/otel";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import * as ClaudeAgentSDKModule from "@anthropic-ai/claude-agent-sdk";
import {
  createSdkMcpServer,
  type Options,
  type PermissionResult,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { buildSchemaBlock } from "./helpers/buildSchemaBlock.ts";
import { startRunViewer, type RunEvent, type RunViewer } from "./runViewer.ts";
import { ontologyApiBase } from "./tools/shared/ontologyApi.ts";

// Langfuse reads these off the span; they are plain strings in its OTel contract.
const LANGFUSE_TRACE_NAME = "langfuse.trace.name";
const LANGFUSE_AS_ROOT = "langfuse.internal.as_root";
const LANGFUSE_TRACE_INPUT = "langfuse.trace.input";
const LANGFUSE_TRACE_OUTPUT = "langfuse.trace.output";

/** Our own tracer, and the scope name its spans carry. */
export const TRACER_NAME = "fastcampus-agents";

const ARIZE_SCOPE = "@arizeai/openinference-instrumentation-claude-agent-sdk";

/**
 * Which spans reach Langfuse. The vendor example keeps Langfuse's own spans and
 * the instrumentation's; our root span is neither, and without this third arm it
 * was silently dropped -- taking langfuse.trace.name, and so the trace's name,
 * with it. Exported so the rule can be tested directly.
 */
export const shouldExportSpan: ShouldExportSpan = ({ otelSpan }) => {
  const scope = otelSpan.instrumentationScope.name;
  return isDefaultExportSpan(otelSpan) || scope === ARIZE_SCOPE || scope === TRACER_NAME;
};

/**
 * A patched global Date is silently fatal to tracing: spans get stamped with the
 * override date, and the collector drops anything that far out of its ingestion
 * window. Nothing errors -- the run simply produces no trace.
 *
 * performance.timeOrigin is a separate time source that clock.ts does not touch,
 * so the gap between the two is a reliable tell. The tolerance is generous; only
 * a deliberate override lands anywhere near it.
 */
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

export function clockSkewMs(): number {
  return Date.now() - (performance.timeOrigin + performance.now());
}

/** Returns the warning it printed, or null when the clock is real. */
export function warnIfClockAnchored(): string | null {
  const skew = clockSkewMs();
  if (Math.abs(skew) <= CLOCK_SKEW_TOLERANCE_MS) return null;

  const days = (skew / 86_400_000).toFixed(1);
  const message =
    `▸ WARNING: this process's Date is ${days} days from real time, so Langfuse will ` +
    `drop its spans and the run will not be traced.\n` +
    `  Something imported code that anchors the clock to COURSE_NOW -- usually the ` +
    `ontology app. Run the ontology API in its own process and point ONTOLOGY_URL at it.`;

  console.warn(message);
  return message;
}

const MCP_SERVER = "ontology";

/** An SDK MCP tool reaches the model as mcp__<server>__<tool>. */
export function wireName(tool: SdkMcpToolDefinition<any>): string {
  return `mcp__${MCP_SERVER}__${tool.name}`;
}

/**
 * The one permission decision, made against the tools this agent was given.
 * They run unasked; everything else — Bash, Read, another MCP server — is
 * refused rather than queued for a human who is not watching. Exported so the
 * rule can be tested without spending a model turn.
 */
export function toolPermission(toolName: string, allowed: readonly string[]): PermissionResult {
  if (allowed.includes(toolName)) return { behavior: "allow" };
  return {
    behavior: "deny",
    message: `${toolName} is not available. This agent may only use: ${allowed.join(", ")}.`,
  };
}

export type RunAgentParams = {
  /** Names the Langfuse trace and identifies this agent to the ontology API. */
  identity: string;
  prompt: string;
  /** The agent's own tools. The MCP server and the permission gate come from these. */
  tools: SdkMcpToolDefinition<any>[];
  /** The agent's role instructions, appended after the injected schema and date. */
  systemPrompt?: string;
  /** Merged over the defaults; anything here wins. */
  options?: Partial<Options>;
};

/**
 * Tags ontology calls with who is making them. Scoped by URL on purpose: the
 * Anthropic and Langfuse endpoints have no business seeing an internal identity.
 */
function installOntologyFetchInterceptor(identity: string): void {
  const base = ontologyApiBase();
  const original = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (!url.startsWith(base)) return original(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-caller-identity", identity);
    return original(input, { ...init, headers });
  };
}

/**
 * Starts OpenTelemetry and returns the instrumented SDK module. The instrumented
 * copy is what matters: manuallyInstrument patches the object handed to it, and
 * ESM namespaces are frozen, so query() must be called off this copy or the run
 * produces no spans.
 */
function startTelemetry(): { sdk: NodeSDK | null; query: typeof ClaudeAgentSDKModule.query } {
  const configured = process.env["LANGFUSE_PUBLIC_KEY"] && process.env["LANGFUSE_SECRET_KEY"];
  const instrumentation = new ClaudeAgentSDKInstrumentation();
  const instrumented = instrumentation.manuallyInstrument({ ...ClaudeAgentSDKModule });

  if (!configured) {
    // No keys, no exporter: the run still works, just untraced. Say so, because
    // silence here looks exactly like tracing that is quietly failing.
    console.log("▸ tracing: off (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set)");
    return { sdk: null, query: instrumented.query };
  }

  const sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({ shouldExportSpan }),
    ],
    instrumentations: [instrumentation],
  });
  sdk.start();
  console.log(`▸ tracing: on → ${process.env["LANGFUSE_BASE_URL"] ?? "https://cloud.langfuse.com"}`);

  return { sdk, query: instrumented.query };
}

/**
 * The schema leads, inside a tag so the model can tell this injected reference
 * from the rest of the prompt. The date override follows it.
 */
export function buildSystemPrompt(schemaBlock: string, role?: string): string {
  const sections: string[] = [`<ontology-schema>\n${schemaBlock}\n</ontology-schema>`];
  const courseNow = process.env["COURSE_NOW"];

  if (courseNow) {
    sections.push(
      [
        "## Current date (COURSE_NOW override)",
        "",
        `The current date and time is ${courseNow}.`,
        "",
        "This is an override supplied by the environment variable COURSE_NOW, and it",
        "replaces your own sense of today. Treat it as the present moment for every",
        "time-relative judgement about ontology data — what counts as recent, overdue,",
        "upcoming, or how many days a batch has been running. Do not reason from any",
        "other notion of the current date.",
      ].join("\n"),
    );
  }

  if (role) sections.push(role);
  return sections.join("\n\n");
}

function publish(viewer: RunViewer, event: RunEvent): void {
  viewer.publish(event);
}

const now = () => new Date().toISOString();
const truncate = (text: string, max = 300) =>
  text.length > max ? `${text.slice(0, max)}… (${text.length} chars)` : text;

export async function runAgent({ identity, prompt, tools, systemPrompt, options }: RunAgentParams): Promise<void> {
  // Before telemetry starts, so the warning reads ahead of "tracing: on".
  warnIfClockAnchored();
  installOntologyFetchInterceptor(identity);

  const { sdk, query } = startTelemetry();
  const viewer = await startRunViewer();
  console.log(`▸ ${identity}\n▸ watch: ${viewer.url}\n`);

  const schemaBlock = await buildSchemaBlock();
  const ontology = createSdkMcpServer({ name: MCP_SERVER, version: "0.0.0", tools });
  const allowed = tools.map(wireName);

  publish(viewer, { kind: "start", identity, prompt, at: now() });

  const tracer = trace.getTracer(TRACER_NAME);
  let failure: unknown = null;

  await tracer.startActiveSpan(identity, async (span) => {
    span.setAttribute(LANGFUSE_TRACE_NAME, identity);
    span.setAttribute(LANGFUSE_AS_ROOT, true);
    span.setAttribute(LANGFUSE_TRACE_INPUT, prompt);

    try {
      const agent = query({
        prompt,
        options: {
          model: "claude-opus-5",
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: buildSystemPrompt(schemaBlock, systemPrompt),
          },
          mcpServers: { [MCP_SERVER]: ontology },
          // `tools` decides what exists; Bash and Read are named as forbidden on
          // top of that. Permission is left to one gate: canUseTool approves our
          // tools without asking and refuses anything else outright, rather than
          // queueing a prompt for a human who is not there.
          //
          // Our tools are deliberately NOT in allowedTools: a bare name there
          // auto-approves before the callback runs, which would shadow the gate
          // (the SDK warns about exactly this) and leave the deny path untested.
          tools: allowed,
          disallowedTools: ["Bash", "Read"],
          // No updatedInput on allow: returning one would replace the arguments
          // the model actually sent.
          canUseTool: async (toolName) => toolPermission(toolName, allowed),
          ...options,
        },
      });

      for await (const message of agent) {
        if (message.type === "assistant") {
          for (const block of message.message.content) {
            if (block.type === "text" && block.text.trim() !== "") {
              console.log(`[assistant] ${block.text.trim()}`);
              publish(viewer, { kind: "assistant", text: block.text.trim(), at: now() });
            } else if (block.type === "tool_use") {
              console.log(`[tool call] ${block.name} ${truncate(JSON.stringify(block.input), 160)}`);
              publish(viewer, { kind: "tool_call", tool: block.name, input: block.input, at: now() });
            }
          }
        } else if (message.type === "user") {
          const content = message.message.content;
          const blocks = typeof content === "string" ? [] : content;
          for (const block of blocks) {
            if (block.type !== "tool_result") continue;
            const payload = block.content;
            const text =
              typeof payload === "string"
                ? payload
                : Array.isArray(payload)
                  ? payload.map((part) => (part.type === "text" ? part.text : `[${part.type}]`)).join("")
                  : "";
            console.log(`[tool result] ${truncate(text, 160)}`);
            publish(viewer, { kind: "tool_result", text, at: now() });
          }
        } else if (message.type === "result") {
          if (message.subtype === "success") {
            const seconds = message.duration_ms / 1000;
            console.log(
              `\n[result] ${message.result}\n— ${message.num_turns} turns · ${seconds.toFixed(1)}s · $${message.total_cost_usd.toFixed(4)}`,
            );
            span.setAttribute(LANGFUSE_TRACE_OUTPUT, message.result);
            publish(viewer, {
              kind: "result",
              text: message.result,
              turns: message.num_turns,
              seconds,
              costUsd: message.total_cost_usd,
              at: now(),
            });
          } else {
            const reason = `agent ended without a result: ${message.subtype}`;
            console.error(`\n[result] ${reason}`);
            span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
            publish(viewer, { kind: "error", message: reason, at: now() });
            failure = new Error(reason);
          }
        }
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      console.error(`\n[error] ${reason}`);
      span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
      publish(viewer, { kind: "error", message: reason, at: now() });
      failure = cause;
    } finally {
      span.end();
    }
  });

  // The run is over, so the process should end — but not before the page has the
  // last event and the spans have actually been sent.
  await viewer.close();
  if (sdk) await sdk.shutdown();

  process.exit(failure === null ? 0 : 1);
}

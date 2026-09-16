// Shift report processor.
//
//   pnpm --filter @fastcampus/agents agent src/agents/manufacturing/shift-report-agent.ts
//
// The note is hardcoded rather than read from argv: this agent exists to process
// one handover, not to answer a question.
import { runAgent } from "../../run-agent.ts";
import { batchDeferStart } from "../../tools/manufacturing/batchDeferStart.ts";
import { tankScheduleMaintenance } from "../../tools/manufacturing/tankScheduleMaintenance.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

const SYSTEM_PROMPT = [
  "You are a shift report processor. You receive operator shift handover notes and translate",
  "actionable items into ontology actions. You act only through the tools available to you — you",
  "have no way to notify people, leave notes for another shift, or flag an item for later; if",
  "something needs to happen, it happens through a tool call or it does not happen at all. For each",
  "item, determine whether it is actionable. If it is, query the ontology to understand the current",
  "state, then invoke the appropriate action. Acknowledge non-actionable items without acting on",
  "them. Always explain your reasoning for each item, and reason through the impact of each action",
  "on the full schedule. Act on the consequences you identify.",
].join(" ");

const SHIFT_NOTE = `End of shift report — Park Kyungwon, 2026-04-30 evening shift:
T-7 pressure readings were fluctuating all afternoon. I manually adjusted twice but it kept drifting. Recommend taking it offline for inspection before we run B-2120 tomorrow.
Hop delivery for the next Lager run (B-2126) slipped — supplier says about a week out. Probably want to push that start back.
T-3 is fine, B-2134 still fermenting on track. Nothing to report.`;

await runAgent({
  identity: "shift-report-agent",
  prompt: SHIFT_NOTE,
  tools: [queryObjects, getObject, batchDeferStart, tankScheduleMaintenance],
  systemPrompt: SYSTEM_PROMPT,
});

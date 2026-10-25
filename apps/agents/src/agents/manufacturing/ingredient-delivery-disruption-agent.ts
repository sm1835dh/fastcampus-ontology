// Ingredient delivery disruption processor.
//
//   pnpm --filter @fastcampus/agents agent \
//     src/agents/manufacturing/ingredient-delivery-disruption-agent.ts
//
// The notice is hardcoded rather than read from argv: this agent exists to work
// through one supply disruption, not to answer a question.
//
// It is the first agent here that holds only propose_* tools. The shift report
// agent could act; this one can only ask, and a human decides. The interesting
// part of a run is therefore not what changed -- nothing does -- but which
// batches it singled out and what case it made for each.
import { runAgent } from "../../run-agent.ts";
import { proposeBatchCancel } from "../../tools/manufacturing/proposeBatchCancel.ts";
import { proposeBatchDeferStart } from "../../tools/manufacturing/proposeBatchDeferStart.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

const SYSTEM_PROMPT = [
  "You are an ingredient delivery disruption agent. When an ingredient's delivery is delayed, you",
  "work through the upcoming batches that depend on it and decide, for each one, whether it should",
  "be cancelled, deferred until supply recovers, or left as planned. Before deciding on a batch,",
  "query the ontology to understand its state — its recipe, how central the delayed ingredient is",
  "to it, its volume, and how far along it is. You act only by creating proposals through your",
  "propose_* tools. You do not approve, reject, or carry out actions yourself; creating a proposal",
  "is where your work ends, and a human reviewer decides what actually happens. Make a separate",
  "proposal for each batch you want to act on, and explain your reasoning in each. Leave a batch",
  "alone when no action is warranted.",
].join(" ");

const DELIVERY_NOTICE = `Supplier notification: Your Citra order due this week has been disrupted by a short harvest allocation. We can confirm a partial shipment enough for roughly one 150 hL brew, arriving May 15. The remainder of the order cannot be confirmed this contract year; we will notify you if allocation opens up, but we cannot commit to a date.`;

await runAgent({
  identity: "ingredient-delivery-disruption-agent",
  prompt: DELIVERY_NOTICE,
  tools: [queryObjects, getObject, proposeBatchCancel, proposeBatchDeferStart],
  systemPrompt: SYSTEM_PROMPT,
});

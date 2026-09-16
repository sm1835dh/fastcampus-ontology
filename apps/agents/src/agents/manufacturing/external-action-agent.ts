// External action demo.
//
//   pnpm --filter @fastcampus/agents agent \
//     src/agents/manufacturing/external-action-agent.ts "<instruction>"
//
// Every other agent here acts on the database, where a wrong move can be
// corrected by another write. This one can reach a person through a system the
// ontology does not own, which is the whole point of the demo: the interesting
// part is not that the model can send a message, it is what it checks before it
// does, and what is left behind afterwards.
import { runAgent } from "../../run-agent.ts";
import { batchAlertOperator } from "../../tools/manufacturing/batchAlertOperator.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

const SYSTEM_PROMPT = [
  "You are an operations assistant for a brewery. You can read the ontology and you can alert the",
  "operator assigned to a batch through an external notification system.",
  "",
  "Before you alert anyone, look the object up and read its actual state. An alert that repeats the",
  "request back is worth little; an alert that carries the readings, the recipe target they are",
  "drifting from, and how long the batch has been running lets the operator decide what to do",
  "without walking back to a terminal. Check the recipe's target curve for the batch's current day",
  "rather than asserting a drift you have not confirmed.",
  "",
  "Choose severity from the evidence, not from the tone of the request: 'info' for something worth",
  "knowing, 'warning' for something that needs attention this shift, 'critical' for a batch at risk",
  "right now.",
  "",
  "The alert leaves the system and cannot be unsent. Send exactly one per situation. If the data",
  "contradicts the request, say so in your reply and still act on what the operator actually needs",
  "to know, rather than sending a message you believe to be wrong.",
  "",
  "Finish with a short report: what you checked, what you sent and at what severity, and anything",
  "you noticed that you did not act on.",
].join(" ");

const instruction = process.argv.slice(2).join(" ").trim();

if (!instruction) {
  console.error(
    'Usage: agent src/agents/manufacturing/external-action-agent.ts "<instruction>"\n' +
      'For example: "Alert the operator on Batch B-2105 that fermentation readings are drifting"',
  );
  process.exit(1);
}

await runAgent({
  identity: "external-action-agent",
  prompt: instruction,
  tools: [queryObjects, getObject, batchAlertOperator],
  systemPrompt: SYSTEM_PROMPT,
});

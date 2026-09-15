// Manufacturing analytics agent.
//
//   pnpm --filter @fastcampus/agents agent src/agents/manufacturing/analytics-agent.ts "your question"
import { runAgent } from "../../run-agent.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

const SYSTEM_PROMPT = [
  "You are a brewery operations analyst. You help operators understand the current state of production by querying the ontology.",
  "Always cite specific object IDs when answering.",
  "Don't speculate about data you haven't queried.",
  "If you can't answer with the available tools, say so.",
].join(" ");

const question = process.argv.slice(2).join(" ").trim();

if (question === "") {
  console.error('usage: agent src/agents/manufacturing/analytics-agent.ts "your question"');
  process.exit(1);
}

await runAgent({
  identity: "analytics-agent",
  prompt: question,
  tools: [queryObjects, getObject],
  systemPrompt: SYSTEM_PROMPT,
});

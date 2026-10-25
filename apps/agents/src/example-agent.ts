// A standalone agent script.
//
//   pnpm --filter @fastcampus/agents agent src/example-agent.ts
//   pnpm --filter @fastcampus/agents agent src/example-agent.ts "your question"
//
// Everything else — telemetry, the live viewer, the ontology schema, the clock
// override, the tool permissions — is runAgent's job.
import { runAgent } from "./run-agent.ts";
import { getObject } from "./tools/shared/getObject.ts";
import { queryObjects } from "./tools/shared/queryObjects.ts";

await runAgent({
  identity: "example-agent",
  tools: [queryObjects, getObject],
  prompt:
    process.argv.slice(2).join(" ").trim() ||
    "How many fermenting batches are there, and which of them are behind their recipe's target sugar curve?",
});

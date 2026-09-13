// A standalone agent script.
//
//   pnpm --filter @fastcampus/agents agent src/example-agent.ts
//   pnpm --filter @fastcampus/agents agent src/example-agent.ts "your prompt here"
//
// The Agent SDK is Claude Code packaged as a library: it brings its own agent
// loop and built-in tools (Read, Glob, Grep, Bash, ...) and runs on this
// machine. Credentials are resolved the way the Claude Code CLI resolves them,
// so there is nothing to pass in here.
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";

// __dirname does not exist in ES modules; derive paths from import.meta.url.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const prompt =
  process.argv.slice(2).join(" ").trim() ||
  "Read the README and describe, in three sentences, what this repository does.";

const agent = query({
  prompt,
  options: {
    model: "claude-opus-5",
    cwd: repoRoot,
    // `tools` restricts what exists; `allowedTools` is what runs without asking.
    // Both are read-only here, so the script never blocks on an approval prompt.
    tools: ["Read", "Glob", "Grep"],
    allowedTools: ["Read", "Glob", "Grep"],
    maxTurns: 12,
  },
});

for await (const message of agent) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "text") console.log(block.text);
    }
  } else if (message.type === "result") {
    if (message.subtype === "success") {
      const seconds = (message.duration_ms / 1000).toFixed(1);
      console.log(`\n— ${message.num_turns} turns · ${seconds}s · $${message.total_cost_usd.toFixed(4)}`);
    } else {
      console.error(`\nagent ended without a result: ${message.subtype}`);
      process.exitCode = 1;
    }
  }
}

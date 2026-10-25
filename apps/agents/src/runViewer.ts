// A tiny live view of an agent run, served on port 3455.
//
// The terminal already shows the run; this exists so the turns can be watched
// in a browser, with long tool results folded away instead of scrolling past.
// Everything is buffered, so opening the page mid-run still shows the whole run
// from the start.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export const VIEWER_PORT = 3455;

export type RunEvent =
  | { kind: "start"; identity: string; prompt: string; at: string }
  | { kind: "assistant"; text: string; at: string }
  | { kind: "tool_call"; tool: string; input: unknown; at: string }
  | { kind: "tool_result"; text: string; at: string }
  | { kind: "result"; text: string; turns: number; seconds: number; costUsd: number; at: string }
  | { kind: "error"; message: string; at: string };

export type RunViewer = {
  url: string;
  publish: (event: RunEvent) => void;
  /** Lets open pages receive the last events, then stops listening. */
  close: (graceMs?: number) => Promise<void>;
};

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Agent run</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    background: #14171a; color: #e6e8eb;
    font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  header { margin-bottom: 20px; }
  h1 { margin: 0 0 4px; font-size: 16px; letter-spacing: .02em; }
  .muted { color: #8b949e; }
  .prompt { margin-top: 10px; padding: 10px 14px; border-left: 3px solid #4493f8; background: #1b1f24; white-space: pre-wrap; }
  .event { margin: 10px 0; border: 1px solid #2a2f36; border-radius: 6px; background: #1b1f24; overflow: hidden; }
  .event > .head { display: flex; gap: 10px; align-items: baseline; padding: 8px 14px; }
  .tag { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
  .assistant .tag { background: #1f6feb33; color: #7db4ff; }
  .tool_call .tag { background: #a371f733; color: #c297ff; }
  .tool_result .tag { background: #3fb95033; color: #6fd47e; }
  .result .tag { background: #d2992233; color: #e3b341; }
  .error .tag { background: #f8514933; color: #ff8b84; }
  .time { margin-left: auto; font-size: 11px; color: #6e7681; }
  .body { padding: 0 14px 12px; white-space: pre-wrap; word-break: break-word; }
  .result .body { color: #f0d58c; }
  details > summary { cursor: pointer; padding: 0 14px 12px; color: #8b949e; }
  details[open] > summary { padding-bottom: 6px; }
  pre { margin: 0; padding: 10px 14px; background: #101316; border-top: 1px solid #2a2f36; overflow-x: auto; }
  .waiting { color: #6e7681; padding: 20px 0; }
</style>
</head>
<body>
<header>
  <h1>Agent run <span class="muted" id="identity"></span></h1>
  <div class="muted" id="status">connecting…</div>
  <div class="prompt" id="prompt" hidden></div>
</header>
<main id="log"><div class="waiting">Waiting for the first event…</div></main>
<script>
  const log = document.getElementById("log");
  const status = document.getElementById("status");
  let cleared = false;

  const clearOnce = () => { if (!cleared) { log.innerHTML = ""; cleared = true; } };
  const time = (iso) => new Date(iso).toLocaleTimeString();

  function block(kind, label, event, bodyHtml) {
    clearOnce();
    const el = document.createElement("section");
    el.className = "event " + kind;
    el.innerHTML =
      '<div class="head"><span class="tag">' + label + '</span>' +
      '<span class="time">' + time(event.at) + "</span></div>" + bodyHtml;
    log.appendChild(el);
    window.scrollTo(0, document.body.scrollHeight);
  }

  const escape = (text) =>
    String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

  const folded = (summary, content) =>
    "<details><summary>" + escape(summary) + "</summary><pre>" + escape(content) + "</pre></details>";

  const source = new EventSource("/events");

  source.onopen = () => { status.textContent = "connected"; };
  source.onerror = () => { status.textContent = "disconnected"; };

  source.onmessage = (message) => {
    const event = JSON.parse(message.data);

    if (event.kind === "start") {
      document.getElementById("identity").textContent = "· " + event.identity;
      const prompt = document.getElementById("prompt");
      prompt.textContent = event.prompt;
      prompt.hidden = false;
      status.textContent = "running…";
      return;
    }
    if (event.kind === "assistant") {
      block("assistant", "assistant", event, '<div class="body">' + escape(event.text) + "</div>");
      return;
    }
    if (event.kind === "tool_call") {
      const input = JSON.stringify(event.input, null, 2);
      block("tool_call", event.tool, event, folded("input (" + input.length + " chars)", input));
      return;
    }
    if (event.kind === "tool_result") {
      const short = event.text.length <= 200;
      block(
        "tool_result", "tool result", event,
        short ? '<div class="body">' + escape(event.text) + "</div>"
              : folded(event.text.length + " chars", event.text),
      );
      return;
    }
    if (event.kind === "result") {
      status.textContent =
        "done · " + event.turns + " turns · " + event.seconds.toFixed(1) + "s · $" + event.costUsd.toFixed(4);
      block("result", "result", event, '<div class="body">' + escape(event.text) + "</div>");
      return;
    }
    if (event.kind === "error") {
      status.textContent = "failed";
      block("error", "error", event, '<div class="body">' + escape(event.message) + "</div>");
    }
  };
</script>
</body>
</html>`;

function writeEvent(response: ServerResponse, event: RunEvent): void {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function startRunViewer(): Promise<RunViewer> {
  const history: RunEvent[] = [];
  const streams = new Set<ServerResponse>();

  const handler = (request: IncomingMessage, response: ServerResponse): void => {
    if (request.url === "/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      // Replay first: a page opened mid-run should still show the whole run.
      for (const event of history) writeEvent(response, event);
      streams.add(response);
      request.on("close", () => streams.delete(response));
      return;
    }

    if (request.url === "/" || request.url === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(PAGE);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  };

  const server: Server = createServer(handler);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(VIEWER_PORT, () => {
      resolve({
        url: `http://localhost:${VIEWER_PORT}`,

        publish(event) {
          history.push(event);
          for (const stream of streams) writeEvent(stream, event);
        },

        async close(graceMs = 400) {
          // A moment for the browser to paint the final event before the
          // process exits and the stream dies with it.
          await new Promise((done) => setTimeout(done, graceMs));
          for (const stream of streams) stream.end();
          streams.clear();
          await new Promise<void>((done) => server.close(() => done()));
        },
      });
    });
  });
}

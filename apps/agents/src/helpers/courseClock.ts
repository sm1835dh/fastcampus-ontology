// The course's clock, as an agent process sees it.
//
// The ontology server patches its own global Date so that "now" is the course's
// narrative date. An agent process deliberately does not do that -- importing
// the ontology app here would stamp OpenTelemetry spans months out of date and
// the collector would drop them silently. So an agent that needs to write a
// timestamp reads the anchor itself.
//
// This matters for any value the agent sends rather than lets the database
// default: a column defaulting to now() gets Postgres's real clock, while a
// value the agent supplies gets the course's. Those are months apart.

/** The anchor, as configured for the whole workspace. */
export function courseAnchor(): Date | null {
  const raw = process.env["COURSE_NOW"];
  if (!raw) return null;

  const anchored = new Date(raw);
  return Number.isNaN(anchored.getTime()) ? null : anchored;
}

/**
 * The course's current time, as an ISO string.
 *
 * The server's clock starts at the anchor and advances from there, so this
 * advances too rather than freezing at the anchor: two proposals written a
 * minute apart carry timestamps a minute apart. Falls back to the real clock
 * when COURSE_NOW is unset, which is the same thing the server does.
 */
export function courseNowIso(startedAt: number = START_REAL_MS): string {
  const anchor = courseAnchor();
  if (anchor === null) return new Date().toISOString();

  const elapsed = Date.now() - startedAt;
  return new Date(anchor.getTime() + elapsed).toISOString();
}

// Captured once, when the process starts, so `elapsed` measures how long this
// run has been going rather than anything about the wall clock's absolute value.
const START_REAL_MS = Date.now();

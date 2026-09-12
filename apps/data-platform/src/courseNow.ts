// The workspace's "last 7 days" has to mean what the API means by it, so the
// browser anchors to the same COURSE_NOW, injected at build time by vite.config.ts.

const raw = import.meta.env.VITE_COURSE_NOW;
const anchor = typeof raw === "string" && raw !== "" ? new Date(raw).getTime() : Number.NaN;

// An offset rather than a frozen instant: the clock still advances from the anchor.
const offset = Number.isNaN(anchor) ? 0 : anchor - Date.now();

export const courseAnchored = !Number.isNaN(anchor);
export const courseAnchor = Number.isNaN(anchor) ? null : new Date(anchor);

export function courseNow(): Date {
  return new Date(Date.now() + offset);
}

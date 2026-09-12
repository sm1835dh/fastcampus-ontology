// Anchors the server's idea of "now" to COURSE_NOW, so the seeded data keeps the
// past/future relationship it was written with no matter when the course is run.
//
// This patches the global Date as a side effect of being imported, which is why
// index.ts imports it before anything else: every module evaluated afterwards,
// and so every route handler, reads the anchored clock.

const RealDate = Date;

function readAnchor(): number | null {
  const raw = process.env["COURSE_NOW"];
  if (!raw) return null;

  const anchor = new RealDate(raw).getTime();
  if (Number.isNaN(anchor)) {
    console.warn(`COURSE_NOW is not a valid datetime: '${raw}'. Running on the real clock.`);
    return null;
  }
  return anchor;
}

const anchor = readAnchor();

// An offset, not a frozen instant: the clock still advances a second per second
// from the anchor. Both ends of any duration shift equally, so elapsed-time
// measurements are unaffected.
const offset = anchor === null ? 0 : anchor - RealDate.now();

function anchoredNow(): number {
  return RealDate.now() + offset;
}

export const clock = {
  anchored: anchor !== null,
  /** The instant the clock was anchored to, or null when running on real time. */
  anchor: anchor === null ? null : new RealDate(anchor),
  now: anchoredNow,
};

if (anchor !== null) {
  globalThis.Date = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      // `new Date()` with no arguments is the only construction that means "now".
      // Every other form -- a timestamp, a string, Y/M/D parts -- is passed straight
      // through, so parsing and arithmetic behave exactly as they always did.
      return Reflect.construct(target, args.length === 0 ? [anchoredNow()] : args, newTarget);
    },

    get(target, property) {
      // Date.parse, Date.UTC and the prototype come from the real Date untouched.
      return property === "now" ? anchoredNow : Reflect.get(target, property);
    },

    apply() {
      // `Date()` called without `new` returns the current time as a string.
      return new RealDate(anchoredNow()).toString();
    },
  });
}

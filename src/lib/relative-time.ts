/**
 * How long ago, in the row's mono-readout — design-spec.md §8's freshness
 * timestamp.
 *
 * Deliberately coarse. §12 asks for a calm voice, and "updated 3d ago" is what
 * someone scanning a list needs; "updated 3 days, 4 hours and 12 minutes ago" is
 * noise pretending to be precision. The units stop at weeks because §13's list
 * is active work — anything older has a staleness problem the buckets are
 * already saying more about than a timestamp could.
 *
 * `now` is a parameter for the same reason it is one in `buckets.ts`: this is a
 * claim about two instants, and a function that read the clock itself could only
 * be tested approximately.
 *
 * The strings live in `src/i18n`, so this returns a unit and a count rather than
 * text — TR and NL do not pluralise or order these the way English does, and a
 * formatter that returned "3d ago" would have baked one language in.
 */

export type RelativeTime =
  { unit: "justNow" } | { unit: "minutes" | "hours" | "days" | "weeks"; value: number };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Under this, nothing useful separates one timestamp from another. */
const JUST_NOW_MS = MINUTE;

export function relativeTime(then: number, now: number): RelativeTime {
  // A future timestamp is a clock skew, not a prediction. Reading it as "in 3
  // minutes" would be worse than reading it as recent, which is what it is.
  const elapsed = Math.max(0, now - then);

  if (elapsed < JUST_NOW_MS) return { unit: "justNow" };
  if (elapsed < HOUR) return { unit: "minutes", value: Math.floor(elapsed / MINUTE) };
  if (elapsed < DAY) return { unit: "hours", value: Math.floor(elapsed / HOUR) };
  if (elapsed < WEEK) return { unit: "days", value: Math.floor(elapsed / DAY) };
  return { unit: "weeks", value: Math.floor(elapsed / WEEK) };
}

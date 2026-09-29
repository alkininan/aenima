/**
 * How long ago, in the row's mono-readout — design-spec.md §8.27's freshness
 * timestamp, on §12's ladder.
 *
 * Deliberately coarse. §12 asks for a calm voice, and "3 d ago" is what someone
 * scanning a list needs; "3 days, 4 hours and 12 minutes ago" is noise pretending
 * to be precision. The boundaries are §12's, not the calendar's: "{n} d ago" under
 * 100 days, "{n} w ago" under 52 weeks, then "{n} y ago" — so a week-old item reads
 * "7 d ago", and every readout the ladder can produce fits the 8 characters §8.27's
 * 72 column budgets ("99 d ago", "51 w ago").
 *
 * `now` is a parameter for the same reason it is one in `buckets.ts`: this is a
 * claim about two instants, and a function that read the clock itself could only
 * be tested approximately.
 *
 * The strings live in `src/i18n`, so this returns a unit and a count rather than
 * text — TR and NL do not pluralise or order these the way English does, and a
 * formatter that returned "3 d ago" would have baked one language in.
 */

export type RelativeTime =
  { unit: "justNow" } | { unit: "minutes" | "hours" | "days" | "weeks" | "years"; value: number };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** §12 draws the year line at 52 weeks, so a year on this ladder is 52 weeks. */
const YEAR = 52 * WEEK;

/** Under this, nothing useful separates one timestamp from another. */
const JUST_NOW_MS = MINUTE;
/** §12: days "under 100 days". */
const DAYS_UNTIL = 100 * DAY;
/** §12: weeks "under 52 weeks". */
const WEEKS_UNTIL = YEAR;

export function relativeTime(then: number, now: number): RelativeTime {
  // A future timestamp is a clock skew, not a prediction. Reading it as "in 3
  // minutes" would be worse than reading it as recent, which is what it is.
  const elapsed = Math.max(0, now - then);

  if (elapsed < JUST_NOW_MS) return { unit: "justNow" };
  if (elapsed < HOUR) return { unit: "minutes", value: Math.floor(elapsed / MINUTE) };
  if (elapsed < DAY) return { unit: "hours", value: Math.floor(elapsed / HOUR) };
  if (elapsed < DAYS_UNTIL) return { unit: "days", value: Math.floor(elapsed / DAY) };
  if (elapsed < WEEKS_UNTIL) return { unit: "weeks", value: Math.floor(elapsed / WEEK) };
  return { unit: "years", value: Math.floor(elapsed / YEAR) };
}

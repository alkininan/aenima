import { describe, expect, it } from "vitest";

import { getDictionary } from "@/i18n";
import { relativeTime } from "@/lib/relative-time";

const NOW = Date.UTC(2026, 7, 23, 12, 0, 0);
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const ago = (ms: number) => relativeTime(NOW - ms, NOW);

describe("relativeTime", () => {
  it("says just now for anything under a minute", () => {
    expect(ago(0)).toEqual({ unit: "justNow" });
    expect(ago(59 * 1000)).toEqual({ unit: "justNow" });
  });

  /**
   * design-spec §12's row-freshness ladder (T0.49): "{n} m ago" / "{n} h ago" / "{n} d ago"
   * under 100 days / "{n} w ago" under 52 weeks / "{n} y ago". Days run to 99 — a week-old
   * item reads "7 d ago", not "1 w ago" — because the ladder's boundaries are §12's, not
   * the calendar's.
   */
  it("steps up through the units at §12's boundaries", () => {
    expect(ago(MINUTE)).toEqual({ unit: "minutes", value: 1 });
    expect(ago(59 * MINUTE)).toEqual({ unit: "minutes", value: 59 });
    expect(ago(HOUR)).toEqual({ unit: "hours", value: 1 });
    expect(ago(23 * HOUR)).toEqual({ unit: "hours", value: 23 });
    expect(ago(DAY)).toEqual({ unit: "days", value: 1 });
    expect(ago(WEEK)).toEqual({ unit: "days", value: 7 });
    expect(ago(99 * DAY)).toEqual({ unit: "days", value: 99 });
    expect(ago(100 * DAY)).toEqual({ unit: "weeks", value: 14 });
    expect(ago(52 * WEEK - DAY)).toEqual({ unit: "weeks", value: 51 });
    expect(ago(52 * WEEK)).toEqual({ unit: "years", value: 1 });
  });

  // Rounds down: an item touched 90 minutes ago is "1 h ago", not "2 h ago". The
  // list must never report something as older than it is.
  it("rounds down, never up", () => {
    expect(ago(90 * MINUTE)).toEqual({ unit: "hours", value: 1 });
    expect(ago(2 * DAY + 23 * HOUR)).toEqual({ unit: "days", value: 2 });
    expect(ago(103 * WEEK)).toEqual({ unit: "years", value: 1 });
  });

  // §12 draws the year line at 52 weeks, so a year on this ladder is 52 weeks and the
  // scale stops there: nothing above years, and never a decade.
  it("grows to years at 52 weeks and no further", () => {
    expect(ago(104 * WEEK)).toEqual({ unit: "years", value: 2 });
    expect(ago(52 * 10 * WEEK)).toEqual({ unit: "years", value: 10 });
  });

  /**
   * A future timestamp is clock skew between our server and the database, not a
   * prediction. "In 3 minutes" on a list of work already done would be a
   * puzzle; "just now" is what it actually is.
   */
  it("reads a future timestamp as just now rather than counting forward", () => {
    expect(relativeTime(NOW + 5 * MINUTE, NOW)).toEqual({ unit: "justNow" });
  });

  /**
   * §12: "at most 8 characters in every locale" — §8.27's freshness column is 72 wide and
   * budgets exactly that. The widest value each unit can carry is read through the
   * dictionary, so the ladder's boundaries and the copy are held to the box together.
   */
  it("keeps every readout the ladder can produce at 8 characters or fewer", () => {
    const t = getDictionary();
    const widest = [
      t.relativeTime.justNow,
      t.relativeTime.minutes(59),
      t.relativeTime.hours(23),
      t.relativeTime.days(99),
      t.relativeTime.weeks(51),
      t.relativeTime.years(99),
    ];
    for (const readout of widest) expect(readout.length, readout).toBeLessThanOrEqual(8);
  });
});

import { describe, expect, it } from "vitest";

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

  it("steps up through the units at each boundary", () => {
    expect(ago(MINUTE)).toEqual({ unit: "minutes", value: 1 });
    expect(ago(59 * MINUTE)).toEqual({ unit: "minutes", value: 59 });
    expect(ago(HOUR)).toEqual({ unit: "hours", value: 1 });
    expect(ago(23 * HOUR)).toEqual({ unit: "hours", value: 23 });
    expect(ago(DAY)).toEqual({ unit: "days", value: 1 });
    expect(ago(6 * DAY)).toEqual({ unit: "days", value: 6 });
    expect(ago(WEEK)).toEqual({ unit: "weeks", value: 1 });
  });

  // Rounds down: an item touched 90 minutes ago is "1h ago", not "2h ago". The
  // list must never report something as older than it is.
  it("rounds down, never up", () => {
    expect(ago(90 * MINUTE)).toEqual({ unit: "hours", value: 1 });
    expect(ago(2 * DAY + 23 * HOUR)).toEqual({ unit: "days", value: 2 });
  });

  // The scale stops at weeks — §13's list is active work, and the buckets say
  // more about a months-old item than its timestamp could.
  it("does not grow a unit beyond weeks", () => {
    expect(ago(52 * WEEK)).toEqual({ unit: "weeks", value: 52 });
  });

  /**
   * A future timestamp is clock skew between our server and the database, not a
   * prediction. "In 3 minutes" on a list of work already done would be a
   * puzzle; "just now" is what it actually is.
   */
  it("reads a future timestamp as just now rather than counting forward", () => {
    expect(relativeTime(NOW + 5 * MINUTE, NOW)).toEqual({ unit: "justNow" });
  });
});

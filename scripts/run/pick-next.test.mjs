import { describe, expect, it } from "vitest";

import { pickNext } from "./pick-next.mjs";

const row = (Name, Priority, createdTime, Status = "Ready") => ({
  Name,
  Priority,
  createdTime,
  Status,
});

describe("pickNext", () => {
  it("prefers Must over Should over Could, whatever the age", () => {
    const rows = [
      row("could, oldest", "Could", "2026-01-01"),
      row("should", "Should", "2026-02-01"),
      row("must, newest", "Must", "2026-09-01"),
    ];
    expect(pickNext(rows).Name).toBe("must, newest");
  });

  it("breaks a priority tie by oldest created", () => {
    const rows = [row("newer", "Must", "2026-09-02"), row("older", "Must", "2026-09-01")];
    expect(pickNext(rows).Name).toBe("older");
  });

  it("claims nothing that is not Ready", () => {
    const rows = [
      row("backlog", "Must", "2026-01-01", "Backlog"),
      row("ready", "Could", "2026-09-01"),
    ];
    expect(pickNext(rows).Name).toBe("ready");
  });

  it("never claims a Won't, even when it is the only Ready row", () => {
    expect(pickNext([row("wont", "Won't", "2026-01-01")])).toBeNull();
  });

  it("returns null on an empty queue, which is how the run says nothing to do", () => {
    expect(pickNext([])).toBeNull();
    expect(pickNext([row("done", "Must", "2026-01-01", "Done")])).toBeNull();
  });

  it("sorts a row with no priority last rather than first", () => {
    const rows = [row("unset", undefined, "2026-01-01"), row("could", "Could", "2026-09-01")];
    expect(pickNext(rows).Name).toBe("could");
  });

  it("leaves the caller's array alone", () => {
    const rows = [row("b", "Must", "2026-09-02"), row("a", "Must", "2026-09-01")];
    pickNext(rows);
    expect(rows.map((r) => r.Name)).toEqual(["b", "a"]);
  });
});

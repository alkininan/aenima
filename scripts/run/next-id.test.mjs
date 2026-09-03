import { describe, expect, it } from "vitest";

import { idOf, nextId, phaseOf } from "./next-id.mjs";

// TC1 → AC1. The ID a claimed task gets is the highest already used in its epic, plus one.
describe("nextId", () => {
  it("takes the highest number in the epic and adds one", () => {
    expect(
      nextId("E3.1 Authoring loop", ["T3.1 Author-critic loop", "T3.4 Live assembly"]),
    ).toEqual({ id: "T3.5", phase: 3, n: 5 });
  });

  it("does not take the count, which a gap would make wrong", () => {
    // Three tasks, highest 9. Counting would say T3.4 and collide on the next run.
    expect(nextId("E3.1 X", ["T3.2 a", "T3.7 b", "T3.9 c"]).id).toBe("T3.10");
  });

  it("starts at 1 in an epic with no numbered tasks yet", () => {
    expect(nextId("E5.2 Handover", []).id).toBe("T5.1");
    expect(nextId("E5.2 Handover", ["Smoke A", "Another"]).id).toBe("T5.1");
  });

  it("ignores tasks from a different phase in the same list", () => {
    expect(nextId("E3.1 X", ["T4.9 other phase", "T3.2 mine"]).id).toBe("T3.3");
  });

  it("refuses to invent a phase when the epic name carries none", () => {
    expect(nextId("Authoring loop", ["T3.1 a"]).error).toContain("no phase number");
    expect(nextId(null, []).error).toContain("no phase number");
  });

  it("reads a two-digit number as one number, not as its first digit", () => {
    expect(nextId("E0.1 Foundation", ["T0.98 Smoke A"]).id).toBe("T0.99");
  });
});

describe("the parsers under it", () => {
  it("takes the phase from an epic id and nothing else", () => {
    expect(phaseOf("E3.1 Authoring loop")).toBe(3);
    expect(phaseOf("E12.4 Later")).toBe(12);
    expect(phaseOf("Phase 3 Authoring")).toBeNull();
  });

  it("reads a task id only at the head of the name", () => {
    expect(idOf("T3.1 Author-critic loop")).toEqual({ phase: 3, n: 1 });
    expect(idOf("Rework T3.1 later")).toBeNull();
    expect(idOf("")).toBeNull();
  });
});

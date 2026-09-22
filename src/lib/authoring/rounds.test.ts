import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { refinementOutcome } from "@/db/schema";

import { MAX_REFINEMENTS, SURFACING_ROUND, currentCycle, nextMove, roundCount } from "./rounds";
import type { StoredRound } from "./rounds";

/** The section's text in the human baseline every fixture round was written under. */
const BASE = "hash-of-the-humans-section";

/** A stored round on `section`/`check`, round `roundNo`, cycle 1 over BASE. */
function round(roundNo: number, overrides: Partial<StoredRound> = {}): StoredRound {
  return {
    sectionId: "scheduling",
    checkId: "prd-4",
    cycleNo: 1,
    baseSectionHash: BASE,
    roundNo,
    outcome: "revised",
    reason: `reason ${roundNo}`,
    evidence: "Propose 2 time options",
    authorPosition: `position ${roundNo}`,
    ...overrides,
  };
}

describe("roundCount — TA3 → AA3", () => {
  it("reads two rounds on one (artifact, section, check) as two rows counting to the highest round number", () => {
    const rows = [round(1), round(2)];
    expect(rows).toHaveLength(2);
    expect(roundCount(rows, "scheduling", "prd-4")).toBe(2);
  });

  it("takes the highest round number, not the row count and not the last row read", () => {
    expect(roundCount([round(2), round(1)], "scheduling", "prd-4")).toBe(2);
    expect(roundCount([round(2)], "scheduling", "prd-4")).toBe(2);
  });

  it("is 0 when the ledger holds no round for the key", () => {
    expect(roundCount([], "scheduling", "prd-4")).toBe(0);
  });

  it("counts only its own section and check", () => {
    const rows = [
      round(1),
      round(2),
      round(1, { checkId: "prd-5" }),
      round(1, { sectionId: "meet" }),
    ];
    expect(roundCount(rows, "scheduling", "prd-5")).toBe(1);
    expect(roundCount(rows, "meet", "prd-4")).toBe(1);
  });
});

describe("nextMove — the two-round cap", () => {
  it("revises twice", () => {
    expect(MAX_REFINEMENTS).toBe(2);
    expect(nextMove([], "scheduling", "prd-4", BASE)).toEqual({
      kind: "revise",
      roundNo: 1,
      cycleNo: 1,
    });
    expect(nextMove([round(1)], "scheduling", "prd-4", BASE)).toEqual({
      kind: "revise",
      roundNo: 2,
      cycleNo: 1,
    });
  });

  it("surfaces the third objection with the author's latest position", () => {
    expect(nextMove([round(2), round(1)], "scheduling", "prd-4", BASE)).toEqual({
      kind: "surface",
      roundNo: SURFACING_ROUND,
      cycleNo: 1,
      authorPosition: "position 2",
    });
  });

  it("surfaces with the position of the latest draft the document kept, not a refused one", () => {
    const rows = [round(1, { outcome: "revised" }), round(2, { outcome: "refused" })];
    expect(nextMove(rows, "scheduling", "prd-4", BASE)).toMatchObject({
      authorPosition: "position 1",
    });

    const neither = [round(1, { outcome: "refused" }), round(2, { outcome: "refused" })];
    expect(nextMove(neither, "scheduling", "prd-4", BASE)).toMatchObject({
      authorPosition: "position 2",
    });
  });

  it("spends a refused or held round like a revised one", () => {
    const rows = [round(1, { outcome: "refused" }), round(2, { outcome: "held" })];
    expect(nextMove(rows, "scheduling", "prd-4", BASE).kind).toBe("surface");
  });

  it("writes nothing more once the question is open", () => {
    const rows = [round(1), round(2), round(3, { outcome: "surfaced" })];
    expect(nextMove(rows, "scheduling", "prd-4", BASE)).toEqual({ kind: "closed" });
  });
});

describe("the open question — TA2 → AA2", () => {
  it("is a round row marked surfaced: the outcome exists on the round ledger", () => {
    expect(refinementOutcome.enumValues).toContain("surfaced");
    const outcomes: StoredRound["outcome"][] = [...refinementOutcome.enumValues];
    expect(outcomes).toEqual(["revised", "held", "refused", "surfaced"]);
  });

  it("has no table of its own: no table in the schema is named for a question", () => {
    const tables = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .map((table) => getTableName(table as PgTable));
    expect(tables).toContain("refinement_round");
    expect(tables.filter((name) => /question/i.test(name))).toEqual([]);
  });
});

describe("the cycle — T3.2's TA1 → AA1", () => {
  const REWRITTEN = "hash-after-the-human-rewrote-it";

  it("keeps a section's first pass on cycle 1 while its human baseline stands", () => {
    expect(currentCycle([], "scheduling", "prd-4", BASE)).toBe(1);
    expect(currentCycle([round(1)], "scheduling", "prd-4", BASE)).toBe(1);
  });

  it("opens the next cycle once the human's text for that section differs", () => {
    const surfaced = [round(1), round(2), round(3, { outcome: "surfaced" })];
    expect(currentCycle(surfaced, "scheduling", "prd-4", REWRITTEN)).toBe(2);
  });

  it("reopens a surfaced check at round zero when the human rewrites the section", () => {
    const surfaced = [round(1), round(2), round(3, { outcome: "surfaced" })];

    // The closure stands on the text it was a judgement about …
    expect(nextMove(surfaced, "scheduling", "prd-4", BASE)).toEqual({ kind: "closed" });
    // … and not on text that no longer exists.
    expect(nextMove(surfaced, "scheduling", "prd-4", REWRITTEN)).toEqual({
      kind: "revise",
      roundNo: 1,
      cycleNo: 2,
    });
  });

  it("leaves the old cycle's rows to be read exactly as they were written", () => {
    const surfaced = [round(1), round(2), round(3, { outcome: "surfaced" })];
    const before = structuredClone(surfaced);

    nextMove(surfaced, "scheduling", "prd-4", REWRITTEN);
    currentCycle(surfaced, "scheduling", "prd-4", REWRITTEN);

    expect(surfaced).toEqual(before);
    expect(roundCount(surfaced, "scheduling", "prd-4")).toBe(3);
  });

  it("spends the new cycle's own two rounds rather than inheriting the old cycle's count", () => {
    const rows = [
      round(1),
      round(2),
      round(3, { outcome: "surfaced" }),
      round(1, { cycleNo: 2, baseSectionHash: REWRITTEN }),
    ];
    expect(nextMove(rows, "scheduling", "prd-4", REWRITTEN)).toEqual({
      kind: "revise",
      roundNo: 2,
      cycleNo: 2,
    });
  });

  it("reopens only the section the human rewrote, never its neighbours", () => {
    const rows = [
      round(3, { outcome: "surfaced" }),
      round(3, { sectionId: "meet", outcome: "surfaced" }),
    ];
    expect(nextMove(rows, "scheduling", "prd-4", REWRITTEN).kind).toBe("revise");
    expect(nextMove(rows, "meet", "prd-4", BASE)).toEqual({ kind: "closed" });
  });

  // The reviewer's first Must: `readRounds` is unordered and one cycle's rows can
  // hold different baselines — a round written for a section the human version
  // did not hold carries null, and a later round of the same cycle carries a
  // hash. Reading the cycle from whichever row came back first made two reads of
  // identical rows disagree.
  it("reads one cycle's baseline from every row of it, in any order the ledger returns", () => {
    const mixed = [
      round(1, { baseSectionHash: null }),
      round(2, { baseSectionHash: BASE }),
      round(3, { outcome: "surfaced", baseSectionHash: BASE }),
    ];
    const reversed = [...mixed].reverse();

    for (const rows of [mixed, reversed]) {
      expect(currentCycle(rows, "scheduling", "prd-4", BASE)).toBe(1);
      expect(currentCycle(rows, "scheduling", "prd-4", REWRITTEN)).toBe(2);
      expect(nextMove(rows, "scheduling", "prd-4", BASE)).toEqual({ kind: "closed" });
      expect(nextMove(rows, "scheduling", "prd-4", REWRITTEN)).toMatchObject({ cycleNo: 2 });
    }
  });

  it("holds the closure of a round written before cycles existed, whose baseline is unknown", () => {
    const old = [round(3, { outcome: "surfaced", baseSectionHash: null })];
    expect(currentCycle(old, "scheduling", "prd-4", REWRITTEN)).toBe(1);
    expect(nextMove(old, "scheduling", "prd-4", REWRITTEN)).toEqual({ kind: "closed" });
  });

  it("holds the closure where the section has no human baseline at all", () => {
    const surfaced = [round(3, { outcome: "surfaced" })];
    expect(nextMove(surfaced, "scheduling", "prd-4", null)).toEqual({ kind: "closed" });
  });
});

describe("a surfacing the author never answered — T3.2's TA3 → AA3", () => {
  it("carries no author position, and is still the closure", () => {
    const unread = [round(1, { outcome: "surfaced", authorPosition: null })];
    expect(nextMove(unread, "scheduling", "prd-4", BASE)).toEqual({ kind: "closed" });
  });

  it("surfaces with no position rather than inventing one when no round holds one", () => {
    const rows = [
      round(1, { outcome: "surfaced", authorPosition: null }),
      round(2, { outcome: "refused", authorPosition: null }),
    ];
    expect(nextMove(rows, "scheduling", "prd-4", BASE)).toEqual({ kind: "closed" });

    const spent = [
      round(1, { outcome: "refused", authorPosition: null }),
      round(2, { outcome: "refused", authorPosition: null }),
    ];
    expect(nextMove(spent, "scheduling", "prd-4", BASE)).toEqual({
      kind: "surface",
      roundNo: SURFACING_ROUND,
      cycleNo: 1,
      authorPosition: null,
    });
  });
});

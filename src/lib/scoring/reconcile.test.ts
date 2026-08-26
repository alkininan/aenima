import { describe, expect, it } from "vitest";

import { reconcileGaps } from "./reconcile";
import type { ExistingGap, ReconcileVerdict } from "./reconcile";

const PACK_CHECKS = ["prd-1", "prd-15", "prd-19", "prd-20"];

const fails = (checkId: string): ReconcileVerdict => ({
  checkId,
  tag: "must",
  passed: false,
  evidence: `${checkId} is not satisfied.`,
});

const passes = (checkId: string): ReconcileVerdict => ({
  checkId,
  tag: "must",
  passed: true,
  evidence: "",
});

const gap = (
  id: string,
  checkId: string,
  disposition: ExistingGap["disposition"],
): ExistingGap => ({
  id,
  checkId,
  disposition,
});

describe("reconcileGaps", () => {
  it("raises a gap for a check that fails with nothing on record", () => {
    const writes = reconcileGaps({
      verdicts: [fails("prd-19")],
      packCheckIds: PACK_CHECKS,
      gaps: [],
    });

    expect(writes).toEqual([
      { kind: "insert", checkId: "prd-19", tag: "must", evidence: "prd-19 is not satisfied." },
    ]);
  });

  it("restates an open gap rather than raising a second one", () => {
    const writes = reconcileGaps({
      verdicts: [fails("prd-19")],
      packCheckIds: PACK_CHECKS,
      gaps: [gap("g1", "prd-19", "open")],
    });

    expect(writes).toEqual([
      { kind: "update", gapId: "g1", checkId: "prd-19", evidence: "prd-19 is not satisfied." },
    ]);
  });

  it("closes an open gap whose check now passes", () => {
    const writes = reconcileGaps({
      verdicts: [passes("prd-19")],
      packCheckIds: PACK_CHECKS,
      gaps: [gap("g1", "prd-19", "open")],
    });

    expect(writes).toEqual([{ kind: "close", gapId: "g1", checkId: "prd-19", reason: "passed" }]);
  });

  it("closes an open gap whose check stopped applying", () => {
    // §4's engine answered in the same pass that scored: the surface stopped
    // rendering a list, so prd-15 is not in the denominator. Leaving the gap
    // open would have §13 calling the item "Your move" over a check the item is
    // no longer measured against.
    const writes = reconcileGaps({
      verdicts: [passes("prd-19")],
      packCheckIds: PACK_CHECKS,
      gaps: [gap("g1", "prd-15", "open")],
    });

    expect(writes).toEqual([
      { kind: "close", gapId: "g1", checkId: "prd-15", reason: "no-longer-applicable" },
    ]);
  });

  describe("§1 law 7 — a named person's debt", () => {
    it("never raises a second gap beside an accepted one", () => {
      // The check still fails and the debt is still real; someone took it on
      // the record. Raising another would turn an accepted risk into a fresh
      // accusation on every re-score.
      expect(
        reconcileGaps({
          verdicts: [fails("prd-19")],
          packCheckIds: PACK_CHECKS,
          gaps: [gap("g1", "prd-19", "accepted")],
        }),
      ).toEqual([]);
    });

    it("never raises a second gap beside an excluded one", () => {
      expect(
        reconcileGaps({
          verdicts: [fails("prd-20")],
          packCheckIds: PACK_CHECKS,
          gaps: [gap("g1", "prd-20", "excluded")],
        }),
      ).toEqual([]);
    });

    it("never closes an accepted gap whose check now passes", () => {
      expect(
        reconcileGaps({
          verdicts: [passes("prd-19")],
          packCheckIds: PACK_CHECKS,
          gaps: [gap("g1", "prd-19", "accepted")],
        }),
      ).toEqual([]);
    });

    it("never closes an excluded gap whose check stopped applying", () => {
      expect(
        reconcileGaps({
          verdicts: [passes("prd-19")],
          packCheckIds: PACK_CHECKS,
          gaps: [gap("g1", "prd-20", "excluded")],
        }),
      ).toEqual([]);
    });
  });

  it("raises a gap again after an earlier one was closed", () => {
    // A closed gap is the machine saying reality moved. Reality can move back,
    // and the new debt is its own row rather than a resurrection of the old one.
    const writes = reconcileGaps({
      verdicts: [fails("prd-19")],
      packCheckIds: PACK_CHECKS,
      gaps: [gap("g1", "prd-19", "closed")],
    });

    expect(writes).toEqual([
      { kind: "insert", checkId: "prd-19", tag: "must", evidence: "prd-19 is not satisfied." },
    ]);
  });

  it("leaves another rubric's gaps alone", () => {
    // An item carries a PRD and a design package, each scored by its own pack
    // against its own ids. Without the id-space filter, scoring the PRD would
    // find no verdict for a design check and close it as no longer applicable.
    const writes = reconcileGaps({
      verdicts: [passes("prd-19")],
      packCheckIds: PACK_CHECKS,
      gaps: [gap("g1", "design-4", "open")],
    });

    expect(writes).toEqual([]);
  });

  it("handles a run that moves several checks at once", () => {
    const writes = reconcileGaps({
      verdicts: [fails("prd-1"), passes("prd-19"), fails("prd-20")],
      packCheckIds: PACK_CHECKS,
      gaps: [gap("g1", "prd-19", "open"), gap("g2", "prd-15", "open"), gap("g3", "prd-20", "open")],
    });

    expect(writes).toEqual([
      { kind: "insert", checkId: "prd-1", tag: "must", evidence: "prd-1 is not satisfied." },
      { kind: "close", gapId: "g1", checkId: "prd-19", reason: "passed" },
      { kind: "update", gapId: "g3", checkId: "prd-20", evidence: "prd-20 is not satisfied." },
      { kind: "close", gapId: "g2", checkId: "prd-15", reason: "no-longer-applicable" },
    ]);
  });
});

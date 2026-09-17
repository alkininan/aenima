import { describe, expect, it } from "vitest";

import { featurePrdPack } from "@/packs";

import {
  admitObjections,
  bindObjections,
  verifyObjections,
  type Objection,
  type ObjectionDraft,
} from "./objection";

const ARTIFACT = `## Problem

Members at a venue cannot tell who nearby is open to talking.

## Stories

**GM-2 — Ghost mode ends when I leave.**
WHEN the member leaves the venue THE SYSTEM SHALL turn ghost mode off.`;

const objection = (over: Partial<Objection> = {}): Objection => ({
  checkId: "prd-11",
  reason: "No out-of-scope list is written down.",
  evidence: "THE SYSTEM SHALL turn ghost mode off.",
  scope: "stories",
  ...over,
});

const draft = (over: Partial<ObjectionDraft> = {}): ObjectionDraft => ({ ...objection(), ...over });

describe("bindObjections — TC1 → AC1", () => {
  it("discards an objection naming a check the loaded pack does not have", () => {
    const unbound = objection({ checkId: "prd-99" });
    const bound = objection({ checkId: "prd-3" });
    expect(bindObjections(featurePrdPack, [unbound, bound])).toEqual([bound]);
  });

  it("keeps an objection bound to a layered check, since the id space is one space", () => {
    const layered = objection({ checkId: "prd-20" });
    expect(bindObjections(featurePrdPack, [layered])).toEqual([layered]);
  });

  it("binds on the exact id, never a near miss", () => {
    const nearMisses = [objection({ checkId: "PRD-3" }), objection({ checkId: "prd-3 " })];
    expect(bindObjections(featurePrdPack, nearMisses)).toEqual([]);
  });

  it("carries on as if the discarded objection had not been made", () => {
    // The round continues with what is left, in the critic's order — not an
    // error, not a count of what was dropped.
    const first = objection({ checkId: "prd-9" });
    const second = objection({ checkId: "prd-11" });
    const admitted = admitObjections(featurePrdPack, ARTIFACT, [
      draft({ checkId: "made-up" }),
      first,
      draft({ checkId: "also-made-up" }),
      second,
    ]);
    expect(admitted).toEqual([first, second]);
  });
});

describe("verifyObjections — TC5 → AC5", () => {
  it("drops an objection whose evidence is not in the artifact", () => {
    const invented = objection({ evidence: "THE SYSTEM SHALL keep ghost mode on forever." });
    const real = objection();
    expect(verifyObjections(ARTIFACT, [invented, real])).toEqual([real]);
  });

  it("verifies the way T2.3's guard does: a re-wrap and emphasis are not content", () => {
    const quoted = objection({ evidence: "GM-2 — Ghost mode ends when I leave. WHEN the member" });
    expect(verifyObjections(ARTIFACT, [quoted])).toEqual([quoted]);
  });

  it("drops it before the author sees it: admitObjections never returns it", () => {
    const admitted = admitObjections(featurePrdPack, ARTIFACT, [
      draft({ evidence: "Members at a venue can always tell who is open to talking." }),
    ]);
    expect(admitted).toEqual([]);
  });
});

describe("admitObjections — an objection is four fields, or it is discarded", () => {
  it.each(["checkId", "reason", "evidence", "scope"] as const)(
    "discards one whose %s is missing or blank",
    (field) => {
      const admitted = admitObjections(featurePrdPack, ARTIFACT, [
        draft({ [field]: null }),
        draft({ [field]: "   " }),
      ]);
      expect(admitted).toEqual([]);
    },
  );

  it("admits a complete, bound, verified objection with its prose fields trimmed", () => {
    const admitted = admitObjections(featurePrdPack, ARTIFACT, [
      draft({ reason: " No out-of-scope list. ", scope: " stories " }),
    ]);
    expect(admitted).toEqual([objection({ reason: "No out-of-scope list.", scope: "stories" })]);
  });

  it("does not tidy a padded check id into a binding", () => {
    expect(admitObjections(featurePrdPack, ARTIFACT, [draft({ checkId: " prd-11" })])).toEqual([]);
  });
});

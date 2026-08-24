import { describe, expect, it } from "vitest";

import { featurePrdPack } from "@/packs/feature-prd";
import { applicableChecks, denominatorFor, scoreRun } from "@/packs/scoring";
import type { CheckResult, SkillPack } from "@/packs/types";

const LIST = "list-rendering-surface";
const NETWORK = "network-dependent-surface";
const SAFETY = "user-to-user-or-location";

const denominator = (conditions: string[]) =>
  denominatorFor(applicableChecks(featurePrdPack, conditions));

/**
 * §4: "non-applicable checks leave the denominator … Denominators renormalize
 * when conditional checks enter or leave."
 *
 * All eight combinations, on the real pack, because this is the arithmetic every
 * score in the product is divided by. The two directions are not symmetric — a
 * conditional *check* leaves the base, a *layer* enters above it — and only the
 * full table shows that both work at once.
 */
describe("renormalization", () => {
  it("renormalizes across every combination of the three conditions", () => {
    // The default PRD — a list surface that talks to the network, no safety
    // exposure. This is the case §7.2's "100 points" describes.
    expect(denominator([LIST, NETWORK])).toBe(100);

    // The layer enters: 100 + 5.
    expect(denominator([LIST, NETWORK, SAFETY])).toBe(105);

    // One conditional check leaves: 100 − 6, either way round.
    expect(denominator([NETWORK])).toBe(94);
    expect(denominator([LIST])).toBe(94);

    // One leaves, the layer enters: 94 + 5.
    expect(denominator([NETWORK, SAFETY])).toBe(99);
    expect(denominator([LIST, SAFETY])).toBe(99);

    // Both leave: 100 − 12. An admin dashboard with no list.
    expect(denominator([])).toBe(88);
    expect(denominator([SAFETY])).toBe(93);
  });

  it("drops the conditional checks themselves, not just their points", () => {
    const ids = applicableChecks(featurePrdPack, []).map((check) => check.id);
    expect(ids).not.toContain("prd-15");
    expect(ids).not.toContain("prd-16");
    expect(ids).not.toContain("prd-20");
    expect(ids).toContain("prd-10");
  });

  it("keeps the pack's own order, base checks then layered ones", () => {
    const ids = applicableChecks(featurePrdPack, [LIST, NETWORK, SAFETY]).map((c) => c.id);
    expect(ids).toEqual(Array.from({ length: 20 }, (_, index) => `prd-${index + 1}`));
  });

  it("ignores an unmet condition it has never heard of", () => {
    expect(denominator(["some-future-layer"])).toBe(88);
  });
});

describe("scoring a run", () => {
  const pass = (id: string): CheckResult => ({ checkId: id, passed: true });
  const fail = (id: string): CheckResult => ({
    checkId: id,
    passed: false,
    evidence: "the exact gap",
  });

  it("scores out of the renormalized denominator, not out of 100", () => {
    // Every applicable check passes on a surface where both conditionals left.
    const results = applicableChecks(featurePrdPack, []).map((check) => pass(check.id));
    expect(scoreRun(featurePrdPack, [], results)).toEqual({
      earned: 88,
      denominator: 88,
      score: 100,
    });
  });

  it("counts a check's full points or none of them", () => {
    // §5: "checks are binary with evidence … no vibes-based partial credit."
    const results = [pass("prd-10"), fail("prd-19")];
    const { earned, denominator: out } = scoreRun(featurePrdPack, [LIST, NETWORK], results);
    expect(earned).toBe(10);
    expect(out).toBe(100);
  });

  // §4 has applicability decided in the same pass as scoring, so a run can carry
  // a verdict for a check that renormalized out. Counting it would inflate a
  // score above its own denominator.
  it("ignores a verdict for a check that does not apply", () => {
    const { earned, score } = scoreRun(featurePrdPack, [], [pass("prd-15"), pass("prd-20")]);
    expect(earned).toBe(0);
    expect(score).toBe(0);
  });

  // A truncated run must not read as a perfect one.
  it("gives nothing for a check with no verdict", () => {
    expect(scoreRun(featurePrdPack, [LIST, NETWORK], []).earned).toBe(0);
  });

  it("returns zero rather than NaN when nothing applies", () => {
    const empty: SkillPack = { ...featurePrdPack, checks: [], layers: [] };
    expect(scoreRun(empty, [], [])).toEqual({ earned: 0, denominator: 0, score: 0 });
  });

  it("applies a layer check's own condition on top of the layer's", () => {
    const gated: SkillPack = {
      ...featurePrdPack,
      layers: [
        {
          id: "safety",
          appliesWhen: { id: SAFETY, when: "the layer's own condition" },
          checks: [
            {
              id: "prd-20",
              prose: "a layer check that is itself conditional",
              tag: "must",
              points: 5,
              appliesWhen: { id: "also-this", when: "and this too" },
            },
          ],
        },
      ],
    };
    expect(denominatorFor(applicableChecks(gated, [LIST, NETWORK, SAFETY]))).toBe(100);
    expect(denominatorFor(applicableChecks(gated, [LIST, NETWORK, SAFETY, "also-this"]))).toBe(105);
  });
});

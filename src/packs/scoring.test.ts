import { describe, expect, it } from "vitest";

import { featurePrdPack } from "@/packs/feature-prd";
import {
  applicableChecks,
  denominatorFor,
  excludedChecks,
  packConditions,
  scoreRun,
} from "@/packs/scoring";
import type { CheckResult, SkillPack } from "@/packs/types";
import { allChecks } from "@/packs/validate";

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

/**
 * §4's conditions as a list of questions — what a scoring call asks the model
 * before any check is judged.
 */
describe("packConditions", () => {
  it("collects both directions: a check's condition and a layer's", () => {
    const ids = packConditions(featurePrdPack).map((condition) => condition.id);

    // LIST and NETWORK take checks *out* of the base; SAFETY brings a layer's
    // check *in*. A list that missed either direction would leave a condition
    // nobody answers and a denominator renormalizing on a default.
    expect(ids).toEqual([LIST, NETWORK, SAFETY]);
  });

  it("asks about a shared condition once", () => {
    const pack: SkillPack = {
      ...featurePrdPack,
      checks: [
        { id: "a", prose: "A", tag: "must", points: 50, appliesWhen: { id: "x", when: "X." } },
        { id: "b", prose: "B", tag: "must", points: 50, appliesWhen: { id: "x", when: "X." } },
      ],
      layers: [],
    };

    expect(packConditions(pack).map((condition) => condition.id)).toEqual(["x"]);
  });

  it("carries the pack's own wording, which is what the model is shown", () => {
    // §4 keeps `when` "in the spec's own words, so that the agent that evaluates
    // it and the human who reviews the pack read the same sentence".
    const safety = packConditions(featurePrdPack).find((condition) => condition.id === SAFETY);

    expect(safety?.when).toBe(featurePrdPack.layers[0]!.appliesWhen.when);
  });

  it("is empty for a pack with no conditions at all", () => {
    const pack: SkillPack = {
      ...featurePrdPack,
      checks: [{ id: "a", prose: "A", tag: "must", points: 100 }],
      layers: [],
    };

    expect(packConditions(pack)).toEqual([]);
  });
});

/**
 * §4's renormalization, said out loud — product-spec.md §4 and T2.4's AC3.
 *
 * `applicableChecks` answers "what counts"; this answers "what did not, and
 * why". A denominator of 99 is arithmetic nobody can argue with until the two
 * checks behind it are named, so these tests pin the naming rather than the
 * arithmetic — which the table above already covers.
 */
describe("excludedChecks", () => {
  const excluded = (conditions: string[]) =>
    excludedChecks(featurePrdPack, conditions).map(({ check, condition }) => [
      check.id,
      condition.id,
    ]);

  /**
   * Ghost mode's three conditions, from the marking scheme in docs/build-log.md:
   * no list surface, network-dependent, user-to-user. One check leaves, the
   * layer enters, and 99 is what they add up to.
   */
  it("names the one check Ghost mode did not ask, and the condition that kept it out", () => {
    expect(excluded([NETWORK, SAFETY])).toEqual([["prd-15", LIST]]);

    // The other direction, on the same run: the layer entered, so prd-20 is
    // asked and is not in this list at all.
    expect(applicableChecks(featurePrdPack, [NETWORK, SAFETY]).map((check) => check.id)).toContain(
      "prd-20",
    );
    expect(denominator([NETWORK, SAFETY])).toBe(99);
  });

  /**
   * A layer check is excluded by **the layer's** condition, never by one of its
   * own — `prd-20` carries no `appliesWhen`, so a function that read only the
   * check would have no sentence to show and would show nothing.
   */
  it("blames the layer's condition when the layer never entered", () => {
    expect(excluded([LIST, NETWORK])).toEqual([["prd-20", SAFETY]]);
  });

  it("names both conditional checks when neither condition holds", () => {
    expect(excluded([SAFETY])).toEqual([
      ["prd-15", LIST],
      ["prd-16", NETWORK],
    ]);
  });

  // The complement is exact: every check is asked or excluded, never both and
  // never neither. If this ever fails, a check has fallen out of the rubric.
  it("is the exact complement of applicableChecks, for every combination", () => {
    const all = allChecks(featurePrdPack)
      .map((check) => check.id)
      .sort();

    for (const conditions of [
      [],
      [LIST],
      [NETWORK],
      [SAFETY],
      [LIST, NETWORK],
      [LIST, SAFETY],
      [NETWORK, SAFETY],
      [LIST, NETWORK, SAFETY],
    ]) {
      const asked = applicableChecks(featurePrdPack, conditions).map((check) => check.id);
      const notAsked = excludedChecks(featurePrdPack, conditions).map(({ check }) => check.id);

      expect([...asked, ...notAsked].sort()).toEqual(all);
    }
  });

  it("is empty when every condition holds", () => {
    expect(excluded([LIST, NETWORK, SAFETY])).toEqual([]);
  });

  /**
   * The rule the real pack cannot test.
   *
   * `prd-20` carries no `appliesWhen` of its own, so on `featurePrdPack` the
   * layer's condition and the check's coincide — and a function that read the
   * wrong one would pass every test above. That coincidence is the shape of
   * T2.2's escalation bug, so the rule gets a pack where the two differ: the
   * layer did not enter, and the layer's condition is the answer even though
   * the check has one to offer.
   */
  it("blames the layer, not the check, when a layer check carries its own condition", () => {
    const inner = { id: "inner", when: "The check's own condition." };
    const outer = { id: "outer", when: "The layer's condition." };

    const pack: SkillPack = {
      ...featurePrdPack,
      checks: [{ id: "base", prose: "Base", tag: "must", points: 100 }],
      layers: [
        {
          id: "layer",
          appliesWhen: outer,
          checks: [{ id: "layered", prose: "Layered", tag: "must", points: 5, appliesWhen: inner }],
        },
      ],
      interview: [],
    };

    // Neither condition holds. The layer never entered, so that is the reason.
    expect(excludedChecks(pack, []).map(({ condition }) => condition.id)).toEqual(["outer"]);

    // The layer entered and the check's own condition failed: now it is the check's.
    expect(excludedChecks(pack, ["outer"]).map(({ condition }) => condition.id)).toEqual(["inner"]);

    // Both hold: nothing is excluded.
    expect(excludedChecks(pack, ["outer", "inner"])).toEqual([]);
  });
});

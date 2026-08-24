import { describe, expect, it } from "vitest";

import { featurePrdPack } from "@/packs/feature-prd";
import type { SkillPack } from "@/packs/types";
import { assertValidPack, validatePack } from "@/packs/validate";

/**
 * One rejection test per rule. A validator with no rejection test is a validator
 * nobody has run: every rule below passes trivially if the function returns an
 * empty array unconditionally, and only a pack that *should* fail proves it does
 * not.
 */

/** The real pack, broken one way at a time. */
const broken = (patch: Partial<SkillPack>): SkillPack => ({ ...featurePrdPack, ...patch });

const matching = (pack: SkillPack, fragment: string) =>
  validatePack(pack).filter((problem) => problem.includes(fragment));

describe("validatePack", () => {
  it("passes the real pack", () => {
    expect(validatePack(featurePrdPack)).toEqual([]);
  });

  // §5's zero-sum budget: "any new check … must take its points from an existing
  // check."
  it("rejects a base that does not sum to 100", () => {
    const added = broken({
      checks: [
        ...featurePrdPack.checks,
        { id: "prd-21", prose: "a new idea nobody paid for", tag: "should", points: 4 },
      ],
    });
    expect(matching(added, "sum to 104")).toHaveLength(1);

    const removed = broken({ checks: featurePrdPack.checks.slice(0, -1) });
    expect(matching(removed, "sum to 92")).toHaveLength(1);
  });

  // Both halves land in one `gap.check_id` column, so the id space is one space.
  it("rejects a duplicate id, including one that collides with a layer's", () => {
    const clash = broken({
      checks: featurePrdPack.checks.map((check) =>
        check.id === "prd-1" ? { ...check, id: "prd-20" } : check,
      ),
    });
    expect(matching(clash, 'duplicate check id "prd-20"')).toHaveLength(1);
  });

  it("rejects points that are zero, negative or fractional", () => {
    for (const points of [0, -5, 2.5]) {
      const pack = broken({
        checks: featurePrdPack.checks.map((check) =>
          check.id === "prd-4" ? { ...check, points } : check,
        ),
      });
      expect(matching(pack, 'check "prd-4" has points')).toHaveLength(1);
    }
  });

  // §6: "unbound objections are discarded." A question naming no check is one
  // that arrives already inside the bank.
  it("rejects an interview question bound to no check", () => {
    const pack = broken({
      interview: [
        ...featurePrdPack.interview,
        { checkId: "prd-99", prompt: "and one more thing", criticTest: "nothing can test this" },
      ],
    });
    expect(matching(pack, '"prd-99"')).toHaveLength(1);
  });

  it("rejects a version that is not semver", () => {
    expect(matching(broken({ version: "1" }), "not semver")).toHaveLength(1);
    expect(matching(broken({ version: "v1.0.0" }), "not semver")).toHaveLength(1);
    expect(validatePack(broken({ version: "2.11.0-rc.1" }))).toEqual([]);
  });

  // Fixing one error per run is a slow way to transcribe twenty checks.
  it("reports every problem, not the first", () => {
    const pack = broken({
      version: "nope",
      checks: featurePrdPack.checks.map((check) =>
        check.id === "prd-4" ? { ...check, points: 0 } : check,
      ),
    });
    expect(validatePack(pack).length).toBeGreaterThanOrEqual(3);
  });
});

describe("assertValidPack", () => {
  it("says nothing about a valid pack", () => {
    expect(() => assertValidPack(featurePrdPack)).not.toThrow();
  });

  it("throws, naming the pack and every problem", () => {
    const pack = broken({ id: "wrong-pack", version: "nope" });
    expect(() => assertValidPack(pack)).toThrow(/wrong-pack@nope/);
    expect(() => assertValidPack(pack)).toThrow(/not semver/);
  });
});

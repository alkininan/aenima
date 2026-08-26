import { describe, expect, it } from "vitest";

import { applicableChecks, featurePrdPack, packConditions, scoreRun } from "@/packs";
import type { SkillPack } from "@/packs";

import { readAnswer } from "./answer";
import { NOTE_LIMIT, STORED_QUOTE_LIMIT } from "./evidence";
import type { ScorerAnswer } from "./schema";

const ARTIFACT = `# Ghost mode

WHEN the member leaves the venue THE SYSTEM SHALL turn ghost mode off.

Events: GhostOn, ghost_mode_toggled.`;

/** Every check passing, every condition as given. The base a test edits. */
function answerWith(
  pack: SkillPack,
  conditions: Record<string, boolean>,
  overrides: Record<string, Partial<ScorerAnswer["results"][number]>> = {},
): ScorerAnswer {
  // The wire spells absent as "" — see `Verdict`. `VerifiedVerdict`, which is
  // what comes back out, spells it null.
  const results: ScorerAnswer["results"] = [
    ...pack.checks,
    ...pack.layers.flatMap((layer) => layer.checks),
  ].map((check) => ({
    checkId: check.id,
    passed: true,
    requirementId: "",
    quote: "",
    note: "",
    ...overrides[check.id],
  }));

  return {
    conditions: Object.fromEntries(
      packConditions(pack).map((condition) => [condition.id, conditions[condition.id] ?? false]),
    ),
    results,
  };
}

const NO_CONDITIONS = {
  "list-rendering-surface": false,
  "network-dependent-surface": false,
  "user-to-user-or-location": false,
};

describe("readAnswer", () => {
  it("keeps only the checks that apply", () => {
    // §4: a check whose condition failed leaves the denominator, and a verdict
    // for it is discarded rather than stored — the model answers every check
    // because applicability is decided in the same pass.
    const read = readAnswer(featurePrdPack, answerWith(featurePrdPack, NO_CONDITIONS), ARTIFACT);

    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const ids = read.verdicts.map((verdict) => verdict.checkId);
    expect(ids).not.toContain("prd-15");
    expect(ids).not.toContain("prd-16");
    expect(ids).not.toContain("prd-20");
    expect(ids).toContain("prd-19");
  });

  it("brings a layer's checks in when its condition holds", () => {
    const read = readAnswer(
      featurePrdPack,
      answerWith(featurePrdPack, { ...NO_CONDITIONS, "user-to-user-or-location": true }),
      ARTIFACT,
    );

    expect(read.ok).toBe(true);
    if (!read.ok) return;

    expect(read.conditionsMet).toContain("user-to-user-or-location");
    expect(read.verdicts.map((verdict) => verdict.checkId)).toContain("prd-20");
  });

  it("renormalizes in both directions at once — the seeded PRD's shape", () => {
    // The golden document is built to take prd-15 out (−6) and bring prd-20 in
    // (+5). A denominator of 99 is one number that proves both.
    const read = readAnswer(
      featurePrdPack,
      answerWith(featurePrdPack, {
        "list-rendering-surface": false,
        "network-dependent-surface": true,
        "user-to-user-or-location": true,
      }),
      ARTIFACT,
    );

    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const { denominator } = scoreRun(featurePrdPack, read.conditionsMet, read.results);
    expect(denominator).toBe(99);
  });

  it("verifies a failure's quote against the artifact", () => {
    const read = readAnswer(
      featurePrdPack,
      answerWith(featurePrdPack, NO_CONDITIONS, {
        "prd-19": {
          passed: false,
          requirementId: "GM-2",
          quote: "WHEN the member leaves the venue THE SYSTEM SHALL turn ghost mode off.",
          note: "Leaves how — the geofence, or a tap on check out?",
        },
      }),
      ARTIFACT,
    );

    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const verdict = read.verdicts.find((entry) => entry.checkId === "prd-19");
    expect(verdict?.evidence).toBe(
      "GM-2: 'WHEN the member leaves the venue THE SYSTEM SHALL turn ghost mode off.' — " +
        "Leaves how — the geofence, or a tap on check out?",
    );
  });

  it("refuses the whole run when a quote is not in the artifact", () => {
    // §1 law 3. Not a lower score, not a dropped check — no run at all. A
    // fabricated quote is the one failure that would be invisible on the
    // surface, because it looks exactly like a real finding.
    const read = readAnswer(
      featurePrdPack,
      answerWith(featurePrdPack, NO_CONDITIONS, {
        "prd-19": {
          passed: false,
          quote: "Ghost mode expires after two hours.",
          note: "Two readings.",
        },
      }),
      ARTIFACT,
    );

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.detail).toContain("prd-19");
    expect(read.detail).toContain("not in the artifact");
  });

  it("allows an empty quote, because some checks fail on an absence", () => {
    const read = readAnswer(
      featurePrdPack,
      answerWith(featurePrdPack, NO_CONDITIONS, {
        "prd-8": { passed: false, quote: "", note: "No kill or rollback line anywhere." },
      }),
      ARTIFACT,
    );

    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const verdict = read.verdicts.find((entry) => entry.checkId === "prd-8");
    expect(verdict?.quote).toBeNull();
    expect(verdict?.evidence).toBe("No kill or rollback line anywhere.");
  });

  it("refuses a failure with no reading", () => {
    const read = readAnswer(
      featurePrdPack,
      answerWith(featurePrdPack, NO_CONDITIONS, {
        "prd-8": { passed: false, quote: "", note: "   " },
      }),
      ARTIFACT,
    );

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.detail).toContain("no reading");
  });

  it("refuses a run missing a verdict for an applicable check", () => {
    // The schema makes this unreachable through a provider that honours it.
    // This is the second wall, for the provider that does not.
    const answer = answerWith(featurePrdPack, NO_CONDITIONS);
    answer.results = answer.results.filter((verdict) => verdict.checkId !== "prd-10");

    const read = readAnswer(featurePrdPack, answer, ARTIFACT);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.detail).toContain("prd-10");
  });

  it("refuses a verdict for a check the pack does not have", () => {
    // The pack is law. A rubric does not gain a check because a model wrote one
    // down, and a verdict nobody asked for is the first sign of one trying.
    const answer = answerWith(featurePrdPack, NO_CONDITIONS);
    answer.results.push({
      checkId: "prd-21",
      passed: false,
      requirementId: "",
      quote: "",
      note: "Invented.",
    });

    const read = readAnswer(featurePrdPack, answer, ARTIFACT);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.detail).toContain("not a check");
  });

  it("refuses two verdicts for one check", () => {
    // An answer that says both says neither, and picking one would be us
    // deciding the check.
    const answer = answerWith(featurePrdPack, NO_CONDITIONS);
    answer.results.push({
      checkId: "prd-1",
      passed: false,
      requirementId: "",
      quote: "",
      note: "Actually no.",
    });

    const read = readAnswer(featurePrdPack, answer, ARTIFACT);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.detail).toContain("two verdicts");
  });

  it("drops evidence attached to a pass", () => {
    // There is no gap for it to be evidence of, and the column shape says so.
    const read = readAnswer(
      featurePrdPack,
      answerWith(featurePrdPack, NO_CONDITIONS, {
        "prd-1": { passed: true, quote: "Ghost mode", note: "Looks fine." },
      }),
      ARTIFACT,
    );

    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const verdict = read.verdicts.find((entry) => entry.checkId === "prd-1");
    expect(verdict).toEqual({
      checkId: "prd-1",
      tag: "should",
      points: 5,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
      evidence: "",
    });
  });

  describe("evidence too long for the column it lands in", () => {
    // An over-long answer is compliance, not corruption: the model followed the
    // protocol and reached a verdict, and only the prose is long. Refusing the
    // run would throw away nineteen other verdicts — and a provider call the
    // workspace already paid for — over the length of one sentence.

    it("clips a note past the column and reports the check", () => {
      const read = readAnswer(
        featurePrdPack,
        answerWith(featurePrdPack, NO_CONDITIONS, {
          "prd-8": { passed: false, quote: "", note: "n".repeat(4000) },
        }),
        ARTIFACT,
      );

      expect(read.ok).toBe(true);
      if (!read.ok) return;

      const verdict = read.verdicts.find((entry) => entry.checkId === "prd-8");
      expect(verdict?.note?.length).toBeLessThanOrEqual(NOTE_LIMIT);
      expect(verdict?.note?.endsWith("…")).toBe(true);
      // Recorded, not silent — `writeRun` puts this in the ledger.
      expect(read.clipped).toEqual(["prd-8"]);
    });

    it("clips a quote past the column, and only after verifying the whole of it", () => {
      // The passage is really in the artifact; it is simply longer than
      // `scoring_check_result_quote_len`. Verifying a *clipped* quote would
      // verify a prefix, and a prefix of an invented sentence is still invented.
      const long = `${"padding ".repeat(400)}WHEN the member leaves the venue`;
      const read = readAnswer(
        featurePrdPack,
        answerWith(featurePrdPack, NO_CONDITIONS, {
          "prd-19": { passed: false, quote: long, note: "Leaves how?" },
        }),
        `# Ghost mode\n\n${long}\n`,
      );

      expect(read.ok).toBe(true);
      if (!read.ok) return;

      const verdict = read.verdicts.find((entry) => entry.checkId === "prd-19");
      expect(verdict?.quote?.length).toBeLessThanOrEqual(STORED_QUOTE_LIMIT);
      expect(read.clipped).toEqual(["prd-19"]);
    });

    it("still refuses a long quote that is not in the artifact", () => {
      // Clipping is a courtesy about length. It is not a way past §1 law 3.
      const read = readAnswer(
        featurePrdPack,
        answerWith(featurePrdPack, NO_CONDITIONS, {
          "prd-19": { passed: false, quote: "z".repeat(4000), note: "Two readings." },
        }),
        ARTIFACT,
      );

      expect(read.ok).toBe(false);
      if (read.ok) return;
      expect(read.detail).toContain("not in the artifact");
    });

    it("renders a clipped failure inside what `gap.evidence` accepts", () => {
      const read = readAnswer(
        featurePrdPack,
        answerWith(featurePrdPack, NO_CONDITIONS, {
          "prd-8": {
            passed: false,
            requirementId: "R".repeat(400),
            quote: "",
            note: "n ".repeat(3000),
          },
        }),
        ARTIFACT,
      );

      expect(read.ok).toBe(true);
      if (!read.ok) return;

      const verdict = read.verdicts.find((entry) => entry.checkId === "prd-8");
      // The constraint this whole mechanism exists to stay inside.
      expect(verdict!.evidence.length).toBeLessThanOrEqual(2000);
    });

    it("reports nothing clipped on an ordinary run", () => {
      const read = readAnswer(featurePrdPack, answerWith(featurePrdPack, NO_CONDITIONS), ARTIFACT);

      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(read.clipped).toEqual([]);
    });
  });

  it("takes tag and points from the pack, never from the answer", () => {
    const read = readAnswer(featurePrdPack, answerWith(featurePrdPack, NO_CONDITIONS), ARTIFACT);

    expect(read.ok).toBe(true);
    if (!read.ok) return;

    for (const verdict of read.verdicts) {
      const check = applicableChecks(featurePrdPack, read.conditionsMet).find(
        (entry) => entry.id === verdict.checkId,
      );
      expect(verdict.tag).toBe(check?.tag);
      expect(verdict.points).toBe(check?.points);
    }
  });
});

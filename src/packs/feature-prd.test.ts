import { describe, expect, it } from "vitest";

import { featurePrdPack, getPack, listPacks } from "@/packs";
import { RUBRIC_TOTAL, allChecks, validatePack } from "@/packs/validate";

const safetyLayer = featurePrdPack.layers.find((layer) => layer.id === "safety");

/**
 * The transcription, checked against §7.2's own header line: "20 checks, 100
 * points, 9 Musts."
 *
 * These are not tests of the code — they are tests of the copying. §7.2 is law
 * and this file is a hand transcription of it, which is exactly the kind of work
 * that goes wrong silently: a 6 typed as an 8 still compiles, still scores, and
 * changes what every artifact in the product is measured against.
 */
describe("the Feature PRD pack", () => {
  it("loads through the registry and validates", () => {
    expect(validatePack(featurePrdPack)).toEqual([]);
    expect(getPack("feature-prd")).toBe(featurePrdPack);
    expect(listPacks()).toContain(featurePrdPack);
  });

  it("has §7.2's twenty checks — nineteen in the rubric, one in the safety layer", () => {
    expect(featurePrdPack.checks).toHaveLength(19);
    expect(allChecks(featurePrdPack)).toHaveLength(20);
    expect(featurePrdPack.layers.map((layer) => layer.id)).toEqual(["safety"]);
    expect(safetyLayer?.checks.map((check) => check.id)).toEqual(["prd-20"]);
  });

  it("sums to 100 points", () => {
    const total = featurePrdPack.checks.reduce((sum, check) => sum + check.points, 0);
    expect(total).toBe(RUBRIC_TOTAL);
  });

  // §7.2's header says nine, and its table shows ten — the tenth is check 20,
  // which is the layer. Both halves of that sentence are asserted, because the
  // reconciliation between them is the one decision this file rests on.
  it("has nine Musts in the rubric and a tenth in the layer", () => {
    const musts = featurePrdPack.checks.filter((check) => check.tag === "must");
    expect(musts.map((check) => check.id)).toEqual([
      "prd-6",
      "prd-9",
      "prd-10",
      "prd-11",
      "prd-14",
      "prd-15",
      "prd-16",
      "prd-17",
      "prd-19",
    ]);
    expect(safetyLayer?.checks.map((check) => check.tag)).toEqual(["must"]);
  });

  it("numbers its checks after §7.2's rows", () => {
    expect(allChecks(featurePrdPack).map((check) => check.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `prd-${index + 1}`),
    );
  });

  // A spot-check of the copying, weighted toward the rows where a slip costs
  // most: the heaviest check, the two conditional ones, and the layer.
  it("transcribes §7.2's prose and weights", () => {
    const byId = new Map(allChecks(featurePrdPack).map((check) => [check.id, check]));

    expect(byId.get("prd-1")).toMatchObject({
      prose: "Problem written without the solution hidden inside it",
      tag: "should",
      points: 5,
    });
    expect(byId.get("prd-10")).toMatchObject({
      prose: "Every story has testable GWT acceptance criteria",
      tag: "must",
      points: 10,
    });
    expect(byId.get("prd-15")).toMatchObject({
      prose: "Empty / first-use states (list-rendering surfaces only)",
      points: 6,
    });
    expect(byId.get("prd-16")).toMatchObject({
      prose: "Permission-denied, offline, degraded behavior (conditional)",
      points: 6,
    });
    expect(byId.get("prd-20")).toMatchObject({
      prose:
        "Safety (conditional, user-to-user/location features): misuse against a person + protections",
      points: 5,
    });
  });

  // §4 governs individual checks, and exactly three of §7.2's rows carry a
  // condition. A fourth would change every denominator in the product.
  it("makes exactly three checks conditional", () => {
    const conditional = allChecks(featurePrdPack).filter((check) => check.appliesWhen);
    expect(conditional.map((check) => check.id)).toEqual(["prd-15", "prd-16"]);
    expect(safetyLayer?.appliesWhen.id).toBe("user-to-user-or-location");
  });

  it("binds all twenty interview questions to real checks", () => {
    expect(featurePrdPack.interview).toHaveLength(20);
    expect(featurePrdPack.interview.map((question) => question.checkId)).toEqual(
      allChecks(featurePrdPack).map((check) => check.id),
    );
  });

  // Appendix B item 19 is "Critic sweep, no question". Transcribing that as a
  // prompt would put words in an interviewer's mouth; it is the only null.
  it("carries no prompt for the critic sweep, and one for every other question", () => {
    const promptless = featurePrdPack.interview.filter((question) => question.prompt === null);
    expect(promptless.map((question) => question.checkId)).toEqual(["prd-19"]);
    for (const question of featurePrdPack.interview) {
      expect(question.criticTest.length).toBeGreaterThan(0);
    }
  });

  it("transcribes Appendix B's prompts", () => {
    const byCheck = new Map(featurePrdPack.interview.map((q) => [q.checkId, q]));

    expect(byCheck.get("prd-1")?.prompt).toBe(
      "Forget the feature — what's going wrong for users right now?",
    );
    expect(byCheck.get("prd-1")?.criticTest).toBe(
      "delete the proposed solution from the answer; if nothing remains, it's a solution in disguise.",
    );
    expect(byCheck.get("prd-20")?.prompt).toBe(
      "How could someone use this against another person at 2 a.m., and what stops them?",
    );
  });
});

import { describe, expect, it } from "vitest";

import { MAX_PASSES, nextStep, readVerdict } from "./review-cap.mjs";

const verdict = (pass, body, last) =>
  ["# T0.44 — review", "", "abc1234", "", `pass ${pass}`, "", ...body, "", last, ""].join("\n");

// T0.44 TC3 → AC3: the cap is a count the run reads off the verdict file.
describe("the review cap", () => {
  it("reads the pass, the verdict and the tags", () => {
    const text = verdict(
      2,
      ["1. Must — a wrong result", "2. **Should** — a name", "3. Should: a test"],
      "FINDINGS",
    );
    expect(readVerdict(text)).toEqual({ pass: 2, verdict: "FINDINGS", musts: 1, shoulds: 2 });
  });

  // Review pass 1, Should 11: a wrapped line of prose is not a tag.
  it("counts a tag and not a line of prose that begins with the same word", () => {
    const text = verdict(
      2,
      [
        "1. **Must (uncertain)** — a wrong result, and",
        "Should the closer file it, the task names it.",
        "Must be read twice.",
        "- Should: a name",
      ],
      "FINDINGS",
    );
    expect(readVerdict(text)).toMatchObject({ musts: 1, shoulds: 1 });
  });

  it("closes on a PASS, and counts the Shoulds the closer files as one task", () => {
    expect(
      nextStep(verdict(2, ["1. Should — a name", "2. Should — a test"], "PASS")),
    ).toMatchObject({
      next: "close",
      shoulds: 2,
    });
    expect(nextStep(verdict(1, [], "PASS"))).toMatchObject({ next: "close", shoulds: 0 });
  });

  it("sends Musts in pass 1 or 2 back to the builder for the next pass", () => {
    expect(nextStep(verdict(1, ["1. Must — x"], "FINDINGS"))).toMatchObject({
      next: "build",
      pass: 1,
    });
    expect(nextStep(verdict(2, ["1. Must — x"], "FINDINGS"))).toMatchObject({
      next: "build",
      pass: 2,
    });
  });

  it("stops at Decision on a Must in pass 3, and there is no pass 4", () => {
    expect(MAX_PASSES).toBe(3);
    expect(nextStep(verdict(3, ["1. Must — x"], "FINDINGS"))).toMatchObject({
      next: "decision",
      why: "pass 3 still finds a Must, and there is no pass 4",
    });
  });

  it("stops at Decision when the count cannot be read", () => {
    expect(nextStep(null).next).toBe("decision");
    expect(nextStep("# T0.44 — review\n\n1. Must — x\n\nFINDINGS\n")).toMatchObject({
      next: "decision",
      why: "the verdict file carries no pass number",
    });
    expect(nextStep(verdict(1, [], "maybe")).next).toBe("decision");
  });
});

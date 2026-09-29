import { describe, expect, it } from "vitest";

import { splitAround } from "@/lib/chip-label";

/**
 * §8.9: on a row the gap chip reads "Must · {check id}", the id in mono-readout — so the
 * dictionary's one string has to be split around the id it was formatted with, wherever
 * the locale put it.
 */
describe("splitAround", () => {
  it("finds the id where English puts it", () => {
    expect(splitAround("Must · prd-10", "prd-10")).toEqual({ before: "Must · ", after: "" });
  });

  it("finds the id where another locale might put it", () => {
    expect(splitAround("prd-10 · Zorunlu", "prd-10")).toEqual({
      before: "",
      after: " · Zorunlu",
    });
  });

  // A locale that dropped the id, or a formatter that never took it: nothing to set in
  // mono, and the caller renders the string whole rather than guessing.
  it("answers null when the string does not carry the id", () => {
    expect(splitAround("Must · unclear", "prd-10")).toBeNull();
    expect(splitAround("Must · prd-10", "")).toBeNull();
  });
});

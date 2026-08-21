import { describe, expect, it } from "vitest";

import { TYPEAHEAD_RESET_MS, matchTypeahead } from "@/lib/typeahead";

const LABELS = ["Feature", "Enhancement", "Technical", "Content", "Experiment", "Fix", "Spike"];

/** design-spec.md §8 requires type-to-jump on the select. */
describe("matchTypeahead", () => {
  it("has a reset window", () => {
    expect(TYPEAHEAD_RESET_MS).toBe(500);
  });

  it("matches nothing on an empty buffer", () => {
    expect(matchTypeahead("", LABELS, 0)).toBeNull();
  });

  it("finds the first match from a standing start", () => {
    expect(matchTypeahead("t", LABELS, -1)).toBe(2);
    expect(matchTypeahead("c", LABELS, -1)).toBe(3);
  });

  it("is case-insensitive", () => {
    expect(matchTypeahead("SPI", LABELS, -1)).toBe(6);
  });

  it("narrows as the buffer grows, without moving off a still-valid match", () => {
    expect(matchTypeahead("e", LABELS, -1)).toBe(1);
    expect(matchTypeahead("ex", LABELS, 1)).toBe(4);
  });

  // Pressing the same letter again is a request for the next one like it.
  it("cycles through the entries sharing a first letter", () => {
    expect(matchTypeahead("f", LABELS, -1)).toBe(0);
    expect(matchTypeahead("ff", LABELS, 0)).toBe(5);
    expect(matchTypeahead("fff", LABELS, 5)).toBe(0);
  });

  it("wraps past the end of the list", () => {
    expect(matchTypeahead("c", LABELS, 5)).toBe(3);
  });

  it("returns null when nothing starts with the buffer", () => {
    expect(matchTypeahead("zz", LABELS, 0)).toBeNull();
  });
});

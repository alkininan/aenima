import { describe, expect, it } from "vitest";

import { inlineSections, sectionsOf } from "./spec-sections.mjs";

const DOC = [
  "# aenima — Product Specification v1.6",
  "",
  "## 1. Principles",
  "",
  "1. **Status is derived, never declared.**",
  "",
  "## 2. Object model",
  "",
  "An item is the unit of work.",
  "",
  "### 2.1 A sub-heading that must not end its parent",
  "",
  "Still inside section 2.",
  "",
  "## 7. Artifact packs",
  "",
  "Packs are per stage.",
  "",
  "### 7.5 Backlog refinement",
  "",
  "No story too big.",
  "",
  "## A. Seed baselines",
  "",
  "Numbers for a team.",
  "",
].join("\n");

describe("sectionsOf", () => {
  it("finds sections and sub-sections in order, dotted or not", () => {
    expect(sectionsOf(DOC).map((s) => s.number)).toEqual(["1", "2", "2.1", "7", "7.5", "A"]);
  });

  it("keeps the title beside the number", () => {
    expect(sectionsOf(DOC)[1].title).toBe("Object model");
  });

  it("runs a section past its own sub-headings to the next section", () => {
    const seven = sectionsOf(DOC).find((s) => s.number === "7");
    expect(seven.body).toContain("### 7.5 Backlog refinement");
    expect(seven.body).toContain("No story too big.");
    expect(seven.body).not.toContain("## A. Seed baselines");
  });

  it("runs a sub-section only to the next heading of its own level or shallower", () => {
    const sub = sectionsOf(DOC).find((s) => s.number === "7.5");
    expect(sub.body).toContain("No story too big.");
    expect(sub.body).not.toContain("## A.");
  });

  it("reads a lettered appendix heading", () => {
    expect(sectionsOf(DOC).find((s) => s.number === "A").title).toBe("Seed baselines");
  });

  it("includes the heading line itself, so the inlined text says what it is", () => {
    expect(sectionsOf(DOC)[0].body.startsWith("## 1. Principles")).toBe(true);
  });

  it("runs the last section to the end of the document", () => {
    expect(sectionsOf(DOC).at(-1).body).toContain("Numbers for a team.");
  });

  it("trims the blank lines before the next heading", () => {
    expect(sectionsOf(DOC)[0].body.endsWith("declared.**")).toBe(true);
  });

  it("finds nothing in a document with no numbered sections", () => {
    expect(sectionsOf("# Title\n\nSome prose.\n")).toEqual([]);
  });
});

describe("inlineSections", () => {
  it("returns the cited sections verbatim, in the order cited", () => {
    const inlined = inlineSections(DOC, ["7.5", "1"]);
    expect(inlined.map((s) => s.number)).toEqual(["7.5", "1"]);
    expect(inlined[0].body).toContain("No story too big.");
    expect(inlined[1].body).toContain("Status is derived");
  });

  it("distinguishes a sub-section from the section that contains it", () => {
    expect(inlineSections(DOC, ["7.5"])[0].body).not.toContain("Packs are per stage.");
    expect(inlineSections(DOC, ["7"])[0].body).toContain("Packs are per stage.");
  });

  it("marks a section the document does not have as missing, not as empty", () => {
    const [only] = inlineSections(DOC, ["9"]);
    expect(only).toEqual({ number: "9", missing: true });
    expect(only.body).toBeUndefined();
  });

  it("accepts a number given as a number rather than a string", () => {
    expect(inlineSections(DOC, [1])[0].title).toBe("Principles");
  });

  it("does not match 7.5 when 7.6 was cited", () => {
    expect(inlineSections(DOC, ["7.6"])[0].missing).toBe(true);
  });
});

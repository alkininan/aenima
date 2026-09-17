import { describe, expect, it } from "vitest";

import {
  EMPTY_SLUG,
  PREAMBLE_ID,
  joinSections,
  parseSections,
  slugOf,
  spliceSection,
} from "./sections";

/**
 * T3.1's addendum, answer 1 — "A section is a `##` heading block, its id the
 * heading's slug … Two headings that slug the same get a numeric suffix in
 * document order."
 */

const ids = (body: string) => parseSections(body).map((section) => section.id);

describe("parseSections — TA1 → AA1", () => {
  it("parses a ## block to a section whose id is the heading's slug", () => {
    const body = "## Date & Meet\n\nScheduling is locked.\n";
    expect(parseSections(body)).toEqual([{ id: "date-meet", text: body }]);
  });

  it("suffixes a second heading that slugs the same, in document order", () => {
    const body = "## Scope\none\n## Risks\ntwo\n## Scope\nthree\n## SCOPE!\nfour\n";
    expect(ids(body)).toEqual(["scope", "risks", "scope-2", "scope-3"]);
  });

  it("moves past a suffix a heading already took rather than colliding with it", () => {
    const body = "## Scope 2\na\n## Scope\nb\n## Scope\nc\n";
    expect(ids(body)).toEqual(["scope-2", "scope", "scope-3"]);
  });

  it("keeps a section's id when a section is added after it", () => {
    const before = "## Scope\na\n## Risks\nb\n";
    const after = `${before}## Scope\nc\n`;
    expect(ids(after).slice(0, 2)).toEqual(ids(before));
  });

  it("is lossless: the sections join back to the body byte for byte", () => {
    const body =
      "# Juno\r\n\r\nIntro.\r\n## One\r\n\r\ntext  \r\n### Sub\r\nmore\r\n## Two ##\r\nlast line";
    expect(joinSections(parseSections(body))).toBe(body);
  });

  it("reads ### and deeper as part of the ## section above them", () => {
    expect(ids("## Date\n### Scheduling\n#### Detail\n## Meet\n")).toEqual(["date", "meet"]);
  });

  it("holds the text before the first ## heading as the preamble", () => {
    const sections = parseSections("# Juno\n\nIntro.\n## One\nbody\n");
    expect(sections.map((s) => s.id)).toEqual([PREAMBLE_ID, "one"]);
    expect(sections[0]!.text).toBe("# Juno\n\nIntro.\n");
  });

  it("gives no preamble to a body that opens on a ## heading", () => {
    expect(ids("## One\nbody\n")).toEqual(["one"]);
  });

  it("does not read a ## line inside a fenced code block as a heading", () => {
    const body = "## Real\n```md\n## Not a heading\n```\n~~~\n## Nor this\n~~~\n## Also real\n";
    expect(ids(body)).toEqual(["real", "also-real"]);
  });

  it("closes a fence only on the same character at least as long", () => {
    const body = "## A\n````\n```\n## still code\n````\n## B\n";
    expect(ids(body)).toEqual(["a", "b"]);
  });

  it("needs a space after ## — #hashtag and ##tight are text", () => {
    expect(ids("## A\n##tight\n#hashtag\n")).toEqual(["a"]);
  });
});

describe("slugOf", () => {
  it("keeps letters of every script, so a Turkish heading is not torn apart", () => {
    expect(slugOf("Güvenlik ve Gizlilik")).toBe("güvenlik-ve-gizlilik");
    expect(slugOf("İstanbul")).toBe("i̇stanbul");
  });

  it("reads one heading typed two ways as one id", () => {
    expect(slugOf("Güvenlik")).toBe(slugOf("Güvenlik"));
  });

  it("slugs a heading with no letters or digits to the empty-slug id", () => {
    expect(slugOf("???")).toBe(EMPTY_SLUG);
    expect(ids("##\nbody\n")).toEqual([EMPTY_SLUG]);
  });
});

describe("spliceSection", () => {
  const body = "# T\n## One\nold\n## Two\nkeep\n";

  it("replaces one section and leaves every other byte as it was", () => {
    const next = spliceSection(parseSections(body), "one", "## One\nnew\n");
    expect(next).toBe("# T\n## One\nnew\n## Two\nkeep\n");
  });

  it("puts back a trailing line break the revision dropped, so the next heading stays one", () => {
    const next = spliceSection(parseSections(body), "one", "## One\nnew");
    expect(ids(next)).toEqual([PREAMBLE_ID, "one", "two"]);
  });

  it("keeps the section's own run of trailing line breaks, so a section returned unchanged reads unchanged", () => {
    const spaced = "## One\nold\n\n## Two\nkeep\n";
    expect(spliceSection(parseSections(spaced), "one", "## One\nold\n")).toBe(spaced);
    expect(spliceSection(parseSections(spaced), "one", "## One\nold\n\n\n\n")).toBe(spaced);
  });

  it("refuses to splice a section the document does not have", () => {
    expect(() => spliceSection(parseSections(body), "three", "x")).toThrow(/three/);
  });
});

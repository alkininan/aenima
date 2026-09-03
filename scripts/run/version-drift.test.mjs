import { describe, expect, it } from "vitest";

import { parseHeaderVersion, parseSpec, versionDrift } from "./version-drift.mjs";

// The real header lines, copied from the documents as they stand.
const HEADERS = {
  "docs/product-spec.md": "# aenima — Product Specification v1.6\n\nSomething below.",
  "docs/design-spec.md": "# aenima — Design Specification v2.17 (web)\n",
  "docs/build-guide.md":
    "<!-- build-guide.md · v2.1 · in the repo · §2 carries the hooks and the reviewer, §6 the Stop gate.\n" +
    "     v2.0 was a rewrite rather than a revision: v1.0 was written before ticket 0.1 -->\n" +
    "\n# aenima — build guide v2.1\n",
  "docs/guidelines.md": "<!-- guidelines.md · v1.2 · in the repo · §9 states its closed gaps -->\n",
};

const read = (path) => {
  if (!(path in HEADERS)) throw new Error(`no such document: ${path}`);
  return HEADERS[path];
};

// TC2 → AC2. Drift is detected from the header lines the documents actually carry.
describe("parseHeaderVersion", () => {
  it("reads a version out of an H1 title", () => {
    expect(parseHeaderVersion(HEADERS["docs/product-spec.md"])).toBe("1.6");
  });

  it("reads one that is followed by other words", () => {
    expect(parseHeaderVersion(HEADERS["docs/design-spec.md"])).toBe("2.17");
  });

  it("reads one out of an HTML header comment", () => {
    expect(parseHeaderVersion(HEADERS["docs/guidelines.md"])).toBe("1.2");
  });

  it("takes the first version in the header, not a later one it mentions", () => {
    // build-guide's own comment names v2.1 and then v2.0 and v1.0 as history.
    expect(parseHeaderVersion(HEADERS["docs/build-guide.md"])).toBe("2.1");
  });

  it("does not find a version that sits below the header", () => {
    expect(parseHeaderVersion("# Title\n\n\n\n\n\n\n\nv9.9 far below")).toBeNull();
  });

  it("says null rather than guessing when there is no version at all", () => {
    expect(parseHeaderVersion("# aenima — schema\n")).toBeNull();
  });
});

describe("parseSpec", () => {
  it("reads several documents, versions and sections off one line", () => {
    expect(parseSpec("product-spec v1.6 §8, §11 · design-spec v2.15 §4")).toEqual([
      { doc: "product-spec", version: "1.6", sections: ["8", "11"] },
      { doc: "design-spec", version: "2.15", sections: ["4"] },
    ]);
  });

  it("reads a citation with no sections", () => {
    expect(parseSpec("guidelines v1.2")).toEqual([
      { doc: "guidelines", version: "1.2", sections: [] },
    ]);
  });

  it("returns nothing for a Spec line that cites no document", () => {
    expect(parseSpec("")).toEqual([]);
    expect(parseSpec("see the board")).toEqual([]);
  });
});

describe("versionDrift", () => {
  it("says nothing drifted when every citation matches the repo", () => {
    const rows = versionDrift("product-spec v1.6 §8 · design-spec v2.17 §4", read);
    expect(rows.every((row) => row.drifted)).toBe(false);
    expect(rows.map((row) => row.repo)).toEqual(["1.6", "2.17"]);
  });

  it("flags the one that moved and leaves the other alone", () => {
    const rows = versionDrift("product-spec v1.6 §8 · design-spec v2.15 §4", read);
    expect(rows.find((row) => row.doc === "design-spec")).toMatchObject({
      cited: "2.15",
      repo: "2.17",
      drifted: true,
    });
    expect(rows.find((row) => row.doc === "product-spec").drifted).toBe(false);
  });

  it("reports a document it cannot read as drifted rather than as matching", () => {
    const row = versionDrift("schema v1.0", read)[0];
    expect(row).toMatchObject({ doc: "schema", cited: "1.0", repo: null, drifted: true });
  });

  it("keeps the cited sections for the report", () => {
    expect(versionDrift("guidelines v1.2 §4, §5", read)[0].sections).toEqual(["4", "5"]);
  });
});

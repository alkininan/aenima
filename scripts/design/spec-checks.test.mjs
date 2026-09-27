import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { checkC01, checkC02, checkC03, checkC04, SPEC } from "./spec-checks.mjs";

const root = join(import.meta.dirname, "../..");
const spec = readFileSync(join(root, SPEC), "utf8");

/** The document with one line added at the top of a section's body. */
const plant = (heading, line) => {
  expect(spec).toContain(heading);
  return spec.replace(heading, `${heading}\n\n${line}`);
};

// TC1 → AC1. design-spec §17's checks on the document itself, over the committed file, and
// each over a copy carrying one planted offender so a detector that finds nothing is caught.
describe("design-spec §17 C-01–C-04 (T0.38)", () => {
  it("C-01 the title, the last changelog line and the footer carry one version", () => {
    expect(checkC01(spec)).toEqual([]);
    const title = /^# .*$/m.exec(spec)?.[0] ?? "";
    expect(checkC01(spec.replace(title, title.replace(/v\d+\.\d+/, "v9.9")))).not.toEqual([]);
  });

  it("C-01 the changelog comment closes on its last line", () => {
    expect(checkC01(spec.replace(/ -->\n/, "\n-->\n"))).toEqual([
      "the changelog comment does not close on its last line",
    ]);
  });

  it("C-02 no hedge before a number outside §1", () => {
    expect(checkC02(spec)).toEqual([]);
    expect(checkC02(plant("## 6. Motion & tactility", "Settles in about 200ms."))).toHaveLength(1);
    expect(checkC02(plant("## 4. Layout, z-order, chrome", "A gap of ~12."))).toHaveLength(1);
    // §1 describes finished assets and is outside the check.
    expect(checkC02(plant("## 1. Brand mark", "Roughly 3 tones."))).toEqual([]);
  });

  it("C-03 every custom property named in prose is declared in §2, §3, §5 or §6", () => {
    expect(checkC03(spec)).toEqual([]);
    expect(checkC03(plant("## 8. Components", "Reads `--made-up`."))).toEqual(["--made-up"]);
    // The two exceptions §17 names, and the changelog comment, are not read.
    expect(checkC03(plant("## 8. Components", "`--morph-r0` and `--a`."))).toEqual([]);
    expect(checkC03(spec.replace("<!--", "<!-- --only-in-history"))).toEqual([]);
  });

  it("C-04 every bare section reference resolves; product-spec's are not resolved here", () => {
    expect(checkC04(spec)).toEqual([]);
    expect(checkC04(plant("## 8. Components", "See §8.99."))).toHaveLength(1);
    expect(checkC04(plant("## 8. Components", "See §42."))).toHaveLength(1);
    expect(checkC04(plant("## 8. Components", "See product-spec §42."))).toEqual([]);
  });
});

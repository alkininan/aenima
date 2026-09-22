import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * design-spec §17 C-39's font clause, over the fonts this build serves (T0.40).
 *
 * It runs here rather than in the unit suite because the faces only exist once
 * something has built them: Space Grotesk is downloaded from Google Fonts at build time
 * and emitted under our own origin, and the two vendored faces are cut into subsets and
 * hashed into the same place. Checking the files in the repository would say nothing
 * about the third face, and nothing about what a person is actually served.
 *
 * So the page is asked what it loaded. Every `@font-face` the document carries is read
 * out of `document.styleSheets` — same-origin, so the rules are readable — each file is
 * fetched from the server, and `scripts/fonts/check_fonts.py` reads the lot with
 * fontTools, one manifest entry per family. Pointed at a deployed URL by
 * `PLAYWRIGHT_BASE_URL`, this is the same check against the real deployment.
 */
test.describe("the fonts a production build serves", () => {
  test("cover Turkish and Dutch, the kbd glyphs, and tabular figures", async ({
    page,
    request,
  }) => {
    await page.goto("/sign-in");

    // §3's three faces are all declared in the document's own stylesheets; a face the
    // page never declares is one nothing can render, and the assertion below catches it.
    const faces = await page.evaluate(() => {
      const found: { family: string; url: string }[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRule[];
        try {
          rules = Array.from(sheet.cssRules);
        } catch {
          continue; // A stylesheet from another origin. Ours are not.
        }
        for (const rule of rules) {
          if (!(rule instanceof CSSFontFaceRule)) continue;
          const family = rule.style.getPropertyValue("font-family").replace(/['"]/g, "").trim();
          const source = /url\(["']?([^"')]+)/.exec(rule.style.getPropertyValue("src"))?.[1];
          // The metric-matched fallback `next/font` adds is a `local()` source with no
          // file of its own, and there is nothing in it to read. A real one is relative
          // to the stylesheet that declares it, not to the page.
          if (source) {
            found.push({ family, url: new URL(source, sheet.href ?? document.baseURI).href });
          }
        }
      }
      return found;
    });

    const families = [...new Set(faces.map((face) => face.family))].sort();
    expect(families, "the three faces §3 names").toEqual([
      "DM Sans",
      "JetBrains Mono",
      "Space Grotesk",
    ]);

    const directory = mkdtempSync(join(tmpdir(), "aenima-fonts-"));
    const manifest: Record<string, string[]> = {};
    for (const [index, face] of faces.entries()) {
      const response = await request.get(face.url);
      expect(response.status(), `${face.family} at ${face.url}`).toBe(200);
      const file = join(directory, `${index}.woff2`);
      writeFileSync(file, await response.body());
      (manifest[face.family] ??= []).push(file);
    }

    const manifestFile = join(directory, "manifest.json");
    writeFileSync(manifestFile, JSON.stringify(manifest));

    // The check itself is fontTools': it exits non-zero, naming the face and the letters,
    // when a face is missing any of them. A failure to run it at all — no Python, no
    // fontTools — is also a failure here, and says so rather than passing quietly.
    const report = execFileSync("python3", ["scripts/fonts/check_fonts.py", manifestFile], {
      encoding: "utf8",
    });
    expect(report).toContain("DM Sans");
  });
});

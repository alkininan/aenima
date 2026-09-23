import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * design-spec §17 C-37 — where blur is allowed to be.
 *
 * "`backdrop-filter` appears only in the glass recipe's blurred class, applied only to
 * sticky bars, panels and toasts, and in the morph's rules, where the image-pair carries
 * the blurred recipe and the group `none` (§6); modals, sheets and the pipeline strip
 * carry the recipe's unblurred class, and nothing outside §5's list carries either."
 *
 * §5 gives the reason, which is why the check is worth having rather than a style
 * preference: "the scrim passes a fifth of the page and the glass fill 15% of that, so a
 * blur behind a modal has nothing to blur, and the largest blurred areas in the product
 * would otherwise be sheets on phones."
 */

const root = process.cwd();
const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");

/**
 * Every rule in the stylesheet as `{ selectors, body }`, innermost first.
 *
 * **Comments are stripped before anything is read, and that is not tidiness.** The first
 * version of this file did not, and the prose above `.glass` — which explains that the
 * blur lives in `.glass-blur` — became part of that rule's captured selector. A blur put
 * into `.glass` by hand then passed the check, because the selector "contained"
 * `.glass-blur`: the test was reading a sentence about the rule as though it were the
 * rule. Caught by negative-checking, which is the only thing that would have caught it.
 */
function rules(css: string): { selectors: string[]; body: string }[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: { selectors: string[]; body: string }[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stripped)) !== null) {
    found.push({
      selectors: (match[1] ?? "")
        .split(",")
        .map((one) => one.trim())
        .filter(Boolean),
      body: match[2] ?? "",
    });
  }
  return found;
}

/** Whether a rule's selector list names this exact selector. */
const names = (rule: { selectors: string[] }, selector: string) =>
  rule.selectors.some((one) => one === selector || one.endsWith(` ${selector}`));

/** The two places §5 and §6 let a blur be declared. */
const ALLOWED = [".glass-blur", ":root::view-transition-image-pair(morph)"];

/** And the places it is declared as `none`, which C-37 names explicitly. */
const ALLOWED_NONE = [".glass-blur", ":root::view-transition-group(morph)"];

describe("C-37 · backdrop-filter is only where §5 and §6 put it", () => {
  const blurring = rules(globals).filter((rule) => /backdrop-filter/.test(rule.body));

  it("declares a blur in the blurred class and the morph's image-pair, and nowhere else", () => {
    const real = blurring.filter((rule) => /backdrop-filter:\s*blur/.test(rule.body));
    expect(real.length).toBeGreaterThan(0);
    for (const rule of real) {
      expect(
        ALLOWED.some((allowed) => names(rule, allowed)),
        `backdrop-filter: blur in \`${rule.selectors.join(", ")}\``,
      ).toBe(true);
    }
  });

  it("turns a blur off only on the group and in the fallbacks", () => {
    const off = blurring.filter((rule) => /backdrop-filter:\s*none/.test(rule.body));
    expect(off.length).toBeGreaterThan(0);
    for (const rule of off) {
      expect(
        ALLOWED_NONE.some((allowed) => names(rule, allowed)),
        `backdrop-filter: none in \`${rule.selectors.join(", ")}\``,
      ).toBe(true);
    }
  });

  // §5: the unblurred recipe is the base; the blur is the addition. So `.glass`
  // itself must not blur, or every modal and sheet would.
  it("keeps the base recipe unblurred", () => {
    const base = rules(globals).filter((rule) => names(rule, ".glass"));
    // Three of them: the recipe, the no-backdrop-filter fallback, and the two
    // §13 media queries. If this ever finds none, the check has stopped reading
    // the stylesheet rather than the stylesheet having stopped declaring one.
    expect(base.length).toBeGreaterThan(1);
    for (const rule of base) expect(rule.body).not.toMatch(/backdrop-filter:\s*blur/);
  });
});

describe("C-37 · which surfaces carry the blurred class", () => {
  /** Every source file that could name a class. */
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sources(path));
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  const files = sources("src").map((path) => ({
    path,
    text: readFileSync(join(root, path), "utf8"),
  }));

  it("is claimed only by a panel and a toast", () => {
    const carriers = files
      .filter(({ text }) => /\bglass-blur\b/.test(text))
      .map(({ path }) => path);

    // Both live in `variants.ts`, which is where every class string in the
    // system is written; no component assembles one of its own.
    expect(carriers).toEqual(["src/components/ui/variants.ts"]);

    const variants = files.find((file) => file.path === "src/components/ui/variants.ts")?.text ?? "";
    const blurred = variants
      .split("\n")
      .filter((line) => line.includes("glass-blur"))
      .join("\n");
    expect(blurred).toContain("panel glass glass-blur");
    expect(blurred).toContain("glass glass-blur overlay-rise");
  });

  // §5: surfaces over `--bg-scrim`, and in-flow glass, take the recipe without
  // its two backdrop-filter lines.
  it("is not claimed by a modal, a sheet or the pipeline strip", () => {
    const variants = files.find((file) => file.path === "src/components/ui/variants.ts")?.text ?? "";
    for (const base of ["MODAL_SURFACE_BASE", "SHEET_SURFACE_BASE"]) {
      const at = variants.indexOf(base);
      if (at === -1) continue;
      const declaration = variants.slice(at, variants.indexOf(";", at));
      expect(declaration, base).toContain("glass");
      expect(declaration, base).not.toContain("glass-blur");
    }

    const strip =
      files.find((file) => file.path === "src/app/app/PipelineStrip.tsx")?.text ?? "";
    expect(strip).toContain('"glass ');
    expect(strip).not.toContain("glass-blur");
  });
});

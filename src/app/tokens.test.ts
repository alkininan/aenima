import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * design-spec §17 C-05, and the type half of C-39 (T0.40).
 *
 * C-05: "Every custom property declared in the CSS blocks of §2, §3, §5 and §6 exists in
 * `globals.css` with the same value, and `globals.css` declares no colour, radius,
 * duration or easing this document does not; the script timers this document names (§6)
 * exist in `motion.ts` with the same values and `motion.ts` holds no timer this document
 * does not."
 *
 * So every assertion here runs in both directions. A token added to the document and not
 * to the stylesheet fails; so does one added to the stylesheet and not to the document,
 * which is the direction that keeps the stylesheet from growing a private vocabulary.
 *
 * The email-template clause of C-05 is not here: §14's templates do not exist yet, and a
 * check over no files would pass by saying nothing.
 */

const root = process.cwd();
const spec = readFileSync(join(root, "docs/design-spec.md"), "utf8");
const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
const motion = readFileSync(join(root, "src/lib/motion.ts"), "utf8");

/** A `## N. Title` section of the document, up to the next one. */
function section(number: string): string {
  const at = spec.search(new RegExp(`^## ${number}\\. `, "m"));
  if (at === -1) throw new Error(`design-spec has no §${number}`);
  const rest = spec.slice(at + 1);
  const end = rest.search(/^## \d+\. /m);
  return end === -1 ? spec.slice(at) : spec.slice(at, at + 1 + end);
}

/**
 * Every fenced css block in a section, joined. C-05 reads "the CSS blocks" of each
 * section, and §5 has two — the radii and the glass recipe. The recipe declares no
 * custom property today, so reading only the first would miss nothing and say so
 * silently the day it does.
 */
function cssBlock(number: string): string {
  const blocks = [...section(number).matchAll(/```css\n([\s\S]*?)```/g)].map(
    (match) => match[1] ?? "",
  );
  if (blocks.length === 0) throw new Error(`§${number} carries no css block`);
  return blocks.join("\n");
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `--name: value` in a chunk of CSS, in source order, whitespace collapsed. */
function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of stripComments(css).split(";")) {
    const match = /(--[\w-]+)\s*:\s*([^;]+)/.exec(line);
    if (match?.[1] && match[2]) found.set(match[1], match[2].replace(/\s+/g, " ").trim());
  }
  return found;
}

/** The body of a top-level block — `:root { … }`, `@theme static { … }` — by its opener. */
function block(css: string, opener: string): string {
  const at = css.indexOf(`${opener} {`);
  if (at === -1) throw new Error(`globals.css has no ${opener} block`);
  let depth = 0;
  for (let i = css.indexOf("{", at); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(css.indexOf("{", at) + 1, i);
    }
  }
  throw new Error(`${opener} block is not closed`);
}

/**
 * A face can be named two ways and mean one thing. §3 writes families —
 * `'DM Sans', system-ui, sans-serif` — and the stylesheet writes the family itself where
 * the face declares one (the two vendored faces do) and the variable `next/font` writes
 * where it does not (Space Grotesk's family name is generated at build time). So both
 * sides are read down to the family, and `'DM Sans'` and `var(--font-dm-sans)` are the
 * same value spelled the two ways it can be spelled.
 */
const familySpelling = (value: string) =>
  value
    // Either quote: the document writes `\'DM Sans\'` and Prettier writes `"DM Sans"`.
    .replace(/["']([^"']+)["']/g, (_, family: string) => family.toLowerCase().replace(/\s+/g, "-"))
    .replace(/var\(--font-([\w-]+)\)/g, (_, slug: string) => slug);

/** The z-ladder is §4's, stated in prose, and is no colour, radius, duration or easing. */
const Z_LADDER = [
  "--z-content",
  "--z-sticky",
  "--z-chat",
  "--z-popover",
  "--z-modal",
  "--z-toast",
  "--z-tooltip",
];

describe("C-05 · the token layer is the document's", () => {
  const documentTokens = new Map<string, string>();
  for (const number of ["2", "5", "6"]) {
    for (const [name, value] of declarations(cssBlock(number))) documentTokens.set(name, value);
  }
  const fontTokens = declarations(cssBlock("3"));

  const rootTokens = declarations(block(globals, ":root"));
  const themeStatic = declarations(block(globals, "@theme static"));
  const themeInline = declarations(block(globals, "@theme inline"));

  it("declares every §2, §5 and §6 token with the document's value", () => {
    for (const [name, value] of documentTokens) {
      expect(rootTokens.get(name), `${name} in globals.css`).toBe(value);
    }
  });

  it("declares every §3 typeface with the document's family", () => {
    for (const [name, value] of fontTokens) {
      expect(familySpelling(themeStatic.get(name) ?? ""), `${name} in globals.css`).toBe(
        familySpelling(value),
      );
    }
  });

  it("declares nothing of its own beside them but §4's z-ladder", () => {
    const extra = [...rootTokens.keys()].filter(
      (name) => !documentTokens.has(name) && !Z_LADDER.includes(name),
    );
    expect(extra).toEqual([]);
    expect([...themeStatic.keys()].filter((name) => !fontTokens.has(name))).toEqual([]);
  });

  it("maps tokens in the Tailwind theme rather than restating their values", () => {
    const known = new Set([...documentTokens.keys(), ...fontTokens.keys(), ...Z_LADDER]);
    for (const [name, value] of themeInline) {
      const referenced = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
      expect(referenced, `${name} maps a token`).toBeDefined();
      expect(known.has(referenced ?? ""), `${name} maps a token the document declares`).toBe(true);
    }
  });
});

/** `1.5s` and `60s` in ms, `0.5 px/ms` as itself: one number per timer, comparable. */
function asNumber(value: string, unit: string): number {
  return unit === "s" ? Number(value) * 1000 : Number(value);
}

describe("C-05 · the script timers are the document's", () => {
  /**
   * §6's sentence names each timer with the section it serves: "the 1.5s validation pause
   * (§8.2), the 1.5s copy tick (§8.16), the 5s and 8s toast clocks (§8.20) …". Each value
   * belongs to the first section reference that follows it, which is what pairs the two
   * lists without either of them holding the other's names.
   */
  // Up to "of its own.", not to the first full stop: "1.5s" carries one of its own.
  const sentence = /The timers that live in script rather than CSS[\s\S]*?of its own\./.exec(
    section("6"),
  )?.[0];

  const documentTimers = (() => {
    if (!sentence) throw new Error("§6 does not name its script timers");
    const references = [...sentence.matchAll(/§(8\.\d+)/g)];
    return [...sentence.matchAll(/([\d.]+)\s?(px\/ms|ms|s)\b/g)].map((match) => {
      const after = references.find((reference) => (reference.index ?? 0) > (match.index ?? 0));
      return { section: after?.[1] ?? "", value: asNumber(match[1] ?? "", match[2] ?? "") };
    });
  })();

  const moduleTimers = [
    ...motion.matchAll(/\/\*\*[\s\S]*?§(8\.\d+)[\s\S]*?\*\/\s*export const (\w+) = ([\d_.]+);/g),
  ].map((match) => ({
    section: match[1] ?? "",
    value: Number((match[3] ?? "").replaceAll("_", "")),
    name: match[2] ?? "",
  }));

  const key = (timer: { section: string; value: number }) => `§${timer.section} ${timer.value}`;

  it("reads every timer §6 names, with the document's value", () => {
    expect(documentTimers.length).toBeGreaterThan(0);
    expect(moduleTimers.map(key).sort()).toEqual(documentTimers.map(key).sort());
  });

  it("holds no timer of its own", () => {
    const exported = [...motion.matchAll(/export const (\w+) =/g)].map((match) => match[1]);
    expect(exported.sort()).toEqual(moduleTimers.map((timer) => timer.name).sort());
  });
});

/** `Space Grotesk Bold` → the family and the weight the scale asks of it. */
const WEIGHTS: Record<string, number> = {
  Regular: 400,
  Medium: 500,
  SemiBold: 600,
  Bold: 700,
};

describe("C-39 · every §3 type token is in the scale", () => {
  // The family each face is reached by: §3's own block says which variable carries it.
  const familyVariable = new Map(
    [...declarations(cssBlock("3"))].map(([name, value]) => [
      /'([^']+)'/.exec(value)?.[1] ?? "",
      name,
    ]),
  );

  /** §3's table: `| display-xl | Space Grotesk Bold | 32/38 | Page titles |`. */
  const rows = [...section("3").matchAll(/^\| ([a-z][\w-]+) \| ([^|]+) \| ([^|]+) \|/gm)].map(
    (match) => {
      const face = (match[2] ?? "").trim();
      const weight = face.split(" ").at(-1) ?? "";
      const metrics = (match[3] ?? "").split(",").map((part) => part.trim());
      const [size, line] = (metrics[0] ?? "").split("/");
      return {
        token: match[1] ?? "",
        family: familyVariable.get(face.slice(0, face.length - weight.length).trim()) ?? "",
        weight: WEIGHTS[weight] ?? 0,
        size: `${size}px`,
        line: `${line}px`,
        tracking: metrics.find((part) => /^[+−-][\d.]+%$/.test(part)) ?? null,
        uppercase: metrics.includes("UPPERCASE"),
      };
    },
  );

  /** Every declaration that reaches `.type-<token>`, the shared selectors included. */
  function styles(token: string): Map<string, string> {
    const applied = new Map<string, string>();
    for (const rule of stripComments(globals).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = (rule[1] ?? "").split(",").map((one) => one.trim());
      if (!selectors.includes(`.type-${token}`)) continue;
      for (const line of (rule[2] ?? "").split(";")) {
        const match = /([\w-]+)\s*:\s*(.+)/.exec(line.trim());
        if (match?.[1] && match[2]) applied.set(match[1], match[2].trim());
      }
    }
    return applied;
  }

  it("reads §3's whole table", () => {
    // Seventeen rows: the table is the type scale, and a regex that matched fewer would
    // make every assertion below vacuous for the ones it missed.
    expect(rows.map((row) => row.token)).toEqual([
      "display-xl",
      "display-lg",
      "display-md",
      "display-num",
      "ui-headline",
      "ui-button",
      "ui-input",
      "ui-subhead",
      "ui-button-sm",
      "ui-body",
      "ui-footnote",
      "ui-label",
      "ui-caption",
      "mono-code",
      "mono-readout",
      "mono-micro",
      "special-otp",
    ]);
  });

  it.each(rows.map((row) => [row.token, row] as const))(
    "%s carries its face, weight, size, line, tracking and case",
    (token, row) => {
      const applied = styles(token);
      expect(applied.get("font-family"), "face").toBe(`var(${row.family})`);
      expect(applied.get("font-weight"), "weight").toBe(String(row.weight));
      expect(applied.get("font-size"), "size").toBe(row.size);
      expect(applied.get("line-height"), "line").toBe(row.line);

      // §3: "Space Grotesk styles: letter-spacing −1%", and a row states its own tracking
      // where it has one. A token with neither carries no letter-spacing at all.
      const tracking =
        row.tracking === null
          ? row.family === "--font-display"
            ? "-0.01em"
            : undefined
          : `${row.tracking.replace("−", "-").replace("+", "").replace("%", "")}`.replace(
              /^([\d.-]+)$/,
              (percent) => `${Number(percent) / 100}em`,
            );
      expect(applied.get("letter-spacing"), "tracking").toBe(tracking);

      expect(applied.get("text-transform"), "case").toBe(row.uppercase ? "uppercase" : undefined);
    },
  );
});

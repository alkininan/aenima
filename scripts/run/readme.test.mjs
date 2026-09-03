import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T0.98 — the README under scripts/run/ stays in step with the protocol and the directory.
 * A README that lists nine steps, or omits the script somebody added last week, is worse
 * than none: it reads as complete.
 */

const dir = join(import.meta.dirname);
const readme = readFileSync(join(dir, "README.md"), "utf8");

/** Guidelines §5, step numbers and names, in order. */
const STEPS = [
  "0 Preflight",
  "1 Claim",
  "2 Inline",
  "3 Branch",
  "4 Build",
  "5 Review",
  "6 Migration",
  "7 Gate",
  "8 Report",
  "9 Close",
];

/** `## heading` sections of the README: `{ heading, paragraphs }`, in document order. */
function sections(text) {
  const parts = text.split(/^## /m).slice(1);
  return parts.map((part) => {
    const [heading, ...rest] = part.split("\n");
    const paragraphs = rest
      .join("\n")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    return { heading: heading.trim(), paragraphs };
  });
}

/** Every script in the directory that is a step's, not a helper's and not a test's. */
function stepScripts() {
  return readdirSync(dir).filter(
    (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs") && name !== "cli.mjs",
  );
}

describe("scripts/run/README.md", () => {
  // AC1
  it("has the ten steps of guidelines §5 as sections, in order", () => {
    expect(sections(readme).map((s) => s.heading)).toEqual(STEPS);
  });

  // AC1
  it("has exactly one paragraph under each step", () => {
    for (const section of sections(readme)) {
      expect(section.paragraphs, section.heading).toHaveLength(1);
    }
  });

  // AC2
  it("names every step script by file name", () => {
    const scripts = stepScripts();
    expect(scripts.length).toBeGreaterThan(0);
    const body = sections(readme)
      .flatMap((s) => s.paragraphs)
      .join("\n");
    for (const script of scripts) {
      expect(body, script).toContain(`\`${script}\``);
    }
  });
});

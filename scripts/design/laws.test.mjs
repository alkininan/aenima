import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AGENT_ALLOWED,
  BLUR_ALLOWED,
  blurDeclarations,
  classUses,
  componentRules,
  copyOffenders,
  DANGER_ALLOWED,
  declarationLiteral,
  DOT_GRID_ALLOWED,
  GLASS_ALLOWED,
  GLASS_BLUR_ALLOWED,
  GLOBALS,
  isLiteralShadow,
  literalOffenders,
  outside,
  pageGrounds,
  scrollbarClashes,
  stringValues,
  tokenUses,
  utilities,
  utilityLiteral,
} from "./laws.mjs";

const root = join(import.meta.dirname, "../..");
const globals = readFileSync(join(root, GLOBALS), "utf8");

/** What a list of offenders says, one line each, so a red run names what it found. */
const named = (offenders) =>
  offenders.map(
    (offender) => `${offender.path}:${offender.line} ${offender.context} — ${offender.found}`,
  );

/** A utility as the scan reads it: variants off first, then the detector. */
const literal = (utility, hasDuration = false) =>
  utilityLiteral(utilities(utility)[0] ?? "", { hasDuration })?.kind ?? null;

// TC2 → AC2. C-06 and C-39's literal clause, over the stylesheet's component rules and every
// class string in src/app and src/components.
describe("C-06 and C-39 · no literal in a component stylesheet (T0.38)", () => {
  it("finds none in the repository, the literals C-06 names excepted", () => {
    expect(named(literalOffenders(root))).toEqual([]);
  });

  it("reads a colour, a radius, a duration, a shadow and a z-index written as a literal", () => {
    expect(literal("border-[rgba(120,126,136,.72)]")).toBe("colour");
    expect(literal("hover:bg-red-500")).toBe("colour");
    expect(literal("text-white")).toBe("colour");
    expect(literal("md:rounded-[27px]")).toBe("radius");
    expect(literal("rounded-full")).toBe("radius");
    expect(literal("rounded-xl")).toBe("radius");
    expect(literal("duration-150")).toBe("duration");
    expect(literal("animate-pulse")).toBe("duration");
    expect(literal("transition-colors")).toBe("duration");
    expect(literal("shadow-lg")).toBe("shadow");
    expect(literal("shadow-[0_2px_4px_rgba(0,0,0,.3)]")).toBe("colour");
    expect(literal("z-10")).toBe("z-index");
    expect(literal("z-[1]")).toBe("z-index");
    expect(literal("[z-index:3]")).toBe("z-index");
  });

  it("reads a font size or a line height written as a literal (C-39)", () => {
    expect(literal("text-sm")).toBe("font-size");
    expect(literal("text-[13px]")).toBe("font-size");
    expect(literal("leading-6")).toBe("line-height");
    expect(declarationLiteral("font-size", "13px")?.kind).toBe("font-size");
    expect(declarationLiteral("line-height", "22px")?.kind).toBe("line-height");
  });

  it("passes a token, one of §4's rungs, and a calc or color-mix on a token", () => {
    for (const utility of [
      "rounded-pill",
      "rounded-l-lg",
      "rounded-[calc(var(--r-panel)-var(--panel-pad))]",
      "duration-[var(--t-fast)]",
      "z-[var(--z-modal)]",
      "z-[calc(var(--z-content)+1)]",
      "shadow-[inset_0_1px_0_var(--edge-highlight-card)]",
      "[--glass-elevation:var(--shadow-float)]",
      "bg-prime/40",
      "text-n-white",
      "border-glass-border-hover",
      "type-ui-label",
      "text-n-secondary",
    ])
      expect(literal(utility), utility).toBeNull();
    expect(literal("transition-colors", true)).toBeNull();
    expect(declarationLiteral("z-index", "calc(var(--z-content) - 1)")).toBeNull();
    expect(declarationLiteral("transition-duration", "0ms")).toBeNull();
    expect(
      declarationLiteral("background-color", "color-mix(in srgb, var(--bg-base) 12%, transparent)"),
    ).toBeNull();
  });

  it("reads a shadow as literal only when it carries its own colour or bare geometry", () => {
    expect(isLiteralShadow("0 0 #0000")).toBe(true);
    expect(isLiteralShadow("0 8px 24px black")).toBe(true);
    expect(isLiteralShadow("0 0 transparent")).toBe(false);
    expect(isLiteralShadow("inset 0 1px 0 var(--edge-highlight)")).toBe(false);
    expect(isLiteralShadow("var(--control-edge), var(--control-glow)")).toBe(false);
  });

  it("reads class strings from the syntax tree: a comment is not a class, a + chain is one list", () => {
    const values = stringValues(
      "x.tsx",
      [
        "// rounded-[27px] in a comment",
        'const A = "transition-colors " + "duration-[var(--t-fast)]";',
        "const B = { danger: `bg-danger-deep` };",
      ].join("\n"),
    );
    expect(values.map((value) => [value.context, value.value])).toEqual([
      ["A", "transition-colors  duration-[var(--t-fast)]"],
      ["B.danger", "bg-danger-deep"],
    ]);
    expect(utilities("md:hover:rounded-[27px] [--x:var(--y)] !z-10")).toEqual([
      "rounded-[27px]",
      "[--x:var(--y)]",
      "z-10",
    ]);
  });

  it("does not read the token layer as a component: :root, @theme, the §3 type scale", () => {
    const selectors = componentRules(globals).map((rule) => rule.selector);
    expect(selectors).not.toContain(":root");
    expect(selectors.some((selector) => selector.startsWith(".type-"))).toBe(false);
    expect(selectors).toContain(".field-label");
  });
});

// TC3 → AC3, the half that can run: C-33's scan over the dictionaries.
describe("C-33 · the UI strings (T0.38)", () => {
  it("are sentence case, carry no exclamation mark, and never say test, fail or violation", () => {
    expect(named(copyOffenders(root))).toEqual([]);
  });
});

// TC4 → AC4. C-35 to C-38, each use read against its allowlist by where it sits.
describe("C-35–C-38 · the allowlists (T0.38)", () => {
  it("C-35 the danger tokens stand only on the Danger button, field errors and destructive rows", () => {
    const uses = tokenUses(root, "danger");
    expect(uses.length).toBeGreaterThan(0);
    expect(named(outside(uses, DANGER_ALLOWED))).toEqual([]);
  });

  it("C-36 the agent tokens stand only on proposal cards, the spinner, the caret, a chart series", () => {
    expect(named(outside(tokenUses(root, "agent"), AGENT_ALLOWED))).toEqual([]);
  });

  it("C-37 backdrop-filter is the blurred class's alone, on sticky bars, panels and toasts", () => {
    expect(named(outside(blurDeclarations(root), BLUR_ALLOWED))).toEqual([]);
    expect(named(outside(classUses(root, "glass-blur"), GLASS_BLUR_ALLOWED))).toEqual([]);
    expect(named(outside(classUses(root, "glass"), GLASS_ALLOWED))).toEqual([]);
  });

  it("C-37 modals, sheets and the pipeline strip carry the unblurred class and not the blurred", () => {
    const blurred = new Set(classUses(root, "glass-blur").map((use) => use.context));
    for (const context of ["MODAL_BASE", "SHEET_BASE", "PipelineStrip"]) {
      expect(
        classUses(root, "glass").some((use) => use.context === context),
        context,
      ).toBe(true);
      expect(blurred.has(context), context).toBe(false);
    }
  });

  it("C-38 the dot grid stands only on login and empty states, and every page ground is --bg-base", () => {
    expect(named(outside(classUses(root, "dot-grid"), DOT_GRID_ALLOWED))).toEqual([]);
    expect(named(pageGrounds(root))).toEqual([]);
  });
});

// TC5 → AC5. C-50, the grep half: the browser half runs in Firefox and is not this suite's.
describe("C-50 · the scrollbar rules never meet (T0.38)", () => {
  it("gives no element both ::-webkit-scrollbar rules and the standard properties", () => {
    expect(scrollbarClashes(globals)).toEqual([]);
  });

  it("finds the clash when the standard properties leave §4's gate", () => {
    const css = [
      ".a { scrollbar-width: thin; }",
      ".a::-webkit-scrollbar { width: 8px; }",
      "@supports not selector(::-webkit-scrollbar) { .b { scrollbar-width: thin; } }",
      ".b::-webkit-scrollbar-thumb:hover { background: red; }",
    ].join("\n");
    expect(scrollbarClashes(css).map((clash) => clash.context)).toEqual([".a"]);
  });
});

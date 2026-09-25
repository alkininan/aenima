import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

/**
 * T0.38. The design laws §17 checks by grep, read over the repository rather than by eye:
 *
 *   C-06 no literal colour, radius, duration, shadow or z-index in a component stylesheet
 *   C-39 (its literal clause) no literal font-size or line-height in a component
 *   C-33 (its scan) UI strings in sentence case, no exclamation marks, never test/fail/violation
 *   C-35–C-38 the danger, violet, blur and dot-grid allowlists, and the page ground
 *   C-50 no element takes both `::-webkit-scrollbar` rules and the standard properties
 *
 * "Component stylesheet" is two things here, because the repository styles in two places:
 * the rules of `src/app/globals.css` outside the token layer (`:root`, `@theme`, the §3 type
 * scale's `.type-*` classes, which *are* the type tokens), and the Tailwind class strings in
 * `src/app` and `src/components`. A class string is read from the TypeScript syntax tree,
 * never from the raw text, so a comment that quotes a literal is not an offender and a
 * string split across `+` is read as the one class list it is.
 *
 * Every detector returns offenders as `{ path, line, context, found }`. `context` is where a
 * usage sits — the rule's selector in CSS, the enclosing declaration and object key in
 * TypeScript (`BUTTON_VARIANT_CLASSES.danger`) — and it is what the allowlists name, so a
 * token that moves to a surface the law does not allow turns the check red even when the
 * file is one the allowlist already mentions.
 */

export const GLOBALS = "src/app/globals.css";
export const DICTIONARIES = "src/i18n";

// ---------------------------------------------------------------------------------------------
// Sources

/** Every non-test TypeScript source under src/app and src/components. */
export function componentFiles(root) {
  return globSync(["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"], { cwd: root })
    .filter((path) => !/\.(test|spec)\.tsx?$/.test(path) && !path.endsWith(".d.ts"))
    .sort();
}

/** The dictionaries: every module under src/i18n that holds strings, not the plumbing. */
export function dictionaryFiles(root) {
  return globSync(`${DICTIONARIES}/*.ts`, { cwd: root })
    .filter((path) => !/(index|locales)\.ts$|\.test\.ts$/.test(path))
    .sort();
}

export function read(root, path) {
  return readFileSync(join(root, path), "utf8");
}

// ---------------------------------------------------------------------------------------------
// CSS

/** Comments blanked to spaces, so offsets and line numbers still hold. */
function blankComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

/**
 * Every rule in a stylesheet: its selector, the at-rules around it (outermost first), its
 * own declarations, and the line it opens on. Nested rules are rules of their own; a rule's
 * declarations are only the text directly inside its braces.
 */
export function cssRules(css) {
  const text = blankComments(css);
  const rules = [];
  const stack = [];
  let segment = 0;
  const lineAt = (offset) => text.slice(0, offset).split("\n").length;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "{") {
      const prelude = text.slice(segment, i).trim();
      const frame = {
        prelude,
        own: [],
        line: lineAt(
          segment + (text.slice(segment, i).length - text.slice(segment, i).trimStart().length),
        ),
      };
      stack.push(frame);
      segment = i + 1;
    } else if (char === "}") {
      const frame = stack.pop();
      if (!frame) continue;
      frame.own.push(text.slice(segment, i));
      if (!frame.prelude.startsWith("@")) {
        rules.push({
          selector: frame.prelude.replace(/\s+/g, " "),
          context: stack.map((outer) => outer.prelude.replace(/\s+/g, " ")),
          declarations: declarationsOf(frame.own.join("")),
          line: frame.line,
        });
      }
      segment = i + 1;
      if (stack.length > 0) stack.at(-1).own.push("");
    } else if (char === ";" && stack.length > 0) {
      stack.at(-1).own.push(text.slice(segment, i + 1));
      segment = i + 1;
    }
  }
  return rules;
}

function declarationsOf(body) {
  return body
    .split(";")
    .map((part) => /^\s*([-\w]+)\s*:\s*([\s\S]+?)\s*$/.exec(part))
    .filter(Boolean)
    .map((match) => ({ property: match[1], value: match[2].replace(/\s+/g, " ") }));
}

/** The token layer: declarations that define the vocabulary rather than use it. */
function isTokenLayer(rule) {
  if (rule.selector === ":root") return true;
  if (rule.context.some((at) => at.startsWith("@theme") || at.startsWith("@font-face")))
    return true;
  // §3's type scale: each `.type-*` class is one row of the table, size and line included.
  return rule.selector.split(",").every((part) => part.trim().startsWith(".type-"));
}

/** The component rules of a stylesheet: everything outside the token layer. */
export function componentRules(css) {
  return cssRules(css).filter((rule) => !isTokenLayer(rule));
}

// ---------------------------------------------------------------------------------------------
// TypeScript class strings

const STRINGISH = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateExpression,
]);

function isPlusChain(node) {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    [node.left, node.right].every((side) => STRINGISH.has(side.kind) || isPlusChain(side))
  );
}

function textOf(node) {
  if (ts.isBinaryExpression(node)) return `${textOf(node.left)} ${textOf(node.right)}`;
  if (ts.isTemplateExpression(node))
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
  return node.text;
}

/** A string in a place that is not a value: an import, a type, a key, a directive. */
function isNotAValue(node) {
  const parent = node.parent;
  if (!parent) return true;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if (ts.isLiteralTypeNode(parent)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isExpressionStatement(parent)) return true; // "use client"
  if (ts.isExternalModuleReference(parent)) return true;
  return false;
}

function nameOf(node) {
  const name = node.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

/**
 * Where a string sits: the top-level declaration that holds it, the object keys between,
 * and the JSX element whose attribute it is, if any.
 */
function contextOf(node) {
  const keys = [];
  let top = null;
  let tag = null;
  for (let at = node.parent; at && !ts.isSourceFile(at); at = at.parent) {
    if (ts.isPropertyAssignment(at)) {
      const key = nameOf(at);
      if (key) keys.unshift(key);
    }
    if (!tag && ts.isJsxAttribute(at)) {
      const element = at.parent.parent;
      tag = element.tagName.getText();
    }
    if (ts.isSourceFile(at.parent)) {
      if (ts.isVariableStatement(at))
        top = at.declarationList.declarations.map((declaration) => nameOf(declaration)).join(",");
      else top = nameOf(at) ?? (ts.isExportAssignment(at) ? "default" : null);
    }
  }
  return { context: [top ?? "(module)", ...keys].join("."), tag };
}

/**
 * Every string value in a module, a `+` chain read as one string. Each carries its line,
 * its context, and the JSX tag whose attribute it is.
 */
export function stringValues(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = (node) => {
    if (isPlusChain(node) && !isPlusChain(node.parent)) {
      found.push(entry(node));
      return;
    }
    if (STRINGISH.has(node.kind) && !isPlusChain(node.parent) && !isNotAValue(node)) {
      found.push(entry(node));
      if (ts.isTemplateExpression(node))
        node.templateSpans.forEach((span) => visit(span.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  const entry = (node) => ({
    path,
    line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    value: textOf(node),
    ...contextOf(node),
  });
  visit(source);
  return found;
}

/**
 * A class list's utilities, each without its variants: `md:hover:rounded-[27px]` is
 * `rounded-[27px]`. Variants split on colons outside brackets, so an arbitrary property
 * like `[--glass-elevation:var(--shadow-float)]` stays whole.
 */
export function utilities(classList) {
  return classList
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      let depth = 0;
      let last = 0;
      for (let i = 0; i < token.length; i++) {
        if (token[i] === "[" || token[i] === "(") depth++;
        else if (token[i] === "]" || token[i] === ")") depth--;
        else if (token[i] === ":" && depth === 0) last = i + 1;
      }
      return token.slice(last).replace(/^!/, "");
    });
}

// ---------------------------------------------------------------------------------------------
// Literal detectors

const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/i;
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOUR_UTILITY = new RegExp(
  `^(?:bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|fill|stroke|outline|from|via|to|decoration|caret|accent|divide|placeholder|shadow|inset-shadow|drop-shadow)-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:/\\d+)?$`,
);

/** The bracketed value of an arbitrary utility or property, underscores read as spaces. */
const arbitrary = (utility) => /\[(.*)\]$/.exec(utility)?.[1]?.replace(/_/g, " ") ?? null;

/** `var(…)` and `color-mix(…)` removed, nested parentheses and all. */
function withoutTokens(value) {
  let out = value;
  for (let guard = 0; guard < 10 && /(?:var|color-mix)\(/.test(out); guard++) {
    out = out.replace(/(?:var|color-mix)\((?:[^()]|\([^()]*\))*\)/g, " ");
  }
  return out;
}

/**
 * A shadow is literal when it names a colour of its own, or has geometry and no token at
 * all. `inset 0 1px 0 var(--edge-highlight)` is §5's own recipe, a token's shadow; `0 0
 * transparent` is the empty slot a composed shadow starts from, and says nothing.
 */
export function isLiteralShadow(value) {
  if (/^(?:none|inherit|initial|unset)$/.test(value.trim())) return false;
  if (COLOUR_LITERAL.test(withoutTokens(value))) return true;
  if (/var\(/.test(value)) return false;
  return /[1-9]/.test(value.replace(/\b(?:inset|transparent|currentColor)\b/g, ""));
}

/** A duration that is a value: `0ms` and `0s` are the absence of one (§6's press). */
function literalDurations(value) {
  return [...withoutTokens(value).matchAll(/(?<![\w-])(\d*\.?\d+)(m?s)\b/g)]
    .map((match) => match[0])
    .filter((duration) => Number.parseFloat(duration) !== 0);
}

const isTokenValue = (value) =>
  /^(?:var\(|calc\([\s\S]*var\(|inherit$|initial$|unset$|auto$)/.test(value.trim());

/** C-06 and C-39's literal clause over one utility. Returns what it found, or null. */
export function utilityLiteral(utility, { hasDuration }) {
  const value = arbitrary(utility);
  if (COLOUR_UTILITY.test(utility)) return { law: "C-06", kind: "colour" };
  if (value !== null && COLOUR_LITERAL.test(withoutTokens(value)))
    return { law: "C-06", kind: "colour" };

  if (
    /^rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?(?:-(?:none|full|xl|2xl|3xl|4xl))?$/.test(
      utility,
    )
  )
    return { law: "C-06", kind: "radius" };
  if (/^rounded(?:-[a-z]+)?-\[/.test(utility) && !isTokenValue(value))
    return { law: "C-06", kind: "radius" };

  if (
    /^(?:duration|delay)-(?:\d+|\[.*\])$/.test(utility) &&
    (value === null || !isTokenValue(value))
  )
    return { law: "C-06", kind: "duration" };
  if (/^animate-(?:spin|ping|pulse|bounce)$/.test(utility))
    return { law: "C-06", kind: "duration" };
  // Tailwind's transition utilities carry a default duration of their own (150ms), so one
  // with no duration utility beside it is a literal duration in all but name.
  if (
    /^transition(?:-(?:all|colors|opacity|shadow|transform|\[.*\]))?$/.test(utility) &&
    !hasDuration
  )
    return { law: "C-06", kind: "duration" };

  if (
    /^(?:shadow|inset-shadow|drop-shadow|text-shadow)(?:-(?:2xs|xs|sm|md|lg|xl|2xl|inner|none))?$/.test(
      utility,
    )
  )
    return { law: "C-06", kind: "shadow" };
  if (/^(?:shadow|inset-shadow|drop-shadow)-\[/.test(utility) && isLiteralShadow(value))
    return { law: "C-06", kind: "shadow" };

  if (/^-?z-\d+$/.test(utility)) return { law: "C-06", kind: "z-index" };
  if (/^-?z-\[/.test(utility) && !isTokenValue(value)) return { law: "C-06", kind: "z-index" };

  if (/^text-(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/.+)?$/.test(utility))
    return { law: "C-39", kind: "font-size" };
  if (/^text-\[(?:length:)?\d/.test(utility)) return { law: "C-39", kind: "font-size" };
  if (
    /^leading-(?:none|tight|snug|normal|relaxed|loose|\d+|\[.*\])$/.test(utility) &&
    (value === null || !isTokenValue(value))
  )
    return { law: "C-39", kind: "line-height" };

  // An arbitrary property: `[z-index:3]`, `[box-shadow:…]`, `[font-size:13px]`.
  const property = /^\[([-\w]+):(.*)\]$/.exec(utility);
  if (property) return declarationLiteral(property[1], property[2].replace(/_/g, " "));
  return null;
}

/** C-06 and C-39's literal clause over one CSS declaration. */
export function declarationLiteral(property, value) {
  if (COLOUR_LITERAL.test(withoutTokens(value))) return { law: "C-06", kind: "colour" };
  if (/radius$/.test(property) && !isTokenValue(value) && !/^0(?:px)?$/.test(value.trim()))
    return { law: "C-06", kind: "radius" };
  if (
    /^(?:transition|animation)(?:-duration|-delay)?$/.test(property) &&
    literalDurations(value).length > 0
  )
    return { law: "C-06", kind: "duration", value: literalDurations(value).join(" ") };
  if (/(?:^|-)shadow$/.test(property) && isLiteralShadow(value))
    return { law: "C-06", kind: "shadow" };
  if (property === "z-index" && !isTokenValue(value)) return { law: "C-06", kind: "z-index" };
  if ((property === "font-size" || property === "line-height") && !isTokenValue(value))
    return { law: "C-39", kind: property };
  if (property === "font" && /\d/.test(withoutTokens(value))) return { law: "C-39", kind: "font" };
  return null;
}

/**
 * The literals C-06 itself names — "a mechanism and not a value" — each pinned to the one
 * place it may stand, so the same literal anywhere else is still an offender.
 */
export const C06_NAMED = [
  // §8.19: the tab underline's 2.
  {
    path: "src/components/ui/variants.ts",
    context: "TAB_UNDERLINE_CLASSES",
    found: "rounded-[2px]",
  },
  // §8.7: the checkbox's 6.
  {
    path: "src/components/ui/variants.ts",
    context: "CHECK_BOX_SHAPE.checkbox",
    found: "rounded-[6px]",
  },
  // §8.2: the autofill override's 9999s.
  { path: GLOBALS, context: "input:-webkit-autofill", found: "transition: background-color 9999s" },
  // §3: root 16px — the type scale's own root, which every px in the document is read against.
  { path: GLOBALS, context: "html", found: "font-size: 16px" },
];

const isNamed = (offender) =>
  C06_NAMED.some(
    (named) =>
      named.path === offender.path &&
      named.context === offender.context &&
      named.found === offender.found,
  );

/** C-06 and C-39's literal clause over the stylesheet and every class string. */
export function literalOffenders(root) {
  const offenders = [];
  for (const rule of componentRules(read(root, GLOBALS))) {
    for (const { property, value } of rule.declarations) {
      const hit = declarationLiteral(property, value);
      if (hit)
        offenders.push({
          ...hit,
          path: GLOBALS,
          line: rule.line,
          context: rule.selector,
          found: `${property}: ${value}`,
        });
    }
  }
  for (const path of componentFiles(root)) {
    for (const string of stringValues(path, read(root, path))) {
      const all = utilities(string.value);
      const hasDuration = all.some((utility) => /^duration-/.test(utility));
      for (const utility of all) {
        const hit = utilityLiteral(utility, { hasDuration });
        if (hit)
          offenders.push({
            ...hit,
            path,
            line: string.line,
            context: string.context,
            found: utility,
          });
      }
    }
  }
  return offenders.filter((offender) => !isNamed(offender));
}

// ---------------------------------------------------------------------------------------------
// Allowlists — C-35 to C-38

/**
 * C-35: "`--danger`, `--danger-deep` and `--danger-soft` appear only in the Danger button,
 * field error states, diff deletions and destructive menu rows."
 */
export const DANGER_ALLOWED = [
  {
    path: "src/components/ui/variants.ts",
    context: "BUTTON_VARIANT_CLASSES.danger",
    why: "the Danger button",
  },
  {
    path: "src/components/ui/variants.ts",
    context: "BUTTON_DISABLED_CLASSES.danger",
    why: "the Danger button, disabled",
  },
  {
    path: "src/components/ui/variants.ts",
    context: "inputFieldClasses",
    why: "a field's error state",
  },
  {
    path: "src/components/ui/variants.ts",
    context: "INPUT_HELPER_TONE_CLASSES.error",
    why: "a field's error state",
  },
  {
    path: "src/components/ui/variants.ts",
    context: "otpBoxClasses",
    why: "a field's error state (the OTP box)",
  },
  {
    path: GLOBALS,
    context: ".field-pill:has(.field-input[aria-invalid]) .field-icon-leading",
    why: "a field's error state",
  },
  {
    path: "src/components/ui/variants.ts",
    context: "panelRowClasses",
    why: "a destructive menu row",
  },
];

/**
 * C-36: "`--agent`, `--agent-deep` and `--agent-soft` appear only in proposal cards — the
 * triage card and a proposed patch's card among them — the agent spinner, the stream caret
 * and an agent series in a chart." None of the four is built yet, so nothing may carry them.
 */
export const AGENT_ALLOWED = [];

/**
 * C-37: "`backdrop-filter` appears only in the glass recipe's blurred class, applied only to
 * sticky bars, panels and toasts, and in the morph's rules …; modals, sheets and the pipeline
 * strip carry the recipe's unblurred class, and nothing outside §5's list carries either."
 * The morph is not built, so the blurred class is the one rule that declares it.
 */
export const BLUR_ALLOWED = [{ path: GLOBALS, context: ".glass-blur", why: "the blurred class" }];

/** Where the blurred class may be applied: sticky bars, panels and toasts. */
export const GLASS_BLUR_ALLOWED = [
  { path: "src/components/ui/variants.ts", context: "TOAST_BASE", why: "a toast" },
];

/** Where the recipe may be applied at all: §5's list. */
export const GLASS_ALLOWED = [
  ...GLASS_BLUR_ALLOWED,
  { path: "src/components/ui/variants.ts", context: "MODAL_BASE", why: "a modal" },
  { path: "src/components/ui/variants.ts", context: "SHEET_BASE", why: "a sheet" },
  { path: "src/app/app/PipelineStrip.tsx", context: "PipelineStrip", why: "the pipeline strip" },
  {
    path: "src/app/app/loading.tsx",
    context: "AppLoading",
    why: "the pipeline strip, standing in while the list loads",
  },
];

/** C-38: "The dot-grid class is applied only on login, empty states, error pages and the hero." */
export const DOT_GRID_ALLOWED = [
  { path: "src/app/sign-in/page.tsx", context: "SignInPage", why: "login" },
  { path: "src/components/ui/variants.ts", context: "emptyStateClasses", why: "empty states" },
];

/** Every use of a token family, in CSS by `var()` and in class strings by utility. */
export function tokenUses(root, family) {
  const inCss = new RegExp(`var\\(--${family}(?:-[\\w-]+)?\\)`);
  const inClass = new RegExp(`^[a-z-]+-${family}(?:-deep|-soft)?(?:/\\d+)?$`);
  const uses = [];
  for (const rule of componentRules(read(root, GLOBALS))) {
    for (const { property, value } of rule.declarations) {
      if (inCss.test(value))
        uses.push({
          path: GLOBALS,
          line: rule.line,
          context: rule.selector,
          found: `${property}: ${value}`,
        });
    }
  }
  for (const path of componentFiles(root)) {
    for (const string of stringValues(path, read(root, path))) {
      for (const utility of utilities(string.value)) {
        const value = arbitrary(utility);
        if (inClass.test(utility) || (value !== null && inCss.test(value)))
          uses.push({ path, line: string.line, context: string.context, found: utility });
      }
    }
  }
  return uses;
}

/** Every string value that carries a class, by name. */
export function classUses(root, className) {
  const uses = [];
  for (const path of componentFiles(root)) {
    for (const string of stringValues(path, read(root, path))) {
      if (utilities(string.value).includes(className))
        uses.push({ path, line: string.line, context: string.context, found: className });
    }
  }
  return uses;
}

/** Uses whose `path` and `context` no allowlist entry names. */
export function outside(uses, allowlist) {
  return uses.filter(
    (use) =>
      !allowlist.some((allowed) => allowed.path === use.path && allowed.context === use.context),
  );
}

/**
 * C-37's first half: `backdrop-filter` declared anywhere but the rules that may carry it,
 * and every Tailwind utility that would declare it.
 */
export function blurDeclarations(root) {
  const uses = [];
  for (const rule of componentRules(read(root, GLOBALS))) {
    for (const { property, value } of rule.declarations) {
      if (/backdrop-filter$/.test(property))
        uses.push({
          path: GLOBALS,
          line: rule.line,
          context: rule.selector,
          found: `${property}: ${value}`,
        });
    }
  }
  for (const path of componentFiles(root)) {
    for (const string of stringValues(path, read(root, path))) {
      for (const utility of utilities(string.value)) {
        if (/^backdrop-|^\[(?:-webkit-)?backdrop-filter:/.test(utility))
          uses.push({ path, line: string.line, context: string.context, found: utility });
      }
    }
  }
  return uses;
}

/**
 * C-38's second half: a page ground other than `--bg-base`, set on `html`, `body` or a
 * route's `main` — in CSS, or by a background utility on the element.
 */
export function pageGrounds(root) {
  const grounds = [];
  for (const rule of componentRules(read(root, GLOBALS))) {
    if (!/^(?:html|body|main)$/.test(rule.selector)) continue;
    for (const { property, value } of rule.declarations) {
      if (/^background(?:-color)?$/.test(property) && value !== "var(--bg-base)")
        grounds.push({
          path: GLOBALS,
          line: rule.line,
          context: rule.selector,
          found: `${property}: ${value}`,
        });
    }
  }
  for (const path of componentFiles(root)) {
    for (const string of stringValues(path, read(root, path))) {
      if (!/^(?:html|body|main)$/.test(string.tag ?? "")) continue;
      for (const utility of utilities(string.value)) {
        if (/^bg-/.test(utility) && utility !== "bg-bg-base")
          grounds.push({ path, line: string.line, context: `<${string.tag}>`, found: utility });
      }
    }
  }
  return grounds;
}

// ---------------------------------------------------------------------------------------------
// C-50

/**
 * Every element that takes both kinds of scrollbar rule: a selector with `::-webkit-scrollbar`
 * rules whose base also carries `scrollbar-color` or `scrollbar-width` outside §4's gate,
 * `@supports not selector(::-webkit-scrollbar)`.
 */
export function scrollbarClashes(css) {
  const rules = cssRules(css);
  const gated = (rule) =>
    rule.context.some((at) => /^@supports not selector\(\s*::-webkit-scrollbar\s*\)$/.test(at));
  const webkit = new Set(
    rules
      .filter((rule) => rule.selector.includes("::-webkit-scrollbar"))
      .flatMap((rule) =>
        rule.selector
          .split(",")
          .map((part) => part.trim().replace(/::-webkit-scrollbar[\w-]*(?::[\w-]+)*$/, "")),
      ),
  );
  return rules
    .filter((rule) => !gated(rule))
    .filter((rule) =>
      rule.declarations.some(({ property }) => /^scrollbar-(?:color|width)$/.test(property)),
    )
    .filter((rule) => rule.selector.split(",").some((part) => webkit.has(part.trim())))
    .map((rule) => ({ path: GLOBALS, line: rule.line, context: rule.selector }));
}

// ---------------------------------------------------------------------------------------------
// C-33 — the strings

/**
 * Words that keep their capital mid-sentence: names, acronyms, product-spec §5's two tags,
 * which the product writes as proper nouns ("accepting a Must is the Decider's call"), and
 * product-spec §14's role names and its Decider.
 */
export const CAPITALISED = new Set([
  "AI",
  "PRD",
  "ID",
  "IDs",
  "OTP",
  "URL",
  "API",
  "EN",
  "TR",
  "NL",
  "UTC",
  "Must",
  "Musts",
  "Should",
  "Shoulds",
  "Owner",
  "Product",
  "Developer",
  "Viewer",
  "Decider",
  "Notion",
  "Figma",
  "Slack",
  "Teams",
  "Fireflies",
  "Gmail",
  "Drive",
  "GitHub",
  "Jira",
  "Linear",
]);

/** Names of more than one word, read as one: product-spec §3's artifact names. */
export const NAMES = ["Opportunity Brief"];

/** Each string value of the dictionaries, with what C-33's scan finds in it. */
export function copyOffenders(root) {
  const offenders = [];
  for (const path of dictionaryFiles(root)) {
    for (const string of stringValues(path, read(root, path))) {
      const text = NAMES.reduce(
        (out, name) => out.replaceAll(name, name.split(" ")[0]),
        string.value,
      );
      const report = (found) =>
        offenders.push({ path, line: string.line, context: string.context, found });
      if (text.includes("!")) report(`an exclamation mark: ${text}`);
      const banned = /\b(test|fail|violation)\b/i.exec(text);
      if (banned) report(`"${banned[1]}": ${text}`);
      // Sentence case: a capital opens a sentence, a clause after a colon, or a label
      // after a separator; anywhere else it has to be a name the list above carries.
      for (const segment of text.split(/(?:[.?:;·—(]\s+|\s+[—·]\s+|^)/)) {
        const words = segment.trim().split(/\s+/).slice(1);
        for (const word of words) {
          const bare = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").replace(/'s$/, "");
          if (/^\p{Lu}/u.test(bare) && !CAPITALISED.has(bare))
            report(`"${bare}" mid-sentence: ${text}`);
        }
      }
    }
  }
  return offenders;
}

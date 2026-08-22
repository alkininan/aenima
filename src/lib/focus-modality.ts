/**
 * Input modality — which device last moved focus.
 *
 * design-spec.md §6 (v2.5) splits the focus treatment: pointer focus swaps a
 * field's border and stops there, while the ring and the glow are keyboard
 * affordances. §6 names `:focus-visible` as the mechanism, and for buttons and
 * links it is the right one.
 *
 * It is not sufficient for fields. A text input matches `:focus-visible` when
 * it is clicked — Chromium and Firefox both do this deliberately, because a
 * focused text input is about to receive keystrokes whatever put focus there.
 * So `:focus-visible` alone paints the ring on a mouse click, which is exactly
 * the double stroke the revision removes. Verified in Chromium before this
 * module was written, not assumed.
 *
 * What the split actually needs is the modality itself, so it is tracked on
 * `<html>` and the ring is gated on it in globals.css.
 *
 * The default is `keyboard`. Before anyone has touched anything there is no
 * pointer to have used, and the page may already have autofocused a field
 * (sign-in does) — a focused field with no visible affordance is worse than a
 * ring nobody asked for.
 */
export const FOCUS_MODALITY_ATTRIBUTE = "data-focus-modality";

export type FocusModality = "keyboard" | "pointer";

/**
 * Rendered onto `<html>` by the root layout, not left for the script to add:
 * an attribute that only appears client-side is a hydration mismatch, and
 * having it in the server's HTML also means the keyboard ring survives with
 * scripting off.
 */
export const DEFAULT_FOCUS_MODALITY: FocusModality = "keyboard";

/**
 * Keys that move or act on focus. A modifier or a character key does not
 * change modality: typing into a field you clicked into must not make a ring
 * appear under your cursor mid-word.
 */
export const FOCUS_KEYS: readonly string[] = [
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Enter",
  "Escape",
  " ",
];

/**
 * Inlined into the document head rather than run from a client component: it
 * has to be in place before the first paint, or an autofocused field renders
 * once with no modality set and the ring flickers on hydration. Self-contained
 * by necessity — an inline script cannot import — and kept to the smallest
 * thing that can express the rule. `src/lib/focus-modality.dom.test.ts` runs
 * this exact string.
 */
export const FOCUS_MODALITY_SCRIPT = `(function(){
var e=document.documentElement,k=${JSON.stringify(FOCUS_KEYS)};
function s(m){if(e.getAttribute("${FOCUS_MODALITY_ATTRIBUTE}")!==m)e.setAttribute("${FOCUS_MODALITY_ATTRIBUTE}",m)}
s(${JSON.stringify(DEFAULT_FOCUS_MODALITY)});
addEventListener("pointerdown",function(){s("pointer")},true);
addEventListener("keydown",function(v){if(k.indexOf(v.key)>-1)s("keyboard")},true);
})();`;

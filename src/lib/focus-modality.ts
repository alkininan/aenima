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
 * **There is no default: the attribute is absent until someone does something.**
 * It used to start on `keyboard`, on the reasoning that an autofocused field
 * with no visible affordance is worse than an unasked-for ring. That was wrong
 * in the one case it was written for. An autofocused field already shows a
 * caret, which is the affordance — so the ring adds a second stroke around a
 * field nobody has touched, which is the same double stroke §6 (v2.5) removed
 * from the mouse path. Sign-in is where it showed.
 *
 * Absent is also the honest value. "Which device last moved focus" has no answer
 * before any device has, and `keyboard` was asserting one. The ring appears on
 * the first Tab or focus key, which is the first moment there is something true
 * to say.
 *
 * The cost, and it is real: with scripting off, a field never gets a keyboard
 * ring, because nothing ever sets the attribute. Buttons and links are
 * unaffected — their ring is plain `:focus-visible` and needs no script. The app
 * does not work without JavaScript in any case, so this trades an affordance on
 * a path that is already broken for a correct one on the path people use.
 */
export const FOCUS_MODALITY_ATTRIBUTE = "data-focus-modality";

export type FocusModality = "keyboard" | "pointer";

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
 * Inlined into the document head rather than run from a client component, so the
 * listeners are attached before the page can paint — a Tab pressed on a
 * still-hydrating page has to land, and a listener added by an effect would miss
 * it.
 *
 * It sets nothing on load. The attribute stays absent until a pointer or a focus
 * key says which device is in use, which also means the server's HTML and the
 * client's DOM agree until the first real event, rather than agreeing because
 * both name the same invented default.
 *
 * Self-contained by necessity — an inline script cannot import — and kept to the
 * smallest thing that expresses the rule.
 * `src/lib/focus-modality.dom.test.ts` runs this exact string.
 */
export const FOCUS_MODALITY_SCRIPT = `(function(){
var e=document.documentElement,k=${JSON.stringify(FOCUS_KEYS)};
function s(m){if(e.getAttribute("${FOCUS_MODALITY_ATTRIBUTE}")!==m)e.setAttribute("${FOCUS_MODALITY_ATTRIBUTE}",m)}
addEventListener("pointerdown",function(){s("pointer")},true);
addEventListener("keydown",function(v){if(k.indexOf(v.key)>-1)s("keyboard")},true);
})();`;

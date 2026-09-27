/**
 * design-spec.md §8.20, and §11's rule that a global shortcut "goes quiet in a text field".
 *
 * §8.20: "While an undo shows, `Cmd/Ctrl+Z` triggers it when focus is not in a text
 * field." The exception is not politeness — inside a field that shortcut is the platform's
 * own undo, and taking it would silently discard what someone typed.
 *
 * A read-only field is not a text field for this purpose: nothing in it can be undone, so
 * there is no platform undo to take. That matters here rather than being a curiosity —
 * §8.5's select trigger is a read-only `<input>`, so a select is exactly the control a
 * person is most likely to have just used before reaching for the undo.
 */

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

export function isTextField(element: Element | null): boolean {
  if (!element) return false;

  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;

  if (element instanceof HTMLInputElement) {
    if (element.readOnly || element.disabled) return false;
    // An input with no type is a text input.
    return TEXT_INPUT_TYPES.has(element.type || "text");
  }

  // `isContentEditable` reads through an inherited `contenteditable`, which the
  // attribute on this element alone does not — but it is a property a DOM emulator may
  // not implement at all, and jsdom is one: it answers `undefined`, which would make a
  // plain `<button>` neither a text field nor not one. So the property is used where it
  // is really a boolean, and the attribute — read up the tree, which is the inheritance
  // the property would have given us — is what answers everywhere else.
  if (element instanceof HTMLElement && typeof element.isContentEditable === "boolean") {
    return element.isContentEditable;
  }
  const editable = element.closest("[contenteditable]")?.getAttribute("contenteditable");
  return editable === "" || editable === "true" || editable === "plaintext-only";
}

/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import { isTextField } from "./text-field";

function make(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild as Element;
}

describe("C-20 · where Cmd/Ctrl+Z belongs to the field instead", () => {
  it("is a text input", () => {
    expect(isTextField(make(`<input type="text">`))).toBe(true);
  });

  it("is a textarea", () => {
    expect(isTextField(make(`<textarea></textarea>`))).toBe(true);
  });

  it("is a contenteditable", () => {
    expect(isTextField(make(`<div contenteditable="true"></div>`))).toBe(true);
  });

  it("is not a checkbox or a button", () => {
    expect(isTextField(make(`<input type="checkbox">`))).toBe(false);
    expect(isTextField(make(`<button></button>`))).toBe(false);
  });

  /**
   * The select's own trigger is an input, and a read-only one: there is no text
   * to undo in it, so an undo toast's shortcut still belongs to the toast.
   */
  it("is not a read-only field", () => {
    expect(isTextField(make(`<input type="text" readonly>`))).toBe(false);
  });

  it("is nothing at all", () => {
    expect(isTextField(null)).toBe(false);
  });
});

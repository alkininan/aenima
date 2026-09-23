/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import { tabStopAround } from "./tab-stop";

function page(html: string) {
  document.body.innerHTML = html;
  return (id: string) => document.getElementById(id) as HTMLElement;
}

describe("C-17 · the stop on either side of a trigger", () => {
  it("finds the stop after the trigger", () => {
    const at = page(`
      <button id="before">before</button>
      <button id="trigger">trigger</button>
      <button id="after">after</button>
    `);
    expect(tabStopAround(at("trigger"), false)).toBe(at("after"));
  });

  it("finds the stop before the trigger", () => {
    const at = page(`
      <button id="before">before</button>
      <button id="trigger">trigger</button>
      <button id="after">after</button>
    `);
    expect(tabStopAround(at("trigger"), true)).toBe(at("before"));
  });

  it("skips a disabled control on the way", () => {
    const at = page(`
      <button id="trigger">trigger</button>
      <button id="skipped" disabled>skipped</button>
      <button id="after">after</button>
    `);
    expect(tabStopAround(at("trigger"), false)).toBe(at("after"));
  });

  it("answers null at either end of the document", () => {
    const at = page(`<button id="only">only</button>`);
    expect(tabStopAround(at("only"), false)).toBeNull();
    expect(tabStopAround(at("only"), true)).toBeNull();
  });

  it("finds the stop around a trigger that is not itself one", () => {
    // §6 hides the trigger for the panel's lifetime, so by the time Tab is
    // pressed the trigger may no longer be tabbable itself.
    const at = page(`
      <button id="before">before</button>
      <span id="wrap" style="visibility:hidden"><button id="trigger">t</button></span>
      <button id="after">after</button>
    `);
    expect(tabStopAround(at("wrap"), false)).toBe(at("after"));
    expect(tabStopAround(at("wrap"), true)).toBe(at("before"));
  });
});

import { describe, expect, it } from "vitest";

import { getFocusableElements, nextTrapTarget } from "@/lib/focus";

function container(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

/** design-spec.md §11: focus trapped inside modals. */
describe("getFocusableElements", () => {
  it("collects what Tab can reach, in DOM order", () => {
    const host = container(`
      <a href="#one">one</a>
      <button>two</button>
      <input />
      <div tabindex="0">four</div>
    `);
    expect(getFocusableElements(host).map((el) => el.tagName)).toEqual([
      "A",
      "BUTTON",
      "INPUT",
      "DIV",
    ]);
  });

  it("leaves out what Tab cannot", () => {
    const host = container(`
      <button disabled>disabled</button>
      <input disabled />
      <div tabindex="-1">programmatic only</div>
      <button hidden>hidden</button>
      <button aria-hidden="true">hidden from AT</button>
      <span>text</span>
    `);
    expect(getFocusableElements(host)).toEqual([]);
  });
});

describe("nextTrapTarget", () => {
  const host = container("<button>a</button><button>b</button><button>c</button>");
  const buttons = getFocusableElements(host);
  const [first, , last] = buttons;

  it("leaves the browser alone in the middle of the list", () => {
    expect(nextTrapTarget(buttons, buttons[1] ?? null, false)).toBeUndefined();
    expect(nextTrapTarget(buttons, buttons[1] ?? null, true)).toBeUndefined();
  });

  it("wraps forward off the end and backward off the start", () => {
    expect(nextTrapTarget(buttons, last ?? null, false)).toBe(first);
    expect(nextTrapTarget(buttons, first ?? null, true)).toBe(last);
  });

  it("pulls focus back in when it has escaped the container", () => {
    const outside = document.createElement("button");
    expect(nextTrapTarget(buttons, outside, false)).toBe(first);
    expect(nextTrapTarget(buttons, outside, true)).toBe(last);
    expect(nextTrapTarget(buttons, null, false)).toBe(first);
  });

  it("has nothing to do in an empty container", () => {
    expect(nextTrapTarget([], null, false)).toBeUndefined();
  });
});

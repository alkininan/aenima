/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";

import { getOverlayHost, pushOverlayHost, subscribeOverlayHost } from "./overlay-host";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("C-20 · where a toast is hosted", () => {
  it("is nowhere in particular while no modal is open", () => {
    expect(getOverlayHost()).toBeNull();
  });

  it("is the open modal's subtree while one is open", () => {
    const modal = document.createElement("div");
    document.body.append(modal);

    const release = pushOverlayHost(modal);
    expect(getOverlayHost()).toBe(modal);

    release();
    expect(getOverlayHost()).toBeNull();
  });

  it("is the innermost of two open modals, and falls back to the outer one", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    document.body.append(outer, inner);

    const releaseOuter = pushOverlayHost(outer);
    const releaseInner = pushOverlayHost(inner);
    expect(getOverlayHost()).toBe(inner);

    releaseInner();
    expect(getOverlayHost()).toBe(outer);
    releaseOuter();
  });

  it("tells a subscriber every time the host changes", () => {
    const listener = vi.fn();
    const off = subscribeOverlayHost(listener);
    const modal = document.createElement("div");

    const release = pushOverlayHost(modal);
    release();

    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });
});

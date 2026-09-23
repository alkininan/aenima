import { describe, expect, it, vi } from "vitest";

import {
  MORPH_CONTENT_NAME,
  MORPH_NAME,
  morphPath,
  runMorph,
  skipRunningMorph,
  type MorphElement,
} from "./morph";

function element(): MorphElement & { names: Record<string, string> } {
  const names: Record<string, string> = {};
  return {
    names,
    style: {
      setProperty(key: string, value: string) {
        names[key] = value;
      },
      removeProperty(key: string) {
        delete names[key];
      },
    },
  };
}

function host() {
  let resolve!: () => void;
  const finished = new Promise<void>((r) => {
    resolve = r;
  });
  const skipTransition = vi.fn(() => resolve());
  const startViewTransition = vi.fn((update: () => void) => {
    update();
    return { finished, skipTransition };
  });
  return { startViewTransition, skipTransition, settle: () => resolve(), finished };
}

describe("C-14 · which path an open takes", () => {
  it("runs one view transition when the engine has it and motion is not reduced", () => {
    expect(morphPath({ hasViewTransition: true, reducedMotion: false, forceFallback: false })).toBe(
      "transition",
    );
  });

  it("opens bare where startViewTransition is absent", () => {
    expect(morphPath({ hasViewTransition: false, reducedMotion: false, forceFallback: false })).toBe(
      "bare",
    );
  });

  it("opens bare under reduced motion", () => {
    expect(morphPath({ hasViewTransition: true, reducedMotion: true, forceFallback: false })).toBe(
      "bare",
    );
  });

  it("opens bare under data-force-fallback", () => {
    expect(morphPath({ hasViewTransition: true, reducedMotion: false, forceFallback: true })).toBe(
      "bare",
    );
  });
});

describe("C-14 · the transition path", () => {
  it("hands the name from the trigger to the panel inside the update callback", async () => {
    const trigger = element();
    const panel = element();
    const content = element();
    const h = host();
    const update = vi.fn(() => {
      // Inside the callback the trigger has given the name up and the panel has it:
      // two live elements sharing one name abort every transition on the page.
      expect(trigger.names["view-transition-name"]).toBeUndefined();
      expect(panel.names["view-transition-name"]).toBe(MORPH_NAME);
      expect(content.names["view-transition-name"]).toBe(MORPH_CONTENT_NAME);
    });

    runMorph({ trigger, panel, content, triggerHeight: 48, update, host: h });

    expect(h.startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("sets --morph-r0 to half the trigger's height", () => {
    const trigger = element();
    const panel = element();
    const h = host();
    runMorph({ trigger, panel, content: null, triggerHeight: 48, update: () => {}, host: h });
    expect(panel.names["--morph-r0"]).toBe("24px");
  });

  it("clears every name once the transition has settled", async () => {
    const trigger = element();
    const panel = element();
    const content = element();
    const h = host();
    runMorph({ trigger, panel, content, triggerHeight: 34, update: () => {}, host: h });

    h.settle();
    await h.finished;
    await Promise.resolve();

    expect(trigger.names["view-transition-name"]).toBeUndefined();
    expect(panel.names["view-transition-name"]).toBeUndefined();
    expect(content.names["view-transition-name"]).toBeUndefined();
  });

  it("skips a running transition when a second open starts", () => {
    const first = host();
    runMorph({
      trigger: element(),
      panel: element(),
      content: null,
      triggerHeight: 34,
      update: () => {},
      host: first,
    });

    runMorph({
      trigger: element(),
      panel: element(),
      content: null,
      triggerHeight: 34,
      update: () => {},
      host: host(),
    });

    expect(first.skipTransition).toHaveBeenCalledTimes(1);
  });

  it("skips a running transition on a close", () => {
    const h = host();
    runMorph({
      trigger: element(),
      panel: element(),
      content: null,
      triggerHeight: 34,
      update: () => {},
      host: h,
    });

    skipRunningMorph();

    expect(h.skipTransition).toHaveBeenCalledTimes(1);
  });
});

describe("C-14 · the bare path", () => {
  it("runs the update and names nothing where there is no transition to name for", () => {
    const trigger = element();
    const panel = element();
    const update = vi.fn();

    runMorph({ trigger, panel, content: null, triggerHeight: 48, update, host: {} });

    expect(update).toHaveBeenCalledTimes(1);
    expect(trigger.names["view-transition-name"]).toBeUndefined();
    expect(panel.names["view-transition-name"]).toBeUndefined();
  });
});

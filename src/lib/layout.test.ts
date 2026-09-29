import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BREAKPOINTS,
  COMPONENT_LINE,
  isReadOnly,
  modeFor,
  POINTER_QUERY,
  READ_ONLY_LINE,
  READ_ONLY_QUERY,
  SIDEBAR_QUERY,
} from "./layout";

/**
 * design-spec §4's numbers, in the one module script reads them from (T0.48).
 *
 * The browser half — the frame's `--layout-mode` at 1439/1440, 1279/1280, 1023/1024 and the
 * write gate at 599/600 and 767/768 — is `e2e/frame.spec.ts`. This holds the arithmetic and,
 * below, that the stylesheet's own numbers agree with it: the CSS decides the mode and the
 * script only mirrors it, so the two must never drift apart.
 */
describe("§4 · the modes switch at exactly 1440, 1280 and 1024", () => {
  it("names the four modes either side of each line", () => {
    expect(modeFor(1440)).toBe("wide");
    expect(modeFor(1439)).toBe("standard");
    expect(modeFor(1280)).toBe("standard");
    expect(modeFor(1279)).toBe("desk");
    expect(modeFor(1024)).toBe("desk");
    expect(modeFor(1023)).toBe("hand");
    expect(modeFor(375)).toBe("hand");
  });

  it("puts the sidebar's query at the desk line", () => {
    expect(SIDEBAR_QUERY).toBe(`(min-width: ${BREAKPOINTS.desk}px)`);
    expect(BREAKPOINTS).toEqual({ wide: 1440, standard: 1280, desk: 1024 });
  });
});

describe("§4 · the read-only line is 768 on touch and 600 on pointer", () => {
  it("keeps a zoomed laptop's writes and drops a phone's", () => {
    // 1280 at 200% is 640 CSS px on a pointer device: above the line.
    expect(isReadOnly(640, true)).toBe(false);
    expect(isReadOnly(599, true)).toBe(true);
    expect(isReadOnly(600, true)).toBe(false);
    // The same 640 on touch is a tablet in portrait: below it.
    expect(isReadOnly(640, false)).toBe(true);
    expect(isReadOnly(767, false)).toBe(true);
    expect(isReadOnly(768, false)).toBe(false);
  });

  it("writes the width half of each query one pixel under its line", () => {
    expect(READ_ONLY_LINE).toEqual({ pointer: 600, touch: 768 });
    expect(READ_ONLY_QUERY.pointer).toBe("(max-width: 599px)");
    expect(READ_ONLY_QUERY.touch).toBe("(max-width: 767px)");
    expect(COMPONENT_LINE).toBe(READ_ONLY_LINE.touch);
  });

  it("gates pointer on §7's one query", () => {
    expect(POINTER_QUERY).toBe("(hover: hover) and (pointer: fine)");
  });
});

/**
 * The stylesheet's numbers, read back. `globals.css` declares the `wide`, `pointer` and
 * `touch` variants the frame's class strings use, and the write gate's classes spell the
 * two read-only widths; each has to be the number this module holds.
 */
describe("§4 · the stylesheet agrees with the module", () => {
  const root = process.cwd();
  const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
  const gate = readFileSync(join(root, "src/components/frame/WriteGate.tsx"), "utf8");

  it("declares the wide variant at 1440 and the pointer variant on §7's query", () => {
    expect(globals).toContain(`@custom-variant wide (@media (min-width: ${BREAKPOINTS.wide}px));`);
    expect(globals).toContain(`@custom-variant pointer (@media ${POINTER_QUERY});`);
    expect(globals).toContain(`@custom-variant touch (@media not all and ${POINTER_QUERY});`);
  });

  it("hides the writes under the two lines before hydration", () => {
    // Tailwind's `max-[600px]` is `width < 600px`; `max-md` is `width < 768px`.
    expect(gate).toContain(`pointer:max-[${READ_ONLY_LINE.pointer}px]:hidden`);
    expect(gate).toContain("touch:max-md:hidden");
  });
});

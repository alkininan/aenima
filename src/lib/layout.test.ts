import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LIST_CONTAINER_CLASSES,
  READ_ONLY_HIDDEN_CLASSES,
  READ_ONLY_SHOWN_CLASSES,
} from "@/components/ui/variants";

import {
  BREAKPOINTS,
  COMPONENT_LINE,
  isReadOnly,
  modeFor,
  POINTER_QUERY,
  READ_ONLY_LINE,
  READ_ONLY_QUERY,
  ROW_BREAK,
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
 * §8.27 (T0.49): "Below a content box of 760 the row is two lines, 72h, decided by a
 * container query on the list's own content box (§4 Grid), never by the viewport." The
 * browser half — 56 at 1440 and 1048, 72 at 1047, 792, 791 and 375, and 72 at 1440 with the
 * box held at 759 — is `e2e/list.spec.ts`; this holds the number and that the stylesheet
 * spells the same one.
 */
describe("§8.27 · the row breaks to two lines under a content box of 760", () => {
  it("holds §8.27's sum", () => {
    // 32 + 44 + 48 + 200 + 80 + 96 + 160 + 72 + 28, the addends §8.27 lists.
    expect(ROW_BREAK).toBe(32 + 44 + 48 + 200 + 80 + 96 + 160 + 72 + 28);
    expect(ROW_BREAK).toBe(760);
  });
});

/**
 * The stylesheet's numbers, read back. `globals.css` declares the `wide`, `pointer` and
 * `touch` variants the frame's class strings use, the row's container query, and the
 * write gate's classes spell the two read-only widths; each has to be the number this
 * module holds.
 */
describe("§4 · the stylesheet agrees with the module", () => {
  const root = process.cwd();
  const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");

  it("declares the wide variant at 1440 and the pointer variant on §7's query", () => {
    expect(globals).toContain(`@custom-variant wide (@media (min-width: ${BREAKPOINTS.wide}px));`);
    expect(globals).toContain(`@custom-variant pointer (@media ${POINTER_QUERY});`);
    expect(globals).toContain(`@custom-variant touch (@media not all and ${POINTER_QUERY});`);
  });

  /**
   * The gate's classes and their inverse — what stands in a write's place below the line,
   * the idle row's readout (§8.27) — live side by side in `variants.ts`, so the line is
   * spelled once on the stylesheet's side and once here.
   */
  it("hides the writes under the two lines before hydration, and shows the readout there", () => {
    // Tailwind's `max-[600px]` is `width < 600px`; `max-md` is `width < 768px`.
    expect(READ_ONLY_HIDDEN_CLASSES).toBe(
      `pointer:max-[${READ_ONLY_LINE.pointer}px]:hidden touch:max-md:hidden`,
    );
    expect(READ_ONLY_SHOWN_CLASSES).toBe(
      `hidden pointer:max-[${READ_ONLY_LINE.pointer}px]:inline touch:max-md:inline`,
    );
  });

  /**
   * The row's query is on the list's named container, and the list declares that name:
   * a query on a container nobody declares never matches, and every row would be one line
   * at every width.
   */
  it("queries the list's container at §8.27's 760, and the list declares it", () => {
    expect(globals).toContain(`@container list (width < ${ROW_BREAK}px)`);
    expect(LIST_CONTAINER_CLASSES).toContain("@container/list");
  });
});

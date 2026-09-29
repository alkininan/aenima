import { cx } from "@/lib/cx";

import { ChevronDownIcon, ChevronRightIcon } from "./icons";
import { DISCLOSURE_CHEVRON_CLASSES } from "./variants";

/**
 * §8.25's chevron — 16, "swapped rather than rotated": `nav-arrow-right` while the
 * `<details>` is closed, `nav-arrow-down` while it is open. Two glyphs and a swap, because
 * §6 names no duration for a disclosure and v1 makes step changes instant; a rotation
 * would be a motion the document does not name.
 *
 * Reads the open state through the `group` class the `<details>` carries, so it needs no
 * script and works with JavaScript off, as the disclosure itself does. Rendered inside the
 * summary, 4 from its text (`DISCLOSURE_SUMMARY_CLASSES`).
 */
export function DisclosureChevron({ className }: { className?: string }) {
  return (
    <>
      <ChevronRightIcon
        className={cx(DISCLOSURE_CHEVRON_CLASSES, "group-open:hidden", className)}
      />
      <ChevronDownIcon
        className={cx(DISCLOSURE_CHEVRON_CLASSES, "hidden group-open:block", className)}
      />
    </>
  );
}

import type { ReactNode } from "react";

import {
  PAGE_READOUT_CLASSES,
  PAGE_SUBTITLE_CLASSES,
  PAGE_TITLE_CLASSES,
  PAGE_TOPBAR_CLASSES,
  PAGE_TOPBAR_ROW_CLASSES,
  PAGE_TOPBAR_SURFACE_CLASSES,
  SCRIM_TOP_CLASSES,
} from "@/components/ui/variants";
import { cx } from "@/lib/cx";
import { PAINT_MARKS } from "@/lib/layout";

import { PaintMark } from "./PaintMark";

/**
 * §4's topbar per page — "56 tall … growing by 30 when it carries a subtitle, inline
 * padding the mode's gutter: display-xl title (display-lg in hand chrome) + mono-readout
 * freshness + at most one primary action". Sticky glass with `--scrim-top` in the sidebar
 * modes; in hand chrome it scrolls with the page (globals.css takes the material away
 * there). The `chat-bubble` toggle at the trailing edge is the dock's.
 *
 * It is chrome: drawn from the route alone, and on the item page its two data slots — the
 * title where it is an item's name, and the freshness — carry a skeleton of their own size
 * until the data arrives (C-40); a page's `loading.tsx` renders it with those, and the page
 * renders it with the data. It marks its commit for C-45.
 *
 * `eyebrow` is the mono-readout the item and opportunity pages lead with — the key people
 * say out loud (§3 puts IDs in mono) — standing before the title on the 56 row. `action`
 * is the one primary; in hand chrome §4 makes it an IconButton when it has an icon and a
 * sm button when it does not, which the caller renders, since no page carries one yet.
 */
export function PageTopbar({
  eyebrow,
  title,
  subtitle,
  readout,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** §4's subtitle slot: one line, truncating rather than wrapping. */
  subtitle?: ReactNode;
  /** §4: mono-readout freshness — the item page's `scored … ago`. */
  readout?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header data-testid="page-topbar" className={cx(PAGE_TOPBAR_CLASSES, className)}>
      <div aria-hidden="true" className={SCRIM_TOP_CLASSES} />
      <div className={PAGE_TOPBAR_SURFACE_CLASSES}>
        <div className={PAGE_TOPBAR_ROW_CLASSES}>
          {eyebrow === undefined ? null : (
            <span className="type-mono-readout shrink-0 text-n-secondary">{eyebrow}</span>
          )}
          <h1 className={PAGE_TITLE_CLASSES}>{title}</h1>
          {readout === undefined ? null : (
            <span data-testid="page-readout" className={PAGE_READOUT_CLASSES}>
              {readout}
            </span>
          )}
          {action}
        </div>
        {subtitle === undefined ? null : <p className={PAGE_SUBTITLE_CLASSES}>{subtitle}</p>}
      </div>
      <PaintMark name={PAINT_MARKS.chrome} />
    </header>
  );
}

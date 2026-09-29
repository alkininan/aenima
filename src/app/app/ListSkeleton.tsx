import { PaintMark } from "@/components/frame/PaintMark";
import { GUTTER_CLASSES } from "@/components/ui/variants";
import { cx } from "@/lib/cx";
import { PAINT_MARKS } from "@/lib/layout";

import { ItemListSkeleton } from "./ItemRowSkeleton";

/**
 * §10: "Full-page loads: skeleton screens mirroring the target layout — the content column
 * only, never the chrome, which renders from the route before any data (§4) — never a
 * centered spinner page."
 *
 * The list's content, while its read is in flight: the same gutters, the same strip height,
 * the same 56h rows — because the whole point of a skeleton is that nothing moves when the
 * content arrives. The page topbar above it is chrome and is rendered by `loading.tsx` as
 * itself, title and subtitle real text: they are the same on every load, so pretending not
 * to know them would be slower *and* emptier. Shared by `/app` and the `/dev/list` fixture,
 * whose held read is how C-40 is observed.
 */
export function ListSkeleton() {
  return (
    <div aria-busy="true" className={cx(GUTTER_CLASSES, "flex flex-col gap-[24px] py-[32px]")}>
      <PaintMark name={PAINT_MARKS.skeleton} />

      {/* The strip's own height (§8.26): 6 padding either side of a 48 segment, and the
          recipe's 1px border top and bottom — 62. */}
      <div className="glass h-[62px] rounded-md" />

      <ItemListSkeleton />
    </div>
  );
}

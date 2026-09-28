import { MAIN_CLASSES } from "@/components/ui/variants";
import { getDictionary } from "@/i18n";

import { ItemSkeleton, ItemTopbarSkeleton } from "./ItemSkeleton";
import { CHAT_COLUMN_CLASSES, ITEM_GRID_CLASSES } from "./item-grid";

/**
 * The item segment's Suspense boundary: the page topbar as chrome with its two data slots
 * skeletoned (§4, C-40), over the content column's own skeleton (§10), in the page's grid.
 */
export default function ItemLoading() {
  const t = getDictionary();

  return (
    <main className={MAIN_CLASSES}>
      <ItemTopbarSkeleton />
      <div className={ITEM_GRID_CLASSES}>
        <ItemSkeleton t={t} />
        <aside aria-hidden="true" className={CHAT_COLUMN_CLASSES} />
      </div>
    </main>
  );
}

import { PageTopbar } from "@/components/frame/PageTopbar";
import { MAIN_CLASSES } from "@/components/ui/variants";
import { getDictionary } from "@/i18n";

import { ListSkeleton } from "./ListSkeleton";

/**
 * The segment's Suspense boundary, so this is what shows while the list read is
 * in flight: the page topbar as chrome — drawn from the route alone, no skeleton
 * in it (§4, C-40) — over the content column's own skeleton (§10).
 */
export default function AppLoading() {
  const t = getDictionary();

  return (
    <main className={MAIN_CLASSES}>
      <PageTopbar title={t.list.title} subtitle={t.list.subtitle} />
      <ListSkeleton />
    </main>
  );
}

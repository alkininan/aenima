import { ItemListSkeleton } from "./ItemRowSkeleton";

/**
 * §10: "Full-page loads: skeleton screens mirroring the target layout; never a
 * centered spinner page."
 *
 * The segment's Suspense boundary, so this is what shows while the list read is
 * in flight. It mirrors the page rather than approximating it — the same
 * gutters, the same header block, the same strip height, the same 56h rows —
 * because the whole point of a skeleton is that nothing moves when the content
 * arrives.
 *
 * The title and subtitle are real text rather than blocks: they are the same on
 * every load, so pretending not to know them would be slower *and* emptier.
 */
export default function AppLoading() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-[24px] px-[24px] py-[32px]">
      <header className="flex flex-col gap-[8px]">
        {/* §6's shimmer, the one skeleton motion: its loop is --t-skeleton, where
            Tailwind's pulse would bring a 2s of its own (C-06). */}
        <span className="shimmer block h-[38px] w-[240px] rounded-xs" />
        <span className="shimmer block h-[22px] w-[320px] rounded-xs" />
      </header>

      {/* The strip's own height: 8 padding either side of a 2-line segment. */}
      <div className="glass h-[62px] rounded-md" />

      <ItemListSkeleton />
    </main>
  );
}

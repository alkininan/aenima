import { BucketSection } from "@/app/app/BucketSection";
import { PipelineStrip } from "@/app/app/PipelineStrip";
import { RowWalker } from "@/app/app/RowWalker";
import { PageTopbar } from "@/components/frame/PageTopbar";
import { PaintMark } from "@/components/frame/PaintMark";
import { GUTTER_CLASSES, MAIN_CLASSES } from "@/components/ui/variants";
import { getDictionary } from "@/i18n";
import { BUCKETS } from "@/lib/buckets";
import { cx } from "@/lib/cx";
import { PAINT_MARKS } from "@/lib/layout";

import { devOnly } from "../dev-only";
import { holdContent } from "../frame-fixture";
import { DEV_BOX_PARAM, LIST_COUNTS, LIST_FIXTURE, LIST_NOW, heldBox } from "../list-fixture";

/**
 * DELETE BEFORE LAUNCH, along with everything else under /dev.
 *
 * **The list surface rendered the way `/app` renders it: from a Server
 * Component**, inside the frame the segment layout draws. `/dev/primitives`
 * already previews the same components, but it previews them from a client
 * root — `Composites` carries `"use client"`, so everything below it is a
 * client component and the server/client boundary `/app` has does not exist
 * there at all.
 *
 * That difference shipped a production 500. `Sidebar` handed the i18n dictionary
 * to `ProductSwitcher` and `ItemRow` handed it to `ItemRowMenu`; the dictionary
 * holds formatter functions, and a function cannot be serialized across the
 * boundary. Every gate passed: the unit tests render client components directly,
 * the browser tests drove a client-rooted preview, and `/app` is behind auth, so
 * nothing in the suite ever rendered a Server Component that crossed into a
 * client one.
 *
 * So this page exists to be that render. It is deliberately thin — the same
 * fixture, no client wrapper — and its whole job is to fail when a value that
 * cannot cross the boundary is passed across it. Its rows lead to `/dev/item`,
 * the fixture the frame's route changes are driven between (C-45), and
 * `?delay=` holds its content so the chrome can be observed ahead of it (C-40).
 *
 * **`?box=` holds the list's wrapper at a width** (T0.49), for the one case a viewport
 * query could pass and a container query must: the viewport wide and the list's box under
 * §8.27's 760. The list stands inside §4's frame — the same `MAIN_CLASSES` and
 * `GUTTER_CLASSES` as `/app`, so its box is §4's — and the row-geometry checks (C-12,
 * C-46) drive it here.
 */
/**
 * Dynamic, like `/app`, and for the same reason it is dynamic there.
 *
 * `ProductSwitcher` reads `useSearchParams()`, which a statically prerendered
 * page cannot do without a Suspense boundary — `/app` never hits this because it
 * reads cookies and is therefore dynamic already. Without this the page builds
 * only because `devOnly()` 404s it first, which means the gate would be hiding a
 * broken page rather than a working one. Mirroring `/app`'s rendering mode is
 * also the point of the page: a preview on the other side of a boundary from the
 * surface it previews is what let the last one through.
 */
export const dynamic = "force-dynamic";

export default async function DevListPage({ searchParams }: PageProps<"/dev/list">) {
  devOnly();

  const t = getDictionary();
  const params = await searchParams;
  await holdContent(params);
  const box = heldBox(params[DEV_BOX_PARAM]);

  // §11: the list is one Tab stop, the first row's name — the first row of the first
  // bucket that has one, in the order the buckets render.
  const tabStopKey = BUCKETS.flatMap((bucket) =>
    LIST_FIXTURE.filter((row) => row.bucket === bucket),
  )[0]?.key;

  return (
    <main className={MAIN_CLASSES}>
      <PageTopbar title={t.list.title} subtitle={t.list.subtitle} />

      <div className={cx(GUTTER_CLASSES, "flex flex-col gap-[24px] py-[32px]")}>
        <PaintMark name={PAINT_MARKS.content} />

        <PipelineStrip counts={LIST_COUNTS} active="define" product={undefined} total={6} t={t} />

        {/* The same grid `/app` renders — the walker is the list's container (§8.27) — and,
            held, a wrapper at the requested width around it so the container's box is the
            fixture's rather than the viewport's. */}
        <div style={box === null ? undefined : { width: `${box}px`, maxWidth: "100%" }}>
          <RowWalker label={t.list.title} className="flex flex-col gap-[24px]">
            {BUCKETS.map((bucket) => (
              <BucketSection
                key={bucket}
                bucket={bucket}
                items={LIST_FIXTURE.filter((row) => row.bucket === bucket)}
                t={t}
                now={LIST_NOW}
                linkTo={() => "/dev/item"}
                {...(tabStopKey === undefined ? {} : { tabStopKey })}
              />
            ))}
          </RowWalker>
        </div>
      </div>
    </main>
  );
}

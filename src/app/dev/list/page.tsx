import { AppShell } from "@/app/app/AppShell";
import { BucketSection } from "@/app/app/BucketSection";
import { PipelineStrip } from "@/app/app/PipelineStrip";
import { RowWalker } from "@/app/app/RowWalker";
import { getDictionary } from "@/i18n";
import { BUCKETS } from "@/lib/buckets";

import { devOnly } from "../dev-only";
import { LIST_COUNTS, LIST_FIXTURE, LIST_NOW } from "../list-fixture";

/**
 * DELETE BEFORE LAUNCH, along with everything else under /dev.
 *
 * **The list surface rendered the way `/app` renders it: from a Server
 * Component.** `/dev/primitives` already previews the same components, but it
 * previews them from a client root — `Composites` carries `"use client"`, so
 * everything below it is a client component and the server/client boundary
 * `/app` has does not exist there at all.
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
 * cannot cross the boundary is passed across it.
 *
 * Since T0.45 it is also the shell `/app` has — `AppShell`: skip link, sidebar
 * with its account menu, main region — and its rows walk under `RowWalker` and
 * link to `/dev/item`, which links back. That is what lets §11's keyboard paths
 * — the first Tab stops, focus after a route change, the way back to the row —
 * be driven in a browser without a session.
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

export default function DevListPage() {
  devOnly();

  const t = getDictionary();

  return (
    // The other half of the boundary: Sidebar is a Server Component and
    // ProductSwitcher and AccountMenu are client ones.
    <AppShell t={t} products={[{ slug: "sociera", name: "Sociera" }]} email="someone@example.com">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[24px] px-[24px] py-[32px]">
        <header className="flex flex-col gap-[8px]">
          <h1 className="type-display-xl text-n-primary">{t.list.title}</h1>
          <p className="type-ui-body truncate text-n-secondary">{t.list.subtitle}</p>
        </header>

        <PipelineStrip counts={LIST_COUNTS} active="define" product={undefined} total={6} t={t} />

        <RowWalker className="flex flex-col gap-[24px]">
          {BUCKETS.map((bucket) => (
            <BucketSection
              key={bucket}
              bucket={bucket}
              items={LIST_FIXTURE.filter((row) => row.bucket === bucket)}
              t={t}
              now={LIST_NOW}
            />
          ))}
        </RowWalker>
      </div>
    </AppShell>
  );
}

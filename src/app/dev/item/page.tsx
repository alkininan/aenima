import { ActivityFeed } from "@/app/i/[key]/ActivityFeed";
import { ArtifactList } from "@/app/i/[key]/ArtifactList";
import { DecisionList } from "@/app/i/[key]/DecisionList";
import { GapList } from "@/app/i/[key]/GapList";
import { ItemHeader } from "@/app/i/[key]/ItemHeader";
import { ItemSection } from "@/app/i/[key]/ItemSection";
import { getDictionary } from "@/i18n";

import { devOnly } from "../dev-only";
import {
  ITEM_ACTIVITY,
  ITEM_ARTIFACTS,
  ITEM_DECISIONS,
  ITEM_GAPS,
  ITEM_HEADER,
  ITEM_NOW,
} from "../item-fixture";

/**
 * DELETE BEFORE LAUNCH, along with everything else under /dev.
 *
 * **The item page rendered the way `/i/<key>` renders it: from a Server
 * Component**, over a fixture that carries every case real data cannot. No
 * seeded item has any activity at all, and only one has gaps — so without this
 * the browser tests would be measuring three empty states.
 *
 * The build log's rule is why this is a Server Component rather than a client
 * preview: a preview must render on the same side of the RSC boundary as the
 * surface it previews, or it cannot catch a value that fails to cross it.
 * `/i/<key>` has no client islands today, which is exactly the kind of thing
 * that changes quietly.
 */
export default function DevItemPage() {
  devOnly();

  const t = getDictionary();

  return (
    <main className="mx-auto w-full max-w-[1200px] px-[24px] py-[32px]">
      <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-[32px]">
          <ItemHeader item={ITEM_HEADER} t={t} />

          <ItemSection title={t.item.artifacts}>
            <ArtifactList artifacts={ITEM_ARTIFACTS} t={t} now={ITEM_NOW} />
          </ItemSection>

          <ItemSection title={t.item.gaps}>
            <GapList gaps={ITEM_GAPS} t={t} />
          </ItemSection>

          <ItemSection title={t.item.decisions}>
            <DecisionList decisions={ITEM_DECISIONS} t={t} now={ITEM_NOW} />
          </ItemSection>

          <ItemSection title={t.item.activity}>
            <ActivityFeed entries={ITEM_ACTIVITY} t={t} now={ITEM_NOW} />
          </ItemSection>
        </div>

        {/* The reserved chat column, held the same way the real page holds it. */}
        <aside aria-hidden="true" className="hidden lg:block" />
      </div>
    </main>
  );
}

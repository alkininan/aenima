import { ActivityFeed } from "@/app/i/[key]/ActivityFeed";
import { ArtifactList } from "@/app/i/[key]/ArtifactList";
import { DecisionList } from "@/app/i/[key]/DecisionList";
import { GapList } from "@/app/i/[key]/GapList";
import { ItemHeader } from "@/app/i/[key]/ItemHeader";
import { ItemSection } from "@/app/i/[key]/ItemSection";
import { ReadinessPanel } from "@/app/i/[key]/ReadinessPanel";
import type { MoveableGap } from "@/app/i/[key]/GapMoves";
import { getDictionary } from "@/i18n";
import { isGapMoveOutcome } from "@/lib/gap-move";
import { GAP_PARAMS } from "@/lib/routes";

import { devOnly } from "../dev-only";
import {
  ITEM_ACTIVITY,
  ITEM_ARTIFACTS,
  ITEM_DECISIONS,
  ITEM_GAPS,
  ITEM_HEADER,
  ITEM_NOW,
  ITEM_RUN,
  ITEM_RUN_RETRYING,
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
 * `/i/<key>` has no client islands today — T2.4's disclosure is a native
 * `<details>` precisely so that stays true — and this is what would catch it
 * stopping being true.
 *
 * **`?run=` picks the meter's state**, because §8's meter has three and a
 * mirror of one page can only show one. `scored` is the default; `none` is
 * §10's hollow track with no disclosure at all, and `retrying` is §10's warning
 * dot, which no browser test could stage — it needs a provider outage. A search
 * param rather than three routes: the page stays one mirror of `/i/<key>`, and
 * the parameter changes only which fixture goes in.
 */
type RunState = "scored" | "none" | "retrying";

const RUNS: Record<RunState, typeof ITEM_RUN | null> = {
  scored: ITEM_RUN,
  none: null,
  retrying: ITEM_RUN_RETRYING,
};

function isRunState(value: unknown): value is RunState {
  return value === "scored" || value === "none" || value === "retrying";
}

export default async function DevItemPage({ searchParams }: PageProps<"/dev/item">) {
  devOnly();

  const t = getDictionary();
  const { run: requested, ...move } = await searchParams;

  /**
   * The same `checkId → gap` map and the same URL outcome the real page builds,
   * so the mirror renders §5's moves on the same side of the RSC boundary.
   *
   * The form here posts to the real action, which will refuse: `/dev` is in
   * `PUBLIC_PREFIXES` and carries no session, so `settleGap` redirects to
   * sign-in. That is the honest limit of the mirror — it proves the control
   * renders and is a real form, never that the write works.
   */
  const gapsByCheck = new Map<string, MoveableGap>(
    ITEM_GAPS.filter((gap) => gap.disposition !== "closed").map((gap) => [
      gap.checkId,
      {
        id: gap.id,
        checkId: gap.checkId,
        tag: gap.tag,
        disposition: gap.disposition as MoveableGap["disposition"],
        resolvedBy: gap.resolvedBy,
        resolutionNote: gap.resolutionNote,
      },
    ]),
  );

  const movedGap = move[GAP_PARAMS.gap];
  const moveKind = move[GAP_PARAMS.move];
  const outcome =
    isGapMoveOutcome(moveKind) && typeof movedGap === "string"
      ? { gapId: movedGap, kind: moveKind }
      : null;
  const run =
    RUNS[
      isRunState(typeof requested === "string" ? requested : undefined)
        ? (requested as RunState)
        : "scored"
    ];

  return (
    <main className="mx-auto w-full max-w-[1200px] px-[24px] py-[32px]">
      <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-[32px]">
          {/* The same 16 the real page holds these two at. */}
          <div className="flex flex-col gap-[16px]">
            <ItemHeader item={ITEM_HEADER} t={t} />
            <ReadinessPanel
              run={run}
              t={t}
              now={ITEM_NOW}
              itemKey={ITEM_HEADER.key}
              gapsByCheck={gapsByCheck}
              outcome={outcome}
            />
          </div>

          <ItemSection title={t.item.artifacts}>
            <ArtifactList artifacts={ITEM_ARTIFACTS} t={t} now={ITEM_NOW} />
          </ItemSection>

          <ItemSection title={t.item.gaps}>
            <GapList
              gaps={ITEM_GAPS}
              t={t}
              scored={run !== null}
              itemKey={ITEM_HEADER.key}
              outcome={outcome}
            />
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

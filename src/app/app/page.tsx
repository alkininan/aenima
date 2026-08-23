import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/variants";
import { ListIcon } from "@/components/ui/icons";
import { listItemsForWorkspace, type ItemListRow } from "@/db/queries/item";
import { getCurrentWorkspace } from "@/db/queries/workspace";
import { getDictionary } from "@/i18n";
import { isStale } from "@/lib/baselines";
import { BUCKETS, assignBucket, compareInBucket, type BucketInput } from "@/lib/buckets";
import { LIST_PARAMS, ROUTES } from "@/lib/routes";
import { STAGES, type Stage } from "@/lib/stage";

import { BucketSection } from "./BucketSection";
import { PIPELINE_STAGES, PipelineStrip } from "./PipelineStrip";
import type { ItemRowData } from "./ItemRow";

export const metadata: Metadata = {
  title: "aenima",
};

/** A search param arrives as a string, an array, or not at all. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** An unknown `?stage=` is ignored rather than shown as an empty list. */
function asStage(value: string | undefined): Stage | null {
  return STAGES.includes(value as Stage) && value !== "handed_over" ? (value as Stage) : null;
}

/** What `assignBucket` reads, from what the query returned. */
function toBucketInput(item: ItemListRow, now: number): BucketInput {
  return {
    type: item.type,
    stage: item.stage,
    openGaps: item.openGaps.map((gap) => ({
      tag: gap.tag,
      createdAt: Date.parse(gap.createdAt),
    })),
    stageEnteredAt: Date.parse(item.stageEnteredAt),
    lastActivityAt: Date.parse(item.lastActivityAt),
    now,
  };
}

function toRowData(item: ItemListRow, input: BucketInput): ItemRowData {
  return {
    key: item.key,
    title: item.title,
    type: item.type,
    stage: item.stage,
    bucket: assignBucket(input),
    // §8 shows two gap chips; Musts first, because a Should behind a Must is the
    // less urgent of the two and only two fit.
    gaps: [...item.openGaps]
      .sort((a, b) => (a.tag === b.tag ? 0 : a.tag === "must" ? -1 : 1))
      .map((gap) => ({ id: gap.id, checkId: gap.checkId, tag: gap.tag })),
    lastActivityAt: input.lastActivityAt,
    /**
     * §13: "Idle items dim relative to their stage baseline". Read from the
     * same table the at-risk rule uses, against last activity rather than stage
     * entry — an item worked on yesterday is not idle however long it has been
     * in Define. Types with no baseline are never idle, for the same reason they
     * are never stale.
     */
    idle: isStale(item.type, item.stage, input.now - input.lastActivityAt),
  };
}

/**
 * §13's list surface — "a prioritized list, not a board".
 *
 * Everything on this page is derived. Stage comes from artifacts, buckets come
 * from stage plus gaps plus two clocks, and none of it is stored: there is no
 * status column to read and no drag-to-move, because there is nothing to drop
 * a card into.
 *
 * A Server Component, and the filters are search params rather than client
 * state — so a filtered list is a URL someone can send, the back button works,
 * and the whole thing renders without shipping the list to the browser.
 *
 * **Every meter is hollow.** Scoring is Phase 2; §10 forbids drawing that as a
 * zero, and a 0% bar would say this work was measured and found wanting.
 */
export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const t = getDictionary();
  const params = await searchParams;

  // The layout has already bootstrapped the workspace and turned anonymous
  // traffic away, so this reads rather than ensures.
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  // The read stamps its own instant, and everything below is computed against
  // it. §13's buckets are claims about two moments, so they have to be judged
  // against when the rows were true — and one clock for the whole page means two
  // rows a millisecond apart cannot land on opposite sides of a threshold.
  const { readAt: now, items } = await listItemsForWorkspace(workspace.id);

  const stageFilter = asStage(one(params[LIST_PARAMS.stage]));
  const productFilter = one(params[LIST_PARAMS.product]);

  // The strip counts what the *product* filter leaves, not what the stage
  // filter leaves — a segment showing the count of its own filtered result
  // would read 0 for every stage but the chosen one.
  const inProduct = productFilter
    ? items.filter((item) => item.productSlug === productFilter)
    : items;

  const counts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: inProduct.filter((item) => item.stage === stage).length,
  }));

  const visible = stageFilter ? inProduct.filter((item) => item.stage === stageFilter) : inProduct;

  const rows = visible.map((item) => {
    const input = toBucketInput(item, now);
    return { input, row: toRowData(item, input) };
  });

  const filtered = stageFilter !== null || productFilter !== undefined;

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-[24px] px-[24px] py-[32px]">
      {/* §4: a page topbar is a display-xl title, and §4's subtitle slot is
          where instructional copy lives — never a field's helper line. */}
      <header className="flex flex-col gap-[8px]">
        <h1 className="type-display-xl text-n-primary">{t.list.title}</h1>
        <p className="type-ui-body truncate text-n-secondary">{t.list.subtitle}</p>
      </header>

      <PipelineStrip
        counts={counts}
        active={stageFilter}
        product={productFilter}
        total={inProduct.length}
        t={t}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<ListIcon />}
          textured
          action={
            filtered ? (
              // A link rather than a Button: this navigates, and `Button`
              // renders a `<button>` with no `asChild` escape hatch. The
              // secondary variant's classes are what §8 asks for, so they are
              // borrowed directly rather than a variant being invented.
              <Link href={ROUTES.app} className={buttonClasses({ variant: "secondary" })}>
                {t.list.emptyFilteredAction}
              </Link>
            ) : null
          }
        >
          {/* §8: "Nothing needs you right now," never "No data" — and a filter
              that matches nothing is a different situation from an empty
              workspace, so it says a different thing. */}
          {filtered ? t.list.emptyFilteredTitle : t.list.emptyTitle}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-[24px]">
          {BUCKETS.map((bucket) => (
            <BucketSection
              key={bucket}
              bucket={bucket}
              items={rows
                .filter((entry) => entry.row.bucket === bucket)
                .sort((a, b) => compareInBucket(bucket, a.input, b.input))
                .map((entry) => entry.row)}
              t={t}
              now={now}
            />
          ))}
        </div>
      )}
    </main>
  );
}

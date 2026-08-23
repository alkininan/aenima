import "server-only";

import type { Database } from "@/db/database.types";
import { createClient } from "@/lib/supabase/server";
import { deriveStage, deriveStageEntry, type ArtifactPresence, type Stage } from "@/lib/stage";

/**
 * Item reads — the bottom of the §2 tree, and the shape the list surface needs.
 *
 * **These queries fetch artifacts alongside items on purpose.** Stage is
 * derived in TypeScript (`src/lib/stage.ts`), so rendering a list of items
 * means knowing every item's artifacts. Fetching them per item would be an N+1
 * that grows with the workspace and would only be noticed once someone had a
 * hundred items. PostgREST resource embedding puts the whole tree in one
 * request, which the database executes as one statement with lateral joins and
 * RLS applied to each embedded relation independently.
 *
 * Nothing here stores or transmits a stage. `deriveStage` runs on the way out,
 * per read. There is no stage column to drift from the artifacts it describes.
 */

type ItemType = Database["public"]["Enums"]["item_type"];
type FlowIntent = Database["public"]["Enums"]["flow_intent"];
type GapTag = Database["public"]["Enums"]["gap_tag"];
type GapDisposition = Database["public"]["Enums"]["gap_disposition"];

export type ItemSummary = {
  id: string;
  title: string;
  type: ItemType;
  /** §4: null until the classifier ships. Not a default — a real state. */
  flowIntent: FlowIntent | null;
  opportunityId: string | null;
  /** Derived, never stored. See src/lib/stage.ts. */
  stage: Stage;
  artifacts: ArtifactPresence[];
  /** §13 sorts the at-risk bucket by blocking-gap age; this is the count behind it. */
  openGapCount: number;
};

export type GapDetail = {
  id: string;
  checkId: string;
  tag: GapTag;
  disposition: GapDisposition;
  evidence: string;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

export type DecisionDetail = {
  id: string;
  statement: string;
  reason: string;
  decidedByUserId: string;
  decidedAt: string;
  supersedesId: string | null;
};

export type ItemDetail = ItemSummary & {
  gaps: GapDetail[];
  decisions: DecisionDetail[];
};

/**
 * The embedded selection both reads share.
 *
 * `artifact_version(count)` asks PostgREST for the number of versions rather
 * than the versions themselves — `deriveStage` only needs to know whether an
 * artifact was ever authored into, and version *content* on a list screen would
 * be megabytes to answer a boolean.
 */
const ITEM_TREE =
  "id, title, type, flow_intent, opportunity_id, artifact(kind, artifact_version(count))";

/** PostgREST returns an embedded `count` as `[{ count: n }]`. */
type CountRow = { count: number }[];

function toArtifacts(
  rows: { kind: ArtifactPresence["kind"]; artifact_version: CountRow }[] | null,
): ArtifactPresence[] {
  return (rows ?? []).map((row) => ({
    kind: row.kind,
    versionCount: row.artifact_version[0]?.count ?? 0,
  }));
}

/**
 * Every item in a product, with what each owns and the stage that follows from
 * it. One request regardless of how many items come back.
 */
export async function listItemsForProduct(
  workspaceId: string,
  productId: string,
): Promise<ItemSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("item")
    // The gap embed is filtered to open ones by the `gap.disposition` predicate
    // below — §13's buckets care about what is still outstanding, not the
    // gaps a human already accepted or excluded.
    .select(`${ITEM_TREE}, gap(count)`)
    .eq("workspace_id", workspaceId)
    .eq("product_id", productId)
    .eq("gap.disposition", "open")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not read items: ${error.message}`);

  return (data ?? []).map((row) => {
    const artifacts = toArtifacts(row.artifact);
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      flowIntent: row.flow_intent,
      opportunityId: row.opportunity_id,
      artifacts,
      openGapCount: (row.gap as CountRow)[0]?.count ?? 0,
      stage: deriveStage({ artifacts }),
    };
  });
}

/**
 * One item with everything it owns — artifacts, gaps in every disposition, and
 * the decision log attached to it. Also one request.
 *
 * Unlike the list, this returns gaps in all three dispositions: §5's negotiation
 * history is the point of an item page, and an accepted gap is the part §8's
 * ledger insists stays visible.
 */
export async function getItem(workspaceId: string, itemId: string): Promise<ItemDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("item")
    .select(
      `${ITEM_TREE},
       gap(id, check_id, tag, disposition, evidence, resolved_by_user_id, resolved_at, resolution_note),
       decision(id, statement, reason, decided_by_user_id, decided_at, supersedes_id)`,
    )
    .eq("workspace_id", workspaceId)
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw new Error(`Could not read item: ${error.message}`);
  if (!data) return null;

  const artifacts = toArtifacts(data.artifact);
  const gaps = data.gap.map((gap) => ({
    id: gap.id,
    checkId: gap.check_id,
    tag: gap.tag,
    disposition: gap.disposition,
    evidence: gap.evidence,
    resolvedByUserId: gap.resolved_by_user_id,
    resolvedAt: gap.resolved_at,
    resolutionNote: gap.resolution_note,
  }));

  return {
    id: data.id,
    title: data.title,
    type: data.type,
    flowIntent: data.flow_intent,
    opportunityId: data.opportunity_id,
    artifacts,
    gaps,
    openGapCount: gaps.filter((gap) => gap.disposition === "open").length,
    decisions: data.decision.map((decision) => ({
      id: decision.id,
      statement: decision.statement,
      reason: decision.reason,
      decidedByUserId: decision.decided_by_user_id,
      decidedAt: decision.decided_at,
      supersedesId: decision.supersedes_id,
    })),
    stage: deriveStage({ artifacts }),
  };
}

/* -------------------------------------------------------------------------- */
/* The §13 list surface                                                       */
/* -------------------------------------------------------------------------- */

/** An open gap, with what §13 needs to age it and what the row needs to label it. */
export type OpenGap = {
  id: string;
  checkId: string;
  tag: GapTag;
  /** ISO-8601, UTC. When the gap was raised. */
  createdAt: string;
};

export type ItemListRow = {
  id: string;
  /** §13's row identity — `soc-12`. Product-prefixed, which is what makes a
   *  workspace-wide list legible across two products at once. */
  key: string;
  title: string;
  type: ItemType;
  flowIntent: FlowIntent | null;
  opportunityId: string | null;
  productId: string;
  productName: string;
  productSlug: string;
  /** Derived, never stored. See src/lib/stage.ts. */
  stage: Stage;
  artifacts: ArtifactPresence[];
  openGaps: OpenGap[];
  openGapCount: number;
  /** Derived, never stored. See `deriveStageEntry`. ISO-8601. */
  stageEnteredAt: string;
  /** The newest thing this request saw — see the note in the mapper. ISO-8601. */
  lastActivityAt: string;
};

/**
 * What §13's list surface reads. Three differences from `ITEM_TREE`, each one
 * paying for a bucket rule:
 *
 * `artifact_version(created_at)` rather than `artifact_version(count)` — the
 * at-risk rule is "time-in-stage past ~1.5x the baseline", and stage has no entry
 * timestamp because stage is not stored. The nearest honest one is when the
 * deciding artifact was first authored into, which is its earliest version's
 * `created_at` (see `deriveStageEntry`). Asking for the rows returns the count
 * for free as the array length and costs one timestamp per version. It costs
 * nothing in RLS: counting these rows already evaluated `artifact_version_select`
 * on every one of them. What it still does *not* select is `content` — that is
 * the jsonb a list screen must never carry, and the reason `ITEM_TREE` asks for
 * a count at all. If items ever accumulate many versions, the replacement is an
 * aggregate or an ordered `limit(1)` embed, not a second request.
 *
 * `gap(id, check_id, tag, created_at)` rather than `gap(count)` — "a
 * handover-blocking gap older than 5 days" needs the tag to know whether it
 * blocks and the timestamp to know how old, and the row renders check ids as
 * chips. The count survives as the array length.
 *
 * `product(...)` — a workspace-wide list crosses products, so a row has to be
 * able to say which one it belongs to. A to-one embed, so it joins in the same
 * statement rather than costing a request.
 */
const ITEM_ROW = `id, key, title, type, flow_intent, opportunity_id, product_id,
   created_at, updated_at,
   product(name, slug),
   artifact(kind, artifact_version(created_at)),
   gap(id, check_id, tag, created_at)`;

type VersionRow = { created_at: string };

/**
 * Both ends of an artifact's version range, in one pass.
 *
 * Scanned rather than indexed into: PostgREST emits no `ORDER BY` for an embed
 * unless asked, so the array arrives in whatever order the plan produced.
 * Taking `[0]` would be right most of the time, which is the worst kind of
 * wrong.
 */
function versionRange(rows: VersionRow[] | null): {
  count: number;
  firstAt: string | null;
  lastAt: string | null;
} {
  let firstAt: string | null = null;
  let lastAt: string | null = null;

  for (const row of rows ?? []) {
    if (firstAt === null || row.created_at < firstAt) firstAt = row.created_at;
    if (lastAt === null || row.created_at > lastAt) lastAt = row.created_at;
  }

  return { count: (rows ?? []).length, firstAt, lastAt };
}

/**
 * Every item in the workspace, across every product, with the two clocks §13's
 * buckets run on. One request, however many items and however many products.
 *
 * **There is no product filter, and that is the ticket.** §13's list is "a
 * prioritized list, not a board" — a bucket that stopped at a product boundary
 * would answer "what should I do next in Sociera" rather than "what should I do
 * next", and a Must gap in the other product would be invisible until you went
 * looking for it. RLS still narrows the result: `item_select` is
 * `workspace_id IN (SELECT app.workspace_ids()) AND app.can_see_product(product_id)`,
 * so a member without `all_products` gets a workspace-wide list scoped to the
 * products they can see, and this layer never learns which those are.
 *
 * **It is also unpaginated, deliberately.** The buckets are a ranking over the
 * whole workspace, so there is no page of rows that could be bucketed correctly
 * — you cannot know an item is in the top of Your move from a slice of the
 * table. The read is bounded by workspace size and nothing else. When that stops
 * being acceptable the fix is a cap *plus* a visible "and N more", never a
 * silent LIMIT: truncating the bucket §13 puts "always on top" is exactly the
 * failure nobody would notice.
 */
export type ItemList = {
  /**
   * When this read happened, in epoch ms.
   *
   * The clock travels with the data on purpose. §13's buckets are claims about
   * two instants — "a gap older than 5 days", "past 1.5x the baseline" — so they
   * have to be computed against the moment the rows were true, not against
   * whenever the renderer happened to ask. Reading the clock once here also
   * means every row on a page is bucketed against the same instant, rather than
   * two rows a millisecond apart landing on opposite sides of a threshold.
   */
  readAt: number;
  items: ItemListRow[];
};

export async function listItemsForWorkspace(workspaceId: string): Promise<ItemList> {
  const supabase = await createClient();
  const readAt = Date.now();

  const { data, error } = await supabase
    .from("item")
    // As in `listItemsForProduct`, the gap embed is narrowed to open gaps by the
    // predicate below rather than after the fact. Note what it does *not* do: an
    // embedded filter on a to-many relation filters the embedded rows and never
    // excludes the parent, so an item with no open gaps still arrives, with
    // `gap: []`. That is required here — a gapless item is a Flowing item, not
    // an absent one. `gap!inner(...)` would drop it, and Flowing would quietly
    // become "items that have open gaps".
    .select(ITEM_ROW)
    .eq("workspace_id", workspaceId)
    .eq("gap.disposition", "open")
    // A tiebreaker only: `src/lib/buckets.ts` re-ranks all of this. Stable and
    // boring, so that a list of otherwise-identical items is reproducible.
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not read items: ${error.message}`);

  const items = (data ?? []).map((row) => {
    let lastVersionAt: string | null = null;

    const artifacts: ArtifactPresence[] = (row.artifact ?? []).map((entry) => {
      const range = versionRange(entry.artifact_version);
      if (range.lastAt !== null && (lastVersionAt === null || range.lastAt > lastVersionAt)) {
        lastVersionAt = range.lastAt;
      }
      return { kind: entry.kind, versionCount: range.count, firstVersionAt: range.firstAt };
    });

    const openGaps: OpenGap[] = (row.gap ?? []).map((gap) => ({
      id: gap.id,
      checkId: gap.check_id,
      tag: gap.tag,
      createdAt: gap.created_at,
    }));

    /**
     * §13's Flowing bucket is "everything else, by recent activity", and the
     * row's freshness readout shows the same instant.
     *
     * It is not read from `activity`, for two reasons that are both in the
     * schema. The ledger names its subject polymorphically — `subject_table`
     * plus `subject_id`, with no foreign key to `item` — so PostgREST has no
     * relationship to follow and the embed does not merely cost more, it fails.
     * And `activity`'s only index is `(workspace_id, occurred_at desc)`, so a
     * per-item lookup would scan the fastest-growing table in the system once
     * per row, inside something that still looked like one request.
     *
     * It is also not `item.updated_at` alone. `item_touch` fires on UPDATE of
     * the item row, and authoring a version, opening a gap or resolving one
     * touches no item row — so `updated_at` moves when someone renames an item
     * and sits still for everything that actually happens to it. Alone, it would
     * sort Flowing by noise.
     *
     * So: the newest thing this request already saw, with `item.updated_at` as
     * the floor — which is the right answer for an item nothing has been
     * authored into, whose own timestamp is genuinely the last thing that
     * happened. This is an approximation of the ledger and should give way to a
     * real `last_activity_at` when the schema grows one.
     */
    const lastActivityAt = [row.updated_at, lastVersionAt, ...openGaps.map((gap) => gap.createdAt)]
      // ISO-8601 in UTC compares correctly as a string; `timestamps` in
      // schema/tables.ts is `withTimezone` and CLAUDE.md stores UTC throughout.
      .reduce<string>((newest, at) => (at !== null && at > newest ? at : newest), row.updated_at);

    return {
      id: row.id,
      key: row.key,
      title: row.title,
      type: row.type,
      flowIntent: row.flow_intent,
      opportunityId: row.opportunity_id,
      productId: row.product_id,
      productName: row.product?.name ?? "",
      productSlug: row.product?.slug ?? "",
      artifacts,
      openGaps,
      openGapCount: openGaps.length,
      stage: deriveStage({ artifacts }),
      stageEnteredAt: deriveStageEntry({ artifacts, createdAt: row.created_at }),
      lastActivityAt,
    };
  });

  return { readAt, items };
}
